-- Per-registration check-in token, encoded in the attendee's QR ticket. Stored
-- in the clear because the check-in action is gated by a staff session, not by
-- this value; existing rows stay NULL and are backfilled by prisma/backfill-checkin.mjs.
ALTER TABLE "Registration" ADD COLUMN     "checkInToken" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Registration_checkInToken_key" ON "Registration"("checkInToken");
