-- AlterTable
ALTER TABLE "Variant" ADD COLUMN     "salePriceGross" INTEGER,
ADD COLUMN     "salePriceNet" INTEGER,
ADD COLUMN     "saleStartAt" TIMESTAMP(3),
ADD COLUMN     "saleEndAt" TIMESTAMP(3);
