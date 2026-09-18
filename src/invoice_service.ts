import { createHash } from "node:crypto";
import { z } from "zod";
import type { InvoiceDeliveryGateway } from "./infrai_client.js";

export const invoiceRequestSchema = z.object({
  invoiceNumber: z.string().trim().min(1).max(80),
  issuedAt: z.string().datetime({ offset: true }),
  currency: z.string().regex(/^[A-Z]{3}$/),
  customer: z.object({
    name: z.string().trim().min(1).max(120),
    email: z.string().email(),
  }),
  course: z.object({
    title: z.string().trim().min(1).max(160),
    deliveredAt: z.string().datetime({ offset: true }),
    learnerDeadline: z.string().datetime({ offset: true }),
    amountMinor: z.number().int().nonnegative(),
  }),
  educatorReport: z.object({
    educatorName: z.string().trim().min(1).max(120),
    cohort: z.string().trim().min(1).max(120),
  }),
});

export type InvoiceRequest = z.infer<typeof invoiceRequestSchema>;
export type DeadlineStatus = "on_track" | "overdue";

export type InvoiceResult = {
  invoiceNumber: string;
  pdfUrl: string;
  messageId: string;
  reporting: {
    educatorName: string;
    cohort: string;
    deadlineStatus: DeadlineStatus;
  };
};

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "\"": "&quot;",
    "'": "&#39;",
  })[character] ?? character);
}

function formatAmount(amountMinor: number, currency: string): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(amountMinor / 100);
}

export function deadlineStatus(input: InvoiceRequest): DeadlineStatus {
  return Date.parse(input.issuedAt) > Date.parse(input.course.learnerDeadline) ? "overdue" : "on_track";
}

export function renderInvoiceHtml(input: InvoiceRequest): string {
  const status = deadlineStatus(input);
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>Invoice ${escapeHtml(input.invoiceNumber)}</title></head>
<body style="font-family:Arial,sans-serif;color:#17202a;margin:40px">
  <h1>Course invoice</h1>
  <p><strong>Invoice:</strong> ${escapeHtml(input.invoiceNumber)}</p>
  <p><strong>Customer:</strong> ${escapeHtml(input.customer.name)}</p>
  <hr>
  <h2>${escapeHtml(input.course.title)}</h2>
  <p>Delivered: ${escapeHtml(input.course.deliveredAt)}</p>
  <p>Learner deadline: ${escapeHtml(input.course.learnerDeadline)}</p>
  <p>Deadline status at issue: <strong>${status}</strong></p>
  <p>Amount: <strong>${escapeHtml(formatAmount(input.course.amountMinor, input.currency))}</strong></p>
  <hr>
  <p>Educator report: ${escapeHtml(input.educatorReport.educatorName)} · ${escapeHtml(input.educatorReport.cohort)}</p>
</body></html>`;
}

function deliveryKey(input: InvoiceRequest, stage: "pdf" | "email"): string {
  return createHash("sha256").update(`${input.invoiceNumber}:${input.customer.email}:${stage}`).digest("hex");
}

export async function issueCourseInvoice(
  input: InvoiceRequest,
  gateway: InvoiceDeliveryGateway,
): Promise<InvoiceResult> {
  const status = deadlineStatus(input);
  const pdf = await gateway.generatePdf(renderInvoiceHtml(input), deliveryKey(input, "pdf"));
  const emailHtml = `<p>Hello ${escapeHtml(input.customer.name)},</p>
<p>Your invoice for ${escapeHtml(input.course.title)} is ready.</p>
<p><a href="${escapeHtml(pdf.url)}">Download invoice ${escapeHtml(input.invoiceNumber)} (PDF)</a></p>
<p>Learner deadline: ${escapeHtml(input.course.learnerDeadline)} · Status: ${status}</p>`;
  const email = await gateway.sendEmail(
    input.customer.email,
    `Invoice ${input.invoiceNumber} · ${input.course.title}`,
    emailHtml,
    deliveryKey(input, "email"),
  );

  return {
    invoiceNumber: input.invoiceNumber,
    pdfUrl: pdf.url,
    messageId: email.message_id,
    reporting: {
      educatorName: input.educatorReport.educatorName,
      cohort: input.educatorReport.cohort,
      deadlineStatus: status,
    },
  };
}
