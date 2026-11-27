CREATE TABLE "child_profiles" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"avatar" text,
	"good_day_count" integer DEFAULT 0 NOT NULL,
	"earned_spins" integer DEFAULT 0 NOT NULL,
	"last_bad_spin_date" timestamp,
	"last_good_spin_date" timestamp,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"user_id" integer,
	"child_user_id" integer
);
--> statement-breakpoint
CREATE TABLE "configurations" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"wheel_settings" jsonb NOT NULL,
	"notification_time" time DEFAULT '20:00:00' NOT NULL,
	"good_days_required" integer DEFAULT 7 NOT NULL,
	"notifications_enabled" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "consequences" (
	"id" serial PRIMARY KEY NOT NULL,
	"text" text NOT NULL,
	"type" text NOT NULL,
	"section" integer NOT NULL,
	"user_id" integer
);
--> statement-breakpoint
CREATE TABLE "good_day_log" (
	"id" serial PRIMARY KEY NOT NULL,
	"child_id" integer NOT NULL,
	"date" timestamp DEFAULT now() NOT NULL,
	"day" text,
	"user_id" integer
);
--> statement-breakpoint
CREATE TABLE "pending_consequences" (
	"id" serial PRIMARY KEY NOT NULL,
	"consequence_id" integer,
	"text" text NOT NULL,
	"type" text NOT NULL,
	"section" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"completed" boolean DEFAULT false,
	"child_id" integer NOT NULL,
	"user_id" integer
);
--> statement-breakpoint
CREATE TABLE "session" (
	"sid" varchar PRIMARY KEY NOT NULL,
	"sess" json NOT NULL,
	"expire" timestamp (6) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "spin_requests" (
	"id" serial PRIMARY KEY NOT NULL,
	"child_id" integer NOT NULL,
	"user_id" integer,
	"requested_at" timestamp DEFAULT now() NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"approved_at" timestamp,
	"approved_by" integer,
	"consequence_id" integer,
	"section" integer,
	"rotations" integer DEFAULT 0,
	"type" text,
	"final_angle" text,
	"added_to_pending" boolean DEFAULT false,
	"description" text,
	"spin_id" varchar(32),
	"consequence_text" text
);
--> statement-breakpoint
CREATE TABLE "spins" (
	"id" varchar(32) PRIMARY KEY NOT NULL,
	"family_id" integer NOT NULL,
	"child_id" integer NOT NULL,
	"created_by" integer NOT NULL,
	"type" text NOT NULL,
	"section" integer NOT NULL,
	"consequence_id" integer,
	"text" text NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" serial PRIMARY KEY NOT NULL,
	"username" text NOT NULL,
	"password" text NOT NULL,
	"role" text DEFAULT 'parent' NOT NULL,
	"parent_id" integer,
	"email" text,
	"notify_on_spin" boolean DEFAULT true,
	"notify_on_pending" boolean DEFAULT true,
	"last_login" timestamp DEFAULT now(),
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "users_username_unique" UNIQUE("username")
);
--> statement-breakpoint
ALTER TABLE "child_profiles" ADD CONSTRAINT "child_profiles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "child_profiles" ADD CONSTRAINT "child_profiles_child_user_id_users_id_fk" FOREIGN KEY ("child_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "configurations" ADD CONSTRAINT "configurations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consequences" ADD CONSTRAINT "consequences_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "good_day_log" ADD CONSTRAINT "good_day_log_child_id_child_profiles_id_fk" FOREIGN KEY ("child_id") REFERENCES "public"."child_profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "good_day_log" ADD CONSTRAINT "good_day_log_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pending_consequences" ADD CONSTRAINT "pending_consequences_consequence_id_consequences_id_fk" FOREIGN KEY ("consequence_id") REFERENCES "public"."consequences"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pending_consequences" ADD CONSTRAINT "pending_consequences_child_id_child_profiles_id_fk" FOREIGN KEY ("child_id") REFERENCES "public"."child_profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pending_consequences" ADD CONSTRAINT "pending_consequences_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "spin_requests" ADD CONSTRAINT "spin_requests_child_id_child_profiles_id_fk" FOREIGN KEY ("child_id") REFERENCES "public"."child_profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "spin_requests" ADD CONSTRAINT "spin_requests_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "spin_requests" ADD CONSTRAINT "spin_requests_approved_by_users_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "spin_requests" ADD CONSTRAINT "spin_requests_consequence_id_consequences_id_fk" FOREIGN KEY ("consequence_id") REFERENCES "public"."consequences"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "spins" ADD CONSTRAINT "spins_family_id_users_id_fk" FOREIGN KEY ("family_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "spins" ADD CONSTRAINT "spins_child_id_child_profiles_id_fk" FOREIGN KEY ("child_id") REFERENCES "public"."child_profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "spins" ADD CONSTRAINT "spins_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "spins" ADD CONSTRAINT "spins_consequence_id_consequences_id_fk" FOREIGN KEY ("consequence_id") REFERENCES "public"."consequences"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_parent_id_users_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "good_day_child_day" ON "good_day_log" USING btree ("child_id","day");--> statement-breakpoint
CREATE INDEX "IDX_session_expire" ON "session" USING btree ("expire");