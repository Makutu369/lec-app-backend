import { Hono } from "hono";
import { eq } from "drizzle-orm";
import { createDb } from "../db";
import { payments } from "../db/schema";
import { isValidWebhookSignature } from "../lib/paystack";
import { fulfillPayment } from "../lib/exam-payment";

type Env = {
  Bindings: {
    DATABASE_URL: string;
    JWT_SECRET: string;
    PAYSTACK_SECRET_KEY?: string;
  };
};

const paymentsRouter = new Hono<Env>();

// POST /api/payments/paystack/webhook - Paystack calls this when a payment
// completes. Set it as the Webhook URL in the Paystack dashboard.
paymentsRouter.post("/paystack/webhook", async (c) => {
  const secret = c.env.PAYSTACK_SECRET_KEY;
  if (!secret) {
    return c.json({ error: "Payments not configured" }, 503);
  }

  const rawBody = await c.req.text();
  const valid = await isValidWebhookSignature(
    rawBody,
    c.req.header("x-paystack-signature"),
    secret
  );
  if (!valid) {
    return c.json({ error: "Invalid signature" }, 401);
  }

  let event: { event?: string; data?: { reference?: string; amount?: number; currency?: string; status?: string } };
  try {
    event = JSON.parse(rawBody);
  } catch {
    return c.json({ error: "Invalid JSON body" }, 400);
  }

  if (event.event === "charge.success" && event.data?.reference) {
    const db = createDb(c.env.DATABASE_URL);
    const [payment] = await db
      .select()
      .from(payments)
      .where(eq(payments.reference, event.data.reference))
      .limit(1);

    const paidInFull =
      payment &&
      (event.data.amount ?? 0) >= payment.amount &&
      (event.data.currency ?? "").toUpperCase() === payment.currency.toUpperCase();

    if (paidInFull) {
      await fulfillPayment(db, payment);
    } else {
      console.warn("Webhook for unknown or short payment:", event.data.reference);
    }
  }

  // Always acknowledge a correctly signed event so Paystack stops retrying.
  return c.json({ received: true });
});

// GET /api/payments/paystack/callback - Paystack sends the browser here after
// checkout; hand control back to the app, which then checks the payment status.
paymentsRouter.get("/paystack/callback", (c) => {
  const reference = c.req.query("reference") ?? c.req.query("trxref") ?? "";
  const appUrl = `wtgf://payments/complete?reference=${encodeURIComponent(reference)}`;
  return c.html(
    `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">` +
      `<meta http-equiv="refresh" content="0;url=${appUrl}"><title>Payment received</title></head>` +
      `<body style="font-family:sans-serif;text-align:center;padding:48px 24px">` +
      `<h2>Payment received</h2><p>Return to the app to start your exam.</p>` +
      `<p><a href="${appUrl}">Back to the app</a></p></body></html>`,
    302,
    { Location: appUrl }
  );
});

export default paymentsRouter;
