
CREATE TABLE IF NOT EXISTS payment_approvals (
  id SERIAL PRIMARY KEY,
  user_email VARCHAR(255) NOT NULL,
  plan VARCHAR(50) NOT NULL,
  amount DECIMAL(10,2) NOT NULL,
  payment_method VARCHAR(50) NOT NULL,
  transaction_id VARCHAR(255),
  phone_number VARCHAR(20),
  crypto_type VARCHAR(20),
  payment_proof_url TEXT,
  transaction_proof_url TEXT,
  status VARCHAR(20) DEFAULT 'pending',
  admin_message TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Add indexes for better performance
CREATE INDEX IF NOT EXISTS idx_payment_approvals_user_email ON payment_approvals(user_email);
CREATE INDEX IF NOT EXISTS idx_payment_approvals_status ON payment_approvals(status);
