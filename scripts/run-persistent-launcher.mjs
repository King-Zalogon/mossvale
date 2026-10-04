import {readFileSync} from 'node:fs';
import {launch} from './local-integration.mjs';

try {
  const config = JSON.parse(readFileSync(new URL('./launcher-config.json', import.meta.url), 'utf8'));
  if (config.application !== 'mossvale-local-launcher' || config.format !== 1 || typeof config.repository !== 'string')
    throw new Error('Invalid launcher configuration. Reinstall from your Mossvale checkout.');
  const args = process.argv.slice(2);
  if (args.some(arg => !/^--(?:no-open|port=\d+)$/.test(arg))) throw new Error('Usage: launcher [--no-open] [--port=8080]');
  const port = Number(args.find(arg => arg.startsWith('--port='))?.slice(7) ?? 8080);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Port must be from 1 to 65535.');
  const server = await launch({cwd: config.repository, port, browser: !args.includes('--no-open')});
  for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => server.close(() => process.exit(0)));
} catch (error) {
  console.error(error.code === 'EADDRINUSE' ? 'Port is occupied. Stop the existing launcher or use --port=8081.' : error.message);
  process.exitCode = 1;
}
