module.exports = {
  apps: [{
    name: 'canvas-audio-lti',
    script: 'server.js',
    instances: 1,
    autorestart: true,
    watch: false,
    max_memory_restart: '1G',
    env: {
      NODE_ENV: 'production',
      PORT: 3000,
      SESSION_SECRET: 'change-this-in-production',
    },
    env_production: {
      NODE_ENV: 'production',
      PORT: 3000
    }
  }]
};
