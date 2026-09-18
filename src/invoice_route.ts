import { createServer, type ServerResponse } from "node:http";
import { ZodError } from "zod";
import { InfraiClient, InfraiError } from "./infrai_client.js";
import { invoiceRequestSchema, issueCourseInvoice } from "./invoice_service.js";

function json(response: ServerResponse, status: number, body: unknown): void {
  response.writeHead(status, { "Content-Type": "application/json" });
  response.end(JSON.stringify(body));
}

async function readJson(request: NodeJS.ReadableStream): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(Buffer.from(chunk));
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

const apiKey = process.env.INFRAI_API_KEY;
if (!apiKey) throw new Error("Set INFRAI_API_KEY before starting the service");

const gateway = new InfraiClient(apiKey);
const server = createServer(async (request, response) => {
  if (request.method !== "POST" || request.url !== "/invoices") {
    json(response, 404, { error: "Route not found" });
    return;
  }

  try {
    const input = invoiceRequestSchema.parse(await readJson(request));
    json(response, 201, await issueCourseInvoice(input, gateway));
  } catch (error) {
    if (error instanceof ZodError) {
      json(response, 400, { error: "Invalid invoice request", issues: error.issues });
      return;
    }
    if (error instanceof SyntaxError) {
      json(response, 400, { error: "Request body must be valid JSON" });
      return;
    }
    if (error instanceof InfraiError) {
      const status = error.status >= 400 && error.status < 500 ? error.status : 502;
      json(response, status, { error: error.code, message: error.message });
      return;
    }
    json(response, 500, { error: "Invoice delivery failed" });
  }
});

const port = Number(process.env.PORT ?? 3000);
server.listen(port, () => console.log(`Invoice service listening on http://localhost:${port}`));
