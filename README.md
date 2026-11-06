# md2epub

Build an EPUB 3 book from a **local Docsify-style Markdown project**.

## Supported scope

This initial CLI supports a source directory containing `_sidebar.md`. Local
Markdown links in that sidebar define chapter order. Nested lists are flattened;
duplicate chapter links are included once. External and anchor-only sidebar links
are ignored. `/` and directory links resolve to `README.md`; extensionless links
resolve to `.md` files. Root-relative links are relative to the source directory.

It supports standard Markdown, chapter links between files listed in the sidebar,
heading anchors, local PNG/JPEG/GIF images, a local cover, and title/author overrides.
Images are embedded and shared references are deduplicated. Chapter and image
paths, including symlinks, must stay inside the source directory. The explicit
`--cover` path may be outside it.

**Not supported:** native VuePress configuration/sidebar files, arbitrary directory
scanning, remote chapters or images, raw HTML, Vue components, front-matter metadata,
Docsify plugins, custom heading-ID extensions, SVG/WebP images, and attachments.
Use trusted Markdown with ordinary links. Fragment identifiers should match the
lowercase, hyphenated generated heading IDs; duplicate headings receive `-1`, `-2`,
etc. Links to local chapters omitted from `_sidebar.md` fail with a clear error.

The old entrypoint was named VuePress but read `_sidebar.md`; it was not a native
VuePress adapter. This delivery makes that limitation explicit rather than claiming
both formats work. `--format vuepress` is rejected.

## Build and run from a checkout

Requires **Node.js 20 or newer** and pnpm 9 or newer.

```sh
git clone https://github.com/yourtion/md2epub.git
cd md2epub
pnpm install --frozen-lockfile
pnpm build
node dist/cli.js --help
node dist/cli.js test/fixtures/docsify --output ./example.epub
```

To exercise the installable package without relying on a published npm release:

```sh
npm pack
npm install --global ./md2epub-0.0.1.tgz
md2epub ./test/fixtures/docsify --output ./example.epub
```

Or install the tarball into a separate project with
`npm install /absolute/path/to/md2epub-0.0.1.tgz`, then run
`npx --no-install md2epub ./docs --output ./book.epub` there. The package includes
compiled JavaScript, declarations, templates, and CSS; no TypeScript runner is
needed at runtime. These commands refer to the tarball built from this checkout,
not a claim that the current npm release contains this implementation.

## Example project

```text
docs/
  _sidebar.md
  README.md
  guide.md
  images/
    cover.png
```

`docs/_sidebar.md`:

```markdown
- [Introduction](README.md)
- [Guide](guide.md)
```

`docs/README.md`:

```markdown
# My Handbook

Welcome. [Read the guide](guide.md#getting-started).

![Cover](images/cover.png)
```

`docs/guide.md`:

```markdown
# Guide

## Getting started

Your first chapter.
```

Build it:

```sh
md2epub ./docs --format docsify \
  --title "My Handbook" \
  --author "Alice, Bob" \
  --cover ./docs/images/cover.png \
  --output ./books/handbook.epub
```

## CLI options

- `<source>`: directory containing `_sidebar.md`.
- `-f, --format <format>`: `docsify` only; also the default.
- `-t, --title <title>`: defaults to the first level-one heading in `README.md`,
  then the source directory name. Unsafe filename characters are replaced with `_`
  when deriving an output filename; the book title itself is preserved.
- `-a, --author <authors>`: comma-separated names; defaults to `anonymous`.
- `-c, --cover <file>`: local PNG/JPEG/GIF, resolved from the current working directory.
- `-o, --output <file>`: explicit EPUB filename, resolved from the working directory.
- `--dist <directory>`: alternative output directory, always a directory whether
  absolute or relative. Cannot be combined with `--output`.
- `--tmp-dir <directory>`: temporary workspace parent; defaults to the OS temp
  directory. The legacy `--tmpDir` spelling is accepted.
- `-v, --verbose`: print build details.
- `--help`, `--version`: help and package version.

Without `--output` or `--dist`, the result is `<title>.epub` in the current working
directory. Parent directories are created. An existing output file is overwritten.
The command waits for the archive to finish writing before reporting success.
Errors are printed to stderr with a nonzero exit status, and private temporary
files are cleaned on success and failure.

## JavaScript API (ES modules)

After installing the package built above:

```js
import { build } from 'md2epub';

const { output } = await build('./docs', {
  format: 'docsify',
  title: 'My Handbook',
  author: 'Alice, Bob',
  output: './books/handbook.epub',
  tmpDir: './.tmp',
});
console.log(output);
```

Importing the package does not parse CLI arguments or start a conversion. The
higher-level `build()` API has the same source restrictions as the CLI. The existing
lower-level `EPub` class and its TypeScript option types are also exported for
callers that provide their own HTML; those callers are responsible for validating
that HTML and any referenced resources.

## Development and verification

```sh
pnpm lint
pnpm typecheck
pnpm test
pnpm test:package
```

Tests invoke the compiled CLI and public API against real fixture projects. They
open generated ZIPs, parse XML/XHTML, verify metadata/reading order/assets/links,
check image bytes and temporary cleanup, and exercise failure exit codes.
`test:package` packs and installs the tarball in an isolated directory, runs its
installed executable via `npm exec`, checks the ESM import, and inspects the EPUB.
It requires npm registry access for production dependencies. CI runs these checks
on Node.js 20, 22, and 24. The Node.js 22 job additionally runs the with-cover and
without-cover fixture books through pinned EPUBCheck 5.4.0, failing on warnings.
To run that check locally, install Java and [EPUBCheck](https://github.com/w3c/epubcheck/releases/tag/v5.4.0),
then run `EPUBCHECK_JAR=/path/to/epubcheck.jar pnpm test:epubcheck`.
Passing fixture checks does not guarantee arbitrary input is valid, and does not
replace visual checks in your target ebook reader.

## License

ISC. See [LICENSE](LICENSE).
