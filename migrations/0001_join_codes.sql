ALTER TABLE "users" ADD COLUMN "join_code" text;--> statement-breakpoint
CREATE UNIQUE INDEX "users_join_code_idx" ON "users" USING btree ("join_code");