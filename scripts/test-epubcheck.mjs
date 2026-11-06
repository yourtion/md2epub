import { execFileSync } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

if (!process.env.EPUBCHECK_JAR) throw new Error('Set EPUBCHECK_JAR to your installed EPUBCheck epubcheck.jar.');
const temp = await mkdtemp(path.join(tmpdir(), 'md2epub-epubcheck-'));
const root = fileURLToPath(new URL('../', import.meta.url));
const fixture = path.join(root, 'test/fixtures/docsify');
try {
  for (const cover of [false, true]) {
    const output = path.join(temp, `${cover ? 'with' : 'without'}-cover.epub`);
    execFileSync(process.execPath, [path.join(root, 'dist/cli.js'), fixture, '--output', output,
      ...(cover ? ['--cover', path.join(fixture, 'images/pixel.png')] : [])], { stdio: 'inherit' });
    execFileSync('java', ['-jar', process.env.EPUBCHECK_JAR, '--failonwarnings', output], { stdio: 'inherit' });
  }
} finally {
  await rm(temp, { recursive: true, force: true });
}
