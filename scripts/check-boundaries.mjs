// Module-boundary check: pure layers (data, domain, save, config) must not touch the DOM, timers, time or randomness,
// and must not import from presentation/service layers.
import {readdirSync, readFileSync} from 'node:fs';
import {join, relative} from 'node:path';

const root = new URL('../dist/src/', import.meta.url).pathname;
const pure = ['data', 'domain', 'save.js', 'config.js'];
const forbidden =
  /\b(document|window|navigator|localStorage|sessionStorage|querySelector\w*|requestAnimationFrame|setTimeout|setInterval|Math\.random|Date\.now|performance\.now|alert|fetch)\b/;
const forbiddenImport = /from\s+['"](?:\.\.?\/)+(?:ui|render|services|input|controller|main)(?:\/|\.js)/;
const errors = [];

function* files(path) {
  for (const entry of readdirSync(path, {withFileTypes: true})) {
    const full = join(path, entry.name);
    if (entry.isDirectory()) yield* files(full);
    else if (entry.name.endsWith('.js')) yield full;
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
if (errors.length) {
  console.error('Pure modules must not use DOM/timers/randomness or import UI layers:\n' + errors.join('\n'));
  process.exit(1);
}
console.log('module boundaries OK');
