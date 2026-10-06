#!/usr/bin/env node
import {createServer} from 'node:http';
import {readFileSync, existsSync} from 'node:fs';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {ROOT, generateCatalogue, validateCatalogue, validateGenerated, safePath} from './lib/catalogue.mjs';
import {createVisualIndex, renderCataloguePage, writePortableContext} from './lib/catalogue-visuals.mjs';

const self = fileURLToPath(import.meta.url);

function readJson(path) {
  return JSON.parse(readFileSync(safePath(ROOT, path), 'utf8'));
}

async function currentSources() {
  const generated = await generateCatalogue();
  const issues = validateCatalogue(JSON.parse(generated['content/catalogue/catalogue.json']));
  issues.push(...validateGenerated(generated, path => (existsSync(resolve(ROOT, path)) ? readFileSync(resolve(ROOT, path), 'utf8') : null)));
  if (issues.length) throw new Error(`The generated catalogue is stale or invalid. Run npm run catalogue:write, review it, then retry.\n${issues.join('\n')}`);
  return {
    catalogue: readJson('content/catalogue/catalogue.json'),
    facts: readJson('content/catalogue/facts.json'),
  };
}

function parseArgs(args) {
  const [mode, ...rest] = args;
  const options = {};
  for (const argument of rest) {
    if (argument === '--all') options.all = true;
    else if (argument.startsWith('--out=')) options.out = argument.slice('--out='.length);
    else if (argument === '--out') throw new Error('Use --out=DIR.');
    else if (argument.startsWith('--ids=')) options.ids = argument.slice('--ids='.length).split(',').filter(Boolean);
    else if (argument === '--ids') throw new Error('Use --ids=visual:id,visual:id.');
    else if (argument.startsWith('--port=')) options.port = Number(argument.slice('--port='.length));
    else throw new Error(`Unknown argument: ${argument}`);
  }
  return {mode, options};
}

function contentType(path) {
  if (path.endsWith('.png')) return 'image/png';
  if (path.endsWith('.svg')) return 'image/svg+xml';
  if (path.endsWith('.css')) return 'text/css; charset=utf-8';
  if (path.endsWith('.js')) return 'text/javascript; charset=utf-8';
  return 'text/html; charset=utf-8';
}

export async function startCatalogueServer({port = 4179, host = '127.0.0.1'} = {}) {
  const {catalogue, facts} = await currentSources();
  const visualIndex = createVisualIndex(catalogue, facts);
  const allowedPreviews = new Set(visualIndex.flatMap(item => [item.preview?.path, ...item.referencePreviews.map(preview => preview.path)]).filter(Boolean));
  const visualFiches = new Map(catalogue.entries.filter(entry => entry.kind === 'visual').map(entry => [entry.id, entry]));
  const appScript = readFileSync(resolve(ROOT, 'scripts/catalogue-browser/app.js'));
  const styles = readFileSync(resolve(ROOT, 'scripts/catalogue-browser/styles.css'));
  const server = createServer((request, response) => {
    const headers = {
      'x-content-type-options': 'nosniff',
      'referrer-policy': 'no-referrer',
      'content-security-policy':
        "default-src 'self'; img-src 'self'; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'; connect-src 'self'; frame-ancestors 'none'",
      'cache-control': 'no-store',
    };
    const method = request.method;
    if (method !== 'GET' && method !== 'HEAD') {
      response.writeHead(405, {...headers, allow: 'GET, HEAD'}).end();
      return;
    }
    try {
      const url = new URL(request.url ?? '/', `http://${host}:${port}`);
      let body;
      let type;
      if (url.pathname === '/') {
        body = renderCataloguePage(
          {sourceRevision: catalogue.sourceRevision, entries: [], visuals: visualIndex, ficheEndpoint: '/fiche?id='},
          {appScript: '/app.js', stylesheet: '/styles.css', imagePrefix: '/asset?path='},
        );
        type = 'text/html; charset=utf-8';
      } else if (url.pathname === '/app.js') {
        body = appScript;
        type = contentType(url.pathname);
      } else if (url.pathname === '/styles.css') {
        body = styles;
        type = contentType(url.pathname);
      } else if (url.pathname === '/fiche') {
        const id = url.searchParams.get('id');
        const fiche = visualFiches.get(id);
        if (!fiche) {
          response.writeHead(404, headers).end('Fiche not found');
          return;
        }
        body = JSON.stringify(fiche);
        type = 'application/json; charset=utf-8';
      } else if (url.pathname === '/asset') {
        const previewPath = url.searchParams.get('path');
        if (!allowedPreviews.has(previewPath)) {
          response.writeHead(404, headers).end('Preview not found');
          return;
        }
        body = readFileSync(safePath(ROOT, previewPath));
        type = contentType(previewPath);
      } else {
        response.writeHead(404, headers).end('Not found');
        return;
      }
      response.writeHead(200, {...headers, 'content-type': type});
      response.end(method === 'HEAD' ? undefined : body);
    } catch (error) {
      response.writeHead(400, headers).end(`Catalogue request failed: ${error.message}`);
    }
  });
  await new Promise((resolvePromise, reject) => {
    server.once('error', reject);
    server.listen(port, host, resolvePromise);
  });
  return server;
}

async function main() {
  const {mode, options} = parseArgs(process.argv.slice(2));
  if (mode === 'browse') {
    const port = options.port ?? 4179;
    if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error('--port must be an integer from 0 through 65535.');
    const server = await startCatalogueServer({port});
    console.log(`Mossvale visual catalogue: http://127.0.0.1:${server.address().port}/`);
    console.log('Bound to loopback only; press Ctrl+C to stop.');
    return;
  }
  if (mode === 'export') {
    const {catalogue, facts} = await currentSources();
    const appScript = readFileSync(resolve(ROOT, 'scripts/catalogue-browser/app.js'), 'utf8');
    const stylesheet = readFileSync(resolve(ROOT, 'scripts/catalogue-browser/styles.css'), 'utf8');
    const result = writePortableContext({
      root: ROOT,
      output: options.out,
      catalogue,
      facts,
      ids: options.ids ?? [],
      all: options.all ?? false,
      appScript,
      stylesheet,
    });
    console.log(
      `Portable context written to ${result.destination} (${result.selectedCount} selected visuals, ${result.previewCount} previews, ${result.fileCount} files).`,
    );
    return;
  }
  throw new Error('Usage: node scripts/catalogue-visual.mjs browse [--port=4179] | export --out=DIR (--ids=visual:id,... | --all)');
}

if (process.argv[1] && resolve(process.argv[1]) === self) {
  try {
    await main();
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
