import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { readFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { EPub, type EpubOptions } from '../epub/index.js';

export interface PluginOptions {
  title?: string;
  cover?: string;
  author?: string;
  output?: string;
  dist?: string;
  tmpDir?: string;
  verbose?: boolean;
}

export abstract class Plugin {
  protected dir: string;
  protected options: PluginOptions;

  constructor(dir: string, options: PluginOptions = {}) {
    this.dir = path.resolve(dir);
    this.options = options;
  }

  protected abstract getContent(): Promise<EpubOptions['content']>;
  protected abstract getInfo(): { title?: string; description?: string };

  async build(): Promise<{ result: string; output: string }> {
    if (this.options.output && this.options.dist) {
      throw new Error('Use either --output or --dist, not both.');
    }
    const info = this.getInfo();
    const title = this.options.title ?? info.title ?? path.basename(this.dir);
    if (!title.trim()) throw new Error('Book title must not be empty.');
    // eslint-disable-next-line no-control-regex
    const filename = title.replace(/[<>:"/\\|?*\x00-\x1f]/g, '_').replace(/[. ]+$/, '') || 'book';
    const output = this.options.output
      ? path.resolve(this.options.output)
      : path.resolve(this.options.dist ?? process.cwd(), `${filename}.epub`);
    const content = await this.getContent();
    const options: EpubOptions = {
      title,
      description: info.description ?? '',
      author: this.options.author?.split(',').map(author => author.trim()).filter(Boolean),
      tempDir: path.resolve(this.options.tmpDir ?? tmpdir()),
      css: await readFile(new URL('./epub.css', import.meta.url), 'utf8'),
      appendChapterTitles: false,
      cover: this.options.cover ? pathToFileURL(path.resolve(this.options.cover)).href : undefined,
      verbose: this.options.verbose,
      content,
    };
    await mkdir(path.dirname(output), { recursive: true });
    const result = await new EPub(options, output).render();
    return { ...result, output };
  }
}
