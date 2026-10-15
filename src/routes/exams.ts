import { Hono } from "hono";
import { eq, and, desc, isNull } from "drizzle-orm";
import { z } from "zod";
import { createDb } from "../db";
import {
  courses,
  exams,
  examEnrollments,
  questions,
  examAttempts,
} from "../db/schema";
import type { Db } from "../db";
import type { Exam } from "../db/schema";
import { getCourseExamAccess, issueCertificate } from "../lib/course-exam";
import { authGuard } from "../middleware/auth";
import { adminGuard } from "../middleware/admin";
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

const examsRouter = new Hono<Env>();

// --- Schemas ---

const createExamSchema = z.object({
  title: z.string().min(1).max(255),
  description: z.string().nullable().optional(),
  passingScore: z.number().int().min(0).max(100).optional(),
  timeLimitMinutes: z.number().int().positive().nullable().optional(),
  // Links the exam to a course as its final ("package") exam; null = standalone.
  courseId: z.string().uuid().nullable().optional(),
});

const updateExamSchema = z.object({
  title: z.string().min(1).max(255).optional(),
  description: z.string().nullable().optional(),
  passingScore: z.number().int().min(0).max(100).optional(),
  timeLimitMinutes: z.number().int().positive().nullable().optional(),
  // Links the exam to a course as its final ("package") exam; null = standalone.
  courseId: z.string().uuid().nullable().optional(),
});

const createQuestionSchema = z.object({
  questionText: z.string().min(1),
  options: z.array(z.string().min(1)).min(2),
  correctIndices: z.array(z.number().int().min(0)).min(1),
  scripture: z.string().max(500).nullable().optional(),
  sortOrder: z.number().int().min(0),
});

const updateQuestionSchema = z.object({
  questionText: z.string().min(1).optional(),
  options: z.array(z.string().min(1)).min(2).optional(),
  correctIndices: z.array(z.number().int().min(0)).min(1).optional(),
  scripture: z.string().max(500).nullable().optional(),
  sortOrder: z.number().int().min(0).optional(),
});

const importExamSchema = z.object({
  exam: z.object({
    title: z.string().min(1).max(255),
    description: z.string().nullable().optional(),
    passingScore: z.number().int().min(0).max(100).optional(),
    timeLimitMinutes: z.number().int().positive().nullable().optional(),
    courseId: z.string().uuid().nullable().optional(),
  }),
  questions: z.array(
    z.object({
      questionText: z.string().min(1),
      options: z.array(z.string().min(1)).min(2),
      correctIndices: z.array(z.number().int().min(0)).min(1),
      scripture: z.string().max(500).nullable().optional(),
      sortOrder: z.number().int().min(0),
    })
  ).min(1),
});

const submitExamSchema = z.object({
  answers: z.record(z.string(), z.array(z.number().int().min(0))),
});

async function courseExists(db: Db, courseId: string): Promise<boolean> {
  const [course] = await db
    .select({ id: courses.id })
    .from(courses)
    .where(eq(courses.id, courseId))
    .limit(1);
  return Boolean(course);
}

/** Error message when a course exam is still locked for this user, else null. */
async function courseExamLockReason(
  db: Db,
  userId: string,
  exam: Exam
): Promise<string | null> {
  if (!exam.courseId) return null;
  const access = await getCourseExamAccess(db, userId, exam.courseId);
  if (!access.enrolled) return "Enroll in the course to take its exam";
  if (!access.unlocked) {
    return `Complete all lessons to unlock this exam (${access.completedSections}/${access.totalSections} done)`;
  }
  return null;
}

// --- Admin endpoints ---

