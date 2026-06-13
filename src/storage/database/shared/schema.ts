import { sql } from "drizzle-orm";
import { pgTable, text, varchar, integer, numeric, timestamp, jsonb, index, serial } from "drizzle-orm/pg-core";

// 系统表 - 禁止删除
export const healthCheck = pgTable("health_check", {
  id: serial().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow(),
});

// 租赁记录表
export const rentalRecords = pgTable(
  "rental_records",
  {
    id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
    order_id: varchar("order_id", { length: 20 }).notNull(),
    device_model: varchar("device_model", { length: 20 }).notNull(),
    quantity: integer("quantity").notNull().default(1),
    device_numbers: jsonb("device_numbers").default([]),
    xianyu_customer: varchar("xianyu_customer", { length: 100 }),
    phone: varchar("phone", { length: 20 }),
    ship_address: text("ship_address"),
    address_only: text("address_only"),
    ship_date: varchar("ship_date", { length: 20 }),
    receipt_date: varchar("receipt_date", { length: 20 }),
    expected_return_date: varchar("expected_return_date", { length: 20 }),
    estimated_arrival_date: varchar("estimated_arrival_date", { length: 20 }),
    status: varchar("status", { length: 20 }).notNull().default('待发货'),
    return_date: varchar("return_date", { length: 20 }),
    created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("rental_records_order_id_idx").on(table.order_id),
    index("rental_records_status_idx").on(table.status),
    index("rental_records_device_model_idx").on(table.device_model),
    index("rental_records_ship_date_idx").on(table.ship_date),
    index("rental_records_phone_idx").on(table.phone),
  ]
);

// 设备详情表
export const deviceInfo = pgTable(
  "device_info",
  {
    id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
    model: varchar("model", { length: 20 }).notNull(),
    number: varchar("number", { length: 10 }).notNull(),
    purchase_price: numeric("purchase_price", { precision: 10, scale: 2 }).default("0"),
    condition: varchar("condition", { length: 20 }).default("全新"),
    notes: text("notes"),
    purchase_date: varchar("purchase_date", { length: 20 }),
    created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updated_at: timestamp("updated_at", { withTimezone: true }),
  },
  (table) => [
    index("device_info_model_idx").on(table.model),
    index("device_info_number_idx").on(table.number),
    index("device_info_model_number_idx").on(table.model, table.number),
  ]
);
