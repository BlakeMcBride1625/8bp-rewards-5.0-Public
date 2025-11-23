/**
 * Legacy PM2 ecosystem configuration retained for historical reference only.
 *
 * Docker Compose now owns process lifecycle management. Running this config
 * outside a container will spawn duplicate backend/frontend instances and
 * fight with the containerised stack for ports.
 *
 * If you absolutely must use PM2 on bare metal, copy this file out of the
 * archive and update the listen addresses to match your environment first.
 */

module.exports = {
	apps: [
		{
			name: "8bp-backend",
			script: "dist/backend/backend/src/server.js",
			cwd: "/home/blake/8bp-rewards",
			instances: 1,
			exec_mode: "fork",
			autorestart: true,
			watch: false,
			max_memory_restart: "500M",
			env: {
				NODE_ENV: "production",
				BACKEND_PORT: 2600,
			},
			error_file: "./logs/backend-error.log",
			out_file: "./logs/backend-out.log",
			log_file: "./logs/backend-combined.log",
			time: true,
		},
		{
			name: "8bp-frontend",
			script: "/usr/bin/serve",
			args: ["--single", "frontend/build", "--listen", "0.0.0.0:2500"],
			cwd: "/home/blake/8bp-rewards",
			instances: 1,
			exec_mode: "fork",
			autorestart: true,
			watch: false,
			env: {
				NODE_ENV: "production",
				PORT: 2500,
			},
			error_file: "./logs/frontend-error.log",
			out_file: "./logs/frontend-out.log",
			log_file: "./logs/frontend-combined.log",
			time: true,
		},
	],
};















