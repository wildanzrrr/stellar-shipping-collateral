-- CreateEnum
CREATE TYPE "KycStatus" AS ENUM ('NOT_STARTED', 'INIT', 'PENDING', 'COMPLETED', 'REJECTED', 'ON_HOLD');

-- AlterTable
ALTER TABLE "User" ADD COLUMN "kycStatus" "KycStatus" NOT NULL DEFAULT 'NOT_STARTED';
ALTER TABLE "User" ADD COLUMN "sumsubApplicantId" TEXT;
ALTER TABLE "User" ADD COLUMN "sumsubExternalUserId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "User_sumsubApplicantId_key" ON "User"("sumsubApplicantId");
CREATE INDEX "User_kycStatus_idx" ON "User"("kycStatus");