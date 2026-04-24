-- CreateEnum
CREATE TYPE "BannerPlacement" AS ENUM ('MAIN_HERO', 'MAIN_SIDE', 'KUJI_DETAIL_TOP', 'POPUP');

-- AlterTable
ALTER TABLE "PrizeTier" ADD COLUMN     "animationPreset" TEXT;

-- CreateTable
CREATE TABLE "Banner" (
    "id" TEXT NOT NULL,
    "placement" "BannerPlacement" NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT,
    "imageUrl" TEXT,
    "linkUrl" TEXT,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "startAt" TIMESTAMP(3),
    "endAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Banner_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SiteConfig" (
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SiteConfig_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE INDEX "Banner_placement_isActive_priority_idx" ON "Banner"("placement", "isActive", "priority");

-- CreateIndex
CREATE INDEX "Banner_placement_startAt_endAt_idx" ON "Banner"("placement", "startAt", "endAt");
