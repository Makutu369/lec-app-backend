import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { Hono } from "hono";
import { createDb } from "../../db";
import { signToken } from "../../lib/jwt";
import examsRouter from "../exams";
import {
  users,
  courses,
  sections,
  exams,
  examEnrollments,
  questions,
  progress,
  enrollments,
  examAttempts,
} from "../../db/schema";
import { eq } from "drizzle-orm";

// These tests DELETE every row of every table they touch, so they must never
// see the real database. They only run against TEST_DATABASE_URL (a separate
// Neon branch / database), never the DATABASE_URL from .dev.vars.
const DATABASE_URL = process.env.TEST_DATABASE_URL ?? "";
if (!DATABASE_URL) {
  throw new Error(
    "Set TEST_DATABASE_URL to a disposable test database. These tests wipe all tables."
  );
}
if (DATABASE_URL === process.env.DATABASE_URL) {
  throw new Error("TEST_DATABASE_URL must not be the same database as DATABASE_URL.");
}
const JWT_SECRET = process.env.JWT_SECRET ?? "test-secret";

type Env = {
  Bindings: {
    DATABASE_URL: string;
    JWT_SECRET: string;
  };
  Variables: {
    user: { sub: string; email: string; role: string };
  };
};

function createTestApp() {
  const app = new Hono<Env>();
  app.use("*", async (c, next) => {
    c.env = { DATABASE_URL, JWT_SECRET };
    await next();
  });
  app.route("/api/exams", examsRouter);
  return app;
}

const app = createTestApp();
const db = createDb(DATABASE_URL);

let testUser: { id: string; email: string };
let testCourse: { id: string };
let sectionIds: string[] = [];

async function cleanup() {
  await db.delete(examAttempts);
  await db.delete(examEnrollments);
  await db.delete(questions);
  await db.delete(exams);
  await db.delete(progress);
  await db.delete(enrollments);
  await db.delete(sections);
  await db.delete(courses);
  await db.delete(users);
}

async function ensureUser(
  email: string,
  role = "student"
): Promise<{ id: string; email: string }> {
  const [existing] = await db
    .select()
    .from(users)
    .where(eq(users.email, email))
    .limit(1);
  if (existing) return { id: existing.id, email: existing.email };

  const [user] = await db
    .insert(users)
    .values({
      email,
      firstName: "Test",
      lastName: "User",
      password: "hashed_password_placeholder",
      role,
    })
    .returning();
  return { id: user.id, email: user.email };
}

async function ensureCourse(title: string): Promise<{ id: string }> {
  const [existing] = await db
    .select()
    .from(courses)
    .where(eq(courses.title, title))
    .limit(1);
  if (existing) return { id: existing.id };

  const [course] = await db
    .insert(courses)
    .values({ title, description: `Description for ${title}` })
    .returning();
  return { id: course.id };
}

async function ensureSections(
  courseId: string,
  titles: string[]
): Promise<string[]> {
  const ids: string[] = [];
  for (let i = 0; i < titles.length; i++) {
    const [existing] = await db
      .select()
      .from(sections)
      .where(eq(sections.title, titles[i]))
      .limit(1);
    if (existing) {
      ids.push(existing.id);
    } else {
      const [section] = await db
        .insert(sections)
        .values({
          courseId,
          title: titles[i],
          videoUrl: `https://example.com/${titles[i]}`,
          sortOrder: i,
        })
        .returning();
      ids.push(section.id);
    }
  }
  return ids;
}

async function createExam(
  title: string,
  options: {
    courseId?: string;
    price?: number;
    passingScore?: number;
    isPublished?: boolean;
  } = {}
): Promise<{ id: string }> {
  const [exam] = await db
    .insert(exams)
    .values({
      title,
      description: `Description for ${title}`,
      courseId: options.courseId ?? null,
      price: options.price ?? null,
      passingScore: options.passingScore ?? 50,
      isPublished: options.isPublished ?? true,
    })
    .returning();
  return { id: exam.id };
}

async function createQuestion(
  examId: string,
  questionText: string,
  options: string[],
  correctIndices: number[],
  sortOrder: number
): Promise<{ id: string }> {
  const [question] = await db
    .insert(questions)
    .values({
      examId,
      questionText,
      options,
      correctIndices,
      sortOrder,
    })
    .returning();
  return { id: question.id };
}

async function enrollInCourse(userId: string, courseId: string) {
  await db
    .insert(enrollments)
    .values({ userId, courseId })
    .onConflictDoNothing();
  const courseSections = await db
    .select()
    .from(sections)
    .where(eq(sections.courseId, courseId));
  for (const section of courseSections) {
    await db
      .insert(progress)
      .values({ userId, sectionId: section.id, completed: false })
      .onConflictDoNothing();
  }
}

