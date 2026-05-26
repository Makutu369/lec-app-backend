import { Hono } from "hono";
import { eq, and, inArray } from "drizzle-orm";
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

coursesRouter.post("/:courseId/enroll", authGuard, async (c) => {
  const { courseId } = c.req.param();
  const user = c.get("user");
  const db = createDb(c.env.DATABASE_URL);

  const [course] = await db
    .select()
    .from(courses)
    .where(eq(courses.id, courseId))
    .limit(1);

  if (!course) {
    return c.json({ error: "Course not found" }, 404);
  }

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

  const [enrollment] = await db
    .insert(enrollments)
    .values({
      userId: user.sub,
      courseId,
    })
    .returning();

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

coursesRouter.get("/:courseId/progress", authGuard, async (c) => {
  const { courseId } = c.req.param();
  const user = c.get("user");
  const db = createDb(c.env.DATABASE_URL);

  const courseSections = await db
    .select()
    .from(sections)
    .where(eq(sections.courseId, courseId));

  const sectionIds = courseSections.map((s) => s.id);

  if (sectionIds.length === 0) {
    return c.json({ sections: [] });
  }

  const userProgress = await db
    .select()
    .from(progress)
    .where(
      and(
        eq(progress.userId, user.sub),
        inArray(progress.sectionId, sectionIds)
      )
    );

  return c.json({
    sections: userProgress.map((p) => ({
      sectionId: p.sectionId,
      completed: p.completed,
    })),
  });
});

export default coursesRouter;
