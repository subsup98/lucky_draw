ALTER TABLE "User" ADD COLUMN "kakaoId" TEXT;
ALTER TABLE "User" ADD COLUMN "naverId" TEXT;
ALTER TABLE "User" ADD COLUMN "googleId" TEXT;
CREATE UNIQUE INDEX "User_kakaoId_key" ON "User"("kakaoId");
CREATE UNIQUE INDEX "User_naverId_key" ON "User"("naverId");
CREATE UNIQUE INDEX "User_googleId_key" ON "User"("googleId");
