import {
  pgTable,
  uuid,
  varchar,
  timestamp,
  text,
  foreignKey,
  integer,
  unique,
  boolean,
  index,
  jsonb,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const users = pgTable(
  "users",
  {
    id: uuid()
      .default(sql`gen_random_uuid()`)
      .primaryKey()
      .notNull(),
    email: varchar({ length: 255 }).notNull(),
    firstName: varchar({ length: 100 }),
    lastName: varchar({ length: 100 }),
    profilePicture: varchar({ length: 500 }),
    megaCenter: varchar({ length: 255 }),
    role: varchar({ length: 20 }).default("student").notNull(),
    password: varchar({ length: 255 }).notNull(),
    createdAt: timestamp({ mode: "string" }).defaultNow().notNull(),
    userLocation: varchar({ length: 200 }),
  },
  (table) => [
    unique("UQ_97672ac88f789774dd47f7c8be3").on(table.email),
    index("idx_users_email").on(table.email),
  ]
);

export const courses = pgTable("courses", {
  id: uuid()
    .default(sql`gen_random_uuid()`)
    .primaryKey()
    .notNull(),
  title: varchar({ length: 255 }).notNull(),
  description: text(),
  imageUrl: varchar({ length: 500 }),
  createdAt: timestamp({ mode: "string" }).defaultNow().notNull(),
});

export const sections = pgTable(
  "sections",
  {
    id: uuid()
      .default(sql`gen_random_uuid()`)
      .primaryKey()
      .notNull(),
    courseId: uuid().notNull(),
    title: varchar({ length: 255 }).notNull(),
    videoUrl: varchar({ length: 500 }).notNull(),
    sortOrder: integer(),
  },
  (table) => [
    foreignKey({
      columns: [table.courseId],
      foreignColumns: [courses.id],
      name: "FK_0fc0dc8ce98e7dc47c273f85e3d",
    }).onDelete("cascade"),
    index("idx_sections_course_id").on(table.courseId),
  ]
);

export const enrollments = pgTable(
  "enrollments",
  {
    id: uuid()
      .default(sql`gen_random_uuid()`)
      .primaryKey()
      .notNull(),
    userId: uuid().notNull(),
    courseId: uuid().notNull(),
    completedAt: timestamp({ mode: "string" }),
    createdAt: timestamp({ mode: "string" }).defaultNow().notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.userId],
      foreignColumns: [users.id],
      name: "FK_de33d443c8ae36800c37c58c929",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.courseId],
      foreignColumns: [courses.id],
      name: "FK_60dd0ae4e21002e63a5fdefeec8",
    }).onDelete("cascade"),
    unique("UQ_a6f2eeafcbf0dd7a69fc91e2957").on(table.userId, table.courseId),
    index("idx_enrollments_user_id").on(table.userId),
    index("idx_enrollments_course_id").on(table.courseId),
  ]
);

export const progress = pgTable(
  "progress",
  {
    id: uuid()
      .default(sql`gen_random_uuid()`)
      .primaryKey()
      .notNull(),
    userId: uuid().notNull(),
    sectionId: uuid().notNull(),
    completed: boolean().default(false).notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.userId],
      foreignColumns: [users.id],
      name: "FK_0366c96237f98ea1c8ba6e1ec35",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.sectionId],
      foreignColumns: [sections.id],
      name: "FK_0e8e153704aec2af84aea9d6849",
    }).onDelete("cascade"),
    unique("UQ_a4445fc4efd5eb8ecf32bdfd4f5").on(table.userId, table.sectionId),
    index("idx_progress_user_id").on(table.userId),
    index("idx_progress_section_id").on(table.sectionId),
  ]
);

export const megaCenters = pgTable("mega_centers", {
  id: uuid()
    .default(sql`gen_random_uuid()`)
    .primaryKey()
    .notNull(),
  name: varchar({ length: 255 }).notNull(),
  church: varchar({ length: 255 }),
  zonalPastor: varchar({ length: 255 }),
  head: varchar({ length: 255 }),
  email: varchar({ length: 255 }),
  phone: varchar({ length: 50 }),
});

export const passwordResets = pgTable("password_resets", {
  id: uuid()
    .default(sql`gen_random_uuid()`)
    .primaryKey()
    .notNull(),
  email: varchar({ length: 255 }).notNull(),
  code: varchar({ length: 10 }).notNull(),
  expiresAt: timestamp({ mode: "string" }).notNull(),
  createdAt: timestamp({ mode: "string" }).defaultNow().notNull(),
});

