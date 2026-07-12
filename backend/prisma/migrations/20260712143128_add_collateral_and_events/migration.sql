-- CreateEnum
CREATE TYPE "CollateralStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'VERIFIED', 'ON_CHAIN');

-- CreateEnum
CREATE TYPE "DocumentType" AS ENUM ('COMMERCIAL_INVOICE', 'BILL_OF_LADING', 'PROOF_OF_DELIVERY', 'SHIPPING_CONTRACT', 'NOTICE_OF_ASSIGNMENT');

-- CreateEnum
CREATE TYPE "TransactionEventType" AS ENUM ('RWA_CREATED', 'SHARES_BOUGHT', 'FUND_COLLECTED', 'DEBT_SETTLED', 'CLAIMED');

-- CreateTable
CREATE TABLE "Collateral" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "rwaId" TEXT NOT NULL,
    "tokenAddress" TEXT,
    "status" "CollateralStatus" NOT NULL DEFAULT 'DRAFT',
    "collateralData" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Collateral_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CollateralDocument" (
    "id" TEXT NOT NULL,
    "collateralId" TEXT NOT NULL,
    "documentType" "DocumentType" NOT NULL,
    "gcsUri" TEXT NOT NULL,
    "gcsKey" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "fileHash" TEXT NOT NULL,
    "fileSize" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CollateralDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TransactionEvent" (
    "id" TEXT NOT NULL,
    "rwaId" TEXT NOT NULL,
    "eventType" "TransactionEventType" NOT NULL,
    "investorAddress" TEXT,
    "amount" TEXT,
    "txHash" TEXT NOT NULL,
    "ledger" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TransactionEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EventListenerCursor" (
    "id" TEXT NOT NULL,
    "contractId" TEXT NOT NULL,
    "lastLedger" INTEGER NOT NULL DEFAULT 0,
    "lastEventId" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EventListenerCursor_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Collateral_rwaId_key" ON "Collateral"("rwaId");

-- CreateIndex
CREATE INDEX "Collateral_userId_idx" ON "Collateral"("userId");

-- CreateIndex
CREATE INDEX "Collateral_rwaId_idx" ON "Collateral"("rwaId");

-- CreateIndex
CREATE INDEX "Collateral_status_idx" ON "Collateral"("status");

-- CreateIndex
CREATE INDEX "CollateralDocument_collateralId_idx" ON "CollateralDocument"("collateralId");

-- CreateIndex
CREATE INDEX "CollateralDocument_documentType_idx" ON "CollateralDocument"("documentType");

-- CreateIndex
CREATE INDEX "TransactionEvent_rwaId_idx" ON "TransactionEvent"("rwaId");

-- CreateIndex
CREATE INDEX "TransactionEvent_eventType_idx" ON "TransactionEvent"("eventType");

-- CreateIndex
CREATE INDEX "TransactionEvent_investorAddress_idx" ON "TransactionEvent"("investorAddress");

-- CreateIndex
CREATE UNIQUE INDEX "EventListenerCursor_contractId_key" ON "EventListenerCursor"("contractId");

-- AddForeignKey
ALTER TABLE "Collateral" ADD CONSTRAINT "Collateral_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CollateralDocument" ADD CONSTRAINT "CollateralDocument_collateralId_fkey" FOREIGN KEY ("collateralId") REFERENCES "Collateral"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
