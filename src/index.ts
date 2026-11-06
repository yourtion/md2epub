import Docsify from './plugins/docsify/index.js';
import type { PluginOptions } from './plugins/index.js';

export type { PluginOptions } from './plugins/index.js';
export { EPub } from './epub/index.js';
export type { EpubOptions, EpubContentOptions } from './epub/index.js';

export interface BuildOptions extends PluginOptions {
  format?: 'docsify';
}

/** Build a local Docsify-style project without parsing process.argv. */
export async function build(source: string, options: BuildOptions = {}) {
  if (options.format && options.format !== 'docsify') {
    throw new Error(`Unsupported format: ${options.format}. Supported format: docsify (_sidebar.md).`);
  }
  return new Docsify(source, options).build();
}
