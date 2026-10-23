import { Hono } from "hono";
import { and, count, desc, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { createDb } from "../db";
import { notifications, pushTokens, users } from "../db/schema";
import { authGuard } from "../middleware/auth";
import { adminGuard } from "../middleware/admin";
import type { JwtPayload } from "../lib/jwt";
import { isExpoPushToken } from "../lib/expo-push";
import { notifyUsers, pushConfig } from "../lib/notify";

type Env = {
  Bindings: {
    DATABASE_URL: string;
    JWT_SECRET: string;
    EXPO_PUSH_URL?: string;
    EXPO_ACCESS_TOKEN?: string;
  };
  Variables: {
    user: JwtPayload;
  };
};

const notificationsRouter = new Hono<Env>();

const deviceSchema = z.object({
  token: z.string().max(255).refine(isExpoPushToken, "Invalid Expo push token"),
  platform: z.enum(["android", "ios", "web"]).optional(),
});

const preferencesSchema = z.object({
  reminders: z.boolean(),
});

const routeDataSchema = z
  .object({
    url: z.string().startsWith("/").max(200),
    params: z.record(z.string(), z.string()).optional(),
  })
  .optional();

const broadcastSchema = z.object({
  title: z.string().min(1).max(200),
  body: z.string().min(1).max(1000),
  data: routeDataSchema,
});

const sendSchema = broadcastSchema.extend({
  userId: z.string().uuid(),
});

async function readJson(c: { req: { json: () => Promise<unknown> } }): Promise<unknown | undefined> {
  try {
    return await c.req.json();
  } catch {
    return undefined;
  }
}

// POST /api/notifications/devices - register this device's Expo push token.
// Called on every app launch, so it also records when the user was last active.
notificationsRouter.post("/devices", authGuard, async (c) => {
  const parsed = deviceSchema.safeParse(await readJson(c));
  if (!parsed.success) {
    return c.json({ error: parsed.error.issues[0].message }, 400);
  }
  const user = c.get("user");
  const db = createDb(c.env.DATABASE_URL);
  const now = new Date().toISOString();

  // A device belongs to whoever signed in on it last.
  await db
    .insert(pushTokens)
    .values({ userId: user.sub, token: parsed.data.token, platform: parsed.data.platform ?? null })
    .onConflictDoUpdate({
      target: pushTokens.token,
      set: { userId: user.sub, platform: parsed.data.platform ?? null, lastSeenAt: now },
    });

  return c.json({ registered: true });
});

// DELETE /api/notifications/devices - stop pushes to this device (sign out).
notificationsRouter.delete("/devices", authGuard, async (c) => {
  const body = (await readJson(c)) as { token?: unknown } | undefined;
  if (typeof body?.token !== "string") {
    return c.json({ error: "token is required" }, 400);
  }
  const db = createDb(c.env.DATABASE_URL);
  await db
    .delete(pushTokens)
    .where(and(eq(pushTokens.token, body.token), eq(pushTokens.userId, c.get("user").sub)));
  return c.json({ removed: true });
});

// GET /api/notifications - the user's inbox (latest 50) and unread count.
notificationsRouter.get("/", authGuard, async (c) => {
  const user = c.get("user");
  const db = createDb(c.env.DATABASE_URL);

  const items = await db
    .select({
      id: notifications.id,
      type: notifications.type,
      title: notifications.title,
      body: notifications.body,
      data: notifications.data,
      readAt: notifications.readAt,
      createdAt: notifications.createdAt,
    })
    .from(notifications)
    .where(eq(notifications.userId, user.sub))
    .orderBy(desc(notifications.createdAt))
    .limit(50);

  const [{ unread }] = await db
    .select({ unread: count() })
    .from(notifications)
    .where(and(eq(notifications.userId, user.sub), isNull(notifications.readAt)));

  return c.json({ items, unreadCount: unread });
});

// POST /api/notifications/read-all (before /:id/read)
notificationsRouter.post("/read-all", authGuard, async (c) => {
  const db = createDb(c.env.DATABASE_URL);
  await db
    .update(notifications)
    .set({ readAt: new Date().toISOString() })
    .where(and(eq(notifications.userId, c.get("user").sub), isNull(notifications.readAt)));
  return c.json({ ok: true });
});

notificationsRouter.post("/:id/read", authGuard, async (c) => {
  const { id } = c.req.param();
  const db = createDb(c.env.DATABASE_URL);
  await db
    .update(notifications)
    .set({ readAt: new Date().toISOString() })
    .where(
      and(
        eq(notifications.id, id),
        eq(notifications.userId, c.get("user").sub),
        isNull(notifications.readAt)
      )
    );
  return c.json({ ok: true });
});

// GET/PUT /api/notifications/preferences - reminders on/off.
notificationsRouter.get("/preferences", authGuard, async (c) => {
  const db = createDb(c.env.DATABASE_URL);
  const [row] = await db
    .select({ reminders: users.notifyReminders })
    .from(users)
    .where(eq(users.id, c.get("user").sub))
    .limit(1);
  return c.json({ reminders: row?.reminders ?? true });
});

notificationsRouter.put("/preferences", authGuard, async (c) => {
  const parsed = preferencesSchema.safeParse(await readJson(c));
  if (!parsed.success) {
    return c.json({ error: parsed.error.issues[0].message }, 400);
  }
  const db = createDb(c.env.DATABASE_URL);
  await db
    .update(users)
    .set({ notifyReminders: parsed.data.reminders })
    .where(eq(users.id, c.get("user").sub));
  return c.json({ reminders: parsed.data.reminders });
});

// POST /api/notifications/broadcast (admin) - announcement to every user,
// e.g. a new course or exam. `data.url` is the app screen to open on tap.
notificationsRouter.post("/broadcast", authGuard, adminGuard, async (c) => {
  const parsed = broadcastSchema.safeParse(await readJson(c));
  if (!parsed.success) {
    return c.json({ error: parsed.error.issues[0].message }, 400);
  }
  const db = createDb(c.env.DATABASE_URL);
  const everyone = await db.select({ id: users.id }).from(users);
  // One dedupe key per broadcast so a retried request isn't sent twice.
  const key = `broadcast:${crypto.randomUUID()}`;

  const sent = await notifyUsers(
    db,
    pushConfig(c.env),
    everyone.map((u) => ({
      userId: u.id,
      type: "announcement" as const,
      title: parsed.data.title,
      body: parsed.data.body,
      data: parsed.data.data,
      dedupeKey: key,
    }))
  );
  return c.json({ recipients: sent });
});

// POST /api/notifications/send (admin) - message one user.
notificationsRouter.post("/send", authGuard, adminGuard, async (c) => {
  const parsed = sendSchema.safeParse(await readJson(c));
  if (!parsed.success) {
    return c.json({ error: parsed.error.issues[0].message }, 400);
  }
  const db = createDb(c.env.DATABASE_URL);
  const sent = await notifyUsers(db, pushConfig(c.env), [
    {
      userId: parsed.data.userId,
      type: "announcement",
      title: parsed.data.title,
      body: parsed.data.body,
      data: parsed.data.data,
    },
  ]);
  return c.json({ sent });
});

export default notificationsRouter;
