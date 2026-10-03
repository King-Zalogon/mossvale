// Module-boundary check: pure layers (data, domain, save, config) must not touch the DOM, timers, time or randomness,
// and must not import from presentation/service layers.
import {readdirSync, readFileSync, writeFileSync} from 'node:fs';
import {join, relative} from 'node:path';
import {fileURLToPath} from 'node:url';

const repoRoot = fileURLToPath(new URL('../', import.meta.url));
const root = join(repoRoot, 'dist', 'src');
const inventoryPath = join(repoRoot, 'docs', 'API_INVENTORY.md');
const pure = ['data', 'domain', 'save.js', 'config.js'];
const forbidden =
  /\b(document|window|navigator|localStorage|sessionStorage|querySelector\w*|requestAnimationFrame|setTimeout|setInterval|Math\.random|Date\.now|performance\.now|alert|fetch)\b/;
const forbiddenImport = /from\s+['"](?:\.\.?\/)+(?:ui|render|services|input|controller|main)(?:\/|\.js)/;
const errors = [];
const writeInventory = process.argv.includes('--write-api-inventory');

function* files(path) {
  for (const entry of readdirSync(path, {withFileTypes: true})) {
    const full = join(path, entry.name);
    if (entry.isDirectory()) yield* files(full);
    else if (entry.name.endsWith('.js')) yield full;
  }
}

function moduleFiles(path) {
  return [...files(path)].sort((a, b) => {
    const pathA = relative(root, a).replaceAll('\\', '/');
    const pathB = relative(root, b).replaceAll('\\', '/');
    return pathA < pathB ? -1 : pathA > pathB ? 1 : 0;
  });
}

function exportedNames(source) {
  const names = new Set();
  const declarations = /^\s*export\s+(?:(?:async\s+)?(?:function|class)\s+([\w$]+)|(?:const|let|var)\s+([\w$]+)|default\b)/gm;
  for (const match of source.matchAll(declarations)) names.add(match[1] ?? match[2] ?? 'default');
  for (const match of source.matchAll(/^\s*export\s*\{([\s\S]*?)\}(?:\s*from\s*['"][^'"]+['"])?\s*;?/gm)) {
    for (const item of match[1].split(',')) {
      const parts = item.trim().split(/\s+as\s+/);
      if (parts[0]) names.add(parts.at(-1));
    }
  }
  return [...names].sort();
}

function renderInventory() {
  const rows = moduleFiles(root).map(file => {
    const modulePath = relative(root, file).replaceAll('\\', '/');
    const layer = modulePath.includes('/') ? modulePath.split('/')[0] : 'root';
    const exports = exportedNames(readFileSync(file, 'utf8'));
    return `| \`${modulePath}\` | ${layer} | ${exports.length ? exports.map(name => `\`${name}\``).join(', ') : '—'} |`;
  });
  return [
    '<!-- BEGIN GENERATED MODULE INVENTORY -->',
    '| Module | Layer | Named exports |',
    '| --- | --- | --- |',
    ...rows,
    '<!-- END GENERATED MODULE INVENTORY -->',
  ].join('\n');
}

function checkInventory() {
  const current = readFileSync(inventoryPath, 'utf8');
  const beginMarker = '<!-- BEGIN GENERATED MODULE INVENTORY -->';
  const endMarker = '<!-- END GENERATED MODULE INVENTORY -->';
  const start = current.indexOf(beginMarker);
  const end = current.indexOf(endMarker);
  if (start < 0 || end < start) {
    errors.push('docs/API_INVENTORY.md: generated inventory markers are missing or out of order');
    return;
  }
  const expected = renderInventory();
  const updated = `${current.slice(0, start)}${expected}${current.slice(end + endMarker.length)}`;
  if (writeInventory) {
    writeFileSync(inventoryPath, updated);
    console.log('API inventory updated');
  } else if (updated !== current) {
    errors.push('docs/API_INVENTORY.md: module/export inventory is stale; run node scripts/check-boundaries.mjs --write-api-inventory');
  }
}

for (const item of pure) {
  const full = join(root, item);
  const list = item.endsWith('.js') ? [full] : [...files(full)];
  for (const file of list) {
    readFileSync(file, 'utf8')
      .split('\n')
      .forEach((line, i) => {
        const code = line.replace(/\/\*.*?\*\/|\/\/.*$/g, '');
        if (forbidden.test(code) || forbiddenImport.test(code)) errors.push(`${relative(root, file)}:${i + 1}: ${line.trim()}`);
      });
  }
}
checkInventory();
if (errors.length) {
  console.error('Pure modules must not use DOM/timers/randomness or import UI layers:\n' + errors.join('\n'));
  process.exit(1);
}
console.log('module boundaries OK');
