-- CreateEnum
CREATE TYPE "UserVehicleStatus" AS ENUM ('active', 'inactive');

-- CreateTable
CREATE TABLE "UserVehicle" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "vehicleRegNumber" TEXT NOT NULL,
    "status" "UserVehicleStatus" NOT NULL DEFAULT 'active',
    "displayName" TEXT,
    "latestStatusChange" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "UserVehicle_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "UserVehicle_userId_status_latestStatusChange_idx" ON "UserVehicle"("userId", "status", "latestStatusChange");

-- CreateIndex
CREATE UNIQUE INDEX "UserVehicle_userId_vehicleRegNumber_key" ON "UserVehicle"("userId", "vehicleRegNumber");

-- AddForeignKey
ALTER TABLE "UserVehicle" ADD CONSTRAINT "UserVehicle_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserVehicle" ADD CONSTRAINT "UserVehicle_vehicleRegNumber_fkey" FOREIGN KEY ("vehicleRegNumber") REFERENCES "Vehicle"("regNumber") ON DELETE RESTRICT ON UPDATE CASCADE;

