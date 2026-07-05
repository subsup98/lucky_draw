-- AlterEnum
ALTER TYPE "PaymentStatus" ADD VALUE IF NOT EXISTS 'WAITING_DEPOSIT';
ALTER TYPE "PaymentStatus" ADD VALUE IF NOT EXISTS 'DEPOSIT_CHECK_REQUIRED';

-- AlterEnum
ALTER TYPE "ShipmentStatus" ADD VALUE IF NOT EXISTS 'INVOICE_REGISTERED';
ALTER TYPE "ShipmentStatus" ADD VALUE IF NOT EXISTS 'ON_HOLD';

-- CreateEnum
CREATE TYPE "ProductType" AS ENUM ('PREORDER', 'GENERAL');

-- CreateEnum
CREATE TYPE "ProductSaleStatus" AS ENUM ('DRAFT', 'ON_SALE', 'SOLD_OUT', 'CLOSED');

-- CreateEnum
CREATE TYPE "DeliveryMethod" AS ENUM ('SHIPPING', 'PICKUP');

-- CreateEnum
CREATE TYPE "PickupStatus" AS ENUM ('WAITING', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "NotificationTargetType" AS ENUM ('USER', 'ADMIN');

-- CreateEnum
CREATE TYPE "NotificationChannel" AS ENUM ('SMS', 'EMAIL', 'KAKAO_CHANNEL', 'INTERNAL');

-- CreateEnum
CREATE TYPE "NotificationMessageType" AS ENUM ('ORDER_RECEIVED', 'PAYMENT_COMPLETED', 'DEPOSIT_REQUESTED', 'DEPOSIT_CONFIRMED', 'INVOICE_REGISTERED', 'SHIPPING_STARTED', 'SHIPPING_COMPLETED', 'PICKUP_READY', 'PICKUP_COMPLETED', 'ISSUE_OCCURRED');

-- CreateEnum
CREATE TYPE "NotificationStatus" AS ENUM ('PENDING', 'SENT', 'FAILED');

-- CreateEnum
CREATE TYPE "PrivacyAccessType" AS ENUM ('VIEW', 'UPDATE', 'DOWNLOAD');

-- AlterTable
ALTER TABLE "Order" ADD COLUMN "orderNumber" TEXT;
ALTER TABLE "Order" ADD COLUMN "deliveryMethod" "DeliveryMethod" NOT NULL DEFAULT 'SHIPPING';
ALTER TABLE "Order" ADD COLUMN "adminMemo" TEXT;
ALTER TABLE "Order" ADD COLUMN "completedAt" TIMESTAMP(3);
ALTER TABLE "Order" ADD COLUMN "refundedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Payment" ADD COLUMN "depositorName" TEXT;
ALTER TABLE "Payment" ADD COLUMN "confirmedAt" TIMESTAMP(3);
ALTER TABLE "Payment" ADD COLUMN "confirmedByAdminId" TEXT;

-- AlterTable
ALTER TABLE "Shipment" ADD COLUMN "invoiceRegisteredAt" TIMESTAMP(3);
ALTER TABLE "Shipment" ADD COLUMN "holdReason" TEXT;

-- CreateTable
CREATE TABLE "Product" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "imageUrl" TEXT,
    "type" "ProductType" NOT NULL,
    "price" INTEGER NOT NULL,
    "stock" INTEGER NOT NULL DEFAULT 0,
    "saleStatus" "ProductSaleStatus" NOT NULL DEFAULT 'DRAFT',
    "saleStartAt" TIMESTAMP(3),
    "saleEndAt" TIMESTAMP(3),
    "preorderOpenedAt" TIMESTAMP(3),
    "preorderClosedAt" TIMESTAMP(3),
    "expectedArrivalDate" DATE,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Product_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrderItem" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "productId" TEXT,
    "productNameSnapshot" TEXT NOT NULL,
    "priceSnapshot" INTEGER NOT NULL,
    "quantity" INTEGER NOT NULL,
    "itemStatus" TEXT NOT NULL DEFAULT 'PENDING',
    "reservationSequence" INTEGER,
    "paidSequence" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OrderItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Pickup" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "status" "PickupStatus" NOT NULL DEFAULT 'WAITING',
    "location" TEXT,
    "scheduledAt" TIMESTAMP(3),
    "pickedUpAt" TIMESTAMP(3),
    "confirmedByAdminId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Pickup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "orderId" TEXT,
    "targetType" "NotificationTargetType" NOT NULL,
    "channel" "NotificationChannel" NOT NULL,
    "messageType" "NotificationMessageType" NOT NULL,
    "message" TEXT NOT NULL,
    "status" "NotificationStatus" NOT NULL DEFAULT 'PENDING',
    "sentAt" TIMESTAMP(3),
    "failureReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PrivacyAccessLog" (
    "id" TEXT NOT NULL,
    "adminUserId" TEXT NOT NULL,
    "targetUserId" TEXT,
    "orderId" TEXT,
    "accessType" "PrivacyAccessType" NOT NULL,
    "accessedField" TEXT NOT NULL,
    "ip" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PrivacyAccessLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Order_orderNumber_key" ON "Order"("orderNumber");

-- CreateIndex
CREATE INDEX "Order_deliveryMethod_status_idx" ON "Order"("deliveryMethod", "status");

-- CreateIndex
CREATE INDEX "Payment_method_status_idx" ON "Payment"("method", "status");

-- CreateIndex
CREATE INDEX "Shipment_carrier_trackingNumber_idx" ON "Shipment"("carrier", "trackingNumber");

-- CreateIndex
CREATE UNIQUE INDEX "Product_slug_key" ON "Product"("slug");

-- CreateIndex
CREATE INDEX "Product_type_saleStatus_idx" ON "Product"("type", "saleStatus");

-- CreateIndex
CREATE INDEX "Product_saleStatus_saleStartAt_idx" ON "Product"("saleStatus", "saleStartAt");

-- CreateIndex
CREATE INDEX "Product_expectedArrivalDate_idx" ON "Product"("expectedArrivalDate");

-- CreateIndex
CREATE INDEX "OrderItem_orderId_idx" ON "OrderItem"("orderId");

-- CreateIndex
CREATE INDEX "OrderItem_productId_idx" ON "OrderItem"("productId");

-- CreateIndex
CREATE INDEX "OrderItem_productId_reservationSequence_idx" ON "OrderItem"("productId", "reservationSequence");

-- CreateIndex
CREATE INDEX "OrderItem_productId_paidSequence_idx" ON "OrderItem"("productId", "paidSequence");

-- CreateIndex
CREATE UNIQUE INDEX "Pickup_orderId_key" ON "Pickup"("orderId");

-- CreateIndex
CREATE INDEX "Pickup_status_scheduledAt_idx" ON "Pickup"("status", "scheduledAt");

-- CreateIndex
CREATE INDEX "Pickup_confirmedByAdminId_idx" ON "Pickup"("confirmedByAdminId");

-- CreateIndex
CREATE INDEX "Notification_userId_createdAt_idx" ON "Notification"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "Notification_orderId_createdAt_idx" ON "Notification"("orderId", "createdAt");

-- CreateIndex
CREATE INDEX "Notification_targetType_status_createdAt_idx" ON "Notification"("targetType", "status", "createdAt");

-- CreateIndex
CREATE INDEX "Notification_messageType_createdAt_idx" ON "Notification"("messageType", "createdAt");

-- CreateIndex
CREATE INDEX "PrivacyAccessLog_adminUserId_createdAt_idx" ON "PrivacyAccessLog"("adminUserId", "createdAt");

-- CreateIndex
CREATE INDEX "PrivacyAccessLog_targetUserId_createdAt_idx" ON "PrivacyAccessLog"("targetUserId", "createdAt");

-- CreateIndex
CREATE INDEX "PrivacyAccessLog_orderId_createdAt_idx" ON "PrivacyAccessLog"("orderId", "createdAt");

-- CreateIndex
CREATE INDEX "PrivacyAccessLog_accessType_createdAt_idx" ON "PrivacyAccessLog"("accessType", "createdAt");

-- AddForeignKey
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Pickup" ADD CONSTRAINT "Pickup_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Pickup" ADD CONSTRAINT "Pickup_confirmedByAdminId_fkey" FOREIGN KEY ("confirmedByAdminId") REFERENCES "AdminUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PrivacyAccessLog" ADD CONSTRAINT "PrivacyAccessLog_adminUserId_fkey" FOREIGN KEY ("adminUserId") REFERENCES "AdminUser"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PrivacyAccessLog" ADD CONSTRAINT "PrivacyAccessLog_targetUserId_fkey" FOREIGN KEY ("targetUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PrivacyAccessLog" ADD CONSTRAINT "PrivacyAccessLog_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;
