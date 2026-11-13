import { cp, mkdir, readdir, rm, stat, readFile, writeFile } from 'node:fs/promises';
import { zipDirectory } from './zip.mjs';
import path from 'node:path';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\//, '')), '..');
const target = process.argv[2];
if (!['chrome', 'firefox'].includes(target)) throw new Error('Usage: build-extension.mjs chrome|firefox');
const dist = path.join(root, 'dist', target);
await rm(dist, { recursive: true, force: true });
await mkdir(dist, { recursive: true });
const excluded = new Set(['node_modules', '.git', 'dist', 'scripts', 'tests', 'tests-e2e', 'screenshots', '.vscode', 'package.json', 'package-lock.json', 'eslint.config.js', 'eslint.config.mjs', '.editorconfig', '.gitattributes', '.gitignore', 'popup-full-preview.png', 'debug.log', 'chrome-screenshot-profile']);
async function copyDir(source, destination) {
  await mkdir(destination, { recursive: true });
  for (const entry of await readdir(source, { withFileTypes: true })) {
    const isExtraMarkdown = entry.isFile() && entry.name.toLowerCase().endsWith('.md') && entry.name !== 'README.md';
    if (excluded.has(entry.name) || isExtraMarkdown || entry.name.endsWith('.zip') || entry.name.startsWith('.copilot')) continue;
    const from = path.join(source, entry.name);
    const to = path.join(destination, entry.name);
    if (entry.isDirectory()) await copyDir(from, to);
    else if ((await stat(from)).isFile()) await cp(from, to);
  }
}
await copyDir(root, dist);
await rm(path.join(dist, 'manifest.json'), { force: true });
await rm(path.join(dist, 'manifest.firefox.json'), { force: true });
if (target === 'firefox') {
  const manifest = JSON.parse(await readFile(path.join(root, 'manifest.firefox.json'), 'utf8'));
  manifest.browser_specific_settings.gecko.id = process.env.QAKITS_GECKO_ID || process.env.SFFA_GECKO_ID || manifest.browser_specific_settings.gecko.id;
  await writeFile(path.join(dist, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
} else {
  await cp(path.join(root, 'manifest.json'), path.join(dist, 'manifest.json'));
}
const zip = path.join(root, 'dist', `qa-kits-${target}.zip`);
await rm(zip, { force: true });
const entries = await zipDirectory(dist, zip);
console.log(`Built ${zip} (${entries} files)`);
