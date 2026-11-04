import { readFile, stat } from 'node:fs/promises';
import { resolve, dirname, extname, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const queue = [
  'index.html',
  'recall.html',
  'workstation/index.html',
  'workstation/previews/source.html',
  'preview/index.html',
  'docs/index.html',
  'preview/starfield/index.html',
  'laboratory/index.html',
  'laboratory/specimens/index.html',
];
const visited = new Set(),
  failures = [];
while (queue.length) {
  const file = queue.shift();
  if (visited.has(file)) continue;
  visited.add(file);
  const path = resolve(root, file),
    text = await readFile(path, 'utf8');
  const refs =
    extname(file) === '.html'
      ? [...text.matchAll(/(?:src|href)="([^"#]+)"/g)].map((m) => m[1])
      : extname(file) === '.css'
        ? [...text.matchAll(/url\(['"]?([^'"\)]+)['"]?\)/g)].map((m) => m[1])
        : [...text.matchAll(/(?:\bfrom\s+|\bimport\s*\(|\bnew\s+URL\s*\()['"]([^'"]+)['"]/g)].map(
            (m) => m[1],
          );
  for (const ref of refs) {
    if (/^(https?:|data:|mailto:|#)/.test(ref)) continue;
    const clean = ref.replaceAll('&amp;', '&').split(/[?#]/)[0];
    if (!clean) continue;
    let destination = resolve(dirname(path), decodeURIComponent(clean));
    try {
      const info = await stat(destination);
      if (info.isDirectory()) destination = resolve(destination, 'index.html');
      await stat(destination);
      const name = relative(root, destination);
      assert.ok(!name.startsWith('..' + sep), 'Path outside sandbox: ' + ref);
      if (
        ['.html', '.css', '.js'].includes(extname(name)) &&
        !name.startsWith('vendor') &&
        !name.includes(sep + 'vendor' + sep) &&
        !name.startsWith('preview' + sep + 'round-')
      )
        queue.push(name);
    } catch (e) {
      failures.push(file + ' → ' + ref + ': ' + e.code);
    }
  }
}
assert.deepEqual(failures, [], 'Broken local references after catalog reorganization');
console.log('PASS: ' + visited.size + ' entry pages, styles and module graphs resolve locally.');
