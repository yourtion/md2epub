import path from "path";
import { EPub, EpubOptions } from "../epub";
import { readFileSync } from "fs";
import { marked } from "marked";

export abstract class Plugin {
  protected dir: string;

  constructor(dir: string) {
    this.dir = dir;
  }

  protected abstract getList():Array<[string, string]>;
  protected abstract getInfo() : {
    title: string;
    description: string;
    cover: string;
    author?:string;
  };

  async build(): Promise<void> {
    const option: EpubOptions = {
      ...this.getInfo(),
      content: [],
      tempDir: "/tmp",
      verbose: true,
      appendChapterTitles: false,
    };
  
    const list = this.getList();
    for (const [name, file] of list) {
      // console.log(name, file)
      if(file.startsWith("#")) {
        continue;
      }
      const fileName = path.resolve(this.dir, file);
      const fileConetnt = readFileSync(fileName).toString();

      const data = await marked.parse(fileConetnt);
      option.content.push({
        title: name,
        author: "",
        data,
        baseURI: path.dirname(fileName)
      });
      
    }
    const filename = "title";
    return new EPub(option, path.resolve(this.dir, `${filename}.epub`)).render();
  }

}