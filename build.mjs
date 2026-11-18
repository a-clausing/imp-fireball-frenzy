// Builds dist/imp-fireball-frenzy.html: a single self-contained file (no server needed).
import { build } from 'esbuild';
import fs from 'node:fs';
const res = await build({ entryPoints: ['src/main.js'], bundle: true, minify: true, format: 'iife', write: false, target: ['es2020'] });
const js = res.outputFiles[0].text.replace(/<\/script/gi, '<\\/script');
const css = fs.readFileSync('styles.css', 'utf8');
let html = fs.readFileSync('index.html', 'utf8')
  .replace('<link rel="stylesheet" href="styles.css">', `<style>${css}</style>`)
  .replace('<script type="module" src="src/main.js"></script>', () => `<script>${js}</script>`);
fs.mkdirSync('dist', { recursive: true });
fs.writeFileSync('dist/imp-fireball-frenzy.html', html);
console.log('dist/imp-fireball-frenzy.html', (html.length / 1024).toFixed(1) + ' KB');
