import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const pngPath = path.join(root, 'public', 'lp-mindspace-logo.png');
const b64 = fs.readFileSync(pngPath).toString('base64');
const svg = [
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">',
  '<defs>',
  '<filter id="inv" color-interpolation-filters="sRGB">',
  '<feColorMatrix type="matrix" values="-1 0 0 0 1  0 -1 0 0 1  0 0 -1 0 1  0 0 0 1 0"/>',
  '</filter>',
  '</defs>',
  `<image href="data:image/png;base64,${b64}" width="32" height="32" filter="url(#inv)"/>`,
  '</svg>',
].join('');
fs.writeFileSync(path.join(root, 'public', 'favicon.svg'), svg);
