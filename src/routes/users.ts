import { Hono } from "hono";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { createDb } from "../db";
import { megaCenters, users } from "../db/schema";
import { authGuard } from "../middleware/auth";
import type { JwtPayload } from "../lib/jwt";

type Env = {
  Bindings: {
    DATABASE_URL: string;
    JWT_SECRET: string;
  };
  Variables: {
    user: JwtPayload;
  };
};

const usersRouter = new Hono<Env>();

const updateMeSchema = z
  .object({
    firstName: z.string().trim().min(1).max(100),
    lastName: z.string().trim().min(1).max(100),
    userLocation: z.string().trim().max(200).nullable(),
    // Mega center id (users.megaCenter stores the id).
    megaCenter: z.string().uuid().nullable(),
  })
  .partial()
  .refine((d) => Object.keys(d).length > 0, "Nothing to update");

function sanitize(user: typeof users.$inferSelect) {
  const { password, ...safe } = user;
  void password;
  return safe;
}

// GET /api/users/me
usersRouter.get("/me", authGuard, async (c) => {
  const db = createDb(c.env.DATABASE_URL);
  const [user] = await db.select().from(users).where(eq(users.id, c.get("user").sub)).limit(1);
  if (!user) {
    return c.json({ error: "User not found" }, 404);
  }
  return c.json(sanitize(user));
});

// PATCH /api/users/me - edit profile (name, location, mega center).
// Email and role are not editable here.
usersRouter.patch("/me", authGuard, async (c) => {
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Invalid JSON body" }, 400);
  }
  const parsed = updateMeSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: parsed.error.issues[0].message }, 400);
  }

  const db = createDb(c.env.DATABASE_URL);
  if (parsed.data.megaCenter) {
    const [center] = await db
      .select({ id: megaCenters.id })
      .from(megaCenters)
      .where(eq(megaCenters.id, parsed.data.megaCenter))
      .limit(1);
    if (!center) {
      return c.json({ error: "Mega center not found" }, 404);
    }
  }

  const [updated] = await db
    .update(users)
    .set(parsed.data)
    .where(eq(users.id, c.get("user").sub))
    .returning();
  if (!updated) {
    return c.json({ error: "User not found" }, 404);
  }
  return c.json(sanitize(updated));
});

export default usersRouter;
