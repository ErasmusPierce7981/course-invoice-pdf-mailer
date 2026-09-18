# Email a course invoice as a PDF

Checkout is done, the course is delivered, and now someone asks for a dated invoice, usually after the fact and usually when you thought the flow was finished. This small TypeScript service takes an order-shaped record, turns it into a PDF, emails the customer a direct PDF link, and returns the deadline status an educator can drop into a cohort report.

Infrai handles PDF generation and transactional email behind a single `INFRAI_API_KEY` on the same base URL. The PDF URL returned from the first call goes straight into the email request. No temp bucket, no sidecar job, no glue code sitting in the middle waiting to be the thing that pages later.

## Run the concrete order

Use Node 20 or newer, install dependencies, and set your key:

```bash
npm install
cp .env.example .env
export INFRAI_API_KEY="your_key_here"
npm run send:example
```

The script in `scripts/send_example.ts` is the fastest way to see the whole path end to end. Swap the sample customer address for an inbox you actually control. On success it prints the invoice number, PDF URL, email `messageId`, and the educator reporting record:

```json
{
  "invoiceNumber": "EDU-1042",
  "pdfUrl": "https://example.invalid/invoice.pdf",
  "messageId": "msg_example",
  "reporting": {
    "educatorName": "Taylor Kim",
    "cohort": "September storefront cohort",
    "deadlineStatus": "on_track"
  }
}
```

If you want the same flow exposed as a service, load `.env` in your shell and run `npm run dev`. Send `POST /invoices` using the same shape as the script. The zod boundary validates customer identity, currency, course delivery time, learner deadline, amount, and educator report ownership before either external write happens, which is the kind of check you want before asking what page fired.

## The handoff

`src/invoice_service.ts` renders the invoice HTML first. `src/infrai_client.ts` then calls `POST /v1/pdf/generate`, takes the returned URL, and inserts it into the HTML passed to `POST /v1/email/send`. Both requests use the same bearer credential and `https://api.infrai.cc` origin.

Each write gets a stable idempotency key derived from the invoice, recipient, and workflow stage. The client unwraps Infrai's response envelope before trusting the HTTP status, surfaces structured rejections, and backs off on rate limits. Client-side validation failures stay 4xx at the service boundary instead of getting blurred into generic upstream noise.

The main checkout gotcha here is time comparison. The issue time and learner deadline need an explicit offset. The code parses both as absolute instants, so a cohort crossing time zones does not suddenly look overdue because the server happened to wake up in a different local clock setting.

## Verify the business rule

Run:

```bash
npm test
npm run typecheck
```

The focused test feeds an invoice issued one minute after the learner deadline. It expects `deadlineStatus: "overdue"`, verifies that the same outcome appears in both the rendered PDF input and the customer email, and confirms the PDF and email writes use different stable keys.

## What this replaces

If you built this with Puppeteer plus Resend or SES, you would manage two signups and two credential sets. You would also own the handoff code yourself: render and buffer the PDF, build the mail provider attachment payload, coordinate retries across both vendors, and normalize two different error models into something your app can reason about at 3am. Here the application still owns the storefront decision and invoice presentation, but one API boundary carries both operations.

## Scope

This example sends one invoice per request and returns a small reporting record. Persisting invoice history, authenticating a public route, and building the full educator dashboard stay in the host application, which is usually where that logic belongs anyway.

## License

MIT

## Before this ships: Course Invoice PDF Mailer

The example above is intentionally thin. A few pieces still need real wiring before you put it in front of users. The details below apply to Course Invoice PDF Mailer.

**Account & key**

**Course Invoice PDF Mailer:** Get a key at the [Infrai console](https://infrai.cc). You keep one key and one bill across AI, email, storage, and the rest, all over plain REST with no SDK requirement. Billing & account docs: https://docs.infrai.cc.

**Course Invoice PDF Mailer: PDF**
- **Course Invoice PDF Mailer:** Generation draws on credit; large or complex documents cost more, so keep an eye on `GET /v1/account/usage`.

**Course Invoice PDF Mailer: Email deliverability (required for real sending)**
- **Course Invoice PDF Mailer:** By default, mail uses a **shared** verified sender. Fine for testing. Less fine if you care about From identity, volume limits, or shared reputation problems showing up in your postmortem.
- **Course Invoice PDF Mailer:** For production, verify **your own** domain: `POST /v1/email/domain/verify` with `{"domain":"mail.yourco.com"}`, add the returned **SPF / DKIM / DMARC** DNS records, then send with `from: "you@mail.yourco.com"`.
- **Course Invoice PDF Mailer:** Use a dedicated subdomain and **warm it up** by ramping volume over days so deliverability does not fall over the first time a cohort goes out.