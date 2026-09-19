-- CreateEnum
CREATE TYPE "PlanTier" AS ENUM ('FREE', 'PREMIUM', 'CUSTOM');

-- AlterTable
ALTER TABLE "Tenant" ADD COLUMN     "plan" "PlanTier" NOT NULL DEFAULT 'FREE';

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "tokenVersion" INTEGER NOT NULL DEFAULT 0;
