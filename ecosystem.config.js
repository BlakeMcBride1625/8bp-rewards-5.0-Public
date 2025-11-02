module.exports = {
  apps: [
    {
      name: '8bp-backend',
      script: 'dist/backend/backend/src/server.js',
      cwd: '/home/blake/8bp-rewards',
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      watch: false,
      max_memory_restart: '500M',
      env: {
        NODE_ENV: 'production',
        BACKEND_PORT: 2600
      },
      error_file: './logs/backend-error.log',
      out_file: './logs/backend-out.log',
      log_file: './logs/backend-combined.log',
      time: true
    },
    {
      name: '8bp-frontend',
      script: '/usr/bin/serve',
      args: ['-s', 'frontend/build', '-l', '2500'],
      cwd: '/home/blake/8bp-rewards',
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      watch: false,
      env: {
        NODE_ENV: 'production',
        PORT: 2500
      },
      error_file: './logs/frontend-error.log',
      out_file: './logs/frontend-out.log',
      log_file: './logs/frontend-combined.log',
      time: true
    }
  ]
};

