#!/usr/bin/env node
// Packs the whole game into one self-contained HTML file.
//
// The game is fifty-odd ES modules that import each other by relative path,
// which is fine over http:// and impossible inside a single file. Rather than
// concatenating the sources — which would mean rewriting every import and
// export and getting the order right — each module is kept exactly as written
// and published as its own `data:` URL, with an import map naming them. The
// only thing rewritten is the specifier strings.
//
//   node tools/bundle.mjs [outfile]

import { readFile, readdir, writeFile } from 'node:fs/promises';
import { join, dirname, relative, resolve } from 'node:path';

const ROOT = resolve(process.cwd());
// --artifact emits a fragment for the Artifact host, which supplies its own
// doctype, <html> and <body>; the default emits a complete standalone page.
const ARTIFACT = process.argv.includes('--artifact');
const OUT = process.argv.filter((a) => !a.startsWith('--'))[2]
  ?? (ARTIFACT ? 'dist/artifact.html' : 'dist/thronebound.html');

/** Every .js file under a directory, recursively. */
async function walk(dir) {
  const found = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) found.push(...await walk(path));
    else if (entry.name.endsWith('.js')) found.push(path);
  }
  return found;
}

// Keys have to be *bare* specifiers. A `data:` URL module has no hierarchical
// base, so anything that looks relative ("./x.js") is resolved against the data
// URL and fails before the import map is ever consulted. A bare specifier always
// goes through the map.
const PREFIX = 'thronebound:';

/** The name a module goes by in the import map. */
function keyFor(absolutePath) {
  return PREFIX + relative(ROOT, absolutePath).split('\\').join('/');
}

/**
 * Rewrites every relative specifier in a module to the flat key of whatever it
 * points at. Covers `from '...'`, bare `import '...'` and dynamic `import(...)`,
 * which between them are every form this codebase uses.
 */
function rewrite(source, modulePath) {
  const dir = dirname(modulePath);
  const resolveSpec = (spec) => keyFor(resolve(dir, spec));

  return source
    .replace(/(\bfrom\s*)(['"])(\.\.?\/[^'"]+)\2/g,
      (_, from, q, spec) => `${from}${q}${resolveSpec(spec)}${q}`)
    .replace(/(\bimport\s*)(['"])(\.\.?\/[^'"]+)\2/g,
      (_, imp, q, spec) => `${imp}${q}${resolveSpec(spec)}${q}`)
    .replace(/(\bimport\s*\(\s*)(['"])(\.\.?\/[^'"]+)\2(\s*\))/g,
      (_, open, q, spec, close) => `${open}${q}${resolveSpec(spec)}${q}${close}`);
}

const dataUrl = (source) =>
  `data:text/javascript;base64,${Buffer.from(source, 'utf8').toString('base64')}`;

const files = await walk(join(ROOT, 'src'));
const imports = {};
let rewritten = 0;

for (const path of files) {
  const source = await readFile(path, 'utf8');
  const out = rewrite(source, path);
  if (out !== source) rewritten++;
  imports[keyFor(path)] = dataUrl(out);
}

// A specifier the rewrite missed, or one pointing at a module that is not in
// the map, would fail silently in the browser. Check every one resolves.
for (const [key, url] of Object.entries(imports)) {
  const decoded = Buffer.from(url.split(',')[1], 'base64').toString('utf8');
  const specifiers = [
    ...decoded.matchAll(/\bfrom\s*['"]([^'"]+)['"]/g),
    ...decoded.matchAll(/\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g),
  ].map((m) => m[1]);

  for (const spec of specifiers) {
    if (spec.startsWith('node:')) continue;
    if (!(spec in imports)) {
      throw new Error(`${key} imports "${spec}", which is not in the bundle`);
    }
  }
}

const css = await readFile(join(ROOT, 'styles.css'), 'utf8');
const html = await readFile(join(ROOT, 'index.html'), 'utf8');
const body = html.slice(html.indexOf('<body>') + 6, html.indexOf('</body>'))
  .replace(/<script[^>]*><\/script>/g, '')
  .trim();

const importMap = `<script type="importmap">
${JSON.stringify({ imports }, null, 0)}
</` + `script>`;
const entry = `<script type="module">
import ${JSON.stringify(keyFor(join(ROOT, 'src/main.js')))};
</` + `script>`;

const page = ARTIFACT
  ? await artifactPage({ body, importMap, entry })
  : `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no">
<title>A Song of Ice and Monsters</title>
<style>
${css}
</style>
</head>
<body>
${body}
${importMap}
${entry}
</body>
</html>
`;

/** The hosted version: the same game, framed for somebody who was sent a link. */
async function artifactPage({ body: markup, importMap: map, entry: boot }) {
  const shell = await readFile(join(ROOT, 'tools/artifact-shell.html'), 'utf8');
  return shell
    .replace('<!--GAME-->', markup)
    .replace('<!--IMPORTMAP-->', map)
    .replace('<!--ENTRY-->', boot);
}

await writeFile(OUT, page, 'utf8');
const kb = (Buffer.byteLength(page) / 1024).toFixed(0);
console.log(`Bundled ${files.length} modules (${rewritten} rewritten) into ${OUT} — ${kb} KB`);
