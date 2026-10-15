import { relations } from "drizzle-orm/relations";
import {
  courses,
  sections,
  users,
  enrollments,
  progress,
  exams,
  examEnrollments,
  questions,
  examAttempts,
} from "./schema";

export const usersRelations = relations(users, ({ many }) => ({
  enrollments: many(enrollments),
  progresses: many(progress),
  examEnrollments: many(examEnrollments),
  examAttempts: many(examAttempts),
}));

export const coursesRelations = relations(courses, ({ many }) => ({
  sections: many(sections),
  enrollments: many(enrollments),
  exams: many(exams),
}));

export const sectionsRelations = relations(sections, ({ one, many }) => ({
  course: one(courses, {
    fields: [sections.courseId],
    references: [courses.id],
  }),
  progresses: many(progress),
}));

export const enrollmentsRelations = relations(enrollments, ({ one }) => ({
  user: one(users, {
    fields: [enrollments.userId],
    references: [users.id],
  }),
  course: one(courses, {
    fields: [enrollments.courseId],
    references: [courses.id],
  }),
}));

export const progressRelations = relations(progress, ({ one }) => ({
  user: one(users, {
    fields: [progress.userId],
    references: [users.id],
  }),
  section: one(sections, {
    fields: [progress.sectionId],
    references: [sections.id],
  }),
}));

export const examsRelations = relations(exams, ({ one, many }) => ({
  course: one(courses, {
    fields: [exams.courseId],
    references: [courses.id],
  }),
  questions: many(questions),
  enrollments: many(examEnrollments),
  attempts: many(examAttempts),
}));

export const examEnrollmentsRelations = relations(examEnrollments, ({ one }) => ({
  user: one(users, {
    fields: [examEnrollments.userId],
    references: [users.id],
  }),
  exam: one(exams, {
    fields: [examEnrollments.examId],
    references: [exams.id],
  }),
}));

export const questionsRelations = relations(questions, ({ one }) => ({
  exam: one(exams, {
    fields: [questions.examId],
    references: [exams.id],
  }),
}));

export const examAttemptsRelations = relations(examAttempts, ({ one }) => ({
  user: one(users, {
    fields: [examAttempts.userId],
    references: [users.id],
  }),
  exam: one(exams, {
    fields: [examAttempts.examId],
    references: [exams.id],
  }),
}));
