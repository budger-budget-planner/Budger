CREATE TABLE "budget_stretches" (
"id" serial PRIMARY KEY NOT NULL,
"user_id" integer NOT NULL,
"transaction_id" integer NOT NULL,
"month" text NOT NULL,
"to_category_id" integer NOT NULL,
"from_category_id" integer NOT NULL,
"amount" numeric(12, 2) NOT NULL,
"stretch_type" text NOT NULL,
"created_at" timestamp with time zone DEFAULT now() NOT NULL,
CONSTRAINT "budget_stretches_transaction_id_unique" UNIQUE("transaction_id")
);
--> statement-breakpoint
ALTER TABLE "budget_stretches" ADD CONSTRAINT "budget_stretches_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "budget_stretches" ADD CONSTRAINT "budget_stretches_to_category_id_categories_id_fk" FOREIGN KEY ("to_category_id") REFERENCES "public"."categories"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "budget_stretches" ADD CONSTRAINT "budget_stretches_from_category_id_categories_id_fk" FOREIGN KEY ("from_category_id") REFERENCES "public"."categories"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "budget_stretches_user_id_month_idx" ON "budget_stretches" USING btree ("user_id","month");
--> statement-breakpoint
CREATE INDEX "budget_stretches_to_category_id_month_idx" ON "budget_stretches" USING btree ("to_category_id","month");
