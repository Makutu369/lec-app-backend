import { pgTable, uuid, varchar, timestamp, text, foreignKey, integer, unique, boolean } from "drizzle-orm/pg-core"
import { sql } from "drizzle-orm"



export const passwordResets = pgTable("password_resets", {
	id: uuid().default(sql`uuid_generate_v4()`).primaryKey().notNull(),
	email: varchar().notNull(),
	code: varchar().notNull(),
	expiresAt: timestamp({ mode: 'string' }).notNull(),
	createdAt: timestamp({ mode: 'string' }).defaultNow().notNull(),
});

export const megaCenters = pgTable("mega_centers", {
	id: uuid().default(sql`uuid_generate_v4()`).primaryKey().notNull(),
	name: varchar().notNull(),
	church: varchar(),
	zonalPastor: varchar(),
	head: varchar(),
	email: varchar(),
	phone: varchar(),
});

export const courses = pgTable("courses", {
	id: uuid().default(sql`uuid_generate_v4()`).primaryKey().notNull(),
	title: varchar().notNull(),
	description: text(),
	imageUrl: varchar(),
	createdAt: timestamp({ mode: 'string' }).defaultNow().notNull(),
});

export const sections = pgTable("sections", {
	id: uuid().default(sql`uuid_generate_v4()`).primaryKey().notNull(),
	courseId: uuid().notNull(),
	title: varchar().notNull(),
	videoUrl: varchar().notNull(),
	sortOrder: integer(),
}, (table) => [
	foreignKey({
			columns: [table.courseId],
			foreignColumns: [courses.id],
			name: "FK_0fc0dc8ce98e7dc47c273f85e3d"
		}).onDelete("cascade"),
]);

export const enrollments = pgTable("enrollments", {
	id: uuid().default(sql`uuid_generate_v4()`).primaryKey().notNull(),
	userId: uuid().notNull(),
	courseId: uuid().notNull(),
	completedAt: timestamp({ mode: 'string' }),
	createdAt: timestamp({ mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	foreignKey({
			columns: [table.userId],
			foreignColumns: [users.id],
			name: "FK_de33d443c8ae36800c37c58c929"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.courseId],
			foreignColumns: [courses.id],
			name: "FK_60dd0ae4e21002e63a5fdefeec8"
		}).onDelete("cascade"),
	unique("UQ_a6f2eeafcbf0dd7a69fc91e2957").on(table.userId, table.courseId),
]);

export const progress = pgTable("progress", {
	id: uuid().default(sql`uuid_generate_v4()`).primaryKey().notNull(),
	userId: uuid().notNull(),
	sectionId: uuid().notNull(),
	completed: boolean().default(false).notNull(),
}, (table) => [
	foreignKey({
			columns: [table.userId],
			foreignColumns: [users.id],
			name: "FK_0366c96237f98ea1c8ba6e1ec35"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.sectionId],
			foreignColumns: [sections.id],
			name: "FK_0e8e153704aec2af84aea9d6849"
		}).onDelete("cascade"),
	unique("UQ_a4445fc4efd5eb8ecf32bdfd4f5").on(table.userId, table.sectionId),
]);

export const users = pgTable("users", {
	id: uuid().default(sql`uuid_generate_v4()`).primaryKey().notNull(),
	email: varchar().notNull(),
	firstName: varchar(),
	lastName: varchar(),
	profilePicture: varchar(),
	megaCenter: varchar(),
	role: varchar().default('student').notNull(),
	password: varchar().notNull(),
	createdAt: timestamp({ mode: 'string' }).defaultNow().notNull(),
	userLocation: varchar(),
}, (table) => [
	unique("UQ_97672ac88f789774dd47f7c8be3").on(table.email),
]);
