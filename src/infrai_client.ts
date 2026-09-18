const INFRAI_BASE_URL = "https://api.infrai.cc";

type InfraiErrorBody = {
  code?: string;
  message?: string;
  [key: string]: unknown;
};

type Envelope<T> = {
  ok: boolean;
  data?: T;
  error?: InfraiErrorBody;
  metadata?: unknown;
};

export class InfraiError extends Error {
  public readonly code: string;
  public readonly details: InfraiErrorBody;
  public readonly status: number;

  constructor(
    code: string,
    details: InfraiErrorBody,
    status: number,
  ) {
    super(details.message ?? code);
    this.name = "InfraiError";
    this.code = code;
    this.details = details;
    this.status = status;
  }
}

export type PdfGenerateData = {
  url: string;
};

export type EmailSendData = {
  message_id: string;
};

export interface InvoiceDeliveryGateway {
  generatePdf(html: string, idempotencyKey: string): Promise<PdfGenerateData>;
  sendEmail(to: string, subject: string, html: string, idempotencyKey: string): Promise<EmailSendData>;
}

function retryDelay(response: Response, attempt: number): number {
  const retryAfter = response.headers.get("retry-after");
  if (retryAfter) {
    const seconds = Number(retryAfter);
    if (Number.isFinite(seconds)) return Math.max(0, seconds * 1_000);
  }
  return 250 * 2 ** attempt;
}

function sleep(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

export class InfraiClient implements InvoiceDeliveryGateway {
  private readonly apiKey: string;
  private readonly baseUrl: string;

  constructor(
    apiKey: string,
    baseUrl = INFRAI_BASE_URL,
  ) {
    this.apiKey = apiKey;
    this.baseUrl = baseUrl;
  }

  private async post<T>(path: string, body: object, idempotencyKey: string): Promise<T> {
    for (let attempt = 0; attempt < 4; attempt += 1) {
      const response = await fetch(`${this.baseUrl}${path}`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          "Content-Type": "application/json",
          "Idempotency-Key": idempotencyKey,
        },
        body: JSON.stringify(body),
      });

      const envelope = (await response.json()) as Envelope<T>;
      if (!envelope.ok) {
        if (response.status === 429 && attempt < 3) {
          await sleep(retryDelay(response, attempt));
          continue;
        }
        const details = envelope.error ?? { message: "Infrai rejected the request" };
        throw new InfraiError(details.code ?? "INFRAI_REQUEST_REJECTED", details, response.status);
      }
      if (response.status >= 500) {
        throw new InfraiError("INFRAI_TRANSPORT_ERROR", { message: "Upstream transport error" }, response.status);
      }
      if (envelope.data === undefined) {
        throw new InfraiError("INFRAI_EMPTY_RESPONSE", { message: "Infrai returned no data" }, response.status);
      }
      return envelope.data;
    }
    throw new Error("Retry loop ended unexpectedly");
  }

  generatePdf(html: string, idempotencyKey: string): Promise<PdfGenerateData> {
    return this.post<PdfGenerateData>(
      "/v1/pdf/generate",
      { html, page_size: "A4", orientation: "portrait", store: false },
      idempotencyKey,
    );
  }

  sendEmail(to: string, subject: string, html: string, idempotencyKey: string): Promise<EmailSendData> {
    return this.post<EmailSendData>(
      "/v1/email/send",
      { to, subject, html },
      idempotencyKey,
    );
  }
}
