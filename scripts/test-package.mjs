import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, rm, readFile, access } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readEpub, validateEpub } from '../test/helpers.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const temp = await mkdtemp(path.join(tmpdir(), 'md2epub-package-'));
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
try {
  const packed = execFileSync(npm, ['pack', '--json', '--pack-destination', temp], { cwd: root, encoding: 'utf8' });
  const [info] = JSON.parse(packed.slice(packed.indexOf('[')));
  assert.ok(info.files.some(file => file.path === 'dist/cli.js'));
  assert.ok(info.files.some(file => file.path === 'dist/epub/templates/epub3/content.opf.ejs'));
  assert.ok(info.files.some(file => file.path === 'dist/plugins/epub.css'));
  assert.ok(!info.files.some(file => file.path.startsWith('src/') || file.path.includes('test/')));
  execFileSync(npm, ['install', '--prefix', temp, '--ignore-scripts', '--no-audit', '--no-fund', path.join(temp, info.filename)], { stdio: 'pipe' });
  const installed = path.join(temp, 'node_modules/md2epub');
  const manifest = JSON.parse(await readFile(path.join(installed, 'package.json'), 'utf8'));
  await access(path.join(installed, manifest.bin.md2epub));
  const output = path.join(temp, 'installed.epub');
  const stdout = execFileSync(npm, ['exec', '--offline', '--', 'md2epub', path.join(root, 'test/fixtures/docsify'), '--output', output], { cwd: temp, encoding: 'utf8' });
  assert.match(stdout, /Created/);
  validateEpub(readEpub(output));
  const exported = execFileSync(process.execPath, ['--input-type=module', '-e', "import { build } from 'md2epub'; console.log(typeof build)"], { cwd: temp, encoding: 'utf8' });
  assert.equal(exported.trim(), 'function');
  console.log('Packed tarball installation, npm exec CLI, ESM import and generated EPUB passed.');
} finally {
  await rm(temp, { recursive: true, force: true });
}