// POST /api/exams/import must be before /api/exams/:id
examsRouter.post("/import", authGuard, adminGuard, async (c) => {
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Invalid JSON body" }, 400);
  }

  const parsed = importExamSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: parsed.error.issues[0].message }, 400);
  }

  const db = createDb(c.env.DATABASE_URL);

  const courseId = parsed.data.exam.courseId ?? null;
  if (courseId && !(await courseExists(db, courseId))) {
    return c.json({ error: "Course not found" }, 404);
  }

  const [exam] = await db
    .insert(exams)
    .values({
      title: parsed.data.exam.title,
      description: parsed.data.exam.description ?? null,
      passingScore: parsed.data.exam.passingScore ?? 50,
      timeLimitMinutes: parsed.data.exam.timeLimitMinutes ?? null,
      courseId,
      isPublished: false,
    })
    .returning();

  const values = parsed.data.questions.map((q) => ({
    examId: exam.id,
    questionText: q.questionText,
    options: q.options,
    correctIndices: q.correctIndices,
    scripture: q.scripture ?? null,
    sortOrder: q.sortOrder,
  }));

  const createdQuestions = await db.insert(questions).values(values).returning();

  return c.json({ exam, questions: createdQuestions }, 201);
});

examsRouter.post("/", authGuard, adminGuard, async (c) => {
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Invalid JSON body" }, 400);
  }

  const parsed = createExamSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: parsed.error.issues[0].message }, 400);
  }

  const db = createDb(c.env.DATABASE_URL);

  const courseId = parsed.data.courseId ?? null;
  if (courseId && !(await courseExists(db, courseId))) {
    return c.json({ error: "Course not found" }, 404);
  }

  const [exam] = await db
    .insert(exams)
    .values({
      title: parsed.data.title,
      description: parsed.data.description ?? null,
      passingScore: parsed.data.passingScore ?? 50,
      timeLimitMinutes: parsed.data.timeLimitMinutes ?? null,
      courseId,
    })
    .returning();

  return c.json(exam, 201);
});

examsRouter.get("/", authGuard, adminGuard, async (c) => {
  const db = createDb(c.env.DATABASE_URL);

  const all = await db.query.exams.findMany({
    with: {
      questions: {
        orderBy: (questions, { asc }) => [asc(questions.sortOrder)],
      },
    },
    orderBy: (exams, { desc }) => [desc(exams.createdAt)],
  });

  return c.json(all);
});

// GET /api/exams/published - user listing, must be before /:id.
// Standalone exams only: course exams are reached through their course
// (GET /api/courses/:courseId/exam) so lessons can't be skipped.
examsRouter.get("/published", authGuard, async (c) => {
  const db = createDb(c.env.DATABASE_URL);

  const all = await db.query.exams.findMany({
    where: and(eq(exams.isPublished, true), isNull(exams.courseId)),
    orderBy: (exams, { desc }) => [desc(exams.createdAt)],
  });

  return c.json(all);
});

examsRouter.get("/:id", authGuard, adminGuard, async (c) => {
  const { id } = c.req.param();
  const db = createDb(c.env.DATABASE_URL);

  const exam = await db.query.exams.findFirst({
    where: eq(exams.id, id),
    with: {
      questions: {
        orderBy: (questions, { asc }) => [asc(questions.sortOrder)],
      },
    },
  });

  if (!exam) {
    return c.json({ error: "Exam not found" }, 404);
  }

  return c.json(exam);
});

examsRouter.put("/:id", authGuard, adminGuard, async (c) => {
  const { id } = c.req.param();
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Invalid JSON body" }, 400);
  }

  const parsed = updateExamSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: parsed.error.issues[0].message }, 400);
  }

  const db = createDb(c.env.DATABASE_URL);

  const [existing] = await db
    .select()
    .from(exams)
    .where(eq(exams.id, id))
    .limit(1);

  if (!existing) {
    return c.json({ error: "Exam not found" }, 404);
  }

  if (parsed.data.courseId && !(await courseExists(db, parsed.data.courseId))) {
    return c.json({ error: "Course not found" }, 404);
  }

  const [updated] = await db
    .update(exams)
    .set(parsed.data)
    .where(eq(exams.id, id))
    .returning();

  return c.json(updated);
});

examsRouter.delete("/:id", authGuard, adminGuard, async (c) => {
  const { id } = c.req.param();
  const db = createDb(c.env.DATABASE_URL);

  const [existing] = await db
    .select()
    .from(exams)
    .where(eq(exams.id, id))
    .limit(1);

  if (!existing) {
    return c.json({ error: "Exam not found" }, 404);
  }

  await db.delete(exams).where(eq(exams.id, id));

  return c.json({ message: "Exam deleted" });
});

