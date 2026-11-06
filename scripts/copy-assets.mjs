import { chmod, cp, copyFile } from 'node:fs/promises';

await cp(new URL('../src/epub/templates/', import.meta.url), new URL('../dist/epub/templates/', import.meta.url), { recursive: true });
await copyFile(new URL('../src/plugins/epub.css', import.meta.url), new URL('../dist/plugins/epub.css', import.meta.url));
await chmod(new URL('../dist/cli.js', import.meta.url), 0o755);
