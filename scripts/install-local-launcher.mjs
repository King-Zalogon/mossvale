import {execFileSync} from 'node:child_process';
import {copyFileSync, existsSync, lstatSync, mkdirSync, readFileSync, realpathSync, writeFileSync, chmodSync, readdirSync} from 'node:fs';
import {homedir} from 'node:os';
import {dirname, isAbsolute, join, relative, resolve, sep} from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';

const source = dirname(fileURLToPath(import.meta.url));
export function installDirectory(platform = process.platform, env = process.env, home = homedir()) {
  if (platform === 'win32') return join(env.LOCALAPPDATA || join(home, 'AppData', 'Local'), 'Mossvale', 'LocalTesting');
  if (platform === 'darwin') return join(home, 'Library', 'Application Support', 'Mossvale', 'LocalTesting');
  return join(env.XDG_DATA_HOME || join(home, '.local', 'share'), 'mossvale', 'local-testing');
}
const inside = (parent, child) => {
  const path = relative(parent, child);
  return !path || (!path.startsWith('..' + sep) && path !== '..' && !isAbsolute(path));
};
const shellQuote = value => "'" + value.replaceAll("'", "'\"'\"'") + "'";
const files = ['launcher-config.json', 'local-integration.mjs', 'run-persistent-launcher.mjs', 'Test Integration.cmd', 'test-integration.sh'];

export function installLauncher({repository = resolve(source, '..'), directory = installDirectory(), node = process.execPath} = {}) {
  repository = realpathSync(repository);
  const top = execFileSync('git', ['rev-parse', '--show-toplevel'], {cwd: repository, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe']}).trim();
  if (realpathSync(top) !== repository) throw new Error('Install from the root of your Mossvale Git checkout.');
  directory = resolve(directory);
  // Resolve existing parents before creating anything, so symlinks cannot place the installation inside the checkout.
  let parent = directory;
  while (!existsSync(parent)) parent = dirname(parent);
  const effective = resolve(realpathSync(parent), relative(parent, directory));
  if (inside(repository, effective)) throw new Error('The persistent launcher must be installed outside the Git checkout.');
  if (/[\r\n"]/.test(node)) throw new Error('Unsupported Node executable path.');
  if (existsSync(directory)) {
    if (lstatSync(directory).isSymbolicLink() || !lstatSync(directory).isDirectory()) throw new Error('Installation directory must be a real directory.');
    const entries = readdirSync(directory);
    if (entries.some(name => !files.includes(name) || lstatSync(join(directory, name)).isSymbolicLink()))
      throw new Error('Installation directory contains unrelated files or symlinks; choose another directory.');
    if (entries.length) {
      const config = JSON.parse(readFileSync(join(directory, 'launcher-config.json'), 'utf8'));
      if (config.application !== 'mossvale-local-launcher' || config.format !== 1) throw new Error('Installation directory is not managed by Mossvale.');
    }
  }
  mkdirSync(directory, {recursive: true});
  // Write the identifying configuration first: an interrupted install can safely be retried.
  writeFileSync(join(directory, 'launcher-config.json'), JSON.stringify({application: 'mossvale-local-launcher', format: 1, repository}, null, 2) + '\n', {
    mode: 0o600,
  });
  for (const name of ['local-integration.mjs', 'run-persistent-launcher.mjs']) copyFileSync(join(source, name), join(directory, name));
  writeFileSync(
    join(directory, 'Test Integration.cmd'),
    `@echo off\r\nsetlocal DisableDelayedExpansion\r\n"${node.replaceAll('%', '%%')}" "%~dp0run-persistent-launcher.mjs" %*\r\nif errorlevel 1 pause\r\n`,
  );
  writeFileSync(
    join(directory, 'test-integration.sh'),
    `#!/bin/sh\ncd "$(dirname "$0")" || exit 1\nexec ${shellQuote(node)} ./run-persistent-launcher.mjs "$@"\n`,
  );
  chmodSync(join(directory, 'test-integration.sh'), 0o755);
  const command = join(directory, process.platform === 'win32' ? 'Test Integration.cmd' : 'test-integration.sh');
  console.log(
    `Persistent launcher installed:\n${command}\nFolder: ${directory}\nRepository: ${repository}\nYou can switch branches now. Reinstall after moving this checkout or Node. Delete this folder to uninstall.`,
  );
  return {directory, command};
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  try {
    const args = process.argv.slice(2);
    if (args.length > 1 || (args.length && !args[0].startsWith('--directory=')))
      throw new Error('Usage: node scripts/install-local-launcher.mjs [--directory=absolute-path]');
    const directory = args.length ? args[0].slice('--directory='.length) : installDirectory();
    if (!isAbsolute(directory)) throw new Error('Installation directory must be an absolute path.');
    installLauncher({directory});
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
