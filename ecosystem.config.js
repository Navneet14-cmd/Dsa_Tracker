// pm2 process file for running the API as a long-lived service
// (Windows home server or any other machine).
//   pm2 start ecosystem.config.js && pm2 save
// See docs/WINDOWS_SETUP.md for starting it automatically at boot.
const path = require('path');

module.exports = {
  apps: [
    {
      name: 'dsa-tracker-api',
      script: 'dist/index.js',
      cwd: __dirname,
      exec_mode: 'fork',
      instances: 1,
      autorestart: true,
      restart_delay: 5000, // e.g. Postgres still starting after a reboot
      max_restarts: 50,
      min_uptime: 10000,
      max_memory_restart: '500M',
      kill_timeout: 5000,
      time: true, // timestamp log lines
      out_file: path.join(__dirname, 'logs', 'api.out.log'),
      error_file: path.join(__dirname, 'logs', 'api.err.log'),
      env: {
        // Everything else comes from .env
        NODE_ENV: 'production',
      },
    },
  ],
};
