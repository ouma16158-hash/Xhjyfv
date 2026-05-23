
-- EXECUTE THIS SQL DIRECTLY IN YOUR SUPABASE SQL EDITOR
-- Go to Supabase Dashboard > SQL Editor > New query > Copy and paste this entire script

-- Drop existing subscription tables if they exist
DROP TABLE IF EXISTS pending_premium_subscriptions CASCADE;
DROP TABLE IF EXISTS subscriptions CASCADE;
DROP TABLE IF EXISTS payment_transactions CASCADE;

-- Create comprehensive pending_premium_subscriptions table
CREATE TABLE pending_premium_subscriptions (
    id SERIAL PRIMARY KEY,
    user_email VARCHAR(255) NOT NULL,
    payment_method VARCHAR(50) NOT NULL CHECK (payment_method IN ('mpesa', 'crypto', 'paypal', 'binance', 'credit_card')),
    payment_proof_url TEXT,
    amount DECIMAL(10,2) NOT NULL,
    currency VARCHAR(10) DEFAULT 'USD',
    transaction_reference VARCHAR(255),
    phone_number VARCHAR(20),
    crypto_type VARCHAR(50),
    crypto_wallet_address TEXT,
    plan VARCHAR(50) NOT NULL CHECK (plan IN ('premium', 'weekly', 'monthly', 'yearly')),
    status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'expired')),
    admin_message TEXT,
    admin_email VARCHAR(255),
    requested_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    reviewed_at TIMESTAMP,
    expires_at TIMESTAMP,
    paypal_order_id VARCHAR(255),
    binance_order_id VARCHAR(255),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create subscriptions table for active subscriptions
CREATE TABLE subscriptions (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL,
    user_email VARCHAR(255) NOT NULL,
    plan VARCHAR(50) NOT NULL CHECK (plan IN ('free', 'premium', 'weekly', 'monthly', 'yearly')),
    status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'expired', 'cancelled', 'suspended')),
    payment_method VARCHAR(50),
    amount_paid DECIMAL(10,2),
    currency VARCHAR(10) DEFAULT 'USD',
    start_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    end_date TIMESTAMP,
    auto_renew BOOLEAN DEFAULT false,
    paypal_order_id VARCHAR(255),
    binance_order_id VARCHAR(255),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create payment_transactions table for payment history
CREATE TABLE payment_transactions (
    id SERIAL PRIMARY KEY,
    user_email VARCHAR(255) NOT NULL,
    subscription_id INTEGER,
    payment_method VARCHAR(50) NOT NULL,
    transaction_reference VARCHAR(255),
    amount DECIMAL(10,2) NOT NULL,
    currency VARCHAR(10) DEFAULT 'USD',
    status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'failed', 'refunded')),
    gateway_response TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (subscription_id) REFERENCES subscriptions(id) ON DELETE SET NULL
);

-- Create unique constraints for ON CONFLICT operations
CREATE UNIQUE INDEX unique_pending_subscription_reference ON pending_premium_subscriptions(user_email, transaction_reference) WHERE transaction_reference IS NOT NULL;
CREATE UNIQUE INDEX unique_pending_subscription_paypal ON pending_premium_subscriptions(paypal_order_id) WHERE paypal_order_id IS NOT NULL;
CREATE UNIQUE INDEX unique_pending_subscription_binance ON pending_premium_subscriptions(binance_order_id) WHERE binance_order_id IS NOT NULL;

-- Create indexes for better performance
CREATE INDEX idx_pending_subscriptions_user_email ON pending_premium_subscriptions(user_email);
CREATE INDEX idx_pending_subscriptions_status ON pending_premium_subscriptions(status);
CREATE INDEX idx_pending_subscriptions_created_at ON pending_premium_subscriptions(created_at);
CREATE INDEX idx_subscriptions_user_email ON subscriptions(user_email);
CREATE INDEX idx_subscriptions_status ON subscriptions(status);
CREATE INDEX idx_subscriptions_end_date ON subscriptions(end_date);
CREATE INDEX idx_payment_transactions_user_email ON payment_transactions(user_email);
CREATE INDEX idx_payment_transactions_status ON payment_transactions(status);

-- Insert default free subscriptions for existing users
INSERT INTO subscriptions (user_id, user_email, plan, status, start_date)
SELECT 
    id, 
    email, 
    'free', 
    'active',
    CURRENT_TIMESTAMP
FROM users 
WHERE email NOT IN (SELECT user_email FROM subscriptions WHERE status = 'active')
ON CONFLICT DO NOTHING;

-- Create function to automatically update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create triggers for updated_at
CREATE TRIGGER update_pending_subscriptions_updated_at 
    BEFORE UPDATE ON pending_premium_subscriptions 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_subscriptions_updated_at 
    BEFORE UPDATE ON subscriptions 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
