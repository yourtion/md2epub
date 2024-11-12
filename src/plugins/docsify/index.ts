import { readFileSync } from "fs";
import { Plugin } from "..";
import { marked } from 'marked';
import path from "path";

export default class Docsify extends Plugin {

  getInfo() {
    return {
    }
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