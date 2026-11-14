// Checks the initial bundle against the budget of TS §14.3 (< 300 kB gzip). Angular's own budgets
// measure uncompressed sizes, so this script gzips the scripts and styles that `index.html` loads
// up front, including the chunks it preloads. Since AP 6.8a `main.ts` only prepares the language
// and imports the app dynamically (TS §11.9), so the chunks `main` imports and everything they
// import statically count as well.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';

const BUDGET_BYTES = 300 * 1024;
const root = process.argv[2] ?? 'www';
const html = readFileSync(join(root, 'index.html'), 'utf8');

const files = new Set();
for (const match of html.matchAll(/<(?:script|link)\b[^>]*?(?:src|href)="([^"]+\.(?:js|css))"/g)) {
  files.add(match[1]);
}
const STATIC_IMPORT = /(?:from|import)\s*["'`]\.\/([^"'`]+\.js)["'`]/g;
const DYNAMIC_IMPORT = /import\(\s*["'`]\.\/([^"'`]+\.js)["'`]\s*\)/g;
const queue = [...files].filter((file) => file.endsWith('.js'));
for (const file of queue) {
  const code = readFileSync(join(root, file), 'utf8');
  const imports = [...code.matchAll(STATIC_IMPORT)];
  if (/^main-[^/]*\.js$/.test(file)) {
    imports.push(...code.matchAll(DYNAMIC_IMPORT));
  }
  for (const [, imported] of imports) {
    if (!files.has(imported)) {
      files.add(imported);
      queue.push(imported);
    }
  }
}

let total = 0;
for (const file of [...files].sort()) {
  const size = gzipSync(readFileSync(join(root, file)), { level: 9 }).length;
  total += size;
  console.log(`${(size / 1024).toFixed(1).padStart(8)} kB  ${file}`);
}
const line = `Initial bundle: ${(total / 1024).toFixed(1)} kB gzip (budget ${BUDGET_BYTES / 1024} kB)`;
console.log(line);
if (process.env.GITHUB_STEP_SUMMARY) {
  const { appendFileSync } = await import('node:fs');
  appendFileSync(process.env.GITHUB_STEP_SUMMARY, `- ${line}\n`);
}
if (total > BUDGET_BYTES) {
  console.error('The initial bundle exceeds its budget (TS §14.3).');
  process.exit(1);
}
