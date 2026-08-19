ALTER TABLE rekening_transfer
  ADD COLUMN biaya_admin DECIMAL(14,2) NOT NULL DEFAULT 0 AFTER jumlah,
  ADD COLUMN belanja_id INT NULL AFTER keterangan,
  ADD CONSTRAINT fk_transfer_belanja FOREIGN KEY (belanja_id) REFERENCES belanja(id) ON DELETE SET NULL;
