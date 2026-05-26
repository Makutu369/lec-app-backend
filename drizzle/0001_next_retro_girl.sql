CREATE TABLE "exam_attempts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"userId" uuid NOT NULL,
	"examId" uuid NOT NULL,
	"score" integer NOT NULL,
	"passed" boolean NOT NULL,
	"answers" jsonb NOT NULL,
	"startedAt" timestamp NOT NULL,
	"completedAt" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "exam_enrollments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"userId" uuid NOT NULL,
	"examId" uuid NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "UQ_exam_enrollments_user_exam" UNIQUE("userId","examId")
);
--> statement-breakpoint
CREATE TABLE "exams" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" varchar(255) NOT NULL,
	"description" text,
	"passingScore" integer DEFAULT 50 NOT NULL,
	"timeLimitMinutes" integer,
	"isPublished" boolean DEFAULT false NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "questions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"examId" uuid NOT NULL,
	"questionText" text NOT NULL,
	"options" text[] NOT NULL,
	"correctIndices" integer[] NOT NULL,
	"scripture" varchar(500),
	"sortOrder" integer NOT NULL
);
--> statement-breakpoint
ALTER TABLE "exam_attempts" ADD CONSTRAINT "FK_exam_attempts_user" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exam_attempts" ADD CONSTRAINT "FK_exam_attempts_exam" FOREIGN KEY ("examId") REFERENCES "public"."exams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exam_enrollments" ADD CONSTRAINT "FK_exam_enrollments_user" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exam_enrollments" ADD CONSTRAINT "FK_exam_enrollments_exam" FOREIGN KEY ("examId") REFERENCES "public"."exams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "questions" ADD CONSTRAINT "FK_questions_exam" FOREIGN KEY ("examId") REFERENCES "public"."exams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_exam_attempts_user_id" ON "exam_attempts" USING btree ("userId");--> statement-breakpoint
CREATE INDEX "idx_exam_attempts_exam_id" ON "exam_attempts" USING btree ("examId");--> statement-breakpoint
CREATE INDEX "idx_exam_enrollments_user_id" ON "exam_enrollments" USING btree ("userId");--> statement-breakpoint
CREATE INDEX "idx_exam_enrollments_exam_id" ON "exam_enrollments" USING btree ("examId");--> statement-breakpoint
CREATE INDEX "idx_exams_published" ON "exams" USING btree ("isPublished");--> statement-breakpoint
CREATE INDEX "idx_questions_exam_id" ON "questions" USING btree ("examId");