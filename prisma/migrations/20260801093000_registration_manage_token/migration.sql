-- Per-registration management token, so a registrant can view and give up their
-- own place from the link in their confirmation email without an account.
-- Stores a SHA-256 hash of the emailed value; existing rows stay NULL, which
-- Postgres allows any number of under a unique index.
ALTER TABLE "Registration" ADD COLUMN     "manageToken" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Registration_manageToken_key" ON "Registration"("manageToken");
