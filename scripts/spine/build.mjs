import { execFileSync } from 'node:child_process';
import { copyFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
const root = new URL('../../', import.meta.url),
  generated = new URL('./generated/', import.meta.url);
for (const name of ['build-model.mjs', 'add-hardware.mjs', 'build-scene.mjs']) {
  execFileSync(process.execPath, [fileURLToPath(new URL(name, import.meta.url))], {
    stdio: 'inherit',
  });
  if (name === 'build-model.mjs')
    await copyFile(
      new URL('organic-spine.glb', generated),
      new URL('organic-spine-v2.glb', generated),
    );
}
await mkdir(new URL('assets/models/', root), { recursive: true });
await copyFile(
  new URL('organic-spine.glb', generated),
  new URL('assets/models/organic-spine-study-v3.glb', root),
);
await copyFile(
  new URL('organic-spine-scene-v3.glb', generated),
  new URL('assets/models/organic-spine-scene-v3.glb', root),
);
await import('./check.mjs');
