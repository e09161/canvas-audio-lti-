# Canvas Audio LTI Tool

A Learning Tools Interoperability (LTI) tool for Canvas that allows students to record and submit audio responses.

## Features

- 🎤 Browser-based audio recording
- 📱 Mobile-friendly interface
- 🔐 LTI 1.1 compliant
- ☁️ S3 storage support
- 📊 Submission tracking

## Setup

1. Clone this repository
2. Install dependencies: `npm install`
3. Set environment variables (see below)
4. Deploy to your hosting platform

## Environment Variables

- `LTI_SECRET`: Your LTI shared secret
- `SESSION_SECRET`: Session encryption secret
- `AWS_ACCESS_KEY_ID`: AWS access key (for S3)
- `AWS_SECRET_ACCESS_KEY`: AWS secret key
- `S3_BUCKET_NAME`: S3 bucket for audio storage
- `NODE_ENV`: Environment (production/development)

## Canvas Configuration

1. In Canvas, go to Settings > Apps > View App Configurations
2. Add app "By URL"
3. Use your config.xml URL
4. Set consumer key and secret

## Deployment

### AWS Lightsail
```bash
./deploy.sh
