ALTER TABLE "exam_enrollments" ADD COLUMN "paidAt" timestamp;--> statement-breakpoint
ALTER TABLE "exams" ADD COLUMN "courseId" uuid;--> statement-breakpoint
ALTER TABLE "exams" ADD COLUMN "price" integer;--> statement-breakpoint
ALTER TABLE "exams" ADD CONSTRAINT "FK_exams_course" FOREIGN KEY ("courseId") REFERENCES "public"."courses"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_exams_course_id" ON "exams" USING btree ("courseId");