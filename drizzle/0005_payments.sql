CREATE TABLE "payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"userId" uuid NOT NULL,
	"examId" uuid NOT NULL,
	"provider" varchar(16) DEFAULT 'paystack' NOT NULL,
	"reference" varchar(64) NOT NULL,
	"amount" integer NOT NULL,
	"currency" varchar(3) DEFAULT 'GHS' NOT NULL,
	"status" varchar(16) DEFAULT 'pending' NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"paidAt" timestamp,
	CONSTRAINT "UQ_payments_reference" UNIQUE("reference")
);
--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "FK_payments_user" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "FK_payments_exam" FOREIGN KEY ("examId") REFERENCES "public"."exams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_payments_user_exam" ON "payments" USING btree ("userId","examId");