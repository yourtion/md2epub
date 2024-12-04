import path, { basename, dirname, isAbsolute } from "path";
import { EPub, EpubOptions } from "../epub";
import { readFile } from "fs/promises";
import { marked } from "marked";

export interface PluginOptions {
  title?: string;
  cover?: string;
  author?: string;
  dist?: string;
  tmpDir?: string;
  verbose?: boolean;
}


export abstract class Plugin {
  protected dir: string;
  protected options?: PluginOptions;

  constructor(dir: string, options?: PluginOptions) {
    this.dir = dir;
    this.options = { ...options };
  }

  protected abstract getList(): Array<[string, string]>;
  protected abstract getInfo(): {
    title?: string;
    description?: string;
    cover?: string;
    author?: string;
  };

  async build(): Promise<void> {
    const cover = this.options?.cover ? path.resolve(process.cwd(), this.options?.cover) : undefined;
    const option: EpubOptions = {
      title: "",
      description: "",
      publisher: "Yourtion Guo",
      tempDir: "/tmp",
      appendChapterTitles: false,
      ...this.getInfo(),
      ...this.options,
      cover,
      content: []
    };
    option.author = option.author ?? this.options?.author?.split(",");
    if (!this.options?.title) {
      option.title = basename(this.dir);
    }
    const list = this.getList();
    for (const [name, file] of list) {
      const fileName = path.resolve(this.dir, file);
      const fileConetnt = (await readFile(fileName)).toString();

      const data = await marked.parse(fileConetnt, { async: true });
      option.content.push({
        title: name,
        data,
        baseURI: path.dirname(fileName)
      });

    }
    const filename = option.title;
    let dist = `${filename}.epub`
    if (this.options?.dist) {
      const distPath = this.options?.dist
      dist = isAbsolute(distPath) ? distPath : path.resolve(process.cwd(), dist);
    }
    return new EPub(option, path.resolve(this.dir, dist)).render();
  }

}