# Deployment Troubleshooting Guide

## Deploy Crashed - Common Issues & Fixes

### 1. Missing Environment Variables ⚠️

**Most likely cause of the crash!**

```bash
# Check if all required variables are set
railway variables

# Set missing variables:
railway variables set NODE_ENV=production
railway variables set PORT=3000
railway variables set JWT_SECRET=$(openssl rand -hex 32)
railway variables set ENCRYPTION_KEY=$(openssl rand -hex 32)

# OAuth variables (get from Google/Yahoo consoles)
railway variables set GOOGLE_CLIENT_ID=your_actual_client_id
railway variables set GOOGLE_CLIENT_SECRET=your_actual_secret
railway variables set YAHOO_CLIENT_ID=your_actual_client_id  
railway variables set YAHOO_CLIENT_SECRET=your_actual_secret
```

### 2. Database Connection Issues

```bash
# Ensure PostgreSQL and Redis are added
railway add postgresql
railway add redis

# Check services status
railway status

# DATABASE_URL and REDIS_URL should be automatically set
```

### 3. Build Issues

Check if the TypeScript build is working:

```bash
# Test locally first
npm run build
npm start

# If build fails, check for TypeScript errors
npx tsc --noEmit
```

### 4. Missing Dependencies

Ensure all dependencies are in package.json:

```bash
# Install missing dependencies
npm install @prisma/client prisma

# Regenerate Prisma client
npx prisma generate
```

### 5. Port Configuration

Railway expects the app to listen on the PORT environment variable:

```javascript
// In src/index.ts - should already be correct
const port = process.env.PORT || 3000;
app.listen(port, '0.0.0.0', () => {
  console.log(`Server running on port ${port}`);
});
```

## Quick Fix Commands

```bash
# 1. Check current status
railway status

# 2. View crash logs
railway logs --tail

# 3. Redeploy after fixes
railway up --detach

# 4. Check health endpoint
curl https://your-app.railway.app/health
```

## Step-by-Step Recovery

### Step 1: Link to Your Project
```bash
railway login
railway link
# Select your project from the list
```

### Step 2: Check Logs
```bash
railway logs
# Look for specific error messages
```

### Step 3: Fix Environment Variables
```bash
# List current variables
railway variables

# Add any missing ones from the list above
railway variables set KEY=value
```

### Step 4: Redeploy
```bash
railway up
```

## Common Error Messages & Solutions

### "Cannot connect to database"
```bash
# Ensure PostgreSQL service is added
railway add postgresql
# DATABASE_URL should appear in railway variables
```

### "Redis connection failed"
```bash
# Ensure Redis service is added
railway add redis
# REDIS_URL should appear in railway variables
```

### "JWT_SECRET is required"
```bash
railway variables set JWT_SECRET=$(openssl rand -hex 32)
```

### "Google OAuth client not configured"
```bash
# Get credentials from Google Cloud Console
railway variables set GOOGLE_CLIENT_ID=your_client_id
railway variables set GOOGLE_CLIENT_SECRET=your_secret
```

### "Port binding failed"
```bash
# Ensure app listens on 0.0.0.0, not localhost
# Check src/index.ts line with app.listen()
```

## Verification Checklist

- [ ] PostgreSQL service added (`railway add postgresql`)
- [ ] Redis service added (`railway add redis`)
- [ ] All environment variables set (8+ required)
- [ ] OAuth credentials from Google/Yahoo
- [ ] App listens on `process.env.PORT`
- [ ] Database migrations run successfully

## Get Help

```bash
# View all services
railway status

# Get deployment URL
railway open

# Monitor in real-time
railway logs --tail

# Check specific service
railway logs --service web
```