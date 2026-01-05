# Railway Deployment Guide

## Prerequisites

1. **Railway CLI** installed: `npm install -g @railway/cli`
2. **Railway Account** with project created
3. **Environment Variables** configured
4. **Database Services** set up on Railway

## Quick Deploy Steps

### 1. Initialize Railway Project

```bash
# Login to Railway
railway login

# Link to existing project OR create new one
railway link
# OR
railway init

# Add PostgreSQL and Redis services
railway add postgresql
railway add redis
```

### 2. Set Environment Variables

```bash
# Required environment variables
railway variables set NODE_ENV=production
railway variables set PORT=3000

# Database URLs (auto-provided by Railway services)
# DATABASE_URL - automatically set by PostgreSQL service
# REDIS_URL - automatically set by Redis service

# OAuth Configuration
railway variables set GOOGLE_CLIENT_ID=your_google_client_id
railway variables set GOOGLE_CLIENT_SECRET=your_google_client_secret
railway variables set YAHOO_CLIENT_ID=your_yahoo_client_id
railway variables set YAHOO_CLIENT_SECRET=your_yahoo_client_secret

# Security
railway variables set JWT_SECRET=your_jwt_secret_key
railway variables set ENCRYPTION_KEY=your_encryption_key

# Optional: Set custom domain
railway variables set RAILWAY_PUBLIC_DOMAIN=your-domain.com
```

### 3. Deploy Application

```bash
# Deploy to Railway
railway up

# Or deploy with specific environment
railway up --environment production
```

### 4. Run Database Migrations

```bash
# Generate Prisma client and run migrations
railway run npx prisma generate
railway run npx prisma migrate deploy
```

## Environment Variables Reference

| Variable | Description | Required | Example |
|----------|-------------|----------|---------|
| `NODE_ENV` | Environment mode | ✅ | `production` |
| `PORT` | Server port | ✅ | `3000` |
| `DATABASE_URL` | PostgreSQL connection | ✅ | Auto-set by Railway |
| `REDIS_URL` | Redis connection | ✅ | Auto-set by Railway |
| `GOOGLE_CLIENT_ID` | Google OAuth client ID | ✅ | `xxx.googleusercontent.com` |
| `GOOGLE_CLIENT_SECRET` | Google OAuth secret | ✅ | `GOCSPX-xxx` |
| `YAHOO_CLIENT_ID` | Yahoo OAuth client ID | ✅ | `dj0yJmk9xxx` |
| `YAHOO_CLIENT_SECRET` | Yahoo OAuth secret | ✅ | `xxx` |
| `JWT_SECRET` | JWT signing key | ✅ | `your-secret-key` |
| `ENCRYPTION_KEY` | Token encryption key | ✅ | `your-encryption-key` |
| `RAILWAY_PUBLIC_DOMAIN` | Custom domain | ❌ | `your-app.railway.app` |

## OAuth Setup Requirements

### Google OAuth2
1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create new project or select existing
3. Enable Gmail API
4. Create OAuth2 credentials
5. Add redirect URI: `https://your-domain.railway.app/auth/gmail/callback`

### Yahoo OAuth2
1. Go to [Yahoo Developer Console](https://developer.yahoo.com/)
2. Create new application
3. Get Client ID and Secret
4. Add redirect URI: `https://your-domain.railway.app/auth/yahoo/callback`

## Deployment Commands

```bash
# One-time setup
railway login
railway init
railway add postgresql redis

# Set environment variables
railway variables set KEY=value

# Deploy
railway up

# Check deployment status
railway status

# View logs
railway logs

# Open in browser
railway open
```

## Troubleshooting

### Build Issues
```bash
# Check build logs
railway logs --service build

# Force rebuild
railway up --detach
```

### Database Issues
```bash
# Check database connection
railway run npx prisma db push

# Reset database (DANGER!)
railway run npx prisma migrate reset
```

### Environment Issues
```bash
# List all variables
railway variables

# Remove variable
railway variables delete KEY

# View service status
railway status --json
```

## Health Check

The service includes a health check endpoint at `/health` that verifies:
- Database connectivity
- Redis connectivity
- Service status

Railway will automatically use this for health monitoring.

## Scaling & Performance

- **Memory**: Default Railway plan supports up to 512MB
- **CPU**: Shared CPU resources
- **Database**: PostgreSQL with connection pooling
- **Redis**: Used for session storage and caching

## Security Notes

1. **Secrets Management**: All sensitive data in environment variables
2. **HTTPS**: Railway provides automatic HTTPS
3. **Token Encryption**: OAuth tokens encrypted with AES-256-CBC
4. **Rate Limiting**: Built-in rate limiting for API endpoints
5. **Input Validation**: All inputs validated with Zod schemas

## Custom Domain

```bash
# Add custom domain
railway domain add your-domain.com

# View domains
railway domain list
```

## Monitoring & Logs

```bash
# View real-time logs
railway logs --tail

# View specific service logs
railway logs --service web

# Monitor metrics
railway status
```