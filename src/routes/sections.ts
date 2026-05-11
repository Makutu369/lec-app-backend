import { Hono } from "hono";
import { eq, and } from "drizzle-orm";
import { createDb } from "../db";
import { sections, progress } from "../db/schema";
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

const sectionsRouter = new Hono<Env>();

// ─── PATCH /api/sections/:sectionId/complete ────────────────────────────────
// Mark a section as completed for the authenticated user.
// If no progress row exists (e.g. user wasn't pre-seeded), create one.
sectionsRouter.patch("/:sectionId/complete", authGuard, async (c) => {
  const { sectionId } = c.req.param();
  const user = c.get("user");
  const db = createDb(c.env.DATABASE_URL);

  // Verify section exists
  const [section] = await db
    .select()
    .from(sections)
    .where(eq(sections.id, sectionId))
    .limit(1);

  if (!section) {
    return c.json({ error: "Section not found" }, 404);
  }

  // Check if progress row exists
  const [existing] = await db
    .select()
    .from(progress)
    .where(
      and(
        eq(progress.userId, user.sub),
        eq(progress.sectionId, sectionId)
      )
    )
    .limit(1);

  if (existing) {
    // Update existing
    await db
      .update(progress)
      .set({ completed: true })
      .where(eq(progress.id, existing.id));
  } else {
    // Create new progress row
    await db.insert(progress).values({
      userId: user.sub,
      sectionId,
      completed: true,
    });
  }

  return c.json({ message: "Section marked as completed", sectionId });
});

export default sectionsRouter;
