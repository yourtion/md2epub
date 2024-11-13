import { STR_MAP } from "./constant";

const RegMap: [RegExp, string][] = Object.keys(STR_MAP)
  .map(key => [new RegExp(key, "g"), STR_MAP[key]]);

export function replaceMap(string: string, map = RegMap) {
  let newString = string;
  for (const [key, val] of map) {
    newString = newString.replace(key, val);
  }
  return newString;
}