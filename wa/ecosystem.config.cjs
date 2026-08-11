/**
 * PM2 — hanya untuk menjalankan Node langsung di host (tanpa Docker).
 * Contoh: pm2 start ecosystem.config.cjs --only wa
 *
 * Jangan pakai PM2 untuk mengawasi container Docker — pakai `restart: always` di docker-compose.yml.
 * Sesuaikan cwd di VPS (/var/www/wa atau /var/www/wa2).
 */
module.exports = {
  apps: [
    {
      name: 'wa',
      script: 'server.js',
      cwd: __dirname,
      instances: 1,
      exec_mode: 'fork',
      max_memory_restart: process.env.WA_PM2_MAX_MEMORY || '450M',
      restart_delay: 5000,
      max_restarts: 30,
      min_uptime: 15000,
      exp_backoff_restart_delay: 150,
      kill_timeout: 12000,
      merge_logs: true,
      autorestart: true,
    },
  ],
};
