-- CreateTable
CREATE TABLE "ScaffoldPing" (
    "id" SERIAL NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ScaffoldPing_pkey" PRIMARY KEY ("id")
);
