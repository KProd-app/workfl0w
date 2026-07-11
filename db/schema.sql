-- ============================================================================
-- SQL schema for Printflow ERP (Micro-SaaS Production, Order & ERP Middleware)
-- Database: PostgreSQL
-- Features: Row Level Security (RLS) friendly, serial invoice numbering trigger.
-- ============================================================================

-- Enable UUID extension if not enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 0.1. STATIONS TABLE
CREATE TABLE IF NOT EXISTS stations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  code VARCHAR(50) UNIQUE NOT NULL, -- e.g., 'CANVAS', 'POSTER', 'STICKER'
  description TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 0.1.2. STATION BEDS TABLE
CREATE TABLE IF NOT EXISTS station_beds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  station_id UUID REFERENCES stations(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  width_mm INTEGER NOT NULL,
  height_mm INTEGER NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 0.2. PRODUCT ROUTING RULES TABLE
CREATE TABLE IF NOT EXISTS product_configs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  sku_pattern VARCHAR(100) UNIQUE NOT NULL, -- e.g., 'CANVAS-*', 'POSTER-*'
  station_id UUID REFERENCES stations(id) ON DELETE CASCADE,
  artwork_generator_type VARCHAR(100) NOT NULL, -- e.g., 'standard_canvas', 'high_res_poster'
  required_material_sku VARCHAR(100) REFERENCES inventory(sku) ON DELETE SET NULL,
  material_qty_per_item DECIMAL(10, 2) DEFAULT 1.00,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);


-- Create order statuses type
CREATE TYPE order_status AS ENUM (
  'PENDING_ARTWORK',
  'READY_FOR_PRODUCTION',
  'PRINTED_AND_PACKED',
  'FULFILLED',
  'CANCELLED'
);

-- 1. ORDERS TABLE
CREATE TABLE IF NOT EXISTS orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shopify_order_id VARCHAR(255) UNIQUE NOT NULL,
  order_number VARCHAR(100) NOT NULL,
  customer_name VARCHAR(255) NOT NULL,
  customer_email VARCHAR(255) NOT NULL,
  total_price DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
  shipping_price DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
  raw_materials_cost DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
  net_profit DECIMAL(10, 2) NOT NULL DEFAULT 0.00, -- Computed: total_price - raw_materials_cost - shipping_price
  status order_status NOT NULL DEFAULT 'PENDING_ARTWORK',
  shipping_address JSONB,
  tracking_number VARCHAR(100),
  shipping_label_url TEXT,
  shopify_fulfilled BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Indexing for fast search and filtering in dashboards
CREATE INDEX idx_orders_status ON orders(status);
CREATE INDEX idx_orders_shopify_order_id ON orders(shopify_order_id);

-- 2. ORDER ITEMS TABLE
CREATE TABLE IF NOT EXISTS order_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  shopify_line_item_id VARCHAR(255) NOT NULL,
  product_name VARCHAR(255) NOT NULL,
  sku VARCHAR(100) NOT NULL,
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  price DECIMAL(10, 2) NOT NULL,
  artwork_file_url TEXT, -- Path to generated 300DPI production print file in Supabase Storage
  station_id UUID REFERENCES stations(id) ON DELETE SET NULL,
  status VARCHAR(50) NOT NULL DEFAULT 'PENDING_ARTWORK',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_order_items_order_id ON order_items(order_id);

