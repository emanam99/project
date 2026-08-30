ALTER TABLE sppg
  MODIFY status ENUM('pending_payment', 'pending_dns', 'active', 'suspended', 'cancelled') NOT NULL DEFAULT 'pending_payment';
