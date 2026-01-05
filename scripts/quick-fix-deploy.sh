#!/bin/bash

echo "🔧 Railway Deployment Fix Script"
echo "================================"

# Ensure we're linked to Railway
echo "1. Linking to Railway project..."
railway link

# Check current environment variables
echo "2. Checking environment variables..."
railway variables

# Set required environment variables if missing
echo "3. Setting required environment variables..."

# Generate secure secrets if they don't exist
if ! railway variables | grep -q JWT_SECRET; then
    echo "Setting JWT_SECRET..."
    railway variables set JWT_SECRET=$(openssl rand -hex 32)
fi

if ! railway variables | grep -q ENCRYPTION_KEY; then
    echo "Setting ENCRYPTION_KEY..."
    railway variables set ENCRYPTION_KEY=$(openssl rand -hex 32)
fi

# Set basic config
railway variables set NODE_ENV=production
railway variables set PORT=3000

# Add database services if not present
echo "4. Adding database services..."
railway add postgresql 2>/dev/null || echo "PostgreSQL already added"
railway add redis 2>/dev/null || echo "Redis already added"

# Redeploy with the fixes
echo "5. Deploying with fixes..."
railway up

# Check deployment status
echo "6. Checking deployment status..."
sleep 10
railway status

# Show logs
echo "7. Recent logs:"
railway logs --tail 20

echo "✅ Deployment fix complete!"
echo "🌐 Open your app: railway open"
echo "📊 Check health: curl \$(railway status --json | jq -r '.deployments[0].url')/health"