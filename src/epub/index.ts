import archiver from 'archiver';
import axios from "axios";
import { remove as diacritics } from 'diacritics';
import { renderFile } from 'ejs';
import { encodeXML } from 'entities';
import { createReadStream, createWriteStream, existsSync, readFileSync, writeFileSync, copyFileSync as copySync, mkdirSync, rmSync, renameSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { pipeline } from 'node:stream/promises';
import type { Element } from "hast";
import { imageSize } from "image-size";
import mime from 'mime';
import { basename, dirname, resolve } from 'node:path';
import rehypeParse from "rehype-parse";
import rehypeStringify from "rehype-stringify";
import { type Plugin, unified } from "unified";
import { visit } from "unist-util-visit";
import uslug from 'uslug';
const __dirname = dirname(fileURLToPath(import.meta.url));
const imageTypes = new Set(['image/jpeg', 'image/png', 'image/gif']);
function imageFormat(source: string) {
  const pathname = /^https?:/i.test(source) ? new URL(source).pathname : source;
  const mediaType = mime.getType(pathname);
  if (!mediaType || !imageTypes.has(mediaType)) {
    throw new Error(`Unsupported image: ${source}. Use PNG, JPEG or GIF.`);
  }
  return { mediaType, extension: mime.getExtension(mediaType)! };
}
function resolveImage(source: string, base?: string): string {
  if (source.startsWith('//')) return new URL(`https:${source}`).href;
  if (/^https?:/i.test(source)) return new URL(source).href;
  if (source.startsWith('file:')) return fileURLToPath(source);
  if (/^[a-z][a-z0-9+.-]*:/i.test(source)) throw new Error(`Unsupported image URL: ${source}`);
  if (base && /^https?:/i.test(base)) return new URL(source, base.endsWith('/') ? base : `${base}/`).href;
  return resolve(base?.startsWith('file:') ? fileURLToPath(base) : base ?? process.cwd(), decodeURIComponent(source.split(/[?#]/)[0]));
}

// Allowed HTML attributes & tags
const allowedAttributes = ['content', 'alt', 'id', 'title', 'src', 'href', 'about', 'accesskey', 'aria-activedescendant', 'aria-atomic', 'aria-autocomplete', 'aria-busy', 'aria-checked', 'aria-controls', 'aria-describedat', 'aria-describedby', 'aria-disabled', 'aria-dropeffect', 'aria-expanded', 'aria-flowto', 'aria-grabbed', 'aria-haspopup', 'aria-hidden', 'aria-invalid', 'aria-label', 'aria-labelledby', 'aria-level', 'aria-live', 'aria-multiline', 'aria-multiselectable', 'aria-orientation', 'aria-owns', 'aria-posinset', 'aria-pressed', 'aria-readonly', 'aria-relevant', 'aria-required', 'aria-selected', 'aria-setsize', 'aria-sort', 'aria-valuemax', 'aria-valuemin', 'aria-valuenow', 'aria-valuetext', 'class', 'content', 'contenteditable', 'contextmenu', 'datatype', 'dir', 'draggable', 'dropzone', 'hidden', 'hreflang', 'id', 'inlist', 'itemid', 'itemref', 'itemscope', 'itemtype', 'lang', 'media', 'ns1:type', 'ns2:alphabet', 'ns2:ph', 'onabort', 'onblur', 'oncanplay', 'oncanplaythrough', 'onchange', 'onclick', 'oncontextmenu', 'ondblclick', 'ondrag', 'ondragend', 'ondragenter', 'ondragleave', 'ondragover', 'ondragstart', 'ondrop', 'ondurationchange', 'onemptied', 'onended', 'onerror', 'onfocus', 'oninput', 'oninvalid', 'onkeydown', 'onkeypress', 'onkeyup', 'onload', 'onloadeddata', 'onloadedmetadata', 'onloadstart', 'onmousedown', 'onmousemove', 'onmouseout', 'onmouseover', 'onmouseup', 'onmousewheel', 'onpause', 'onplay', 'onplaying', 'onprogress', 'onratechange', 'onreadystatechange', 'onreset', 'onscroll', 'onseeked', 'onseeking', 'onselect', 'onshow', 'onstalled', 'onsubmit', 'onsuspend', 'ontimeupdate', 'onvolumechange', 'onwaiting', 'prefix', 'property', 'rel', 'resource', 'rev', 'role', 'spellcheck', 'style', 'tabindex', 'target', 'title', 'type', 'typeof', 'vocab', 'xml:base', 'xml:lang', 'xml:space', 'colspan', 'rowspan', 'epub:type', 'epub:prefix'];
const allowedXhtml11Tags = ['div', 'p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'ul', 'ol', 'li', 'dl', 'dt', 'dd', 'address', 'hr', 'pre', 'blockquote', 'center', 'ins', 'del', 'a', 'span', 'bdo', 'br', 'em', 'strong', 'dfn', 'code', 'samp', 'kbd', 'bar', 'cite', 'abbr', 'acronym', 'q', 'sub', 'sup', 'tt', 'i', 'b', 'big', 'small', 'u', 's', 'strike', 'basefont', 'font', 'object', 'param', 'img', 'table', 'caption', 'colgroup', 'col', 'thead', 'tfoot', 'tbody', 'tr', 'th', 'td', 'embed', 'applet', 'iframe', 'img', 'map', 'noscript', 'ns:svg', 'object', 'script', 'table', 'tt', 'var'];

// UUID generation
function uuid() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

export interface EpubContentOptions {
  title: string;
  data: string;
  url?: string;
  author?: Array<string> | string;
  filename?: string;
  excludeFromToc?: boolean;
  beforeToc?: boolean;
  baseURI?: string;
}

export interface EpubOptions {
  id?: string;
  title: string;
  description: string;
  cover?: string;
  publisher?: string;
  author?: Array<string> | string;
  tocTitle?: string;
  appendChapterTitles?: boolean;
  hideToC?: boolean;
  date?: string;
  lang?: string;
  css?: string;
  fonts?: Array<string>;
  content: Array<EpubContentOptions>;
  customOpfTemplatePath?: string;
  customNcxTocTemplatePath?: string;
  customHtmlTocTemplatePath?: string;
  customHtmlCoverTemplatePath?: string;
  version?: number;
  userAgent?: string;
  verbose?: boolean;
  tempDir?: string;
  imageCacheDir?: string;
  allowedAttributes?: string[];
  allowedXhtml11Tags?: string[];
}

interface EpubContent {
  id: string;
  href: string;
  title: string;
  data: string;
  url: string | null;
  author: Array<string>;
  filePath: string;
  templatePath: string;
  excludeFromToc: boolean;
  beforeToc: boolean;
  isCover: boolean;
}

interface EpubImage {
  id: string;
  url: string;
  dir: string;
  mediaType: string;
  extension: string;
}

export class EPub {
  uuid: string;
  title: string;
  description: string;
  cover: string | null;
  coverMediaType: string | null;
  coverExtension: string | null;
  coverDimensions = {
    width: 0,
    height: 0,
  };
  publisher: string;
  author: Array<string>;
  tocTitle: string;
  appendChapterTitles: boolean;
  showToC: boolean;
  date: string;
  lang: string;
  css: string | null;
  fonts: Array<string>;
  content: Array<EpubContent>;
  images: Array<EpubImage>;
  customOpfTemplatePath: string | null;
  customNcxTocTemplatePath: string | null;
  customHtmlCoverTemplatePath: string | null;
  customHtmlTocTemplatePath: string | null;
  version: number;
  userAgent: string;
  verbose: boolean;
  tempDir: string;
  tempEpubDir: string;
  output: string;
  allowedAttributes: string[];
  allowedXhtml11Tags: string[];

  constructor(options: EpubOptions, output: string) {
    // File ID
    this.uuid = options.id ?? uuid();

    // Required options
    this.title = options.title;
    this.description = options.description ?? "";
    this.output = output;

    // Options with defaults
    this.cover = options.cover ?? null;
    this.publisher = options.publisher ?? "anonymous";
    this.author = options.author
      ? typeof options.author === "string"
        ? [options.author]
        : options.author
      : ["anonymous"];
    if (this.author.length === 0) {
      this.author = ["anonymous"];
    }
    this.tocTitle = options.tocTitle ?? "目录";
    this.appendChapterTitles = options.appendChapterTitles ?? true;
    this.showToC = options.hideToC !== true;
    this.date = options.date ?? new Date().toISOString();
    this.lang = options.lang ?? "zh-cn";
    this.css = options.css ?? null;
    this.fonts = options.fonts ?? [];
    this.customOpfTemplatePath = options.customOpfTemplatePath ?? null;
    this.customNcxTocTemplatePath = options.customNcxTocTemplatePath ?? null;
    this.customHtmlTocTemplatePath = options.customHtmlTocTemplatePath ?? null;
    this.customHtmlCoverTemplatePath = options.customHtmlCoverTemplatePath ?? null;
    this.version = options.version ?? 3;
    this.userAgent =
      options.userAgent ??
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/84.0.4147.105 Safari/537.36";
    this.verbose = options.verbose ?? false;
    this.allowedAttributes = options.allowedAttributes ?? allowedAttributes;
    this.allowedXhtml11Tags = options.allowedXhtml11Tags ?? allowedXhtml11Tags;

    if (![2, 3].includes(this.version)) throw new Error('EPUB version must be 2 or 3.');
    this.tempDir = options.tempDir ?? resolve(tmpdir(), 'md2epub');
    // The private work directory is allocated at render time, never from a user-supplied ID.
    this.tempEpubDir = resolve(this.tempDir, `epub-${uuid()}`);
    if (this.cover !== null) {
      this.cover = resolveImage(this.cover);
      const format = imageFormat(this.cover);
      this.coverMediaType = format.mediaType;
      this.coverExtension = format.extension;
    } else {
      this.coverMediaType = null;
      this.coverExtension = null;
    }

    const loadHtml = (content: string, plugins: Plugin[]) =>
      unified()
        .use(rehypeParse, { fragment: true })
        .use(plugins)
        .use(rehypeStringify, { closeSelfClosing: true, closeEmptyElements: true, characterReferences: { useNamedReferences: false } })
        .processSync(content)
        .toString();

    this.images = [];
    this.content = [];

    // Insert cover in content
    if (this.cover) {
      const templatePath =
        this.customHtmlCoverTemplatePath || resolve(__dirname, `./templates/epub${this.version}/cover.xhtml.ejs`);
      if (!existsSync(templatePath)) {
        throw new Error("Could not resolve path to cover template HTML.");
      }

      this.content.push({
        id: `item_${this.content.length}`,
        href: "cover.xhtml",
        title: "cover",
        data: "",
        url: null,
        author: [],
        filePath: resolve(this.tempEpubDir, `./OEBPS/cover.xhtml`),
        templatePath,
        excludeFromToc: true,
        beforeToc: true,
        isCover: true,
      });
    }

    // Parse contents & save images
    const contentTemplatePath = resolve(__dirname, "./templates/content.xhtml.ejs");
    const contentOffset = this.content.length;
    const usedFilenames = new Set(["cover.xhtml", "toc.xhtml"]);
    this.content.push(
      ...options.content.map<EpubContent>((content, i) => {
        const index = contentOffset + i;

        // Get the content URL & path
        let href, filePath;
        if (content.filename === undefined) {
          const titleSlug = uslug(diacritics(content.title || "no title"));
          href = `${index}_${titleSlug}.xhtml`;
          filePath = resolve(this.tempEpubDir, `./OEBPS/${index}_${titleSlug}.xhtml`);
        } else {
          href = content.filename.match(/\.xhtml$/) ? content.filename : `${content.filename}.xhtml`;
          if (content.filename.match(/\.xhtml$/)) {
            filePath = resolve(this.tempEpubDir, `./OEBPS/${content.filename}`);
          } else {
            filePath = resolve(this.tempEpubDir, `./OEBPS/${content.filename}.xhtml`);
          }
        }

        if (!/^[^/\\]+\.xhtml$/.test(href) || href.includes('..') || /[?#%]/.test(href)) {
          throw new Error(`Chapter filename must be a plain XHTML filename: ${href}`);
        }
        if (usedFilenames.has(href)) throw new Error(`Duplicate chapter filename: ${href}`);
        usedFilenames.add(href);

        // Content ID & directory
        const id = `item_${index}`;
        const dir = dirname(filePath);

        // Parse the content
        const html = loadHtml(content.data, [
          () => (tree) => {
            const validateElements = (node: Element) => {
              // Render GFM task checkboxes as static text, not interactive form fields.
              if (node.tagName === 'input' && node.properties?.type === 'checkbox') {
                const checked = node.properties.checked;
                node.tagName = 'span';
                node.properties = {};
                node.children = [{ type: 'text', value: checked ? '☑ ' : '☐ ' }];
              }
              const attrs = node.properties!;
              if (["img", "br", "hr"].includes(node.tagName)) {
                if (node.tagName === "img") {
                  node.properties!.alt = node.properties?.alt || "image-placeholder";
                }
              }

              for (const k of Object.keys(attrs)) {
                if (typeof attrs[k] === "boolean") { delete attrs[k]; continue; }
                if (this.allowedAttributes.includes(k) || (k === "className" && this.allowedAttributes.includes("class"))) {
                  if (k === "type") {
                    if (attrs[k] !== "script") {
                      delete node.properties![k];
                    }
                  }
                } else {
                  delete node.properties![k];
                }
              }

              if (this.version === 2) {
                if (!this.allowedXhtml11Tags.includes(node.tagName)) {
                  if (this.verbose) {
                    console.log(
                      "Warning (content[" + index + "]):",
                      node.tagName,
                      "tag isn't allowed on EPUB 2/XHTML 1.1 DTD."
                    );
                  }
                  node.tagName = "div";
                }
              }
            };

            visit(tree, "element", validateElements);
          },
          () => (tree) => {
            const processImgTags = (node: Element) => {
              if (node.tagName !== "img") {
                return;
              }
              const source = node.properties?.src;
              if (typeof source !== 'string' || !source) throw new Error(`Image in chapter "${content.title}" has no src.`);
              const url = resolveImage(source, content.baseURI);
              let image = this.images.find((element) => element.url === url);
              if (!image) {
                const { mediaType, extension } = imageFormat(url);
                const id = `img_${createHash('sha256').update(url).digest('hex').slice(0, 24)}`;
                image = { id, url, dir, mediaType, extension };
                this.images.push(image);
              }
              const { id, extension } = image;
              node.properties!.src = `images/${id}.${extension}`;
            };

            visit(tree, "element", processImgTags);
          },
        ]);

        // Return the EpubContent
        return {
          id,
          href,
          title: content.title,
          data: html,
          url: content.url ?? null,
          author: content.author ? (typeof content.author === "string" ? [content.author] : content.author) : [],
          filePath,
          templatePath: contentTemplatePath,
          excludeFromToc: content.excludeFromToc === true, // Default to false
          beforeToc: content.beforeToc === true, // Default to false
          isCover: false,
        };
      })
    );
  }

  async render(): Promise<{ result: string }> {
    mkdirSync(this.tempDir, { recursive: true });
    // Each instance owns its directory; recursive mkdir supports nested custom temp roots.
    mkdirSync(this.tempEpubDir, { recursive: true });
    try {
      mkdirSync(resolve(this.tempEpubDir, 'OEBPS'), { recursive: true });
      await this.downloadAllImage(this.images);
      await this.makeCover();
      await this.generateTempFile(this.content);
      await this.generate();
      return { result: 'ok' };
    } finally {
      rmSync(this.tempEpubDir, { recursive: true, force: true });
    }
  }

  private async generateTempFile(contents: Array<EpubContent>) {
    // Create the document's Header
    const docHeader =
      this.version === 2
        ? `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.1//EN" "http://www.w3.org/TR/xhtml11/DTD/xhtml11.dtd">
<html xmlns="http://www.w3.org/1999/xhtml" lang="${encodeXML(this.lang)}">
`
        : `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" lang="${encodeXML(this.lang)}">
`;

    // Copy the CSS style
    if (this.css === null) {
      this.css = readFileSync(resolve(__dirname, "./templates/template.css"), { encoding: "utf8" });
    }
    writeFileSync(resolve(this.tempEpubDir, "./OEBPS/style.css"), this.css);

    // Copy fonts
    if (this.fonts.length) {
      mkdirSync(resolve(this.tempEpubDir, "./OEBPS/fonts"));
      const usedFontNames = new Set<string>();
      this.fonts = this.fonts.map((font) => {
        if (!existsSync(font)) {
          throw new Error(`Custom font not found at ${font}.`);
        }
        const filename = basename(font);
        if (usedFontNames.has(filename)) throw new Error(`Duplicate font filename: ${filename}`);
        if (!/\.(ttf|otf|woff2?)$/i.test(filename)) throw new Error(`Unsupported font: ${font}`);
        usedFontNames.add(filename);
        copySync(font, resolve(this.tempEpubDir, `./OEBPS/fonts/${filename}`));
        return filename;
      });
    }

    // Write content files
    for (const content of contents) {
      const result = await renderFile(
        content.templatePath,
        {
          ...this,
          ...content,
          bookTitle: this.title,
          encodeXML,
          docHeader,
        },
        {
          escape: (markup) => markup,
        }
      );
      writeFileSync(content.filePath, result);
    }

    // write meta-inf/container.xml
    mkdirSync(this.tempEpubDir + "/META-INF");
    writeFileSync(
      `${this.tempEpubDir}/META-INF/container.xml`,
      '<?xml version="1.0" encoding="UTF-8" ?><container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>'
    );

    if (this.version === 2) {
      // write meta-inf/com.apple.ibooks.display-options.xml [from pedrosanta:xhtml#6]
      writeFileSync(
        `${this.tempEpubDir}/META-INF/com.apple.ibooks.display-options.xml`,
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<display_options>
  <platform name="*">
    <option name="specified-fonts">true</option>
  </platform>
</display_options>
`
      );
    }

    const opfPath =
      this.customOpfTemplatePath || resolve(__dirname, `./templates/epub${this.version}/content.opf.ejs`);
    if (!existsSync(opfPath)) {
      throw new Error("Custom file to OPF template not found.");
    }
    writeFileSync(resolve(this.tempEpubDir, "./OEBPS/content.opf"), await renderFile(opfPath, { ...this, fontMediaType: (font: string) => mime.getType(font) }));

    const ncxTocPath = this.customNcxTocTemplatePath || resolve(__dirname, "./templates/toc.ncx.ejs");
    if (!existsSync(ncxTocPath)) {
      throw new Error("Custom file the NCX toc template not found.");
    }
    writeFileSync(resolve(this.tempEpubDir, "./OEBPS/toc.ncx"), await renderFile(ncxTocPath, this));

    const htmlTocPath =
      this.customHtmlTocTemplatePath || resolve(__dirname, `./templates/epub${this.version}/toc.xhtml.ejs`);
    if (!existsSync(htmlTocPath)) {
      throw new Error("Custom file to HTML toc template not found.");
    }
    writeFileSync(resolve(this.tempEpubDir, "./OEBPS/toc.xhtml"), await renderFile(htmlTocPath, this));
  }

  private async copyImage(source: string, destination: string): Promise<void> {
    try {
      if (/^https?:/i.test(source)) {
        const response = await axios.get(source, {
          responseType: 'stream', timeout: 30000,
          headers: { 'User-Agent': this.userAgent },
        });
        await pipeline(response.data, createWriteStream(destination));
      } else {
        await pipeline(createReadStream(source), createWriteStream(destination));
      }
      // Reject corrupt files and mismatched extensions instead of emitting unreadable EPUB assets.
      const dimensions = imageSize(readFileSync(destination));
      const expected = imageFormat(source).mediaType;
      const actual = dimensions.type === 'jpg' ? 'image/jpeg' : `image/${dimensions.type}`;
      if (actual !== expected) throw new Error(`Image contents do not match extension (${actual}, expected ${expected}).`);
    } catch (error) {
      throw new Error(`Cannot process image "${source}": ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private async makeCover(): Promise<void> {
    if (!this.cover) return;
    const destination = resolve(this.tempEpubDir, `OEBPS/cover.${this.coverExtension}`);
    await this.copyImage(this.cover, destination);
    const result = imageSize(readFileSync(destination));
    if (!result.width || !result.height) throw new Error(`Cannot read cover dimensions: ${this.cover}`);
    this.coverDimensions = { width: result.width, height: result.height };
  }

  private async downloadImage(image: EpubImage): Promise<void> {
    await this.copyImage(image.url, resolve(this.tempEpubDir, `OEBPS/images/${image.id}.${image.extension}`));
  }

  private async downloadAllImage(images: Array<EpubImage>): Promise<void> {
    if (images.length === 0) {
      return;
    }

    mkdirSync(resolve(this.tempEpubDir, "./OEBPS/images"), { recursive: true });
    for (let index = 0; index < images.length; index++) {
      await this.downloadImage(images[index]);
    }
  }

  private async generate(): Promise<void> {
    const temporaryOutput = `${this.output}.${uuid()}.tmp`;
    try {
      await new Promise<void>((resolve, reject) => {
        const archive = archiver('zip', { zlib: { level: 9 } });
        const output = createWriteStream(temporaryOutput, { flags: 'wx' });
        let failure: Error | undefined;
        const fail = (error: Error) => {
          failure ??= error;
          archive.abort();
          output.destroy();
        };
        output.on('error', fail);
        archive.on('error', fail);
        archive.on('warning', fail);
        // Wait for the descriptor to close before cleanup, including on Windows.
        output.on('close', () => failure ? reject(failure) : resolve());
        archive.pipe(output);
        archive.append('application/epub+zip', { store: true, name: 'mimetype' });
        archive.directory(`${this.tempEpubDir}/META-INF`, 'META-INF');
        archive.directory(`${this.tempEpubDir}/OEBPS`, 'OEBPS');
        archive.finalize().catch(fail);
      });
      renameSync(temporaryOutput, this.output);
    } finally {
      rmSync(temporaryOutput, { force: true });
    }
  }
}
