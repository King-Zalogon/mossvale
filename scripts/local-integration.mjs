import {execFileSync, spawn} from 'node:child_process';
import {createServer} from 'node:http';
import {createReadStream, existsSync, realpathSync, statSync, openSync, writeFileSync, closeSync, unlinkSync} from 'node:fs';
import {dirname, extname, isAbsolute, relative, resolve, sep} from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';

const repository = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const git = (cwd, args) => execFileSync('git', args, {cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe']}).trim();

export function selectIntegration(cwd = repository) {
  const branch = git(cwd, ['branch', '--show-current']);
  if (branch === 'integration') return {directory: cwd, revision: git(cwd, ['rev-parse', '--short', 'HEAD']), workingCopy: true};
  try {
    git(cwd, ['fetch', 'origin', 'refs/heads/integration:refs/remotes/origin/integration']);
  } catch {
    throw new Error(
      'Cannot fetch origin/integration. Check your connection, GitHub access and that the remote integration branch exists. No other branch will be served.',
    );
  }
  const sha = git(cwd, ['rev-parse', 'origin/integration']);
  const common = git(cwd, ['rev-parse', '--path-format=absolute', '--git-common-dir']);
  const directory = resolve(common, 'mossvale-local-test');
  if (existsSync(directory)) {
    if (realpathSync(git(directory, ['rev-parse', '--show-toplevel'])) !== realpathSync(directory))
      throw new Error('The local test cache is not a Git worktree. Move it aside before retrying.');
    if (git(directory, ['status', '--porcelain', '--untracked-files=all']))
      throw new Error(`The test worktree has local changes. Preserve them before retrying: ${directory}`);
    git(directory, ['checkout', '--detach', sha]);
  } else {
    git(cwd, ['worktree', 'add', '--detach', directory, sha]);
  }
  return {directory, revision: sha.slice(0, 7), workingCopy: false};
}

const types = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json',
  '.css': 'text/css',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.wav': 'audio/wav',
  '.mp3': 'audio/mpeg',
  '.ogg': 'audio/ogg',
  '.woff2': 'font/woff2',
};
export function gameHandler(directory) {
  const root = realpathSync(resolve(directory, 'dist'));
  return (request, response) => {
    if (!['GET', 'HEAD'].includes(request.method)) {
      response.writeHead(405, {Allow: 'GET, HEAD'}).end();
      return;
    }
    try {
      const pathname = decodeURIComponent(request.url.split('?')[0]);
      const parts = pathname.split('/');
      if (!pathname.startsWith('/') || parts.some(part => part.startsWith('.') || part.includes('\\')) || pathname.includes('\0')) {
        response.writeHead(403).end();
        return;
      }
      let file = resolve(root, '.' + pathname);
      if (statSync(file).isDirectory()) file = resolve(file, 'index.html');
      file = realpathSync(file);
      const location = relative(root, file);
      if (location === '..' || location.startsWith('..' + sep) || isAbsolute(location) || !types[extname(file)] || !statSync(file).isFile()) {
        response.writeHead(403).end();
        return;
      }
      response.writeHead(200, {'Content-Type': types[extname(file)], 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff'});
      if (request.method === 'HEAD') response.end();
      else
        createReadStream(file)
          .on('error', () => response.destroy())
          .pipe(response);
    } catch {
      response.writeHead(404).end();
    }
  };
}

function openBrowser(url) {
  const command =
    process.platform === 'win32'
      ? ['powershell.exe', ['-NoProfile', '-Command', `Start-Process '${url}'`]]
      : process.platform === 'darwin'
        ? ['open', [url]]
        : ['xdg-open', [url]];
  const child = spawn(command[0], command[1], {stdio: 'ignore'});
  child.on('error', () => console.log(`Open ${url} in your browser.`));
  child.on('exit', code => {
    if (code) console.log(`Open ${url} in your browser.`);
  });
  child.unref();
}

export async function launch({cwd = repository, port = 8080, browser = true} = {}) {
  let handler;
  const server = createServer((request, response) => (handler ? handler(request, response) : response.writeHead(503).end()));
  // Reserve the port before updating the cached worktree: a second launch cannot change files served by the first.
  await new Promise((accept, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', accept);
  });
  let lock;
  try {
    const common = git(cwd, ['rev-parse', '--path-format=absolute', '--git-common-dir']);
    const lockPath = resolve(common, 'mossvale-local-test.lock');
    try {
      lock = openSync(lockPath, 'wx');
    } catch (error) {
      if (error.code === 'EEXIST')
        throw new Error(`Another launcher owns ${lockPath}. Stop it first. After a crash, remove this lock only after confirming no launcher is running.`);
      throw error;
    }
    server.once('close', () => {
      closeSync(lock);
      try {
        unlinkSync(lockPath);
      } catch {
        /* a deleted test checkout needs no cleanup */
      }
    });
    writeFileSync(lock, String(process.pid));
    const target = selectIntegration(cwd);
    handler = gameHandler(target.directory);
    const url = `http://127.0.0.1:${server.address().port}/`;
    console.log(
      `Mossvale integration ${target.revision}${target.workingCopy ? ' (current working copy, including local edits)' : ''}\n${url}\nServing ${target.directory}\nCtrl+C to stop. Account/feedback APIs require the configured portal; this launcher serves local gameplay.`,
    );
    if (browser) openBrowser(url);
    return server;
  } catch (error) {
    await new Promise(accept => server.close(accept));
    throw error;
  }
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  try {
    const args = process.argv.slice(2);
    if (args.some(arg => !/^--(?:no-open|port=\d+)$/.test(arg))) throw new Error('Usage: node scripts/local-integration.mjs [--no-open] [--port=8080]');
    const port = Number(args.find(arg => arg.startsWith('--port='))?.slice(7) ?? 8080);
    if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Port must be from 1 to 65535.');
    const server = await launch({port, browser: !args.includes('--no-open')});
    for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => server.close(() => process.exit(0)));
  } catch (error) {
    console.error(
      error.code === 'EADDRINUSE' ? 'Port is occupied. Stop the existing server or use --port=8081. Your checkout was not changed.' : error.message,
    );
    process.exitCode = 1;
  }
}
