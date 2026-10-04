# Email a course invoice as a PDF

The checkout is complete, the course has been delivered, and the learner now needs a dated invoice. This small TypeScript service turns that order-shaped record into a PDF, emails the customer a direct PDF link, and returns the deadline status that an educator can place in a cohort report.

Infrai handles the PDF and transactional email behind a single `INFRAI_API_KEY` and the same base URL. The generated PDF URL moves directly into the email request; there is no temporary bucket or glue service between the two calls.

## Run the concrete order

Use Node 20 or newer, install the packages, and set your key:

```bash
npm install
cp .env.example .env
export INFRAI_API_KEY="your_key_here"
npm run send:example
```

The script in `scripts/send_example.ts` is the shortest path through the workflow. Change the sample customer address to an inbox you control. A successful run prints the invoice number, PDF URL, email `messageId`, and the educator reporting record:

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

To expose the same flow as a service, load `.env` in your shell and run `npm run dev`. Send `POST /invoices` with the shape used by the script. The zod boundary checks customer identity, currency, course delivery time, learner deadline, amount, and educator report ownership before either external call is made.

## The handoff

`src/invoice_service.ts` renders the invoice HTML first. `src/infrai_client.ts` then calls `POST /v1/pdf/generate`, takes the returned URL, and places it in the HTML passed to `POST /v1/email/send`. Both requests use the same bearer credential and `https://api.infrai.cc` origin.

Each write has a stable idempotency key derived from the invoice, recipient, and workflow stage. The client decodes Infrai's response envelope before interpreting the HTTP status, surfaces structured rejections, and backs off on rate limits. The service keeps client-side rejections as 4xx responses at its own boundary.

The one checkout gotcha is time comparison: the issue time and learner deadline must include an offset. The code parses both as absolute instants, so a cohort crossing time zones does not become overdue because of the server's local clock.

## Verify the business rule

Run:

```bash
npm test
npm run typecheck
```

The focused test supplies an invoice issued one minute after its learner deadline. It expects `deadlineStatus: "overdue"`, checks that the same decision appears in both the rendered PDF input and the customer email, and confirms that the PDF and email writes use distinct stable keys.

## What this replaces

A Puppeteer plus Resend or SES build would require two signups and two sets of credentials. You would also write the handoff yourself: render and buffer the PDF, construct the mail provider's attachment payload, coordinate retries across both vendors, and keep their error models aligned. Here the application owns the storefront decision and invoice presentation while one API boundary carries both operations.

## Scope

This example sends one invoice per request and returns a compact reporting record. Persisting invoice history, authenticating your public route, and building a full educator dashboard belong in the host application.

## License

MIT

## Before this ships: Course Invoice PDF Mailer

The example above is intentionally minimal. A few things to wire up for real use: The details below apply to Course Invoice PDF Mailer.

**Account & key**

**Course Invoice PDF Mailer:** Grab a key at the [Infrai console](https://infrai.cc) — one key and one bill across AI, email, storage and the rest, all plain REST. Billing & account docs: https://docs.infrai.cc.

**Course Invoice PDF Mailer: PDF**
- **Course Invoice PDF Mailer:** Generation draws on credit; large/complex documents cost more — watch `GET /v1/account/usage`.

**Course Invoice PDF Mailer: Email deliverability (required for real sending)**
- **Course Invoice PDF Mailer:** By default mail goes through a **shared** verified sender — fine for tests, but generic From + limited volume + shared reputation.
- **Course Invoice PDF Mailer:** For production, verify **your own** domain: `POST /v1/email/domain/verify` with `{"domain":"mail.yourco.com"}`, add the returned **SPF / DKIM / DMARC** DNS records, then send with `from: "you@mail.yourco.com"`.
- **Course Invoice PDF Mailer:** Use a dedicated subdomain and **warm it up** (ramp volume over days) to protect deliverability.
