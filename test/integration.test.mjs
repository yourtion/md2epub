import assert from 'node:assert/strict';
import { test } from 'node:test';
import { spawnSync } from 'node:child_process';
import { cp, mkdtemp, readFile, readdir, rm, writeFile, mkdir, symlink } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { build, EPub } from '../dist/index.js';
import { readEpub, validateEpub } from './helpers.mjs';

const fixture = fileURLToPath(new URL('./fixtures/docsify', import.meta.url));
const cli = fileURLToPath(new URL('../dist/cli.js', import.meta.url));
const run = (args, cwd) => spawnSync(process.execPath, [cli, ...args], { cwd, encoding: 'utf8' });
async function workspace(t) {
  const dir = await mkdtemp(path.join(tmpdir(), 'md2epub-test-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const source = path.join(dir, 'docs');
  await cp(fixture, source, { recursive: true });
  return { dir, source, output: path.join(dir, 'book.epub'), temp: path.join(dir, 'work') };
}

test('CLI help, version and errors', () => {
  assert.equal(run(['--help']).status, 0);
  assert.match(run(['--help']).stdout, /--format/);
  assert.match(run(['--version']).stdout, /^0\.0\.1/);
  assert.notEqual(run([]).status, 0);
  assert.notEqual(run([fixture, '--format', 'vuepress']).status, 0);
  assert.notEqual(run([fixture, '--unknown']).status, 0);
});

test('CLI renders an actual EPUB with ordered chapters, links, CSS, images and metadata', async t => {
  const { dir, source, output, temp } = await workspace(t);
  const result = run([source, '--output', output, '--tmp-dir', temp, '--author', 'Alice, Bob']);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Created/);
  const entries = readEpub(output);
  const opf = validateEpub(entries);
  assert.equal(opf.getElementsByTagName('dc:title')[0].textContent, 'Example & Guide');
  assert.equal(opf.getElementsByTagName('dc:creator')[0].textContent, 'Alice, Bob');
  assert.deepEqual([...entries.keys()].filter(n => /chapter-\d.xhtml$/.test(n)), ['OEBPS/chapter-1.xhtml', 'OEBPS/chapter-2.xhtml', 'OEBPS/chapter-3.xhtml']);
  const first = entries.get('OEBPS/chapter-1.xhtml').data.toString();
  assert.match(first, /href="chapter-2.xhtml#details"/);
  assert.match(entries.get('OEBPS/chapter-2.xhtml').data.toString(), /id="details"/);
  assert.match(entries.get('OEBPS/chapter-3.xhtml').data.toString(), /href="chapter-1.xhtml"/);
  assert.match(entries.get('OEBPS/style.css').data.toString(), /\.heti/);
  const images = [...entries].filter(([name]) => /images\/.*\.png$/.test(name));
  assert.equal(images.length, 2, 'duplicate image reused, same basename in another directory retained');
  const originals = await Promise.all(['images/pixel.png', 'chapters/pixel.png'].map(p => readFile(path.join(source, p))));
  for (const original of originals) assert.ok(images.some(([, { data }]) => data.equals(original)));
  assert.deepEqual(await readdir(temp), [], 'work directory cleaned');
  assert.ok(!result.stdout.includes('Plugin'), 'no debug object dump');
  assert.ok((await readdir(dir)).includes('book.epub'));
});

test('public API imports without running CLI; repeated builds do not leak parser hooks', async t => {
  const { source, output, temp } = await workspace(t);
  for (let i = 0; i < 2; i++) {
    const result = await build(source, { output, tmpDir: temp });
    assert.equal(result.output, output);
    const entries = readEpub(output);
    validateEpub(entries);
    assert.equal([...entries.keys()].filter(n => /chapter-\d.xhtml$/.test(n)).length, 3);
  }
});

test('cover, title override, relative output and legacy temp alias', async t => {
  const { dir, source } = await workspace(t);
  const result = run([source, '--title', 'Custom & Book', '--cover', path.join(source, 'images/pixel.png'), '--output', 'out/custom.epub', '--tmpDir', 'nested/tmp'], dir);
  assert.equal(result.status, 0, result.stderr);
  const entries = readEpub(path.join(dir, 'out/custom.epub'));
  const opf = validateEpub(entries);
  assert.equal(opf.getElementsByTagName('dc:title')[0].textContent, 'Custom & Book');
  assert.ok(entries.has('OEBPS/cover.png'));
  assert.match(entries.get('OEBPS/content.opf').data.toString(), /properties="cover-image"/);
  assert.deepEqual(await readdir(path.join(dir, 'nested/tmp')), []);
});

test('absolute and relative --dist always mean directory; default output is cwd', async t => {
  const { dir, source } = await workspace(t);
  for (const dist of ['relative', path.join(dir, 'absolute')]) {
    const result = run([source, '--dist', dist, '--title', 'Named'], dir);
    assert.equal(result.status, 0, result.stderr);
    validateEpub(readEpub(path.resolve(dir, dist, 'Named.epub')));
  }
  assert.equal(run([source, '--title', 'Default'], dir).status, 0);
  validateEpub(readEpub(path.join(dir, 'Default.epub')));
});

test('directory and extensionless sidebar routes preserve order', async t => {
  const { source, output } = await workspace(t);
  await writeFile(path.join(source, '_sidebar.md'), '- [Home](/)\n- [First](chapters/first)\n- [Second](chapters/second.md)\n');
  await build(source, { output });
  validateEpub(readEpub(output));
});

for (const [name, setup, message] of [
  ['missing sidebar', async source => rm(path.join(source, '_sidebar.md')), /Missing _sidebar/],
  ['empty sidebar', async source => writeFile(path.join(source, '_sidebar.md'), '- [Website](https://example.com)'), /no local Markdown/],
  ['missing chapter', async source => writeFile(path.join(source, '_sidebar.md'), '- [Missing](missing.md)'), /ENOENT/],
  ['missing image', async source => rm(path.join(source, 'images/pixel.png')), /ENOENT/],
  ['corrupt image', async source => writeFile(path.join(source, 'images/pixel.png'), 'not an image'), /Cannot process image/],
  ['raw HTML image', async source => writeFile(path.join(source, 'README.md'), '# Book\n<img src="https://example.com/image.png" />'), /Raw HTML is not supported/],
  ['remote markdown image', async source => writeFile(path.join(source, 'README.md'), '# Book\n![Remote](https://example.com/image.png)'), /Use a local image/],
  ['chapter outside project', async source => writeFile(path.join(source, '_sidebar.md'), '- [Outside](../outside.md)'), /outside the source directory/],
  ['symlink outside project', async source => { await writeFile(path.join(source, '../outside.md'), '# Outside'); await symlink(path.join(source, '../outside.md'), path.join(source, 'outside.md')); await writeFile(path.join(source, '_sidebar.md'), '- [Outside](outside.md)'); }, /outside the source directory/],
  ['unlisted chapter link', async source => { await writeFile(path.join(source, 'unlisted.md'), '# Extra'); await writeFile(path.join(source, 'README.md'), '# Book\n[Extra](unlisted.md)'); }, /not listed in _sidebar/],
]) {
  test(`CLI rejects ${name} with nonzero exit`, async t => {
    const { source, output, temp } = await workspace(t);
    await setup(source);
    const result = run([source, '--output', output, '--tmp-dir', temp]);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, message);
    assert.doesNotMatch(result.stdout, /Created/);
    assert.deepEqual(await readdir(temp).catch(() => []), []);
  });
}

