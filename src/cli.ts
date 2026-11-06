#!/usr/bin/env node
import { Command, Option } from 'commander';
import { readFileSync } from 'node:fs';
import { build } from './index.js';

const { version } = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const program = new Command()
  .name('md2epub')
  .description('Build an EPUB 3 book from a local Docsify-style _sidebar.md project.')
  .version(version)
  .argument('<source>', 'directory containing _sidebar.md')
  .addOption(new Option('-f, --format <format>', 'source format').choices(['docsify']).default('docsify'))
  .option('-t, --title <title>', 'book title (defaults to README heading or directory name)')
  .option('-a, --author <authors>', 'comma-separated authors')
  .option('-c, --cover <file>', 'local cover image, relative to the working directory')
  .option('-o, --output <file>', 'output EPUB filename, relative to the working directory')
  .option('--dist <directory>', 'output directory (alternative to --output)')
  .option('--tmp-dir <directory>', 'temporary working directory')
  .addOption(new Option('--tmpDir <directory>', 'legacy alias for --tmp-dir').hideHelp())
  .option('-v, --verbose', 'show build details')
  .action(async (source, options) => {
    const { output } = await build(source, options);
    console.log(`Created ${output}`);
  });

try {
  await program.parseAsync();
} catch (error) {
  console.error(`md2epub: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
}
