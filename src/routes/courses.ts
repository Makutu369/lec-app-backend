import { Hono } from "hono";
import { eq, and } from "drizzle-orm";
import { createDb } from "../db";
import {
  courses,
  sections,
  enrollments,
  progress,
} from "../db/schema";
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

const coursesRouter = new Hono<Env>();

// ─── GET /api/courses ───────────────────────────────────────────────────────
// Returns all courses with their sections (sorted by sortOrder).
// No auth required — public catalog.
coursesRouter.get("/", async (c) => {
  const db = createDb(c.env.DATABASE_URL);

  const allCourses = await db.query.courses.findMany({
    with: {
      sections: {
        orderBy: (sections, { asc }) => [asc(sections.sortOrder)],
      },
    },
    orderBy: (courses, { desc }) => [desc(courses.createdAt)],
  });

  return c.json(allCourses);
});

// ─── GET /api/courses/:courseId ──────────────────────────────────────────────
// Returns a single course with sections.
coursesRouter.get("/:courseId", async (c) => {
  const { courseId } = c.req.param();
  const db = createDb(c.env.DATABASE_URL);

  const course = await db.query.courses.findFirst({
    where: eq(courses.id, courseId),
    with: {
      sections: {
        orderBy: (sections, { asc }) => [asc(sections.sortOrder)],
      },
    },
  });

  if (!course) {
    return c.json({ error: "Course not found" }, 404);
  }

  return c.json(course);
});

// ─── POST /api/courses/:courseId/enroll ──────────────────────────────────────
// Enroll the authenticated user in a course. Creates progress rows for all sections.
coursesRouter.post("/:courseId/enroll", authGuard, async (c) => {
  const { courseId } = c.req.param();
  const user = c.get("user");
  const db = createDb(c.env.DATABASE_URL);

  // Check course exists
  const [course] = await db
    .select()
    .from(courses)
    .where(eq(courses.id, courseId))
    .limit(1);

  if (!course) {
    return c.json({ error: "Course not found" }, 404);
  }

  // Check not already enrolled
  const [existing] = await db
    .select()
    .from(enrollments)
    .where(
      and(
        eq(enrollments.userId, user.sub),
        eq(enrollments.courseId, courseId)
      )
    )
    .limit(1);

  if (existing) {
    return c.json({ error: "Already enrolled in this course" }, 409);
  }

  // Create enrollment
  const [enrollment] = await db
    .insert(enrollments)
    .values({
      userId: user.sub,
      courseId,
    })
    .returning();

  // Pre-seed progress rows for every section in this course
  const courseSections = await db
    .select()
    .from(sections)
    .where(eq(sections.courseId, courseId));

  if (courseSections.length > 0) {
    await db.insert(progress).values(
      courseSections.map((s) => ({
        userId: user.sub,
        sectionId: s.id,
        completed: false,
      }))
    );
  }

  return c.json(enrollment, 201);
});

// ─── GET /api/courses/:courseId/progress ─────────────────────────────────────
// Returns the authenticated user's section-level progress for a course.
coursesRouter.get("/:courseId/progress", authGuard, async (c) => {
  const { courseId } = c.req.param();
  const user = c.get("user");
  const db = createDb(c.env.DATABASE_URL);

  // Get all sections for the course
  const courseSections = await db
    .select()
    .from(sections)
    .where(eq(sections.courseId, courseId));

  // Get progress rows for these sections
  const sectionIds = courseSections.map((s) => s.id);

  if (sectionIds.length === 0) {
    return c.json({ sections: [] });
  }

  const userProgress = await db
    .select()
    .from(progress)
    .where(eq(progress.userId, user.sub));

  // Filter to only sections belonging to this course
  const sectionIdSet = new Set(sectionIds);
  const courseProgress = userProgress.filter((p) =>
    sectionIdSet.has(p.sectionId)
  );

  return c.json({
    sections: courseProgress.map((p) => ({
      sectionId: p.sectionId,
      completed: p.completed,
    })),
  });
});

export default coursesRouter;
