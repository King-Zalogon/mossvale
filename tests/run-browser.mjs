const checks = [
  'startup.browser.mjs',
  'loader.browser.mjs',
  'save-transaction.browser.mjs',
  'playthrough.browser.mjs',
  'meadow.browser.mjs',
  'characters.browser.mjs',
];

for (const check of checks) await import(`./${check}`);