examsRouter.patch("/:id/publish", authGuard, adminGuard, async (c) => {
  const { id } = c.req.param();
  const db = createDb(c.env.DATABASE_URL);

  const [existing] = await db
    .select()
    .from(exams)
    .where(eq(exams.id, id))
    .limit(1);

  if (!existing) {
    return c.json({ error: "Exam not found" }, 404);
  }

  const [updated] = await db
    .update(exams)
    .set({ isPublished: !existing.isPublished })
    .where(eq(exams.id, id))
    .returning();

  return c.json(updated);
});

// --- Question CRUD (admin) ---

examsRouter.post("/:examId/questions", authGuard, adminGuard, async (c) => {
  const { examId } = c.req.param();
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Invalid JSON body" }, 400);
  }

  const parsed = createQuestionSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: parsed.error.issues[0].message }, 400);
  }

  const db = createDb(c.env.DATABASE_URL);

  const [exam] = await db
    .select()
    .from(exams)
    .where(eq(exams.id, examId))
    .limit(1);

  if (!exam) {
    return c.json({ error: "Exam not found" }, 404);
  }

  const [question] = await db
    .insert(questions)
    .values({
      examId,
      questionText: parsed.data.questionText,
      options: parsed.data.options,
      correctIndices: parsed.data.correctIndices,
      scripture: parsed.data.scripture ?? null,
      sortOrder: parsed.data.sortOrder,
    })
    .returning();

  return c.json(question, 201);
});

examsRouter.put("/:examId/questions/:qId", authGuard, adminGuard, async (c) => {
  const { examId, qId } = c.req.param();
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Invalid JSON body" }, 400);
  }

  const parsed = updateQuestionSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: parsed.error.issues[0].message }, 400);
  }

  const db = createDb(c.env.DATABASE_URL);

  const [existing] = await db
    .select()
    .from(questions)
    .where(and(eq(questions.id, qId), eq(questions.examId, examId)))
    .limit(1);

  if (!existing) {
    return c.json({ error: "Question not found" }, 404);
  }

  const [updated] = await db
    .update(questions)
    .set(parsed.data)
    .where(eq(questions.id, qId))
    .returning();

  return c.json(updated);
});

examsRouter.delete("/:examId/questions/:qId", authGuard, adminGuard, async (c) => {
  const { examId, qId } = c.req.param();
  const db = createDb(c.env.DATABASE_URL);

  const [existing] = await db
    .select()
    .from(questions)
    .where(and(eq(questions.id, qId), eq(questions.examId, examId)))
    .limit(1);

  if (!existing) {
    return c.json({ error: "Question not found" }, 404);
  }

  await db.delete(questions).where(eq(questions.id, qId));

  return c.json({ message: "Question deleted" });
});

// --- User endpoints ---

examsRouter.post("/:id/enroll", authGuard, async (c) => {
  const { id } = c.req.param();
  const user = c.get("user");
  const db = createDb(c.env.DATABASE_URL);

  const [exam] = await db
    .select()
    .from(exams)
    .where(and(eq(exams.id, id), eq(exams.isPublished, true)))
    .limit(1);

  if (!exam) {
    return c.json({ error: "Exam not found or not published" }, 404);
  }

  const lockReason = await courseExamLockReason(db, user.sub, exam);
  if (lockReason) {
    return c.json({ error: lockReason }, 403);
  }

  const [existing] = await db
    .select()
    .from(examEnrollments)
    .where(
      and(
        eq(examEnrollments.userId, user.sub),
        eq(examEnrollments.examId, id)
      )
    )
    .limit(1);

  if (existing) {
    return c.json({ error: "Already enrolled in this exam" }, 409);
  }

  const [enrollment] = await db
    .insert(examEnrollments)
    .values({ userId: user.sub, examId: id })
    .returning();

  return c.json(enrollment, 201);
});

