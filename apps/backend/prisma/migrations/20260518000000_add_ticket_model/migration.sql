-- CreateEnum
CREATE TYPE "TicketStatus" AS ENUM ('AVAILABLE', 'RESERVED', 'SOLD');

-- CreateTable
CREATE TABLE "Ticket" (
    "id" TEXT NOT NULL,
    "kujiEventId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "prizeTierId" TEXT NOT NULL,
    "prizeItemId" TEXT,
    "status" "TicketStatus" NOT NULL DEFAULT 'AVAILABLE',
    "reservedByUserId" TEXT,
    "reservedAt" TIMESTAMP(3),
    "reserveExpiresAt" TIMESTAMP(3),
    "orderId" TEXT,
    "drawResultId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Ticket_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Ticket_drawResultId_key" ON "Ticket"("drawResultId");

-- CreateIndex
CREATE UNIQUE INDEX "Ticket_kujiEventId_position_key" ON "Ticket"("kujiEventId", "position");

-- CreateIndex
CREATE INDEX "Ticket_kujiEventId_status_idx" ON "Ticket"("kujiEventId", "status");

-- CreateIndex
CREATE INDEX "Ticket_reserveExpiresAt_idx" ON "Ticket"("reserveExpiresAt");

-- CreateIndex
CREATE INDEX "Ticket_reservedByUserId_status_idx" ON "Ticket"("reservedByUserId", "status");

-- CreateIndex
CREATE INDEX "Ticket_orderId_idx" ON "Ticket"("orderId");

-- AddForeignKey
ALTER TABLE "Ticket" ADD CONSTRAINT "Ticket_kujiEventId_fkey" FOREIGN KEY ("kujiEventId") REFERENCES "KujiEvent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Ticket" ADD CONSTRAINT "Ticket_prizeTierId_fkey" FOREIGN KEY ("prizeTierId") REFERENCES "PrizeTier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Ticket" ADD CONSTRAINT "Ticket_prizeItemId_fkey" FOREIGN KEY ("prizeItemId") REFERENCES "PrizeItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Ticket" ADD CONSTRAINT "Ticket_reservedByUserId_fkey" FOREIGN KEY ("reservedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Ticket" ADD CONSTRAINT "Ticket_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Ticket" ADD CONSTRAINT "Ticket_drawResultId_fkey" FOREIGN KEY ("drawResultId") REFERENCES "DrawResult"("id") ON DELETE SET NULL ON UPDATE CASCADE;
