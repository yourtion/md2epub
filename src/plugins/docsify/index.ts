import { existsSync, readFileSync, realpathSync, statSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { Marked } from 'marked';
import { encodeXML } from 'entities';
import uslug from 'uslug';
import { Plugin } from '../index.js';
import type { EpubOptions } from '../../epub/index.js';

const isExternal = (href: string) => /^(?:[a-z][a-z\d+.-]*:|\/\/)/i.test(href);

export default class Docsify extends Plugin {
  protected getInfo() {
    const readme = path.join(this.dir, 'README.md');
    if (!existsSync(readme)) return {};
    const heading = readFileSync(this.localPath('README.md'), 'utf8').match(/^#\s+(.+?)\s*#*\s*$/m);
    return { title: heading?.[1] };
  }

  private localPath(href: string, base = this.dir): string {
    const decoded = decodeURIComponent(href);
    const file = decoded.startsWith('/')
      ? path.resolve(this.dir, `.${decoded}`)
      : path.resolve(base, decoded);
    const relative = path.relative(this.dir, file);
    if (relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
      throw new Error(`Path is outside the source directory: ${href}`);
    }
    // Symlinks must also remain inside the source project.
    const real = realpathSync(file);
    const realRelative = path.relative(realpathSync(this.dir), real);
    if (realRelative === '..' || realRelative.startsWith(`..${path.sep}`) || path.isAbsolute(realRelative)) {
      throw new Error(`Path is outside the source directory: ${href}`);
    }
    if (!statSync(real).isFile()) throw new Error(`Expected a file: ${href}`);
    return file;
  }

  private chapterPath(href: string, base = this.dir): string {
    let filename = href.split(/[?#]/, 1)[0];
    if (!filename || filename.endsWith('/')) filename += 'README.md';
    if (!path.extname(filename)) filename += '.md';
    if (path.extname(filename).toLowerCase() !== '.md') {
      throw new Error(`Only local Markdown chapters are supported: ${href}`);
    }
    return this.localPath(filename, base);
  }

  protected async getContent(): Promise<EpubOptions['content']> {
    const sidebarPath = path.join(this.dir, '_sidebar.md');
    if (!existsSync(sidebarPath)) {
      throw new Error(`Missing _sidebar.md in ${this.dir}. Only Docsify-style sidebar projects are supported.`);
    }
    const parser = new Marked();
    const chapters = new Map<string, { title: string; filename: string }>();
    parser.walkTokens(parser.lexer(readFileSync(this.localPath('_sidebar.md'), 'utf8')), token => {
      if (token.type !== 'link' || isExternal(token.href) || token.href.startsWith('#')) return;
      const file = this.chapterPath(token.href);
      if (!chapters.has(file)) {
        chapters.set(file, { title: token.text, filename: `chapter-${chapters.size + 1}.xhtml` });
      }
    });
    if (!chapters.size) throw new Error('_sidebar.md contains no local Markdown chapter links.');

    const content: EpubOptions['content'] = [];
    for (const [file, chapter] of chapters) {
      const ids = new Map<string, number>();
      const markdown = new Marked({
        renderer: {
          heading({ text, depth, tokens }) {
            const slug = uslug(text) || 'section';
            const count = ids.get(slug) ?? 0;
            ids.set(slug, count + 1);
            return `<h${depth} id="${encodeXML(count ? `${slug}-${count}` : slug)}">${this.parser.parseInline(tokens)}</h${depth}>\n`;
          },
        },
        walkTokens: token => {
          if (token.type === 'html') {
            throw new Error(`Raw HTML is not supported in ${path.relative(this.dir, file)}. Use Markdown syntax.`);
          }
          if (token.type === 'link' && isExternal(token.href) && !/^(?:https?:|mailto:|\/\/)/i.test(token.href)) {
            throw new Error(`Unsupported link protocol: ${token.href}`);
          }
          if (token.type === 'link' && !isExternal(token.href) && !token.href.startsWith('#')) {
            const target = this.chapterPath(token.href, path.dirname(file));
            const destination = chapters.get(target);
            if (!destination) throw new Error(`Linked chapter is not listed in _sidebar.md: ${token.href}`);
            const hash = token.href.indexOf('#');
            token.href = destination.filename + (hash === -1 ? '' : token.href.slice(hash));
          }
          if (token.type === 'image') {
            if (isExternal(token.href)) {
              throw new Error(`Use a local image in the source directory: ${token.href}`);
            }
            token.href = pathToFileURL(this.localPath(token.href, path.dirname(file))).href;
          }
        },
      });
      content.push({
        ...chapter,
        data: await markdown.parse(readFileSync(file, 'utf8'), { async: true }),
        baseURI: path.dirname(file),
      });
    }
    return content;
  }
}
