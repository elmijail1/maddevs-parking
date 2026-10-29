-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('pending', 'cancelled', 'failed', 'success');

-- CreateTable
CREATE TABLE "Payment" (
    "id" UUID NOT NULL,
    "parkingId" UUID NOT NULL,
    "total" INTEGER NOT NULL,
    "status" "PaymentStatus" NOT NULL DEFAULT 'pending',
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Payment_status_idx" ON "Payment"("status");

-- CreateIndex
CREATE UNIQUE INDEX "payment_open_per_parking_key" ON "Payment"("parkingId") WHERE (status = ANY (ARRAY['pending'::"PaymentStatus", 'success'::"PaymentStatus"]));

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_parkingId_fkey" FOREIGN KEY ("parkingId") REFERENCES "Parking"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

