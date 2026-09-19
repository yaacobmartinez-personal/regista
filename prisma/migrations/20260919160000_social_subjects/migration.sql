-- AlterTable
ALTER TABLE "User" ADD COLUMN     "appleSub" TEXT,
ADD COLUMN     "googleSub" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "User_googleSub_key" ON "User"("googleSub");

-- CreateIndex
CREATE UNIQUE INDEX "User_appleSub_key" ON "User"("appleSub");
