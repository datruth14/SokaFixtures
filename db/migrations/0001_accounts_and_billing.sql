CREATE TABLE IF NOT EXISTS "user" (
  "id" TEXT PRIMARY KEY NOT NULL, "name" TEXT NOT NULL, "email" TEXT NOT NULL UNIQUE,
  "emailVerified" INTEGER NOT NULL DEFAULT 0, "image" TEXT,
  "createdAt" INTEGER NOT NULL, "updatedAt" INTEGER NOT NULL
);
-- statement-breakpoint
CREATE TABLE IF NOT EXISTS "session" (
  "id" TEXT PRIMARY KEY NOT NULL, "expiresAt" INTEGER NOT NULL, "token" TEXT NOT NULL UNIQUE,
  "createdAt" INTEGER NOT NULL, "updatedAt" INTEGER NOT NULL, "ipAddress" TEXT, "userAgent" TEXT,
  "userId" TEXT NOT NULL REFERENCES "user"("id") ON DELETE CASCADE
);
-- statement-breakpoint
CREATE INDEX IF NOT EXISTS "session_userId_idx" ON "session" ("userId");
-- statement-breakpoint
CREATE TABLE IF NOT EXISTS "account" (
  "id" TEXT PRIMARY KEY NOT NULL, "accountId" TEXT NOT NULL, "providerId" TEXT NOT NULL,
  "userId" TEXT NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "accessToken" TEXT, "refreshToken" TEXT, "idToken" TEXT,
  "accessTokenExpiresAt" INTEGER, "refreshTokenExpiresAt" INTEGER, "scope" TEXT, "password" TEXT,
  "createdAt" INTEGER NOT NULL, "updatedAt" INTEGER NOT NULL
);
-- statement-breakpoint
CREATE INDEX IF NOT EXISTS "account_userId_idx" ON "account" ("userId");
-- statement-breakpoint
CREATE TABLE IF NOT EXISTS "verification" (
  "id" TEXT PRIMARY KEY NOT NULL, "identifier" TEXT NOT NULL, "value" TEXT NOT NULL,
  "expiresAt" INTEGER NOT NULL, "createdAt" INTEGER NOT NULL, "updatedAt" INTEGER NOT NULL
);
-- statement-breakpoint
CREATE INDEX IF NOT EXISTS "verification_identifier_idx" ON "verification" ("identifier");
-- statement-breakpoint
CREATE TABLE IF NOT EXISTS "rateLimit" (
  "id" TEXT PRIMARY KEY NOT NULL, "key" TEXT NOT NULL UNIQUE, "count" INTEGER NOT NULL, "lastRequest" INTEGER NOT NULL
);
-- statement-breakpoint
CREATE TABLE IF NOT EXISTS "billing_account" (
  "user_id" TEXT PRIMARY KEY NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "state" TEXT NOT NULL DEFAULT 'new', "trial_started_at" INTEGER, "trial_ends_at" INTEGER,
  "paid_through" INTEGER, "paystack_customer_code" TEXT, "paystack_subscription_code" TEXT UNIQUE,
  "current_reference" TEXT, "refund_state" TEXT, "consent_at" INTEGER, "updated_at" INTEGER NOT NULL
);
-- statement-breakpoint
CREATE TABLE IF NOT EXISTS "billing_attempt" (
  "reference" TEXT PRIMARY KEY NOT NULL, "user_id" TEXT NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "kind" TEXT NOT NULL, "state" TEXT NOT NULL, "created_at" INTEGER NOT NULL, "updated_at" INTEGER NOT NULL
);
-- statement-breakpoint
CREATE INDEX IF NOT EXISTS "billing_attempt_user_idx" ON "billing_attempt" ("user_id");
-- statement-breakpoint
CREATE TABLE IF NOT EXISTS "billing_event" ("event_key" TEXT PRIMARY KEY NOT NULL, "received_at" INTEGER NOT NULL);
-- statement-breakpoint
CREATE TABLE IF NOT EXISTS "billing_checkout_link" (
  "reference" TEXT PRIMARY KEY NOT NULL REFERENCES "billing_attempt"("reference") ON DELETE CASCADE,
  "url" TEXT NOT NULL
);
-- statement-breakpoint
CREATE TABLE IF NOT EXISTS "billing_email" (
  "event_key" TEXT PRIMARY KEY NOT NULL, "recipient" TEXT NOT NULL, "subject" TEXT NOT NULL,
  "body" TEXT NOT NULL, "state" TEXT NOT NULL DEFAULT 'pending', "created_at" INTEGER NOT NULL, "sent_at" INTEGER
);
