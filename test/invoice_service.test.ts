import assert from "node:assert/strict";
import test from "node:test";
import type { InvoiceDeliveryGateway } from "../src/infrai_client.js";
import { issueCourseInvoice, type InvoiceRequest } from "../src/invoice_service.js";

test("an invoice issued after the learner deadline is reported overdue in the PDF and email", async () => {
  const calls: Array<{ kind: string; content: string; key: string }> = [];
  const gateway: InvoiceDeliveryGateway = {
    async generatePdf(html, key) {
      calls.push({ kind: "pdf", content: html, key });
      return { url: "https://documents.example/EDU-1042.pdf" };
    },
    async sendEmail(_to, _subject, html, key) {
      calls.push({ kind: "email", content: html, key });
      return { message_id: "msg_1042" };
    },
  };
  const input: InvoiceRequest = {
    invoiceNumber: "EDU-1042",
    issuedAt: "2026-10-01T00:00:00Z",
    currency: "USD",
    customer: { name: "Morgan Lee", email: "morgan@example.com" },
    course: {
      title: "Storefront Analytics Workshop",
      deliveredAt: "2026-09-10T09:00:00Z",
      learnerDeadline: "2026-09-30T23:59:00Z",
      amountMinor: 12900,
    },
    educatorReport: { educatorName: "Taylor Kim", cohort: "September cohort" },
  };

  const result = await issueCourseInvoice(input, gateway);

  assert.equal(result.reporting.deadlineStatus, "overdue");
  assert.match(calls[0].content, /Deadline status at issue: <strong>overdue<\/strong>/);
  assert.match(calls[1].content, /documents\.example\/EDU-1042\.pdf/);
  assert.match(calls[1].content, /Status: overdue/);
  assert.notEqual(calls[0].key, calls[1].key);
});
