-- CreateEnum
CREATE TYPE "SpaceStatus" AS ENUM ('vacant', 'booked', 'occupied');

-- CreateEnum
CREATE TYPE "ParkingStatus" AS ENUM ('booked', 'cancelled', 'active', 'finished');

-- CreateEnum
CREATE TYPE "RateType" AS ENUM ('day', 'night');

-- CreateTable
CREATE TABLE "Space" (
    "id" UUID NOT NULL,
    "displayName" TEXT NOT NULL,
    "status" "SpaceStatus" NOT NULL DEFAULT 'vacant',
    "relatedVehicle" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Space_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Vehicle" (
    "id" UUID NOT NULL,
    "regNumber" TEXT NOT NULL,
    "vin" TEXT NOT NULL,
    "registrationCertificateNumber" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Vehicle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Parking" (
    "id" UUID NOT NULL,
    "status" "ParkingStatus" NOT NULL DEFAULT 'booked',
    "vehicleRegNumber" TEXT NOT NULL,
    "spaceId" UUID NOT NULL,
    "activeSince" TIMESTAMPTZ(3) NOT NULL,
    "currentRate" "RateType" NOT NULL,
    "latestRateChange" TIMESTAMPTZ(3) NOT NULL,
    "total" INTEGER NOT NULL DEFAULT 0,
    "latestTotalUpdate" TIMESTAMPTZ(3) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Parking_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Space_displayName_key" ON "Space"("displayName");

-- CreateIndex
CREATE UNIQUE INDEX "Vehicle_regNumber_key" ON "Vehicle"("regNumber");

-- CreateIndex
CREATE INDEX "Parking_vehicleRegNumber_status_idx" ON "Parking"("vehicleRegNumber", "status");

-- CreateIndex
CREATE UNIQUE INDEX "parking_open_per_space_key" ON "Parking"("spaceId") WHERE (status IN ('booked', 'active'));

-- CreateIndex
CREATE UNIQUE INDEX "parking_open_per_vehicle_key" ON "Parking"("vehicleRegNumber") WHERE (status IN ('booked', 'active'));

-- AddForeignKey
ALTER TABLE "Parking" ADD CONSTRAINT "Parking_spaceId_fkey" FOREIGN KEY ("spaceId") REFERENCES "Space"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