async function completeAllSections(userId: string, courseId: string) {
  const courseSections = await db
    .select()
    .from(sections)
    .where(eq(sections.courseId, courseId));
  for (const section of courseSections) {
    await db
      .insert(progress)
      .values({ userId, sectionId: section.id, completed: true })
      .onConflictDoUpdate({
        target: [progress.userId, progress.sectionId],
        set: { completed: true },
      });
  }
}

async function makeRequest(
  path: string,
  options: {
    method?: string;
    body?: unknown;
    userId?: string;
    role?: string;
  } = {}
) {
  const { method = "GET", body, userId, role = "student" } = options;

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  if (userId) {
    const token = await signToken(
      { sub: userId, email: "test@test.com", role },
      JWT_SECRET
    );
    headers["Authorization"] = `Bearer ${token}`;
  }

  const req = new Request(`http://localhost${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  return app.request(req);
}

beforeAll(async () => {
  await cleanup();
  testUser = await ensureUser("student@test.com");
  testCourse = await ensureCourse("Test Course");
  sectionIds = await ensureSections(testCourse.id, ["Section 1", "Section 2"]);
});

afterAll(async () => {
  await cleanup();
});

beforeEach(async () => {
  await db.delete(examAttempts);
  await db.delete(examEnrollments);
  await db.delete(questions);
  await db.delete(exams);
  await db.delete(progress);
  await db.delete(enrollments);
  await ensureUser("student@test.com");
});

describe("Exam Access Control", () => {
  describe("Payment-based access (no courseId)", () => {
    it("should allow access when user has paid for exam", async () => {
      const exam = await createExam("Paid Exam A", {
        price: 100,
        courseId: null,
      });

      const enrollRes = await makeRequest(`/api/exams/${exam.id}/enroll`, {
        method: "POST",
        userId: testUser.id,
        body: { paid: true },
      });
      expect(enrollRes.status).toBe(201);

      const takeRes = await makeRequest(`/api/exams/${exam.id}/take`, {
        userId: testUser.id,
      });
      expect(takeRes.status).toBe(200);
      const body = await takeRes.json();
      expect(body).toHaveProperty("exam");
      expect(body).toHaveProperty("questions");
    });

    it("should block enrollment when exam has no courseId and user has not paid", async () => {
      const exam = await createExam("Paid Exam B", {
        price: 100,
        courseId: null,
      });

      const enrollRes = await makeRequest(`/api/exams/${exam.id}/enroll`, {
        method: "POST",
        userId: testUser.id,
        body: { paid: false },
      });
      expect(enrollRes.status).toBe(402);
      const body = await enrollRes.json();
      expect(body.error).toBe("Payment required to enroll in this exam");

      const takeRes = await makeRequest(`/api/exams/${exam.id}/take`, {
        userId: testUser.id,
      });
      expect(takeRes.status).toBe(403);
      const takeBody = await takeRes.json();
      expect(takeBody.error).toBe("You are not enrolled in this exam");
    });

    it("should allow access after confirming payment", async () => {
      const exam = await createExam("Confirm Exam A", {
        courseId: testCourse.id,
        price: 100,
      });

      const enrollRes = await makeRequest(`/api/exams/${exam.id}/enroll`, {
        method: "POST",
        userId: testUser.id,
        body: {},
      });
      expect(enrollRes.status).toBe(201);

      const takeBefore = await makeRequest(`/api/exams/${exam.id}/take`, {
        userId: testUser.id,
      });
      expect(takeBefore.status).toBe(403);

      const confirmRes = await makeRequest(
        `/api/exams/${exam.id}/confirm-payment`,
        { method: "POST", userId: testUser.id }
      );
      expect(confirmRes.status).toBe(200);

      const takeAfter = await makeRequest(`/api/exams/${exam.id}/take`, {
        userId: testUser.id,
      });
      expect(takeAfter.status).toBe(200);
    });

    it("should reject confirm-payment if already paid", async () => {
      const exam = await createExam("Already Paid Exam A", {
        courseId: testCourse.id,
        price: 100,
      });

      await makeRequest(`/api/exams/${exam.id}/enroll`, {
        method: "POST",
        userId: testUser.id,
        body: { paid: true },
      });

      const confirmRes = await makeRequest(
        `/api/exams/${exam.id}/confirm-payment`,
        { method: "POST", userId: testUser.id }
      );
      expect(confirmRes.status).toBe(409);
      const body = await confirmRes.json();
      expect(body.error).toBe("Payment already confirmed");
    });

    it("should reject confirm-payment if not enrolled", async () => {
      const exam = await createExam("Not Enrolled Exam A", {
        courseId: testCourse.id,
        price: 100,
      });

      const confirmRes = await makeRequest(
        `/api/exams/${exam.id}/confirm-payment`,
        { method: "POST", userId: testUser.id }
      );
      expect(confirmRes.status).toBe(403);
      const body = await confirmRes.json();
      expect(body.error).toBe("You are not enrolled in this exam");
    });
  });

  describe("Course completion-based access", () => {
    it("should allow access when user has completed all course sections", async () => {
      const exam = await createExam("Course Exam A", {
        courseId: testCourse.id,
      });

      await enrollInCourse(testUser.id, testCourse.id);
      await completeAllSections(testUser.id, testCourse.id);

      await makeRequest(`/api/exams/${exam.id}/enroll`, {
        method: "POST",
        userId: testUser.id,
        body: {},
      });

      const takeRes = await makeRequest(`/api/exams/${exam.id}/take`, {
        userId: testUser.id,
      });
      expect(takeRes.status).toBe(200);
      const body = await takeRes.json();
      expect(body).toHaveProperty("exam");
      expect(body).toHaveProperty("questions");
    });

    it("should deny access when course is not completed and user has not paid", async () => {
      const exam = await createExam("Course Exam B", {
        courseId: testCourse.id,
        price: 100,
      });

      await enrollInCourse(testUser.id, testCourse.id);

      await makeRequest(`/api/exams/${exam.id}/enroll`, {
        method: "POST",
        userId: testUser.id,
        body: {},
      });

      const takeRes = await makeRequest(`/api/exams/${exam.id}/take`, {
        userId: testUser.id,
      });
      expect(takeRes.status).toBe(403);
      const body = await takeRes.json();
      expect(body.error).toBe(
        "Complete the course or pay to access this exam"
      );
    });

    it("should allow access when course is not completed but user has paid", async () => {
      const exam = await createExam("Course Exam C", {
        courseId: testCourse.id,
        price: 100,
      });

      await enrollInCourse(testUser.id, testCourse.id);

      await makeRequest(`/api/exams/${exam.id}/enroll`, {
        method: "POST",
        userId: testUser.id,
        body: { paid: true },
      });

      const takeRes = await makeRequest(`/api/exams/${exam.id}/take`, {
        userId: testUser.id,
      });
      expect(takeRes.status).toBe(200);
    });

    it("should deny access when course has no sections", async () => {
      const emptyCourse = await ensureCourse("Empty Course");
      const exam = await createExam("Empty Course Exam A", {
        courseId: emptyCourse.id,
      });

      await enrollInCourse(testUser.id, emptyCourse.id);

      await makeRequest(`/api/exams/${exam.id}/enroll`, {
        method: "POST",
        userId: testUser.id,
        body: {},
      });

      const takeRes = await makeRequest(`/api/exams/${exam.id}/take`, {
        userId: testUser.id,
      });
      expect(takeRes.status).toBe(403);
      const body = await takeRes.json();
      expect(body.error).toBe(
        "Complete the course or pay to access this exam"
      );
    });

    it("should deny access when only some sections are completed", async () => {
      const exam = await createExam("Partial Course Exam A", {
        courseId: testCourse.id,
        price: null,
      });

      await enrollInCourse(testUser.id, testCourse.id);
      await db
        .insert(progress)
        .values({
          userId: testUser.id,
          sectionId: sectionIds[0],
          completed: true,
        })
        .onConflictDoUpdate({
          target: [progress.userId, progress.sectionId],
          set: { completed: true },
        });

      await makeRequest(`/api/exams/${exam.id}/enroll`, {
        method: "POST",
        userId: testUser.id,
        body: {},
      });

      const takeRes = await makeRequest(`/api/exams/${exam.id}/take`, {
        userId: testUser.id,
      });
      expect(takeRes.status).toBe(403);
      const body = await takeRes.json();
      expect(body.error).toBe(
        "Complete the course or pay to access this exam"
      );
    });
  });

  describe("Enrollment checks", () => {
    it("should deny access when not enrolled", async () => {
      const exam = await createExam("Published Exam A");

      const takeRes = await makeRequest(`/api/exams/${exam.id}/take`, {
        userId: testUser.id,
      });
      expect(takeRes.status).toBe(403);
      const body = await takeRes.json();
      expect(body.error).toBe("You are not enrolled in this exam");
    });

    it("should prevent duplicate enrollment", async () => {
      const exam = await createExam("Duplicate Test A");

      await makeRequest(`/api/exams/${exam.id}/enroll`, {
        method: "POST",
        userId: testUser.id,
        body: { paid: true },
      });

      const secondEnroll = await makeRequest(`/api/exams/${exam.id}/enroll`, {
        method: "POST",
        userId: testUser.id,
        body: { paid: true },
      });
      expect(secondEnroll.status).toBe(409);
      const body = await secondEnroll.json();
      expect(body.error).toBe("Already enrolled in this exam");
    });

    it("should reject enrollment for unpublished exam", async () => {
      const exam = await createExam("Unpublished Exam A", {
        isPublished: false,
      });

      const enrollRes = await makeRequest(`/api/exams/${exam.id}/enroll`, {
        method: "POST",
        userId: testUser.id,
        body: { paid: true },
      });
      expect(enrollRes.status).toBe(404);
      const body = await enrollRes.json();
      expect(body.error).toBe("Exam not found or not published");
    });

    it("should require payment for enrollment when exam has no courseId", async () => {
      const exam = await createExam("No Course Exam A", {
        courseId: null,
        price: 100,
      });

      const enrollRes = await makeRequest(`/api/exams/${exam.id}/enroll`, {
        method: "POST",
        userId: testUser.id,
        body: { paid: false },
      });
      expect(enrollRes.status).toBe(402);
      const body = await enrollRes.json();
      expect(body.error).toBe("Payment required to enroll in this exam");
    });

    it("should allow enrollment without payment when exam has courseId", async () => {
      const exam = await createExam("Course Exam D", {
        courseId: testCourse.id,
        price: 100,
      });

      const enrollRes = await makeRequest(`/api/exams/${exam.id}/enroll`, {
        method: "POST",
        userId: testUser.id,
        body: {},
      });
      expect(enrollRes.status).toBe(201);
    });
  });

  describe("Exam submission with access checks", () => {
    it("should allow submission when user has paid", async () => {
      const exam = await createExam("Submit Exam A", {
        courseId: null,
        price: 100,
      });

      const q1 = await createQuestion(
        exam.id,
        "What is 2+2?",
        ["3", "4", "5"],
        [1],
        0
      );

      await makeRequest(`/api/exams/${exam.id}/enroll`, {
        method: "POST",
        userId: testUser.id,
        body: { paid: true },
      });

      const submitRes = await makeRequest(`/api/exams/${exam.id}/submit`, {
        method: "POST",
        userId: testUser.id,
        body: { answers: { [q1.id]: [1] } },
      });
      expect(submitRes.status).toBe(200);
      const body = await submitRes.json();
      expect(body).toHaveProperty("attemptId");
      expect(body).toHaveProperty("score", 100);
      expect(body).toHaveProperty("passed", true);
      expect(body.correctCount).toBe(1);
      expect(body.totalQuestions).toBe(1);
    });

    it("should deny submission when user is not enrolled", async () => {
      const exam = await createExam("Submit Denied Exam A", {
        courseId: null,
        price: 100,
      });

      const submitRes = await makeRequest(`/api/exams/${exam.id}/submit`, {
        method: "POST",
        userId: testUser.id,
        body: { answers: {} },
      });
      expect(submitRes.status).toBe(403);
      const body = await submitRes.json();
      expect(body.error).toBe("You are not enrolled in this exam");
    });

    it("should deny submission when course not completed and not paid", async () => {
      const exam = await createExam("Submit Incomplete Exam A", {
        courseId: testCourse.id,
        price: 100,
      });

      await enrollInCourse(testUser.id, testCourse.id);

      await makeRequest(`/api/exams/${exam.id}/enroll`, {
        method: "POST",
        userId: testUser.id,
        body: {},
      });

      const submitRes = await makeRequest(`/api/exams/${exam.id}/submit`, {
        method: "POST",
        userId: testUser.id,
        body: { answers: {} },
      });
      expect(submitRes.status).toBe(403);
      const body = await submitRes.json();
      expect(body.error).toBe(
        "Complete the course or pay to access this exam"
      );
    });

    it("should allow submission when course is completed", async () => {
      const exam = await createExam("Submit Course Exam A", {
        courseId: testCourse.id,
      });

      const q1 = await createQuestion(
        exam.id,
        "What is 3+3?",
        ["5", "6", "7"],
        [1],
        0
      );

      await enrollInCourse(testUser.id, testCourse.id);
      await completeAllSections(testUser.id, testCourse.id);

      await makeRequest(`/api/exams/${exam.id}/enroll`, {
        method: "POST",
        userId: testUser.id,
        body: {},
      });

      const submitRes = await makeRequest(`/api/exams/${exam.id}/submit`, {
        method: "POST",
        userId: testUser.id,
        body: { answers: { [q1.id]: [1] } },
      });
      expect(submitRes.status).toBe(200);
      const body = await submitRes.json();
      expect(body.score).toBe(100);
      expect(body.passed).toBe(true);
    });

    it("should correctly grade multiple answers", async () => {
      const exam = await createExam("Grading Exam A", {
        courseId: null,
        price: 100,
      });

      const q1 = await createQuestion(
        exam.id,
        "Q1?",
        ["A", "B", "C"],
        [1],
        0
      );
      const q2 = await createQuestion(
        exam.id,
        "Q2?",
        ["X", "Y", "Z"],
        [0, 2],
        1
      );

      await makeRequest(`/api/exams/${exam.id}/enroll`, {
        method: "POST",
        userId: testUser.id,
        body: { paid: true },
      });

      const submitRes = await makeRequest(`/api/exams/${exam.id}/submit`, {
        method: "POST",
        userId: testUser.id,
        body: {
          answers: {
            [q1.id]: [1],
            [q2.id]: [0, 2],
          },
        },
      });
      expect(submitRes.status).toBe(200);
      const body = await submitRes.json();
      expect(body.correctCount).toBe(2);
      expect(body.totalQuestions).toBe(2);
      expect(body.score).toBe(100);
    });

    it("should record failed attempt when score is below passing", async () => {
      const exam = await createExam("Fail Exam A", {
        courseId: null,
        price: 100,
        passingScore: 80,
      });

      const q1 = await createQuestion(exam.id, "Q1?", ["A", "B"], [0], 0);
      const q2 = await createQuestion(exam.id, "Q2?", ["X", "Y"], [1], 1);

      await makeRequest(`/api/exams/${exam.id}/enroll`, {
        method: "POST",
        userId: testUser.id,
        body: { paid: true },
      });

      const submitRes = await makeRequest(`/api/exams/${exam.id}/submit`, {
        method: "POST",
        userId: testUser.id,
        body: { answers: { [q1.id]: [1], [q2.id]: [1] } },
      });
      expect(submitRes.status).toBe(200);
      const body = await submitRes.json();
      expect(body.score).toBe(50);
      expect(body.passed).toBe(false);
    });

    it("should reject submission when exam has no questions", async () => {
      const exam = await createExam("Empty Exam A", {
        courseId: null,
        price: 100,
      });

      await makeRequest(`/api/exams/${exam.id}/enroll`, {
        method: "POST",
        userId: testUser.id,
        body: { paid: true },
      });

      const submitRes = await makeRequest(`/api/exams/${exam.id}/submit`, {
        method: "POST",
        userId: testUser.id,
        body: { answers: {} },
      });
      expect(submitRes.status).toBe(400);
      const body = await submitRes.json();
      expect(body.error).toBe("This exam has no questions");
    });
  });

  describe("Attempts history", () => {
    it("should return attempts for user after submission", async () => {
      const exam = await createExam("Attempts Exam A", {
        courseId: null,
        price: 100,
      });

      const q1 = await createQuestion(exam.id, "Q?", ["Yes", "No"], [0], 0);

      await makeRequest(`/api/exams/${exam.id}/enroll`, {
        method: "POST",
        userId: testUser.id,
        body: { paid: true },
      });

      await makeRequest(`/api/exams/${exam.id}/submit`, {
        method: "POST",
        userId: testUser.id,
        body: { answers: { [q1.id]: [0] } },
      });

      const attemptsRes = await makeRequest(`/api/exams/${exam.id}/attempts`, {
        userId: testUser.id,
      });
      expect(attemptsRes.status).toBe(200);
      const body = await attemptsRes.json();
      expect(Array.isArray(body)).toBe(true);
      expect(body.length).toBe(1);
      expect(body[0]).toHaveProperty("score");
      expect(body[0]).toHaveProperty("passed");
    });

    it("should return empty array when no attempts exist", async () => {
      const exam = await createExam("No Attempts Exam A", {
        courseId: null,
        price: 100,
      });

      const attemptsRes = await makeRequest(`/api/exams/${exam.id}/attempts`, {
        userId: testUser.id,
      });
      expect(attemptsRes.status).toBe(200);
      const body = await attemptsRes.json();
      expect(body).toEqual([]);
    });
  });
});
