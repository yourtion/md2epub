import VuePress from "./plugins/vuepress"
import { program } from "commander";

program
  .argument('<source>', 'source')
  .option('-t --title <title>')
  .option('-c --cover <cover>')
  .option('-a --author <author>')
  .option('--dist <dist>')
  .option('--tmpDir <temp_dir>')
  .option('-v --verbose', 'verbose mode');

program.parse();
const options = program.opts();
// console.log(options);

const dir = program.args[0];
console.log(options);
const p = new VuePress(dir, options);
p.build().then().catch();
