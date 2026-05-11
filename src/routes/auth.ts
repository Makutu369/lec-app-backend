import { Hono } from "hono";
import { eq, and } from "drizzle-orm";
import { createDb } from "../db";
import { users, passwordResets } from "../db/schema";
import { hashPassword, comparePassword } from "../lib/password";
import { signToken } from "../lib/jwt";

type Env = {
  Bindings: {
    DATABASE_URL: string;
    JWT_SECRET: string;
  };
};

const auth = new Hono<Env>();

// ─── Helper: strip password from user object ────────────────────────────────
function sanitizeUser(user: typeof users.$inferSelect) {
  const { password: _, ...safe } = user;
  return safe;
}

// ─── POST /api/auth/signin ──────────────────────────────────────────────────
auth.post("/signin", async (c) => {
  const { email, password } = await c.req.json<{
    email: string;
    password: string;
  }>();

  if (!email || !password) {
    return c.json({ error: "Email and password are required" }, 400);
  }

  const db = createDb(c.env.DATABASE_URL);

  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.email, email.toLowerCase().trim()))
    .limit(1);

  if (!user) {
    return c.json({ error: "Invalid email or password" }, 401);
  }

  const valid = await comparePassword(password, user.password);
  if (!valid) {
    return c.json({ error: "Invalid email or password" }, 401);
  }

  const token = await signToken(
    { sub: user.id, email: user.email, role: user.role },
    c.env.JWT_SECRET
  );

  return c.json({ token, user: sanitizeUser(user) });
});

// ─── POST /api/auth/signup ──────────────────────────────────────────────────
auth.post("/signup", async (c) => {
  const body = await c.req.json<{
    firstName: string;
    lastName: string;
    email: string;
    password: string;
    confirmPassword: string;
    megaCenterId?: string;
    userLocation?: string;
  }>();

  const { firstName, lastName, email, password, confirmPassword, megaCenterId, userLocation } = body;

  if (!firstName || !lastName || !email || !password) {
    return c.json({ error: "All fields are required" }, 400);
  }

  if (password !== confirmPassword) {
    return c.json({ error: "Passwords do not match" }, 400);
  }

  if (password.length < 6) {
    return c.json({ error: "Password must be at least 6 characters" }, 400);
  }

  const db = createDb(c.env.DATABASE_URL);

  // Check if user already exists
  const [existing] = await db
    .select()
    .from(users)
    .where(eq(users.email, email.toLowerCase().trim()))
    .limit(1);

  if (existing) {
    return c.json({ error: "A user with this email already exists" }, 409);
  }

  const hashed = await hashPassword(password);

  const [newUser] = await db
    .insert(users)
    .values({
      firstName,
      lastName,
      email: email.toLowerCase().trim(),
      password: hashed,
      megaCenter: megaCenterId || null,
      userLocation: userLocation || null,
      role: "student",
    })
    .returning();

  const token = await signToken(
    { sub: newUser.id, email: newUser.email, role: newUser.role },
    c.env.JWT_SECRET
  );

  return c.json({ token, user: sanitizeUser(newUser) }, 201);
});

// ─── POST /api/auth/forgot-password ─────────────────────────────────────────
auth.post("/forgot-password", async (c) => {
  const { email } = await c.req.json<{ email: string }>();

  if (!email) {
    return c.json({ error: "Email is required" }, 400);
  }

  const db = createDb(c.env.DATABASE_URL);

  // Check user exists (don't reveal whether it does)
  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.email, email.toLowerCase().trim()))
    .limit(1);

  if (!user) {
    // Still return success to prevent email enumeration
    return c.json({ message: "If an account exists, a reset code has been sent" });
  }

  // Generate a 6-digit code
  const code = Math.floor(100000 + Math.random() * 900000).toString();

  // Expires in 15 minutes
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();

  // Delete any existing reset codes for this email
  await db.delete(passwordResets).where(eq(passwordResets.email, email.toLowerCase().trim()));

  // Insert new code
  await db.insert(passwordResets).values({
    email: email.toLowerCase().trim(),
    code,
    expiresAt,
  });

  // TODO: Send email with code (integrate your email provider)
  console.log(`[AUTH] Password reset code for ${email}: ${code}`);

  return c.json({ message: "If an account exists, a reset code has been sent" });
});

// ─── POST /api/auth/verify-reset-code ───────────────────────────────────────
auth.post("/verify-reset-code", async (c) => {
  const { email, code } = await c.req.json<{ email: string; code: string }>();

  if (!email || !code) {
    return c.json({ error: "Email and code are required" }, 400);
  }

  const db = createDb(c.env.DATABASE_URL);

  const [reset] = await db
    .select()
    .from(passwordResets)
    .where(
      and(
        eq(passwordResets.email, email.toLowerCase().trim()),
        eq(passwordResets.code, code)
      )
    )
    .limit(1);

  if (!reset) {
    return c.json({ valid: false, error: "Invalid reset code" }, 400);
  }

  if (new Date(reset.expiresAt) < new Date()) {
    return c.json({ valid: false, error: "Reset code has expired" }, 400);
  }

  return c.json({ valid: true });
});

// ─── POST /api/auth/reset-password ──────────────────────────────────────────
auth.post("/reset-password", async (c) => {
  const { email, code, newPassword } = await c.req.json<{
    email: string;
    code: string;
    newPassword: string;
  }>();

  if (!email || !code || !newPassword) {
    return c.json({ error: "Email, code, and new password are required" }, 400);
  }

  if (newPassword.length < 6) {
    return c.json({ error: "Password must be at least 6 characters" }, 400);
  }

  const db = createDb(c.env.DATABASE_URL);

  // Verify code again
  const [reset] = await db
    .select()
    .from(passwordResets)
    .where(
      and(
        eq(passwordResets.email, email.toLowerCase().trim()),
        eq(passwordResets.code, code)
      )
    )
    .limit(1);

  if (!reset || new Date(reset.expiresAt) < new Date()) {
    return c.json({ error: "Invalid or expired reset code" }, 400);
  }

  const hashed = await hashPassword(newPassword);

  // Update user password
  await db
    .update(users)
    .set({ password: hashed })
    .where(eq(users.email, email.toLowerCase().trim()));

  // Clean up reset code
  await db.delete(passwordResets).where(eq(passwordResets.email, email.toLowerCase().trim()));

  return c.json({ message: "Password has been reset successfully" });
});

export default auth;
