// 文档里的相对链接和图片都要指向真实存在的文件（露娜，2026-11-04 整理目录时加）。
// 检查仓库里所有 .md 和 .html：Markdown 链接 [..](..)、<img src>、<a href>，
// 以及指向本仓库的 GitHub / GitHub Pages 绝对地址。外部网址、锚点、mailto 不查。
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

const root = fileURLToPath(new URL('..', import.meta.url));
const files = execFileSync(
  'git',
  ['ls-files', '-z', '--cached', '--others', '--exclude-standard', '*.md', '*.html'],
  { cwd: root, encoding: 'utf8' },
)
  .split('\0')
  .filter(
    (f) =>
      f && !f.startsWith('vendor/') && !f.includes('/vendor/') && !f.startsWith('node_modules/'),
  );
const own =
  /^https:\/\/(?:github\.com\/yankcc258\/test-sandbox\/(?:blob|tree)\/main\/|yankcc258\.github\.io\/test-sandbox\/)(.*)$/;
const broken = [];
for (const file of files) {
  const text = readFileSync(join(root, file), 'utf8');
  const targets = [
    ...(file.endsWith('.md') ? [...text.matchAll(/\]\(([^)\s]+)\)/g)].map((m) => m[1]) : []),
    ...[...text.matchAll(/\b(?:src|href)="([^"]+)"/g)].map((m) => m[1]),
  ];
  for (const raw of targets) {
    if (/^(#|mailto:|data:|javascript:)/.test(raw) || raw.includes('${')) continue;
    const g = raw.match(own);
    let path;
    if (g) path = g[1];
    else if (/^[a-z]+:/i.test(raw) || raw.startsWith('/')) continue;
    else path = join(dirname(file), raw);
    path = decodeURIComponent(path.split(/[?#]/)[0]);
    if (!path) continue;
    const full = normalize(join(root, path));
    if (!existsSync(full)) broken.push(`${file} → ${raw}`);
  }
}
assert.deepEqual(broken, [], 'Broken document links');
console.log(`PASS: ${files.length} documents, every relative link and image resolves.`);
