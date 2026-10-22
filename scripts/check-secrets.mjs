/**
 * Fails the build if a provider secret or a client-exposed key name reaches
 * source or the bundle. Run after `npm run build`.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const ROOTS = ['src', 'dist'];
const TEXT_EXTENSIONS = new Set(['.js', '.mjs', '.cjs', '.ts', '.tsx', '.css', '.html', '.json']);

const PATTERNS = [
  { name: 'VITE_-prefixed secret', pattern: /\bVITE_[A-Z0-9_]*KEY\b/ },
  { name: 'Google API key', pattern: /AIza[0-9A-Za-z_-]{35}/ },
  { name: 'OpenRouter key', pattern: /sk-or-v1-[0-9a-f]{32,}/ },
];

function walk(dir) {
  const entries = [];
  let listing;
  try {
    listing = readdirSync(dir);
  } catch {
    return entries; // dist is absent before the first build
  }

  for (const entry of listing) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) entries.push(...walk(full));
    else if (TEXT_EXTENSIONS.has(full.slice(full.lastIndexOf('.')))) entries.push(full);
  }
  return entries;
}

const hits = [];

for (const root of ROOTS) {
  for (const file of walk(root)) {
    if (file.endsWith('.test.ts') || file.endsWith('.test.tsx')) continue;
    const contents = readFileSync(file, 'utf8');
    for (const { name, pattern } of PATTERNS) {
      if (pattern.test(contents)) hits.push(`${file}: ${name}`);
    }
  }
}

if (hits.length > 0) {
  console.error('Secret check failed:\n' + hits.map((hit) => `  - ${hit}`).join('\n'));
  process.exit(1);
}

console.log('Secret check passed: no client-exposed key names or provider key formats in src/ or dist/.');
