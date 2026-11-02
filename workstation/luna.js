// 工作台上露娜负责的三段动画的接线（Codex 的 app.js / scene.js 只加了最小的钩子）：
//   1. 区域之间的竖井：前往实验室、复习区时百叶翻开、下行；从它们上来时在竖井里到站，百叶合上露出桌前。
//   2. 纸飞机：flight.js；3. 平板开机：boot.js。
import {
  createPassage,
  passageFrame,
  savePassage,
  takePassage,
  play,
  PASSAGE,
} from '../sandbox/passage.js';
import { createFlight } from './flight.js?v=25';
import { createBoot } from './boot.js?v=25';

const params = new URLSearchParams(location.search),
  reduced = matchMedia('(prefers-reduced-motion: reduce)');
const motion = () =>
  params.get('motion') !== '0' &&
  !reduced.matches &&
  !document.body.classList.contains('motion-off');
const station = () => window.zxStation?.scene || null;
const bg = () =>
  getComputedStyle(document.documentElement).getPropertyValue('--bg').trim() || '#15191b';
let busy = false;

// ---------- 竖井：离开 ----------
const TARGETS = { lab: '../recall.html?region=lab', review: '../recall.html?workbench=1' };
async function leave(to) {
  if (busy) return;
  const href = TARGETS[to];
  if (!motion() || !station()) return location.assign(href);
  busy = true;
  document.getElementById('regions').open = false;
  const p = createPassage({ from: 'workstation', to });
  p.picture(station().snapshot(), bg());
  p.apply(passageFrame('leave', 0));
  document.body.append(p.el);
  await play('leave', PASSAGE.leave, (t) => p.apply(passageFrame('leave', t)));
  savePassage('workstation', to);
  location.assign(href + '&via=passage');
}
// 只是给两个链接加上动画；链接本身照常可用（新窗口打开、无脚本时直接跳转）
function wireRegions() {
  document.querySelectorAll('#regions a[href^="../recall.html"]').forEach((a) => {
    const to = a.getAttribute('href').includes('region=lab') ? 'lab' : 'review';
    a.addEventListener('click', (e) => {
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.button) return;
      e.preventDefault();
      leave(to);
    });
  });
}

// ---------- 竖井：到达 ----------
async function arrive(from) {
  const p = createPassage({ from, to: 'workstation' });
  p.apply(passageFrame('ride', 0));
  document.body.append(p.el);
  document.documentElement.classList.remove('passage-in');
  if (!motion()) return p.el.remove();
  busy = true;
  // 在竖井里上行，同时等工作台场景准备好（第一次要编译材质、生成贴图）
  await play('ride', PASSAGE.ride, (t) => p.apply(passageFrame('ride', t)), {
    hold: (t, dt) => {
      const wait =
        t >= PASSAGE.ride * 0.85 && !station() && !document.body.classList.contains('no-webgl');
      p.hold(wait, dt);
      return wait;
    },
  });
  // 此刻的桌前画面切成百叶，从外往缝翻回来
  p.picture(station()?.snapshot() || null, bg());
  await play('arrive', PASSAGE.arrive, (t) => p.apply(passageFrame('arrive', t)));
  p.el.remove();
  busy = false;
  document.querySelector('.object-dock [data-object="tablet"]')?.focus({ preventScroll: true });
}

// ---------- 启动 ----------
const flight = createFlight({ motion, station }),
  boot = createBoot({ motion, station });
window.zxFlight = flight;
window.zxBoot = boot;
wireRegions();
const came = takePassage('workstation');
if (came) arrive(came.from);
else document.documentElement.classList.remove('passage-in');
// 测试用：停在竖井的某一刻
window.zxPassageTest = (from, to, stage, t) => {
  let p = document.querySelector('.passage.test');
  p?.remove();
  const x = createPassage({ from, to });
  x.el.classList.add('test');
  if (stage !== 'ride') x.picture(station()?.snapshot() || null, bg());
  x.apply(passageFrame(stage, t));
  document.body.append(x.el);
  return x;
};
