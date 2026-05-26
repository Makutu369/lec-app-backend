import { Hono } from "hono";
import { eq, and } from "drizzle-orm";
import { z } from "zod";
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

const signinSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

const signupSchema = z.object({
  firstName: z.string().min(1).max(100),
  lastName: z.string().min(1).max(100),
  email: z.string().email(),
  password: z.string().min(6).max(128),
  confirmPassword: z.string().min(6).max(128),
  megaCenterId: z.string().nullable().optional(),
  userLocation: z.string().max(200).nullable().optional(),
}).refine((d) => d.password === d.confirmPassword, {
  message: "Passwords do not match",
  path: ["confirmPassword"],
});

const forgotPasswordSchema = z.object({
  email: z.string().email(),
});

const verifyResetCodeSchema = z.object({
  email: z.string().email(),
  code: z.string().length(6),
});

const resetPasswordSchema = z.object({
  email: z.string().email(),
  code: z.string().length(6),
  newPassword: z.string().min(6).max(128),
});

function sanitizeUser(user: typeof users.$inferSelect) {
  const { password, ...safe } = user;
  void password;
  return safe;
}

auth.post("/signin", async (c) => {
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Invalid JSON body" }, 400);
  }

  const parsed = signinSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: parsed.error.issues[0].message }, 400);
  }

  const { email, password } = parsed.data;
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

auth.post("/signup", async (c) => {
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Invalid JSON body" }, 400);
  }

  const parsed = signupSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: parsed.error.issues[0].message }, 400);
  }

  const { firstName, lastName, email, password, megaCenterId, userLocation } = parsed.data;
  const db = createDb(c.env.DATABASE_URL);

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

auth.post("/forgot-password", async (c) => {
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Invalid JSON body" }, 400);
  }

  const parsed = forgotPasswordSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: parsed.error.issues[0].message }, 400);
  }

  const { email } = parsed.data;
  const db = createDb(c.env.DATABASE_URL);

  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.email, email.toLowerCase().trim()))
    .limit(1);

  if (!user) {
    return c.json({ message: "If an account exists, a reset code has been sent" });
  }

  const codeBytes = crypto.getRandomValues(new Uint8Array(4));
  const code = Array.from(codeBytes)
    .map((b) => (b % 10).toString())
    .join("");

  const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();

  await db.delete(passwordResets).where(eq(passwordResets.email, email.toLowerCase().trim()));

  await db.insert(passwordResets).values({
    email: email.toLowerCase().trim(),
    code,
    expiresAt,
  });

  // TODO: Send email with code (integrate your email provider)
  // Intentionally NOT logging the code to avoid exposing it in production logs

  return c.json({ message: "If an account exists, a reset code has been sent" });
});

auth.post("/verify-reset-code", async (c) => {
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Invalid JSON body" }, 400);
  }

  const parsed = verifyResetCodeSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: parsed.error.issues[0].message }, 400);
  }

  const { email, code } = parsed.data;
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

auth.post("/reset-password", async (c) => {
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Invalid JSON body" }, 400);
  }

  const parsed = resetPasswordSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: parsed.error.issues[0].message }, 400);
  }

  const { email, code, newPassword } = parsed.data;
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

  if (!reset || new Date(reset.expiresAt) < new Date()) {
    return c.json({ error: "Invalid or expired reset code" }, 400);
  }

  const hashed = await hashPassword(newPassword);

  await db
    .update(users)
    .set({ password: hashed })
    .where(eq(users.email, email.toLowerCase().trim()));

  await db.delete(passwordResets).where(eq(passwordResets.email, email.toLowerCase().trim()));

  return c.json({ message: "Password has been reset successfully" });
});

export default auth;
