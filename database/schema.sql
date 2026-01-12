-- Drop tables if they exist
DROP TABLE IF EXISTS orders CASCADE;
DROP TABLE IF EXISTS products CASCADE;

-- Products Table with dynamic columns support
CREATE TABLE products (
    reference VARCHAR(100) PRIMARY KEY,
    description TEXT NOT NULL,
    price_per_unit DECIMAL(10,2) NOT NULL,
    stock_quantity INTEGER NOT NULL DEFAULT 0,
    image_url VARCHAR(500),
    extra_columns JSONB
);

-- Orders Table
CREATE TABLE orders (
    order_number SERIAL PRIMARY KEY,
    client_identifier VARCHAR(255) NOT NULL,
    file_path VARCHAR(500) NOT NULL,
    product_count INTEGER NOT NULL,
    total_amount DECIMAL(10,2),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for better performance
CREATE INDEX idx_products_reference ON products(reference);
CREATE INDEX idx_orders_client ON orders(client_identifier);
CREATE INDEX idx_orders_created ON orders(created_at DESC);