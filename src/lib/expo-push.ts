import { eq, inArray, lt } from "drizzle-orm";
import type { Db } from "../db";
import { pushTickets, pushTokens } from "../db/schema";

/**
 * Expo Push Service client (https://docs.expo.dev/push-notifications/sending-notifications/).
 * - Up to 100 messages per send request; tickets come back in the same order.
 * - A ticket only means Expo accepted the message: delivery receipts are
 *   fetched ~15 min later (max 1000 ids per request, kept for 24 h).
 * - DeviceNotRegistered (in a ticket or receipt) = the app was uninstalled
 *   or the token expired: stop sending to it.
 */

export type ExpoPushConfig = {
  /** Overridable so tests can point at a fake Expo. */
  baseUrl?: string;
  /** Only needed if "enhanced push security" is enabled on expo.dev. */
  accessToken?: string;
};

export type PushMessage = {
  to: string;
  title: string;
  body: string;
  data?: Record<string, unknown>;
};

type Ticket =
  | { status: "ok"; id: string }
  | { status: "error"; message?: string; details?: { error?: string } };

type Receipt = { status: "ok" } | { status: "error"; message?: string; details?: { error?: string } };

const DEFAULT_BASE_URL = "https://exp.host/--/api/v2/push";
// Must match the channel the app creates (Android drops pushes for unknown channels).
export const ANDROID_CHANNEL_ID = "default";

const RECEIPT_DELAY_MS = 15 * 60 * 1000;

export function isExpoPushToken(token: string): boolean {
  return /^Expo(nent)?PushToken\[[^\]]+\]$/.test(token);
}

async function expoPost<T>(config: ExpoPushConfig, path: string, body: unknown): Promise<T> {
  let lastError: unknown;
  // Retry 429/5xx with exponential backoff, as Expo recommends.
  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await fetch(`${config.baseUrl ?? DEFAULT_BASE_URL}${path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        ...(config.accessToken ? { Authorization: `Bearer ${config.accessToken}` } : {}),
      },
      body: JSON.stringify(body),
    });
    if (res.ok) {
      const json = (await res.json()) as { data: T };
      return json.data;
    }
    lastError = new Error(`Expo ${path} failed: ${res.status} ${await res.text().catch(() => "")}`);
    if (res.status !== 429 && res.status < 500) break;
    await new Promise((r) => setTimeout(r, 500 * 2 ** attempt));
  }
  throw lastError;
}

async function forgetTokens(db: Db, tokens: string[]): Promise<void> {
  if (tokens.length === 0) return;
  await db.delete(pushTokens).where(inArray(pushTokens.token, tokens));
}

/** Send pushes; records tickets for receipt checks and drops dead tokens. */
export async function sendPushes(db: Db, config: ExpoPushConfig, messages: PushMessage[]): Promise<void> {
  const valid = messages.filter((m) => isExpoPushToken(m.to));
  for (let i = 0; i < valid.length; i += 100) {
    const batch = valid.slice(i, i + 100);
    let tickets: Ticket[];
    try {
      tickets = await expoPost<Ticket[]>(
        config,
        "/send",
        batch.map((m) => ({
          to: m.to,
          title: m.title,
          body: m.body,
          data: m.data ?? {},
          sound: "default",
          channelId: ANDROID_CHANNEL_ID,
          priority: "high",
        }))
      );
    } catch (err) {
      console.error("[push] send failed:", err);
      continue;
    }

    const dead: string[] = [];
    const accepted: { id: string; token: string }[] = [];
    tickets.forEach((ticket, idx) => {
      const token = batch[idx]?.to;
      if (!token) return;
      if (ticket.status === "ok") accepted.push({ id: ticket.id, token });
      else if (ticket.details?.error === "DeviceNotRegistered") dead.push(token);
      else console.warn("[push] ticket error:", ticket.message, ticket.details?.error);
    });

    await forgetTokens(db, dead);
    if (accepted.length > 0) {
      await db.insert(pushTickets).values(accepted).onConflictDoNothing();
    }
  }
}

/**
 * Check receipts of tickets older than 15 minutes; drop tokens Expo reports
 * as unregistered. Tickets are removed once checked (or after 24 h).
 */
export async function processReceipts(db: Db, config: ExpoPushConfig): Promise<{ checked: number; removedTokens: number }> {
  const cutoff = new Date(Date.now() - RECEIPT_DELAY_MS).toISOString();
  const due = await db.select().from(pushTickets).where(lt(pushTickets.createdAt, cutoff)).limit(5000);

  let removedTokens = 0;
  for (let i = 0; i < due.length; i += 1000) {
    const batch = due.slice(i, i + 1000);
    let receipts: Record<string, Receipt>;
    try {
      receipts = await expoPost<Record<string, Receipt>>(config, "/getReceipts", { ids: batch.map((t) => t.id) });
    } catch (err) {
      console.error("[push] receipts failed:", err);
      continue;
    }
    const dead = batch
      .filter((t) => {
        const r = receipts[t.id];
        return r?.status === "error" && r.details?.error === "DeviceNotRegistered";
      })
      .map((t) => t.token);
    for (const t of batch) {
      const r = receipts[t.id];
      if (r?.status === "error" && r.details?.error !== "DeviceNotRegistered") {
        console.warn("[push] receipt error:", r.message, r.details?.error);
      }
    }
    await forgetTokens(db, dead);
    removedTokens += dead.length;
    await db.delete(pushTickets).where(inArray(pushTickets.id, batch.map((t) => t.id)));
  }

  // Receipts are gone after 24 h; don't keep tickets forever.
  const expired = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  await db.delete(pushTickets).where(lt(pushTickets.createdAt, expired));

  return { checked: due.length, removedTokens };
}

export async function tokensForUsers(db: Db, userIds: string[]): Promise<{ userId: string; token: string }[]> {
  if (userIds.length === 0) return [];
  return db
    .select({ userId: pushTokens.userId, token: pushTokens.token })
    .from(pushTokens)
    .where(userIds.length === 1 ? eq(pushTokens.userId, userIds[0]) : inArray(pushTokens.userId, userIds));
}
