import path from "path";
import { EPub, EpubOptions } from "../epub";
import { readFile } from "fs/promises";
import { marked } from "marked";

export interface PluginOptions {
  title?: string;
  cover?: string;
  author?: string;
  distPath?: string;
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
      title: "title",
      tempDir: "/tmp",
      appendChapterTitles: false,
      ...this.options,
      cover,
      ...this.getInfo(),
      content: []
    };
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
    const filename = this.options?.title ?? "title";
    return new EPub(option, path.resolve(this.dir, `${filename}.epub`)).render();
  }

}