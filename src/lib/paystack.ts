/**
 * Minimal Paystack client (https://paystack.com/docs/api/).
 * Amounts are in the currency's minor unit (pesewas for GHS).
 */

export type PaystackConfig = {
  secretKey: string;
  /** Overridable so tests can point at a fake Paystack. */
  baseUrl?: string;
};

const DEFAULT_BASE_URL = "https://api.paystack.co";

async function paystackFetch<T>(
  config: PaystackConfig,
  path: string,
  init: RequestInit = {}
): Promise<T> {
  const res = await fetch(`${config.baseUrl ?? DEFAULT_BASE_URL}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${config.secretKey}`,
      "Content-Type": "application/json",
    },
  });
  const body = (await res.json().catch(() => ({}))) as {
    status?: boolean;
    message?: string;
    data?: unknown;
  };
  if (!res.ok || !body.status) {
    throw new Error(`Paystack ${path} failed: ${res.status} ${body.message ?? ""}`);
  }
  return body.data as T;
}

/** Start a hosted checkout; the customer pays on `authorizationUrl`. */
export async function initializeTransaction(
  config: PaystackConfig,
  params: {
    email: string;
    amount: number;
    currency: string;
    reference: string;
    callbackUrl: string;
    metadata: Record<string, string>;
  }
): Promise<{ authorizationUrl: string }> {
  const data = await paystackFetch<{ authorization_url: string }>(
    config,
    "/transaction/initialize",
    {
      method: "POST",
      body: JSON.stringify({
        email: params.email,
        amount: params.amount,
        currency: params.currency,
        reference: params.reference,
        callback_url: params.callbackUrl,
        metadata: params.metadata,
        channels: ["mobile_money", "card"],
      }),
    }
  );
  return { authorizationUrl: data.authorization_url };
}

export type VerifiedTransaction = {
  status: string; // "success" | "failed" | "abandoned" | ...
  amount: number;
  currency: string;
  reference: string;
};

/** Ask Paystack for the authoritative state of a transaction. */
export function verifyTransaction(
  config: PaystackConfig,
  reference: string
): Promise<VerifiedTransaction> {
  return paystackFetch<VerifiedTransaction>(
    config,
    `/transaction/verify/${encodeURIComponent(reference)}`
  );
}

/**
 * Paystack signs webhooks with HMAC-SHA512 of the raw body using the secret
 * key, sent as `x-paystack-signature` (hex).
 */
export async function isValidWebhookSignature(
  rawBody: string,
  signature: string | undefined,
  secretKey: string
): Promise<boolean> {
  if (!signature) return false;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secretKey),
    { name: "HMAC", hash: "SHA-512" },
    false,
    ["sign"]
  );
  const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(rawBody));
  const expected = Array.from(new Uint8Array(mac), (b) =>
    b.toString(16).padStart(2, "0")
  ).join("");

  // Constant-time comparison.
  if (expected.length !== signature.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) {
    diff |= expected.charCodeAt(i) ^ signature.charCodeAt(i);
  }
  return diff === 0;
}
