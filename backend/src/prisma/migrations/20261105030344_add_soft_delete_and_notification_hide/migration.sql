-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "NotificationType" ADD VALUE 'ORDER_REASSIGNED';
ALTER TYPE "NotificationType" ADD VALUE 'ORDER_VOIDED_DELETED';

-- AlterEnum
ALTER TYPE "PermissionCode" ADD VALUE 'ORDER_DELETE';

-- DropIndex
DROP INDEX "areas_company_id_is_technical_queue_idx";

-- DropIndex
DROP INDEX "notifications_recipient_area_id_is_read_created_at_idx";

-- DropIndex
DROP INDEX "notifications_recipient_user_id_is_read_created_at_idx";

-- DropIndex
DROP INDEX "repair_orders_assigned_to_id_status_idx";

-- DropIndex
DROP INDEX "repair_orders_company_id_origin_area_id_created_at_idx";

-- DropIndex
DROP INDEX "repair_orders_company_id_status_idx";

-- DropIndex
DROP INDEX "repair_orders_company_id_target_area_id_status_priority_que_idx";

-- DropIndex
DROP INDEX "repair_orders_created_by_id_status_idx";

-- DropIndex
DROP INDEX "users_company_id_area_id_is_active_available_since_idx";

-- DropIndex
DROP INDEX "users_company_id_is_active_idx";

-- AlterTable
ALTER TABLE "areas" ADD COLUMN     "deleted_at" TIMESTAMPTZ(3),
ADD COLUMN     "is_active" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "notifications" ADD COLUMN     "hidden_at" TIMESTAMPTZ(3),
ADD COLUMN     "is_hidden_by_recipient" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "repair_orders" ADD COLUMN     "deleted_at" TIMESTAMPTZ(3),
ADD COLUMN     "deleted_by_id" UUID;

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "deleted_at" TIMESTAMPTZ(3);

-- CreateIndex
CREATE INDEX "areas_company_id_is_active_deleted_at_idx" ON "areas"("company_id", "is_active", "deleted_at");

-- CreateIndex
CREATE INDEX "areas_company_id_is_technical_queue_is_active_idx" ON "areas"("company_id", "is_technical_queue", "is_active");

-- CreateIndex
CREATE INDEX "notifications_recipient_user_id_is_hidden_by_recipient_is_r_idx" ON "notifications"("recipient_user_id", "is_hidden_by_recipient", "is_read", "created_at" DESC);

-- CreateIndex
CREATE INDEX "notifications_recipient_area_id_is_hidden_by_recipient_is_r_idx" ON "notifications"("recipient_area_id", "is_hidden_by_recipient", "is_read", "created_at" DESC);

-- CreateIndex
CREATE INDEX "repair_orders_company_id_deleted_at_status_idx" ON "repair_orders"("company_id", "deleted_at", "status");

-- CreateIndex
CREATE INDEX "repair_orders_company_id_origin_area_id_deleted_at_created__idx" ON "repair_orders"("company_id", "origin_area_id", "deleted_at", "created_at" DESC);

-- CreateIndex
CREATE INDEX "repair_orders_company_id_target_area_id_deleted_at_status_p_idx" ON "repair_orders"("company_id", "target_area_id", "deleted_at", "status", "priority" DESC, "queued_at" ASC);

-- CreateIndex
CREATE INDEX "repair_orders_assigned_to_id_deleted_at_status_idx" ON "repair_orders"("assigned_to_id", "deleted_at", "status");

-- CreateIndex
CREATE INDEX "repair_orders_created_by_id_deleted_at_status_idx" ON "repair_orders"("created_by_id", "deleted_at", "status");

-- CreateIndex
CREATE INDEX "users_company_id_area_id_is_active_deleted_at_available_sin_idx" ON "users"("company_id", "area_id", "is_active", "deleted_at", "available_since" ASC);

-- CreateIndex
CREATE INDEX "users_company_id_is_active_deleted_at_idx" ON "users"("company_id", "is_active", "deleted_at");

-- AddForeignKey
ALTER TABLE "repair_orders" ADD CONSTRAINT "repair_orders_deleted_by_id_fkey" FOREIGN KEY ("deleted_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
