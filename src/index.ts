import Docsify from "./plugins/docsify"

const dir = process.argv[2];
const p = new Docsify(dir);
p.build().then()