-- 3. INVENTORY (RAW MATERIALS) TABLE
CREATE TABLE IF NOT EXISTS inventory (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  material_name VARCHAR(255) UNIQUE NOT NULL,
  sku VARCHAR(100) UNIQUE NOT NULL,
  quantity_remaining DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
  unit VARCHAR(50) NOT NULL, -- e.g., 'm2', 'ml', 'pcs'
  critical_threshold DECIMAL(10, 2) NOT NULL DEFAULT 10.00, -- Trigger warning when remaining goes below this
  cost_per_unit DECIMAL(10, 2) NOT NULL DEFAULT 0.00, -- Used for dynamic profitability calculations
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 4. RAW MATERIALS USAGE LOG
CREATE TABLE IF NOT EXISTS raw_materials_usage_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID REFERENCES orders(id) ON DELETE SET NULL,
  material_id UUID NOT NULL REFERENCES inventory(id) ON DELETE CASCADE,
  quantity_used DECIMAL(10, 2) NOT NULL,
  logged_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 5. INVOICES TABLE
CREATE TABLE IF NOT EXISTS invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID UNIQUE NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  invoice_number VARCHAR(100) UNIQUE NOT NULL, -- e.g., INV-2026-0001
  pdf_url TEXT, -- Path to generated Invoice PDF in Supabase Storage
  issued_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  sent_to_customer_at TIMESTAMP WITH TIME ZONE,
  status VARCHAR(50) NOT NULL DEFAULT 'ISSUED' -- 'ISSUED', 'SENT', 'FAILED'
);

-- ============================================================================
-- AUTOMATIC INVOICE NUMBER GENERATION (PostgreSQL Trigger)
-- Generates unique, contiguous numbers in format: INV-YYYY-NNNN
-- ============================================================================

-- Create table to track sequential invoice sequence by year
CREATE TABLE IF NOT EXISTS invoice_sequences (
  year INTEGER PRIMARY KEY,
  last_value INTEGER NOT NULL DEFAULT 0
);

-- Trigger function to automatically populate invoice_number
CREATE OR REPLACE FUNCTION generate_invoice_number()
RETURNS TRIGGER AS $$
DECLARE
  current_yr INTEGER;
  next_seq INTEGER;
  formatted_num VARCHAR(100);
BEGIN
  -- Extract current year
  current_yr := EXTRACT(YEAR FROM CURRENT_DATE);
  
  -- Insert sequence row if not exists and lock row for write concurrency
  INSERT INTO invoice_sequences (year, last_value)
  VALUES (current_yr, 0)
  ON CONFLICT (year) DO NOTHING;
  
  -- Select and increment with explicit row locking to prevent duplicates under load
  UPDATE invoice_sequences
  SET last_value = last_value + 1
  WHERE year = current_yr
  RETURNING last_value INTO next_seq;
  
  -- Format with padding: INV-YYYY-0001
  formatted_num := 'INV-' || current_yr || '-' || LPAD(next_seq::text, 4, '0');
  
  -- Set invoice_number
  NEW.invoice_number := formatted_num;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Bind trigger to invoices table
CREATE TRIGGER trg_generate_invoice_number
BEFORE INSERT ON invoices
FOR EACH ROW
WHEN (NEW.invoice_number IS NULL OR NEW.invoice_number = '')
EXECUTE FUNCTION generate_invoice_number();


-- ============================================================================
-- FINANCIAL SUMMARY VIEW (Buhalterijai ir analitikai)
-- This view aggregates orders, sales, shipping, materials cost, and net profit
-- ============================================================================
CREATE OR REPLACE VIEW monthly_financial_summary AS
SELECT
  TO_CHAR(o.created_at, 'YYYY-MM') AS report_month,
  COUNT(o.id) AS total_orders,
  SUM(o.total_price) AS total_revenue,
  SUM(o.shipping_price) AS total_shipping_revenue,
  SUM(o.raw_materials_cost) AS total_materials_cost,
  SUM(o.net_profit) AS total_net_profit,
  COUNT(i.id) AS total_invoices_issued,
  ROUND((SUM(o.net_profit) / NULLIF(SUM(o.total_price), 0) * 100), 2) AS profit_margin_percent
FROM orders o
LEFT JOIN invoices i ON o.id = i.order_id
WHERE o.status != 'CANCELLED'
GROUP BY TO_CHAR(o.created_at, 'YYYY-MM')
ORDER BY report_month DESC;

-- Example query to fetch financial statements:
-- SELECT * FROM monthly_financial_summary;

-- 6. EMAIL LOGS TABLE
CREATE TABLE IF NOT EXISTS email_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient VARCHAR(255) NOT NULL,
  subject VARCHAR(255) NOT NULL,
  status VARCHAR(50) NOT NULL,
  body_preview TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_email_logs_recipient ON email_logs(recipient);