test('CLI rejects conflicting output options, empty title, and invalid cover', async t => {
  const { source, output } = await workspace(t);
  for (const args of [['--output', output, '--dist', 'out'], ['--title', ' '], ['--cover', '/missing.png']]) {
    assert.notEqual(run([source, ...args]).status, 0);
  }
});

test('EPub rejects write errors and cleans temporary files', async t => {
  const { dir, temp } = await workspace(t);
  const book = new EPub({ title: 'Book', description: '', tempDir: temp, content: [{ title: 'Chapter', data: '<p>Hello</p>' }] }, path.join(dir, 'missing', 'book.epub'));
  await assert.rejects(book.render(), /ENOENT/);
  assert.deepEqual(await readdir(temp), []);
});

test('CLI rejects an output directory without unhandled errors', async t => {
  const { source, output, temp } = await workspace(t);
  await mkdir(output);
  const result = run([source, '--output', output, '--tmp-dir', temp]);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /EISDIR/);
  assert.doesNotMatch(result.stderr, /Unhandled/);
  assert.deepEqual(await readdir(temp), []);
});

test('GFM task lists render as static checkboxes', async t => {
  const { source, output } = await workspace(t);
  await writeFile(path.join(source, 'README.md'), '# Tasks\n\n- [x] Done\n- [ ] Pending\n');
  await build(source, { output });
  const entries = readEpub(output);
  validateEpub(entries);
  const chapter = entries.get('OEBPS/chapter-1.xhtml').data.toString();
  assert.match(chapter, /☑/);
  assert.match(chapter, /☐/);
  assert.doesNotMatch(chapter, /<input/);
});

test('image paths with literal percent/hash characters are decoded once', async t => {
  const { source, output } = await workspace(t);
  const image = await readFile(path.join(source, 'images/pixel.png'));
  await writeFile(path.join(source, 'images/a%20b#c.png'), image);
  await writeFile(path.join(source, 'README.md'), '# Paths\n\n![Image](images/a%2520b%23c.png)');
  await build(source, { output });
  const entries = readEpub(output);
  validateEpub(entries);
  assert.ok([...entries].some(([name, entry]) => name.startsWith('OEBPS/images/') && entry.data.equals(image)));
});

for (const markdown of ['<script>alert(1)</script>', '<img src="/tmp/outside.png" />', '[Unsafe](javascript:alert%281%29)']) {
  test(`reject unsafe content: ${markdown}`, async t => {
    const { source, output } = await workspace(t);
    await writeFile(path.join(source, 'README.md'), `# Book\n\n${markdown}`);
    await assert.rejects(build(source, { output }), /Raw HTML|Unsupported link protocol/);
  });
}

test('metadata/sidebar/image symlinks cannot escape source', async t => {
  const { dir, source, output } = await workspace(t);
  const outside = path.join(dir, 'outside.md');
  await writeFile(outside, '# Outside');
  for (const target of ['README.md', '_sidebar.md', 'images/pixel.png']) {
    const file = path.join(source, target);
    const original = await readFile(file);
    await rm(file);
    await symlink(outside, file);
    await assert.rejects(build(source, { output }), /outside the source directory/);
    await rm(file);
    await writeFile(file, original);
  }
});

test('failed builds preserve existing output and leave no output temporary files', async t => {
  const { dir, source, output } = await workspace(t);
  await writeFile(output, 'existing book');
  await writeFile(path.join(source, 'images/pixel.png'), 'broken image');
  await assert.rejects(build(source, { output }), /Cannot process image/);
  assert.equal(await readFile(output, 'utf8'), 'existing book');
  assert.ok(!(await readdir(dir)).some(file => file.endsWith('.tmp')));
});
