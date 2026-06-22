#!/usr/bin/env node
/** Reemplaza el panel admin (AQ) con resumen + apuestas + usuarios */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const BUNDLE = path.join(ROOT, 'assets/index-DZfj7dy3.js');

function minify(code) {
  return code.replace(/\s+/g, ' ').trim();
}

const raw = fs.readFileSync(path.join(ROOT, 'scripts/admin-source.js'), 'utf8');
const start = raw.indexOf('function AQ()');
if (start < 0) throw new Error('admin-source.js must contain function AQ()');
const NEW_AQ = minify(raw.slice(start));

let s = fs.readFileSync(BUNDLE, 'utf8');
const oldStart = s.indexOf('function AQ()');
const oldEnd = s.indexOf('function LQ()', oldStart);
if (oldStart < 0 || oldEnd < 0) throw new Error('AQ block not found in bundle');

s = s.slice(0, oldStart) + NEW_AQ + s.slice(oldEnd);
fs.writeFileSync(BUNDLE, s);
console.log('OK: panel admin (resumen + apuestas + usuarios)');
