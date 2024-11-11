import Docsify from "./plugins/docsify"
import { program } from "commander";

program
  .argument('<source>', 'source')
  .option('-t --title <title>')
  .option('-c --cover <cover>')
  .option('-a --author <author>')
  .option('-d --distPath <distPath>')
  .option('-tmp --tmpDir <temp_dir>')
  .option('-v --verbose', 'verbose mode');

program.parse();
const options = program.opts();
// console.log(options);

const dir = program.args[0];
const p = new Docsify(dir, options);
p.build().then()
