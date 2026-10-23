import { Hono } from "hono";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { createDb } from "../db";
import { users } from "../db/schema";
import { authGuard } from "../middleware/auth";
import type { JwtPayload } from "../lib/jwt";
import { resolveAffiliation } from "../lib/affiliation";

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
    // Branch id (users.branch). Changing branch needs that branch's mega
    // center too, if it has any.
    branch: z.string().max(24).nullable(),
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

// PATCH /api/users/me - edit profile (name, location, branch, mega center).
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
  const { branch, megaCenter, ...rest } = parsed.data;
  const changes: Partial<typeof users.$inferInsert> = rest;

  if (branch !== undefined || megaCenter !== undefined) {
    const [current] = await db
      .select({ branch: users.branch, megaCenter: users.megaCenter })
      .from(users)
      .where(eq(users.id, c.get("user").sub))
      .limit(1);
    if (!current) {
      return c.json({ error: "User not found" }, 404);
    }
    // Only a mega center given: its branch wins. Only a branch given: keep the
    // current mega center if it's the same branch, else one must be picked.
    const affiliation = await resolveAffiliation(db, {
      branchId: branch !== undefined ? branch : megaCenter ? undefined : current.branch,
      megaCenterId:
        megaCenter !== undefined ? megaCenter : branch === current.branch ? current.megaCenter : null,
    });
    if (!affiliation.ok) {
      return c.json({ error: affiliation.error }, 400);
    }
    Object.assign(changes, affiliation.value);
  }

  const [updated] = await db
    .update(users)
    .set(changes)
    .where(eq(users.id, c.get("user").sub))
    .returning();
  if (!updated) {
    return c.json({ error: "User not found" }, 404);
  }
  return c.json(sanitize(updated));
});

export default usersRouter;
