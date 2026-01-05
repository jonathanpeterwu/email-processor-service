// Ensure compatibility with environments expecting `dist/src/index.js`
// by creating a tiny wrapper that loads our actual entry `dist/index.js`.
const fs = require('fs');
const path = require('path');

const targetDir = path.join(__dirname, '..', 'dist', 'src');
const targetFile = path.join(targetDir, 'index.js');
const wrapper = "require('../index.js');\n";

fs.mkdirSync(targetDir, { recursive: true });
fs.writeFileSync(targetFile, wrapper, 'utf8');
console.log(`[postbuild] Wrote wrapper: ${targetFile}`);