export const exams = pgTable(
  "exams",
  {
    id: uuid()
      .default(sql`gen_random_uuid()`)
      .primaryKey()
      .notNull(),
    title: varchar({ length: 255 }).notNull(),
    description: text(),
    passingScore: integer().default(50).notNull(),
    timeLimitMinutes: integer(),
    isPublished: boolean().default(false).notNull(),
    // Set when the exam is a course's final exam ("package" exam); null for standalone exams.
    courseId: uuid(),
    createdAt: timestamp({ mode: "string" }).defaultNow().notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.courseId],
      foreignColumns: [courses.id],
      name: "FK_exams_course",
    }).onDelete("set null"),
    index("idx_exams_published").on(table.isPublished),
    index("idx_exams_course_id").on(table.courseId),
  ]
);

export const examEnrollments = pgTable(
  "exam_enrollments",
  {
    id: uuid()
      .default(sql`gen_random_uuid()`)
      .primaryKey()
      .notNull(),
    userId: uuid().notNull(),
    examId: uuid().notNull(),
    createdAt: timestamp({ mode: "string" }).defaultNow().notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.userId],
      foreignColumns: [users.id],
      name: "FK_exam_enrollments_user",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.examId],
      foreignColumns: [exams.id],
      name: "FK_exam_enrollments_exam",
    }).onDelete("cascade"),
    unique("UQ_exam_enrollments_user_exam").on(table.userId, table.examId),
    index("idx_exam_enrollments_user_id").on(table.userId),
    index("idx_exam_enrollments_exam_id").on(table.examId),
  ]
);

export const questions = pgTable(
  "questions",
  {
    id: uuid()
      .default(sql`gen_random_uuid()`)
      .primaryKey()
      .notNull(),
    examId: uuid().notNull(),
    questionText: text().notNull(),
    options: text().array().notNull(),
    correctIndices: integer().array().notNull(),
    scripture: varchar({ length: 500 }),
    sortOrder: integer().notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.examId],
      foreignColumns: [exams.id],
      name: "FK_questions_exam",
    }).onDelete("cascade"),
    index("idx_questions_exam_id").on(table.examId),
  ]
);

export const examAttempts = pgTable(
  "exam_attempts",
  {
    id: uuid()
      .default(sql`gen_random_uuid()`)
      .primaryKey()
      .notNull(),
    userId: uuid().notNull(),
    examId: uuid().notNull(),
    score: integer().notNull(),
    passed: boolean().notNull(),
    answers: jsonb().notNull(),
    startedAt: timestamp({ mode: "string" }).notNull(),
    completedAt: timestamp({ mode: "string" }).notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.userId],
      foreignColumns: [users.id],
      name: "FK_exam_attempts_user",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.examId],
      foreignColumns: [exams.id],
      name: "FK_exam_attempts_exam",
    }).onDelete("cascade"),
    index("idx_exam_attempts_user_id").on(table.userId),
    index("idx_exam_attempts_exam_id").on(table.examId),
  ]
);

export const certificates = pgTable(
  "certificates",
  {
    id: uuid()
      .default(sql`gen_random_uuid()`)
      .primaryKey()
      .notNull(),
    userId: uuid().notNull(),
    examId: uuid().notNull(),
    // The first passing attempt that earned the certificate.
    attemptId: uuid().notNull(),
    certificateNumber: varchar({ length: 32 }).notNull(),
    score: integer().notNull(),
    issuedAt: timestamp({ mode: "string" }).defaultNow().notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.userId],
      foreignColumns: [users.id],
      name: "FK_certificates_user",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.examId],
      foreignColumns: [exams.id],
      name: "FK_certificates_exam",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.attemptId],
      foreignColumns: [examAttempts.id],
      name: "FK_certificates_attempt",
    }).onDelete("cascade"),
    unique("UQ_certificates_user_exam").on(table.userId, table.examId),
    unique("UQ_certificates_number").on(table.certificateNumber),
    index("idx_certificates_user_id").on(table.userId),
  ]
);

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Course = typeof courses.$inferSelect;
export type Section = typeof sections.$inferSelect;
export type Enrollment = typeof enrollments.$inferSelect;
export type Progress = typeof progress.$inferSelect;
export type MegaCenter = typeof megaCenters.$inferSelect;
export type PasswordReset = typeof passwordResets.$inferSelect;
export type Exam = typeof exams.$inferSelect;
export type NewExam = typeof exams.$inferInsert;
export type ExamEnrollment = typeof examEnrollments.$inferSelect;
export type Question = typeof questions.$inferSelect;
export type NewQuestion = typeof questions.$inferInsert;
export type ExamAttempt = typeof examAttempts.$inferSelect;
export type Certificate = typeof certificates.$inferSelect;
