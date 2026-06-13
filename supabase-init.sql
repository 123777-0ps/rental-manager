-- ============================================
-- 演唱会手机租赁设备管理系统 - 数据库初始化
-- ============================================
-- 在 Supabase SQL Editor 中执行此文件
-- ============================================

-- 1. 订单记录表
CREATE TABLE IF NOT EXISTS rental_records (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  order_id TEXT NOT NULL,
  device_model TEXT NOT NULL,
  quantity INTEGER DEFAULT 1,
  device_numbers TEXT[] DEFAULT '{}',
  xianyu_customer TEXT,
  phone TEXT,
  ship_address TEXT,
  ship_date TEXT,
  receipt_date TEXT,
  expected_return_date TEXT,
  estimated_arrival_date TEXT,
  notes TEXT,
  status TEXT DEFAULT '待发货',
  peer_shipping BOOLEAN DEFAULT FALSE,
  shop_name TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. 设备信息表
CREATE TABLE IF NOT EXISTS device_info (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  model TEXT NOT NULL,
  number TEXT NOT NULL,
  purchase_price TEXT DEFAULT '0',
  condition TEXT DEFAULT '全新',
  notes TEXT DEFAULT '',
  purchase_date TEXT DEFAULT '',
  UNIQUE(model, number)
);

-- 3. 一键到仓快照表
CREATE TABLE IF NOT EXISTS bulk_return_logs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  batch_id TEXT NOT NULL,
  operated_at TIMESTAMPTZ DEFAULT NOW(),
  record_id UUID NOT NULL,
  order_id TEXT NOT NULL,
  device_model TEXT NOT NULL,
  device_number TEXT NOT NULL,
  xianyu_customer TEXT,
  phone TEXT,
  ship_address TEXT,
  ship_date TEXT,
  receipt_date TEXT,
  expected_return_date TEXT,
  estimated_arrival_date TEXT,
  notes TEXT
);

-- 索引
CREATE INDEX IF NOT EXISTS idx_bulk_return_batch_id ON bulk_return_logs(batch_id);
CREATE INDEX IF NOT EXISTS idx_bulk_return_device_number ON bulk_return_logs(device_number);
CREATE INDEX IF NOT EXISTS idx_rental_records_status ON rental_records(status);
CREATE INDEX IF NOT EXISTS idx_rental_records_order_id ON rental_records(order_id);

-- ============================================
-- 初始化设备数据（86台手机）
-- ============================================

-- vivo X200U: 编号 001-065（共65台）
INSERT INTO device_info (model, number) VALUES
  ('vivo X200U', '001'), ('vivo X200U', '002'), ('vivo X200U', '003'),
  ('vivo X200U', '004'), ('vivo X200U', '005'), ('vivo X200U', '006'),
  ('vivo X200U', '007'), ('vivo X200U', '008'), ('vivo X200U', '009'),
  ('vivo X200U', '010'), ('vivo X200U', '011'), ('vivo X200U', '012'),
  ('vivo X200U', '013'), ('vivo X200U', '014'), ('vivo X200U', '015'),
  ('vivo X200U', '016'), ('vivo X200U', '017'), ('vivo X200U', '018'),
  ('vivo X200U', '019'), ('vivo X200U', '020'), ('vivo X200U', '021'),
  ('vivo X200U', '022'), ('vivo X200U', '023'), ('vivo X200U', '024'),
  ('vivo X200U', '025'), ('vivo X200U', '026'), ('vivo X200U', '027'),
  ('vivo X200U', '028'), ('vivo X200U', '029'), ('vivo X200U', '030'),
  ('vivo X200U', '031'), ('vivo X200U', '032'), ('vivo X200U', '033'),
  ('vivo X200U', '034'), ('vivo X200U', '035'), ('vivo X200U', '036'),
  ('vivo X200U', '037'), ('vivo X200U', '038'), ('vivo X200U', '039'),
  ('vivo X200U', '040'), ('vivo X200U', '041'), ('vivo X200U', '042'),
  ('vivo X200U', '043'), ('vivo X200U', '044'), ('vivo X200U', '045'),
  ('vivo X200U', '046'), ('vivo X200U', '047'), ('vivo X200U', '048'),
  ('vivo X200U', '049'), ('vivo X200U', '050'), ('vivo X200U', '051'),
  ('vivo X200U', '052'), ('vivo X200U', '053'), ('vivo X200U', '054'),
  ('vivo X200U', '055'), ('vivo X200U', '056'), ('vivo X200U', '057'),
  ('vivo X200U', '058'), ('vivo X200U', '059'), ('vivo X200U', '060'),
  ('vivo X200U', '061'), ('vivo X200U', '062'), ('vivo X200U', '063'),
  ('vivo X200U', '064'), ('vivo X200U', '065')
ON CONFLICT (model, number) DO NOTHING;

-- 三星: 编号 084-100（共17台）
INSERT INTO device_info (model, number) VALUES
  ('三星', '084'), ('三星', '085'), ('三星', '086'), ('三星', '087'),
  ('三星', '088'), ('三星', '089'), ('三星', '090'), ('三星', '091'),
  ('三星', '092'), ('三星', '093'), ('三星', '094'), ('三星', '095'),
  ('三星', '096'), ('三星', '097'), ('三星', '098'), ('三星', '099'),
  ('三星', '100')
ON CONFLICT (model, number) DO NOTHING;

-- 苹果: 编号 301-304（共4台）
INSERT INTO device_info (model, number) VALUES
  ('苹果', '301'), ('苹果', '302'), ('苹果', '303'), ('苹果', '304')
ON CONFLICT (model, number) DO NOTHING;