examsRouter.get("/:id/take", authGuard, async (c) => {
  const { id } = c.req.param();
  const user = c.get("user");
  const db = createDb(c.env.DATABASE_URL);

  const [enrollment] = await db
    .select()
    .from(examEnrollments)
    .where(
      and(
        eq(examEnrollments.userId, user.sub),
        eq(examEnrollments.examId, id)
      )
    )
    .limit(1);

  if (!enrollment) {
    return c.json({ error: "You are not enrolled in this exam" }, 403);
  }

  const exam = await db.query.exams.findFirst({
    where: eq(exams.id, id),
    with: {
      questions: {
        orderBy: (questions, { asc }) => [asc(questions.sortOrder)],
      },
    },
  });

  if (!exam) {
    return c.json({ error: "Exam not found" }, 404);
  }

  const lockReason = await courseExamLockReason(db, user.sub, exam);
  if (lockReason) {
    return c.json({ error: lockReason }, 403);
  }

  const sanitizedQuestions = exam.questions.map((q) => ({
    id: q.id,
    questionText: q.questionText,
    options: q.options,
    scripture: q.scripture,
    sortOrder: q.sortOrder,
  }));

  return c.json({
    exam: {
      id: exam.id,
      title: exam.title,
      description: exam.description,
      timeLimitMinutes: exam.timeLimitMinutes,
      passingScore: exam.passingScore,
      courseId: exam.courseId,
    },
    questions: sanitizedQuestions,
  });
});

examsRouter.post("/:id/submit", authGuard, async (c) => {
  const { id } = c.req.param();
  const user = c.get("user");
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Invalid JSON body" }, 400);
  }

  const parsed = submitExamSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: parsed.error.issues[0].message }, 400);
  }

  const db = createDb(c.env.DATABASE_URL);

  const [exam] = await db
    .select()
    .from(exams)
    .where(eq(exams.id, id))
    .limit(1);

  if (!exam) {
    return c.json({ error: "Exam not found" }, 404);
  }

  const [enrollment] = await db
    .select()
    .from(examEnrollments)
    .where(
      and(
        eq(examEnrollments.userId, user.sub),
        eq(examEnrollments.examId, id)
      )
    )
    .limit(1);

  if (!enrollment) {
    return c.json({ error: "You are not enrolled in this exam" }, 403);
  }

  const lockReason = await courseExamLockReason(db, user.sub, exam);
  if (lockReason) {
    return c.json({ error: lockReason }, 403);
  }

  const allQuestions = await db
    .select()
    .from(questions)
    .where(eq(questions.examId, id))
    .orderBy(questions.sortOrder);

  if (allQuestions.length === 0) {
    return c.json({ error: "This exam has no questions" }, 400);
  }

  const { answers } = parsed.data;
  let correctCount = 0;

  const results = allQuestions.map((q) => {
    const selected = answers[q.id] ?? [];
    const correct = q.correctIndices;
    const isCorrect =
      selected.length === correct.length &&
      selected.every((v) => correct.includes(v)) &&
      correct.every((v) => selected.includes(v));

    if (isCorrect) correctCount++;

    return {
      questionId: q.id,
      correct: isCorrect,
    };
  });

  const score = Math.round((correctCount / allQuestions.length) * 100);
  const passed = score >= exam.passingScore;
  const now = new Date().toISOString();

  const [attempt] = await db
    .insert(examAttempts)
    .values({
      userId: user.sub,
      examId: id,
      score,
      passed,
      answers,
      startedAt: now,
      completedAt: now,
    })
    .returning();

  const certificate = passed
    ? await issueCertificate(db, {
        userId: user.sub,
        examId: id,
        attemptId: attempt.id,
        score,
      })
    : null;

  return c.json({
    attemptId: attempt.id,
    score,
    passed,
    totalQuestions: allQuestions.length,
    correctCount,
    results,
    certificate,
  });
});

examsRouter.get("/:id/attempts", authGuard, async (c) => {
  const { id } = c.req.param();
  const user = c.get("user");
  const db = createDb(c.env.DATABASE_URL);

  const userAttempts = await db
    .select()
    .from(examAttempts)
    .where(
      and(eq(examAttempts.userId, user.sub), eq(examAttempts.examId, id))
    )
    .orderBy(desc(examAttempts.completedAt));

  return c.json(userAttempts);
});

export default examsRouter;
