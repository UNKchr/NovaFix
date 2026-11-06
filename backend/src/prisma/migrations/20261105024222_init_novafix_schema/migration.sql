-- CreateEnum
CREATE TYPE "OrderStatus" AS ENUM ('CREATED', 'ASSIGNING', 'DIAGNOSING', 'IN_REPAIR', 'READY', 'DELIVERED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "OrderPriority" AS ENUM ('LOW', 'NORMAL', 'HIGH', 'URGENT');

-- CreateEnum
CREATE TYPE "PermissionPreset" AS ENUM ('RECEPTION_AGENT', 'RECEPTION_SUPERVISOR', 'TECHNICAL_SPECIALIST', 'TECHNICAL_SUPERVISOR', 'CUSTOM');

-- CreateEnum
CREATE TYPE "PermissionCode" AS ENUM ('MANAGE_AREAS', 'MANAGE_USERS', 'ORDER_CREATE', 'ORDER_ASSIGN_QUEUE', 'ORDER_STATUS_DIAGNOSING', 'ORDER_STATUS_IN_REPAIR', 'ORDER_STATUS_READY', 'ORDER_STATUS_CANCELLED', 'ORDER_STATUS_DELIVERED', 'ORDER_VIEW_AREA', 'ORDER_VIEW_ALL_COMPANY');

-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('ORDER_CREATED_ASSIGNED', 'ORDER_QUEUED_IN_AREA', 'ORDER_ASSIGNED_FROM_QUEUE', 'ORDER_STATUS_PROGRESS', 'ORDER_READY_FOR_PICKUP', 'ORDER_CANCELLED_ALERT', 'ORDER_DELIVERED_CLOSED');

-- CreateTable
CREATE TABLE "companies" (
    "id" UUID NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "slug" VARCHAR(80) NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "companies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "areas" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "name" VARCHAR(80) NOT NULL,
    "description" VARCHAR(255),
    "is_technical_queue" BOOLEAN NOT NULL DEFAULT false,
    "default_preset" "PermissionPreset" NOT NULL DEFAULT 'CUSTOM',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "areas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "area_permissions" (
    "id" UUID NOT NULL,
    "area_id" UUID NOT NULL,
    "permission" "PermissionCode" NOT NULL,

    CONSTRAINT "area_permissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "area_id" UUID,
    "email" VARCHAR(150) NOT NULL,
    "full_name" VARCHAR(100) NOT NULL,
    "password_hash" VARCHAR(255) NOT NULL,
    "password_salt" VARCHAR(128) NOT NULL,
    "is_company_admin" BOOLEAN NOT NULL DEFAULT false,
    "permission_preset" "PermissionPreset" NOT NULL DEFAULT 'CUSTOM',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "available_since" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_permissions" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "permission" "PermissionCode" NOT NULL,

    CONSTRAINT "user_permissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "repair_orders" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "ticket_code" VARCHAR(16) NOT NULL,
    "status" "OrderStatus" NOT NULL DEFAULT 'CREATED',
    "priority" "OrderPriority" NOT NULL DEFAULT 'NORMAL',
    "client_name" VARCHAR(100) NOT NULL,
    "client_contact" VARCHAR(100) NOT NULL,
    "device_model" VARCHAR(100) NOT NULL,
    "issue_desc" VARCHAR(1000) NOT NULL,
    "resolution_notes" VARCHAR(1000),
    "cancellation_reason" VARCHAR(1000),
    "created_by_id" UUID NOT NULL,
    "origin_area_id" UUID,
    "target_area_id" UUID NOT NULL,
    "assigned_to_id" UUID,
    "queued_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "assigned_at" TIMESTAMPTZ(3),
    "completed_at" TIMESTAMPTZ(3),
    "delivered_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "repair_orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "order_status_history" (
    "id" UUID NOT NULL,
    "repair_order_id" UUID NOT NULL,
    "previous_status" "OrderStatus",
    "new_status" "OrderStatus" NOT NULL,
    "changed_by_id" UUID NOT NULL,
    "comment" VARCHAR(1000),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "order_status_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "repair_order_id" UUID NOT NULL,
    "actor_user_id" UUID NOT NULL,
    "recipient_user_id" UUID,
    "recipient_area_id" UUID,
    "type" "NotificationType" NOT NULL,
    "title" VARCHAR(150) NOT NULL,
    "message" VARCHAR(500) NOT NULL,
    "is_read" BOOLEAN NOT NULL DEFAULT false,
    "read_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "companies_slug_key" ON "companies"("slug");

-- CreateIndex
CREATE INDEX "areas_company_id_is_technical_queue_idx" ON "areas"("company_id", "is_technical_queue");

-- CreateIndex
CREATE UNIQUE INDEX "areas_company_id_name_key" ON "areas"("company_id", "name");

-- CreateIndex
CREATE UNIQUE INDEX "area_permissions_area_id_permission_key" ON "area_permissions"("area_id", "permission");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "users_company_id_area_id_is_active_available_since_idx" ON "users"("company_id", "area_id", "is_active", "available_since" ASC);

-- CreateIndex
CREATE INDEX "users_company_id_is_active_idx" ON "users"("company_id", "is_active");

-- CreateIndex
CREATE UNIQUE INDEX "user_permissions_user_id_permission_key" ON "user_permissions"("user_id", "permission");

-- CreateIndex
CREATE UNIQUE INDEX "repair_orders_ticket_code_key" ON "repair_orders"("ticket_code");

-- CreateIndex
CREATE INDEX "repair_orders_company_id_status_idx" ON "repair_orders"("company_id", "status");

-- CreateIndex
CREATE INDEX "repair_orders_company_id_origin_area_id_created_at_idx" ON "repair_orders"("company_id", "origin_area_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "repair_orders_company_id_target_area_id_status_priority_que_idx" ON "repair_orders"("company_id", "target_area_id", "status", "priority" DESC, "queued_at" ASC);

-- CreateIndex
CREATE INDEX "repair_orders_assigned_to_id_status_idx" ON "repair_orders"("assigned_to_id", "status");

-- CreateIndex
CREATE INDEX "repair_orders_created_by_id_status_idx" ON "repair_orders"("created_by_id", "status");

-- CreateIndex
CREATE INDEX "repair_orders_created_at_idx" ON "repair_orders"("created_at" DESC);

-- CreateIndex
CREATE INDEX "order_status_history_repair_order_id_created_at_idx" ON "order_status_history"("repair_order_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "notifications_recipient_user_id_is_read_created_at_idx" ON "notifications"("recipient_user_id", "is_read", "created_at" DESC);

-- CreateIndex
CREATE INDEX "notifications_recipient_area_id_is_read_created_at_idx" ON "notifications"("recipient_area_id", "is_read", "created_at" DESC);

-- CreateIndex
CREATE INDEX "notifications_company_id_created_at_idx" ON "notifications"("company_id", "created_at" DESC);

-- AddForeignKey
ALTER TABLE "areas" ADD CONSTRAINT "areas_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "area_permissions" ADD CONSTRAINT "area_permissions_area_id_fkey" FOREIGN KEY ("area_id") REFERENCES "areas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_area_id_fkey" FOREIGN KEY ("area_id") REFERENCES "areas"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_permissions" ADD CONSTRAINT "user_permissions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "repair_orders" ADD CONSTRAINT "repair_orders_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "repair_orders" ADD CONSTRAINT "repair_orders_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "repair_orders" ADD CONSTRAINT "repair_orders_origin_area_id_fkey" FOREIGN KEY ("origin_area_id") REFERENCES "areas"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "repair_orders" ADD CONSTRAINT "repair_orders_target_area_id_fkey" FOREIGN KEY ("target_area_id") REFERENCES "areas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "repair_orders" ADD CONSTRAINT "repair_orders_assigned_to_id_fkey" FOREIGN KEY ("assigned_to_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_status_history" ADD CONSTRAINT "order_status_history_repair_order_id_fkey" FOREIGN KEY ("repair_order_id") REFERENCES "repair_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_status_history" ADD CONSTRAINT "order_status_history_changed_by_id_fkey" FOREIGN KEY ("changed_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_repair_order_id_fkey" FOREIGN KEY ("repair_order_id") REFERENCES "repair_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_recipient_user_id_fkey" FOREIGN KEY ("recipient_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_recipient_area_id_fkey" FOREIGN KEY ("recipient_area_id") REFERENCES "areas"("id") ON DELETE CASCADE ON UPDATE CASCADE;
