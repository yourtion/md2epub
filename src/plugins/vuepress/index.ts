import { readFileSync } from "fs";
import { Plugin } from "..";
import { marked } from 'marked';
import path from "path";

export default class VuePress extends Plugin {

  getInfo() {
    const res:{
      title?: string;
      description?: string;
      cover?: string;
      author?: string;
    } = {}
    try {
      const readme = readFileSync(path.resolve(this.dir, "README.md")).toString();
      for(const line of readme.split("\n")) {
        if(line.startsWith("#")){
          res["title"] = line.substring(1).trim();
          break;
        }
      }
    } catch (e) {}
    console.log(res)
    return res;
  }

  getList(): Array<[string, string]> {
    const list: Array<[string, string]> = [];
    const file = readFileSync(path.resolve(this.dir, "_sidebar.md")).toString()
    marked.use({
      walkTokens: (token) => {
        if (token.type === 'link') {
          list.push([token.text, token.href])
        }
      }
    });
    marked.parse(file)
    marked.use({ walkTokens: undefined });
    return list;
  }
}