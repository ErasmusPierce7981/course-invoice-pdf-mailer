import { InfraiClient } from "../src/infrai_client.js";
import { invoiceRequestSchema, issueCourseInvoice } from "../src/invoice_service.js";

const apiKey = process.env.INFRAI_API_KEY;
if (!apiKey) throw new Error("Set INFRAI_API_KEY before running the example");

const input = invoiceRequestSchema.parse({
  invoiceNumber: "EDU-1042",
  issuedAt: "2026-09-18T10:00:00+08:00",
  currency: "USD",
  customer: { name: "Morgan Lee", email: "morgan@example.com" },
  course: {
    title: "Storefront Analytics Workshop",
    deliveredAt: "2026-09-10T09:00:00+08:00",
    learnerDeadline: "2026-09-30T23:59:00+08:00",
    amountMinor: 12900,
  },
  educatorReport: { educatorName: "Taylor Kim", cohort: "September storefront cohort" },
});

const result = await issueCourseInvoice(input, new InfraiClient(apiKey));
console.log(JSON.stringify(result, null, 2));
