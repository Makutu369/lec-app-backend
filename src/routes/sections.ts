import { Hono } from "hono";
import { eq, and } from "drizzle-orm";
import { createDb } from "../db";
import { sections, progress, enrollments } from "../db/schema";
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

sectionsRouter.patch("/:sectionId/complete", authGuard, async (c) => {
  const { sectionId } = c.req.param();
  const user = c.get("user");
  const db = createDb(c.env.DATABASE_URL);

  const [section] = await db
    .select()
    .from(sections)
    .where(eq(sections.id, sectionId))
    .limit(1);

  if (!section) {
    return c.json({ error: "Section not found" }, 404);
  }

  const [enrollment] = await db
    .select()
    .from(enrollments)
    .where(
      and(
        eq(enrollments.userId, user.sub),
        eq(enrollments.courseId, section.courseId)
      )
    )
    .limit(1);

  if (!enrollment) {
    return c.json({ error: "Not enrolled in the course for this section" }, 403);
  }

  await db
    .insert(progress)
    .values({
      userId: user.sub,
      sectionId,
      completed: true,
    })
    .onConflictDoUpdate({
      target: [progress.userId, progress.sectionId],
      set: { completed: true },
    });

  return c.json({ message: "Section marked as completed", sectionId });
});

export default sectionsRouter;
