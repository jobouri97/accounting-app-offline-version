ALTER TABLE products
  ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT TRUE;

DROP INDEX IF EXISTS products_user_id_name_key;
CREATE UNIQUE INDEX products_user_id_name_key
  ON products (user_id, LOWER(name))
  WHERE is_active = TRUE;

DROP INDEX IF EXISTS products_user_id_barcode_key;
CREATE UNIQUE INDEX products_user_id_barcode_key
  ON products (user_id, barcode)
  WHERE barcode IS NOT NULL AND is_active = TRUE;
