import { Hono } from "hono";
import { eq, and, desc, inArray } from "drizzle-orm";
import { z } from "zod";
import { createDb } from "../db";
import {
  exams,
  examEnrollments,
  questions,
  examAttempts,
  sections,
  progress,
} from "../db/schema";
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
  courseId: z.string().uuid().nullable().optional(),
  price: z.number().int().min(0).nullable().optional(),
  passingScore: z.number().int().min(0).max(100).optional(),
  timeLimitMinutes: z.number().int().positive().nullable().optional(),
});

const updateExamSchema = z.object({
  title: z.string().min(1).max(255).optional(),
  description: z.string().nullable().optional(),
  courseId: z.string().uuid().nullable().optional(),
  price: z.number().int().min(0).nullable().optional(),
  passingScore: z.number().int().min(0).max(100).optional(),
  timeLimitMinutes: z.number().int().positive().nullable().optional(),
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
    courseId: z.string().uuid().nullable().optional(),
    price: z.number().int().min(0).nullable().optional(),
    passingScore: z.number().int().min(0).max(100).optional(),
    timeLimitMinutes: z.number().int().positive().nullable().optional(),
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

const enrollExamSchema = z.object({
  paid: z.boolean().optional(),
});

// --- Access control helper ---

async function checkExamAccess(
  db: ReturnType<typeof createDb>,
  exam: typeof exams.$inferSelect,
  userId: string,
  enrollment: typeof examEnrollments.$inferSelect | undefined
): Promise<{ allowed: boolean; reason?: string }> {
  if (!enrollment) {
    return { allowed: false, reason: "You are not enrolled in this exam" };
  }

  if (exam.courseId) {
    const courseCompleted = await checkCourseCompleted(db, exam.courseId, userId);
    if (courseCompleted) {
      return { allowed: true };
    }
    if (enrollment.paidAt) {
      return { allowed: true };
    }
    return {
      allowed: false,
      reason: "Complete the course or pay to access this exam",
    };
  }

  if (enrollment.paidAt) {
    return { allowed: true };
  }
  return { allowed: false, reason: "Payment required to access this exam" };
}

async function checkCourseCompleted(
  db: ReturnType<typeof createDb>,
  courseId: string,
  userId: string
): Promise<boolean> {
  const courseSections = await db
    .select()
    .from(sections)
    .where(eq(sections.courseId, courseId));

  if (courseSections.length === 0) {
    return false;
  }

  const userProgress = await db
    .select()
    .from(progress)
    .where(
      and(
        eq(progress.userId, userId),
        inArray(
          progress.sectionId,
          courseSections.map((s) => s.id)
        )
      )
    );

  const completedIds = new Set(
    userProgress.filter((p) => p.completed).map((p) => p.sectionId)
  );

  return courseSections.every((s) => completedIds.has(s.id));
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

  const [exam] = await db
    .insert(exams)
    .values({
      title: parsed.data.exam.title,
      description: parsed.data.exam.description ?? null,
      courseId: parsed.data.exam.courseId ?? null,
      price: parsed.data.exam.price ?? null,
      passingScore: parsed.data.exam.passingScore ?? 50,
      timeLimitMinutes: parsed.data.exam.timeLimitMinutes ?? null,
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

  const [exam] = await db
    .insert(exams)
    .values({
      title: parsed.data.title,
      description: parsed.data.description ?? null,
      courseId: parsed.data.courseId ?? null,
      price: parsed.data.price ?? null,
      passingScore: parsed.data.passingScore ?? 50,
      timeLimitMinutes: parsed.data.timeLimitMinutes ?? null,
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
      course: true,
    },
    orderBy: (exams, { desc }) => [desc(exams.createdAt)],
  });

  return c.json(all);
});

// GET /api/exams/published - user listing, must be before /:id
examsRouter.get("/published", authGuard, async (c) => {
  const db = createDb(c.env.DATABASE_URL);

  const all = await db.query.exams.findMany({
    where: eq(exams.isPublished, true),
    with: {
      course: true,
    },
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
      course: true,
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

  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    body = {};
  }

  const parsed = enrollExamSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: parsed.error.issues[0].message }, 400);
  }

  const db = createDb(c.env.DATABASE_URL);

  const [exam] = await db
    .select()
    .from(exams)
    .where(and(eq(exams.id, id), eq(exams.isPublished, true)))
    .limit(1);

  if (!exam) {
    return c.json({ error: "Exam not found or not published" }, 404);
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

  if (!exam.courseId && !parsed.data.paid) {
    return c.json({ error: "Payment required to enroll in this exam" }, 402);
  }

  const [enrollment] = await db
    .insert(examEnrollments)
    .values({
      userId: user.sub,
      examId: id,
      paidAt: parsed.data.paid ? new Date().toISOString() : null,
    })
    .returning();

  return c.json(enrollment, 201);
});

examsRouter.post("/:id/confirm-payment", authGuard, async (c) => {
  const { id } = c.req.param();
  const user = c.get("user");
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

  if (enrollment.paidAt) {
    return c.json({ error: "Payment already confirmed" }, 409);
  }

  const [updated] = await db
    .update(examEnrollments)
    .set({ paidAt: new Date().toISOString() })
    .where(
      and(
        eq(examEnrollments.userId, user.sub),
        eq(examEnrollments.examId, id)
      )
    )
    .returning();

  return c.json(updated);
});

examsRouter.get("/:id/take", authGuard, async (c) => {
  const { id } = c.req.param();
  const user = c.get("user");
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

  const access = await checkExamAccess(db, exam, user.sub, enrollment);
  if (!access.allowed) {
    return c.json({ error: access.reason }, 403);
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

  const access = await checkExamAccess(db, exam, user.sub, enrollment);
  if (!access.allowed) {
    return c.json({ error: access.reason }, 403);
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

  return c.json({
    attemptId: attempt.id,
    score,
    passed,
    totalQuestions: allQuestions.length,
    correctCount,
    results,
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
