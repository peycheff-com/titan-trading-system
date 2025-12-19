/**
 * PM2 Ecosystem Configuration for Titan Trading System
 * 
 * Services start in order: titan-core → titan-brain → titan-scavenger → titan-console
 * 
 * Usage:
 *   pm2 start ecosystem.config.js
 *   pm2 stop all
 *   pm2 restart titan-core
 *   pm2 logs
 *   pm2 monit
 *   pm2 save && pm2 startup
 */

module.exports = {
  apps: [
    // ============================================
    // TITAN CORE (Execution Service) - The Hub
    // ============================================
    {
      name: 'titan-core',
      script: './services/titan-execution/server.js',
      cwd: __dirname,
      instances: 1,
      exec_mode: 'fork',
      
      // Startup behavior
      wait_ready: true,
      listen_timeout: 10000,
      
      // Restart behavior
      autorestart: true,
      max_restarts: 10,
      restart_delay: 1000,
      max_memory_restart: '500M',
      
      // Environment
      env: {
        NODE_ENV: 'production',
        PORT: 8080,
        WS_PORT: 8081,
        DATABASE_PATH: '/data/titan.db',
        LOG_LEVEL: 'info'
      },
      env_development: {
        NODE_ENV: 'development',
        PORT: 8080,
        WS_PORT: 8081,
        DATABASE_PATH: './services/titan-execution/titan_execution.db',
        LOG_LEVEL: 'debug'
      },
      
      // Logging
      log_date_format: 'YYYY-MM-DD HH:mm:ss.SSS',
      error_file: './logs/titan-core-error.log',
      out_file: './logs/titan-core-out.log',
      merge_logs: true,
      
      // Graceful shutdown
      kill_timeout: 5000,
      shutdown_with_message: true
    },

    // ============================================
    // TITAN BRAIN - The Cortex (Fund Manager)
    // ============================================
    {
      name: 'titan-brain',
      script: './services/titan-brain/dist/index.js',
      cwd: __dirname,
      instances: 1,
      exec_mode: 'fork',
      
      // Dependency on titan-core
      wait_ready: true,
      listen_timeout: 15000,
      
      // Ensure titan-core is running first
      depends_on: ['titan-core'],
      
      // Restart behavior
      autorestart: true,
      max_restarts: 10,
      restart_delay: 2000,
      max_memory_restart: '400M',
      
      // Environment
      env: {
        NODE_ENV: 'production',
        TITAN_CORE_URL: 'http://127.0.0.1:8080',
        TITAN_CORE_WS: 'ws://127.0.0.1:8081',
        LOG_LEVEL: 'info'
      },
      env_development: {
        NODE_ENV: 'development',
        TITAN_CORE_URL: 'http://127.0.0.1:8080',
        TITAN_CORE_WS: 'ws://127.0.0.1:8081',
        LOG_LEVEL: 'debug'
      },
      
      // Logging
      log_date_format: 'YYYY-MM-DD HH:mm:ss.SSS',
      error_file: './logs/titan-brain-error.log',
      out_file: './logs/titan-brain-out.log',
      merge_logs: true,
      
      // Graceful shutdown
      kill_timeout: 5000
    },

    // ============================================
    // TITAN SCAVENGER - Phase 1 Signal Generator
    // ============================================
    {
      name: 'titan-scavenger',
      script: './services/titan-phase1-scavenger/dist/index.js',
      cwd: __dirname,
      instances: 1,
      exec_mode: 'fork',
      args: '--headless',
      
      // Startup behavior
      wait_ready: true,
      listen_timeout: 20000,
      
      // Ensure titan-core and titan-brain are running first
      depends_on: ['titan-core', 'titan-brain'],
      
      // Restart behavior
      autorestart: true,
      max_restarts: 10,
      restart_delay: 3000,
      max_memory_restart: '400M',
      
      // Environment
      env: {
        NODE_ENV: 'production',
        TITAN_CORE_URL: 'http://127.0.0.1:8080',
        ZMQ_PORT: 5555,
        HEALTH_PORT: 8082,
        LOG_LEVEL: 'info'
      },
      env_development: {
        NODE_ENV: 'development',
        TITAN_CORE_URL: 'http://127.0.0.1:8080',
        ZMQ_PORT: 5555,
        HEALTH_PORT: 8082,
        LOG_LEVEL: 'debug'
      },
      
      // Logging
      log_date_format: 'YYYY-MM-DD HH:mm:ss.SSS',
      error_file: './logs/titan-scavenger-error.log',
      out_file: './logs/titan-scavenger-out.log',
      merge_logs: true,
      
      // Graceful shutdown
      kill_timeout: 5000
    },

    // ============================================
    // TITAN AI QUANT - Phase 4 Optimizer (Nightly)
    // ============================================
    {
      name: 'titan-ai-quant',
      script: './services/titan-ai-quant/optimize.js',
      cwd: __dirname,
      instances: 1,
      exec_mode: 'fork',
      
      // Run at midnight UTC daily
      cron_restart: '0 0 * * *',
      autorestart: false, // Don't restart after completion
      
      // Environment
      env: {
        NODE_ENV: 'production',
        TITAN_CORE_URL: 'http://127.0.0.1:8080',
        DATABASE_PATH: '/data/titan.db',
        LOG_LEVEL: 'info'
      },
      env_development: {
        NODE_ENV: 'development',
        TITAN_CORE_URL: 'http://127.0.0.1:8080',
        DATABASE_PATH: './services/titan-execution/titan_execution.db',
        LOG_LEVEL: 'debug'
      },
      
      // Logging
      log_date_format: 'YYYY-MM-DD HH:mm:ss.SSS',
      error_file: './logs/titan-ai-quant-error.log',
      out_file: './logs/titan-ai-quant-out.log',
      merge_logs: true
    },

    // ============================================
    // TITAN CONSOLE - Web Dashboard
    // ============================================
    {
      name: 'titan-console',
      script: 'npm',
      args: 'start',
      cwd: './services/titan-console',
      instances: 1,
      exec_mode: 'fork',
      
      // Startup behavior
      wait_ready: false,
      
      // Ensure backend services are running first
      depends_on: ['titan-core', 'titan-brain'],
      
      // Restart behavior
      autorestart: true,
      max_restarts: 10,
      restart_delay: 2000,
      max_memory_restart: '300M',
      
      // Environment
      env: {
        NODE_ENV: 'production',
        PORT: 3001,
        NEXT_PUBLIC_TITAN_CORE_URL: 'http://127.0.0.1:8080',
        NEXT_PUBLIC_TITAN_CORE_WS: 'ws://127.0.0.1:8081'
      },
      env_development: {
        NODE_ENV: 'development',
        PORT: 3000,
        NEXT_PUBLIC_TITAN_CORE_URL: 'http://127.0.0.1:8080',
        NEXT_PUBLIC_TITAN_CORE_WS: 'ws://127.0.0.1:8081'
      },
      
      // Logging
      log_date_format: 'YYYY-MM-DD HH:mm:ss.SSS',
      error_file: './logs/titan-console-error.log',
      out_file: './logs/titan-console-out.log',
      merge_logs: true,
      
      // Graceful shutdown
      kill_timeout: 5000
    }
  ],

  // ============================================
  // DEPLOYMENT CONFIGURATION
  // ============================================
  deploy: {
    production: {
      user: 'titan',
      host: 'titan-core.yourdomain.com',
      ref: 'origin/main',
      repo: 'git@github.com:yourusername/titan-system.git',
      path: '/opt/titan-system',
      'pre-deploy-local': '',
      'post-deploy': 'npm install && pm2 reload ecosystem.config.js --env production',
      'pre-setup': ''
    }
  }
};
