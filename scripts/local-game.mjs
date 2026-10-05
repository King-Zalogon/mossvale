#!/usr/bin/env node
import {createServer} from 'node:http';
import {dirname, resolve} from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {gameHandler, listenLocal, localBuildInfo} from './local-integration.mjs';

const repository = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export async function serveLocalGame({cwd = repository, port} = {}) {
  const server = createServer(gameHandler(cwd, {version: () => localBuildInfo(cwd)}));
  const selectedPort = await listenLocal(server, port);
  return {server, port: selectedPort};
}

async function main() {
  const args = process.argv.slice(2);
  if (args.some(arg => !/^--port=\d+$/.test(arg))) throw new Error('Usage: node scripts/local-game.mjs [--port=8080]');
  const requested = args.find(arg => arg.startsWith('--port='));
  const port = requested === undefined ? undefined : Number(requested.slice(7));
  if (port !== undefined && (port < 1 || port > 65535)) throw new Error('Port must be from 1 to 65535.');
  const {server, port: selectedPort} = await serveLocalGame({cwd: repository, port});
  const info = localBuildInfo(repository);
  console.log(
    `Mossvale ${info ? `Build #${info.short}${info.dirty ? '+' : ''} · ${info.branch}` : 'development build'}\nhttp://127.0.0.1:${selectedPort}/\nServing ${repository}/dist\nCtrl+C to stop.`,
  );
  return server;
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  main().catch(error => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
