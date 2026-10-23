import { Hono } from "hono";
import { eq, and, inArray, desc } from "drizzle-orm";
import { createDb } from "../db";
import {
  courses,
  sections,
  enrollments,
  progress,
  exams,
  examEnrollments,
  examAttempts,
} from "../db/schema";
import { getCourseExamAccess, findCertificate } from "../lib/course-exam";
import { EXAM_CURRENCY, isExamFree } from "../lib/exam-payment";
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

// GET /api/courses/:courseId/exam - the exam suggested at the end of this
// course, with the current user's standing: lesson progress (informational —
// exams are standalone and don't require the course), price, whether it's
// unlocked (free or paid), best score and certificate.
coursesRouter.get("/:courseId/exam", authGuard, async (c) => {
  const { courseId } = c.req.param();
  const user = c.get("user");
  const db = createDb(c.env.DATABASE_URL);

  const [exam] = await db
    .select()
    .from(exams)
    .where(and(eq(exams.courseId, courseId), eq(exams.isPublished, true)))
    .orderBy(desc(exams.createdAt))
    .limit(1);

  if (!exam) {
    return c.json({ exam: null });
  }

  const access = await getCourseExamAccess(db, user.sub, courseId);

  const [examEnrollment] = await db
    .select({ paidAt: examEnrollments.paidAt })
    .from(examEnrollments)
    .where(
      and(eq(examEnrollments.userId, user.sub), eq(examEnrollments.examId, exam.id))
    )
    .limit(1);

  const attempts = await db
    .select({ score: examAttempts.score, passed: examAttempts.passed })
    .from(examAttempts)
    .where(
      and(eq(examAttempts.userId, user.sub), eq(examAttempts.examId, exam.id))
    );

  const certificate = await findCertificate(db, user.sub, exam.id);

  return c.json({
    exam,
    ...access,
    currency: EXAM_CURRENCY,
    free: isExamFree(exam),
    paid: Boolean(examEnrollment?.paidAt),
    // Matches the take/submit rule: free, or paid for.
    unlocked: isExamFree(exam) || Boolean(examEnrollment?.paidAt),
    attemptsCount: attempts.length,
    bestScore: attempts.length
      ? Math.max(...attempts.map((a) => a.score))
      : null,
    passed: attempts.some((a) => a.passed),
    certificate: certificate ?? null,
  });
});

export default coursesRouter;
