ALTER TABLE "Merchant"
ADD COLUMN "shopifyTokenEncrypted" TEXT,
ADD COLUMN "shopifyScopes" TEXT,
ADD COLUMN "installedAt" TIMESTAMP(3);
