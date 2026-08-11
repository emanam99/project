// ===========================================
// PM2 Ecosystem File for Tongkrongan AI
// ===========================================

module.exports = {
  apps: [
    {
      name: 'tongkrongan-ai-next',
      script: 'node_modules/.bin/next',
      args: 'start',
      cwd: './',
      instances: 2,
      exec_mode: 'cluster',
      env: {
        NODE_ENV: 'production',
        PORT: 3000,
      },
      env_production: {
        NODE_ENV: 'production',
      },
      max_memory_restart: '500M',
      error_file: './logs/next-error.log',
      out_file: './logs/next-out.log',
      merge_logs: true,
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      restart_delay: 3000,
      max_restarts: 10,
      min_uptime: 10000,
      listen_timeout: 5000,
      kill_timeout: 5000,
    },
    {
      name: 'tongkrongan-ai-socket',
      script: 'dist-server/socket-server.js',
      cwd: './',
      instances: 1,
      exec_mode: 'fork',
      env: {
        NODE_ENV: 'production',
        SOCKET_PORT: 3001,
      },
      env_production: {
        NODE_ENV: 'production',
      },
      max_memory_restart: '300M',
      error_file: './logs/socket-error.log',
      out_file: './logs/socket-out.log',
      merge_logs: true,
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      restart_delay: 3000,
      max_restarts: 10,
      min_uptime: 10000,
      kill_timeout: 5000,
      watch: false,
    },
  ],
};
