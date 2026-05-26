CREATE TABLE "courses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" varchar(255) NOT NULL,
	"description" text,
	"imageUrl" varchar(500),
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "enrollments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"userId" uuid NOT NULL,
	"courseId" uuid NOT NULL,
	"completedAt" timestamp,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "UQ_a6f2eeafcbf0dd7a69fc91e2957" UNIQUE("userId","courseId")
);
--> statement-breakpoint
CREATE TABLE "mega_centers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(255) NOT NULL,
	"church" varchar(255),
	"zonalPastor" varchar(255),
	"head" varchar(255),
	"email" varchar(255),
	"phone" varchar(50)
);
--> statement-breakpoint
CREATE TABLE "password_resets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" varchar(255) NOT NULL,
	"code" varchar(10) NOT NULL,
	"expiresAt" timestamp NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "progress" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"userId" uuid NOT NULL,
	"sectionId" uuid NOT NULL,
	"completed" boolean DEFAULT false NOT NULL,
	CONSTRAINT "UQ_a4445fc4efd5eb8ecf32bdfd4f5" UNIQUE("userId","sectionId")
);
--> statement-breakpoint
CREATE TABLE "sections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"courseId" uuid NOT NULL,
	"title" varchar(255) NOT NULL,
	"videoUrl" varchar(500) NOT NULL,
	"sortOrder" integer
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" varchar(255) NOT NULL,
	"firstName" varchar(100),
	"lastName" varchar(100),
	"profilePicture" varchar(500),
	"megaCenter" varchar(255),
	"role" varchar(20) DEFAULT 'student' NOT NULL,
	"password" varchar(255) NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"userLocation" varchar(200),
	CONSTRAINT "UQ_97672ac88f789774dd47f7c8be3" UNIQUE("email")
);
--> statement-breakpoint
ALTER TABLE "enrollments" ADD CONSTRAINT "FK_de33d443c8ae36800c37c58c929" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "enrollments" ADD CONSTRAINT "FK_60dd0ae4e21002e63a5fdefeec8" FOREIGN KEY ("courseId") REFERENCES "public"."courses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "progress" ADD CONSTRAINT "FK_0366c96237f98ea1c8ba6e1ec35" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "progress" ADD CONSTRAINT "FK_0e8e153704aec2af84aea9d6849" FOREIGN KEY ("sectionId") REFERENCES "public"."sections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sections" ADD CONSTRAINT "FK_0fc0dc8ce98e7dc47c273f85e3d" FOREIGN KEY ("courseId") REFERENCES "public"."courses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_enrollments_user_id" ON "enrollments" USING btree ("userId");--> statement-breakpoint
CREATE INDEX "idx_enrollments_course_id" ON "enrollments" USING btree ("courseId");--> statement-breakpoint
CREATE INDEX "idx_progress_user_id" ON "progress" USING btree ("userId");--> statement-breakpoint
CREATE INDEX "idx_progress_section_id" ON "progress" USING btree ("sectionId");--> statement-breakpoint
CREATE INDEX "idx_sections_course_id" ON "sections" USING btree ("courseId");--> statement-breakpoint
CREATE INDEX "idx_users_email" ON "users" USING btree ("email");