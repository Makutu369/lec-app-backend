CREATE TABLE "certificates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"userId" uuid NOT NULL,
	"examId" uuid NOT NULL,
	"attemptId" uuid NOT NULL,
	"certificateNumber" varchar(32) NOT NULL,
	"score" integer NOT NULL,
	"issuedAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "UQ_certificates_user_exam" UNIQUE("userId","examId"),
	CONSTRAINT "UQ_certificates_number" UNIQUE("certificateNumber")
);
--> statement-breakpoint
ALTER TABLE "certificates" ADD CONSTRAINT "FK_certificates_user" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "certificates" ADD CONSTRAINT "FK_certificates_exam" FOREIGN KEY ("examId") REFERENCES "public"."exams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "certificates" ADD CONSTRAINT "FK_certificates_attempt" FOREIGN KEY ("attemptId") REFERENCES "public"."exam_attempts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_certificates_user_id" ON "certificates" USING btree ("userId");