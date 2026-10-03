import {cpSync, mkdirSync, rmSync} from 'node:fs';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const source = join(root, 'build');
const destination = join(root, 'public/game');

rmSync(destination, {recursive: true, force: true});
mkdirSync(destination, {recursive: true});
cpSync(source, destination, {recursive: true});
console.log(`prepared private game files -> ${destination}`);
