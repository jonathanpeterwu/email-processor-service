FROM node:18-alpine

# Install OpenSSL and other dependencies required by Prisma
RUN apk add --no-cache openssl openssl-dev libc6-compat

WORKDIR /app

# Copy package files first for better layer caching
COPY package*.json ./
COPY prisma ./prisma/

# Install all dependencies (needed for build)
RUN npm ci && npm cache clean --force

# Generate Prisma client
RUN npx prisma generate

# Copy source code
COPY . .

# Build the application (includes prisma generate)
RUN npm run build

# Create a fallback entry point where Railway expects it
RUN echo "require('./dist/index.js');" > /app/index.js

# Verify build output
RUN ls -la /app/ && ls -la /app/dist/index.js && cat /app/index.js

# Remove dev dependencies for smaller image
RUN npm ci --only=production && npm cache clean --force

# Expose port
EXPOSE 3000

# Use the path Railway insists on
CMD ["node", "/app/index.js"]