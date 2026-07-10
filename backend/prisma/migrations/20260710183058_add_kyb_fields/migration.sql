/*
  Warnings:

  - A unique constraint covering the columns `[sumsubKybApplicantId]` on the table `User` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateEnum
CREATE TYPE "KybStatus" AS ENUM ('NOT_STARTED', 'INIT', 'PENDING', 'COMPLETED', 'REJECTED', 'ON_HOLD');

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "companyCountry" TEXT,
ADD COLUMN     "companyName" TEXT,
ADD COLUMN     "companyRegistrationNumber" TEXT,
ADD COLUMN     "kybStatus" "KybStatus" NOT NULL DEFAULT 'NOT_STARTED',
ADD COLUMN     "sumsubKybApplicantId" TEXT,
ADD COLUMN     "sumsubKybExternalUserId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "User_sumsubKybApplicantId_key" ON "User"("sumsubKybApplicantId");

-- CreateIndex
CREATE INDEX "User_kybStatus_idx" ON "User"("kybStatus");
