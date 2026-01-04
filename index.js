// Entry point for Railway deployment
// Railway's Railpack insists on using this file

// Load environment variables first
require('dotenv').config();

// Check if dist exists (production) or use src (development)
const fs = require('fs');
const path = require('path');

const distPath = path.join(__dirname, 'dist', 'index.js');
const srcPath = path.join(__dirname, 'src', 'index.ts');

if (fs.existsSync(distPath)) {
  console.log('Starting from compiled dist/index.js...');
  require(distPath);
} else if (fs.existsSync(srcPath)) {
  console.log('Starting from TypeScript src/index.ts...');
  // For development - requires tsx
  require('tsx').register();
  require(srcPath);
} else {
  console.error('ERROR: Cannot find entry point!');
  console.error('Expected either:');
  console.error('  - dist/index.js (run "npm run build" first)');
  console.error('  - src/index.ts (for development)');
  process.exit(1);
}