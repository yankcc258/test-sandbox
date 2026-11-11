// 生成洛希极限展品用的碎石堆（猫猫）：从松散的随机云出发，在自身引力下聚拢成随机密堆，存成 exhibits/roche/moon/pile-data.js。
// 用的就是 physics.js 里的 CPU 积分，所以页面一打开就有一颗已经平衡的卫星，不必让每台设备现场等它聚拢。
// 用法：node scripts/roche/build-pile.mjs [颗粒数 ...]，默认 1024 和 4096（4096 那份要跑几分钟）。
import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import {
  createState,
  looseCloud,
  pileParams,
  advance,
  measurePile,
  SETTLE_TIME,
  SETTLE_DAMP,
} from '../../exhibits/roche/moon/physics.js';

const sizes = process.argv.slice(2).map(Number).filter(Boolean);
const entries = [];
for (const n of sizes.length ? sizes : [1024, 4096]) {
  const started = performance.now(),
    state = createState(n),
    params = pileParams(n, 1),
    steps = Math.ceil(SETTLE_TIME / params.dt);
  state.x.set(looseCloud(n, 7));
  for (let done = 0; done < steps; done += 100) {
    advance(state, params, Math.min(100, steps - done), { planet: false, settle: SETTLE_DAMP });
  }
  // 再不加整体阻尼走一小段，量残余的速度：应该远小于表面逃逸速度
  advance(state, params, 200, { planet: false });
  const pile = measurePile(state.x, n);
  let speed = 0;
  for (let i = 0; i < 3 * n; i++) speed += state.v[i] ** 2;
  const rms = Math.sqrt(speed / n),
    escape = Math.sqrt((2 * params.mass) / pile.rEff);
  console.log(
    `n=${n} steps=${steps} rEff=${pile.rEff.toFixed(5)} rms speed / escape = ${(rms / escape).toExponential(2)} ` +
      `(${((performance.now() - started) / 1000).toFixed(1)} s)`,
  );
  const bytes = Buffer.from(new Float32Array(pile.pos).buffer).toString('base64');
  entries.push(`  ${n}: '${bytes}',`);
}
const out = fileURLToPath(new URL('../../exhibits/roche/moon/pile-data.js', import.meta.url));
await writeFile(
  out,
  `// 由 scripts/roche/build-pile.mjs 生成，不要手改。键是颗粒数，值是相对质心的位置（Float32，xyz 依次排列，base64）。\n` +
    `// prettier-ignore\nexport const PILES = {\n${entries.join('\n')}\n};\n`,
);
console.log('wrote', out);
