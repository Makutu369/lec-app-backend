import { eq, and, isNull } from "drizzle-orm";
import type { Db } from "../db";
import { refreshTokens, type User } from "../db/schema";
import { signToken } from "./jwt";

/** Refresh tokens last this long; each refresh issues a new one, so active users stay signed in. */
const REFRESH_TOKEN_TTL_DAYS = 60;

export type TokenPair = { token: string; refreshToken: string };

function randomToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value)
  );
  return Array.from(new Uint8Array(digest), (b) =>
    b.toString(16).padStart(2, "0")
  ).join("");
}

/** Sign an access token and store a new refresh token for the user. */
export async function issueTokenPair(
  db: Db,
  user: Pick<User, "id" | "email" | "role">,
  secret: string
): Promise<TokenPair> {
  const token = await signToken(
    { sub: user.id, email: user.email, role: user.role },
    secret
  );
  const refreshToken = randomToken();
  const expiresAt = new Date(
    Date.now() + REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000
  ).toISOString();

  await db.insert(refreshTokens).values({
    userId: user.id,
    tokenHash: await sha256(refreshToken),
    expiresAt,
  });

  return { token, refreshToken };
}

export type RotateResult =
  | { ok: true; userId: string }
  | { ok: false; reason: "invalid" | "expired" | "reused" };

/**
 * Validate a refresh token and revoke it (single use). Presenting an already
 * revoked token means it was copied or stolen, so every session of that user
 * is revoked.
 */
export async function consumeRefreshToken(
  db: Db,
  refreshToken: string
): Promise<RotateResult> {
  const [row] = await db
    .select()
    .from(refreshTokens)
    .where(eq(refreshTokens.tokenHash, await sha256(refreshToken)))
    .limit(1);

  if (!row) return { ok: false, reason: "invalid" };

  if (row.revokedAt) {
    await revokeAllForUser(db, row.userId);
    return { ok: false, reason: "reused" };
  }

  if (new Date(row.expiresAt) < new Date()) {
    return { ok: false, reason: "expired" };
  }

  // Conditional update so two concurrent refreshes can't both succeed.
  const [revoked] = await db
    .update(refreshTokens)
    .set({ revokedAt: new Date().toISOString() })
    .where(and(eq(refreshTokens.id, row.id), isNull(refreshTokens.revokedAt)))
    .returning({ id: refreshTokens.id });

  if (!revoked) return { ok: false, reason: "reused" };

  return { ok: true, userId: row.userId };
}

/** Revoke one refresh token (sign out on this device). Unknown tokens are ignored. */
export async function revokeRefreshToken(
  db: Db,
  refreshToken: string
): Promise<void> {
  await db
    .update(refreshTokens)
    .set({ revokedAt: new Date().toISOString() })
    .where(
      and(
        eq(refreshTokens.tokenHash, await sha256(refreshToken)),
        isNull(refreshTokens.revokedAt)
      )
    );
}

/** Revoke every refresh token of a user (sign out everywhere). */
export async function revokeAllForUser(db: Db, userId: string): Promise<void> {
  await db
    .update(refreshTokens)
    .set({ revokedAt: new Date().toISOString() })
    .where(
      and(eq(refreshTokens.userId, userId), isNull(refreshTokens.revokedAt))
    );
}
