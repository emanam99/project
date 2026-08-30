-- Sesi platform admin tidak terikat tenant (sppg_id NULL).
ALTER TABLE sessions MODIFY sppg_id INT NULL;
