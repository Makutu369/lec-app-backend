CREATE TABLE "branches" (
	"id" varchar(24) PRIMARY KEY NOT NULL,
	"name" varchar(255) NOT NULL,
	"zoneId" varchar(24)
);
--> statement-breakpoint
ALTER TABLE "mega_centers" ADD COLUMN "branchId" varchar(24);--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "branch" varchar(24);--> statement-breakpoint
ALTER TABLE "mega_centers" ADD CONSTRAINT "mega_centers_branchId_branches_id_fk" FOREIGN KEY ("branchId") REFERENCES "public"."branches"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_mega_centers_branch_id" ON "mega_centers" USING btree ("branchId");