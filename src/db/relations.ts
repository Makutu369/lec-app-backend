import { relations } from "drizzle-orm/relations";
import {
  courses,
  sections,
  users,
  enrollments,
  progress,
} from "./schema";

export const usersRelations = relations(users, ({ many }) => ({
  enrollments: many(enrollments),
  progresses: many(progress),
}));

export const coursesRelations = relations(courses, ({ many }) => ({
  sections: many(sections),
  enrollments: many(enrollments),
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
