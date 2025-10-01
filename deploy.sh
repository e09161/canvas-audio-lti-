#!/bin/bash
echo "🚀 Starting deployment of Canvas Audio LTI Tool..."

# Pull latest changes
echo "📥 Pulling latest changes..."
git pull origin main

# Install dependencies
echo "📦 Installing dependencies..."
npm install --production

# Create necessary directories
echo "📁 Setting up directories..."
mkdir -p uploads
mkdir -p logs

# Set proper permissions
echo "🔒 Setting permissions..."
chmod -R 755 public
chmod -R 755 uploads

# Restart application with PM2
echo "🔄 Restarting application..."
pm2 restart canvas-audio-lti

# Wait a moment and check status
sleep 2
pm2 status

echo "✅ Deployment completed successfully!"
echo "📊 Check logs with: pm2 logs canvas-audio-lti"
