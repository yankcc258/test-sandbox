import { initialState, reduceState, tokyoMood } from './state.js?v=31';
import { CHAPTERS } from './chapters.js?v=31';

const $ = (id) => document.getElementById(id);
let state = initialState(),
  scene = null,
  userMotion = new URLSearchParams(location.search).get('motion') !== '0';
const reduced = matchMedia('(prefers-reduced-motion: reduce)');
const motion = () => userMotion && !reduced.matches;
const copy = {
  overview: [
    '01 / MATHEMATICS',
    '从结构，进入理解。',
    '点一次螺旋，聚焦数学。再点一次，展开其中的观察对象。',
  ],
  focus: [
    'MATHEMATICS / FOCUS',
    '数学，近一些。',
    '再点一次，薄片向外展开。曲面与章节会一起出现。',
  ],
  observe: [
    'SPECIMEN 01 / OBSERVATION',
    '从整体，看到局部。',
    '旋转曲面，比较切平面与截面；也可以直接选择章节开始阅读。',
  ],
  lesson: [
    'MATHEMATICS / READING',
    '把观察，写成理解。',
    '模型仍在身旁。阅读时也可以切换观察方式，返回后继续探索。',
  ],
};
const anchor = document.createElement('button');
anchor.id = 'math-anchor';
anchor.className = 'model-anchor';
anchor.type = 'button';
anchor.onclick = () => dispatch({ type: 'activate' });
document.querySelector('.scene-viewport').append(anchor);
for (const chapter of CHAPTERS) {
  const button = document.createElement('button');
  button.className = 'chapter-entry';
  button.type = 'button';
  button.dataset.chapter = chapter.id;
  const number = document.createElement('small'),
    title = document.createElement('strong'),
    summary = document.createElement('span'),
    arrow = document.createElement('b');
  number.textContent = chapter.number;
  title.textContent = chapter.title;
  summary.textContent = chapter.summary;
  arrow.textContent = '↗';
  arrow.setAttribute('aria-hidden', 'true');
  button.append(number, title, summary, arrow);
  button.onclick = () => dispatch({ type: 'chapter', chapter });
  $('chapter-list').append(button);
}
function render() {
  document.body.dataset.stage = state.stage;
  document.body.dataset.mode = state.mode;
  document.body.classList.toggle('motion-off', !motion());
  const [eyebrow, title, description] = copy[state.stage];
  $('stage-eyebrow').textContent = eyebrow;
  $('stage-title').replaceChildren(
    ...title.match(/[^，]+，?/g).map((clause) => {
      const span = document.createElement('span');
      span.textContent = clause;
      return span;
    }),
  );
  $('stage-copy').textContent = description;
  const inside = state.stage === 'observe' || state.stage === 'lesson';
  $('lab-canvas').setAttribute(
    'aria-label',
    inside
      ? '数学曲面标本，可拖动或用左右方向键旋转'
      : '三叶结学科模型，第一次点击聚焦数学，第二次展开观察',
  );
  $('study-panel').hidden = !inside;
  $('lesson-panel').hidden = state.stage !== 'lesson';
  $('primary-action').hidden = inside;
  $('skip-study').hidden = inside;
  $('primary-action').textContent = state.stage === 'overview' ? '聚焦数学 →' : '展开观察对象 →';
  $('back-stage').hidden = state.stage === 'overview';
  $('back-stage').textContent = state.stage === 'lesson' ? '← 返回观察' : '← 收拢回总览';
  anchor.hidden = inside || !scene;
  anchor.textContent = state.stage === 'overview' ? '数学 · 聚焦 ↗' : '数学 · 展开 ↗';
  document
    .querySelectorAll('#observation-tabs button[data-mode]')
    .forEach((button) =>
      button.setAttribute('aria-pressed', String(button.dataset.mode === state.mode)),
    );
  $('probe').disabled = state.mode === 'surface';
  $('probe').value = String(state.probe);
  $('probe-label').textContent = state.mode === 'section' ? '截面高度 c' : '切点横坐标 a';
  $('probe-value').textContent = (
    state.mode === 'section' ? state.probe * 0.5 : state.probe
  ).toFixed(state.mode === 'section' ? 3 : 2);
  $('probe').setAttribute(
    'aria-valuetext',
    state.mode === 'section'
      ? `截面高度 ${(state.probe * 0.5).toFixed(3)}`
      : `切点横坐标 ${state.probe.toFixed(2)}`,
  );
  document.querySelector('.probe-limits').firstElementChild.textContent =
    state.mode === 'section' ? '−0.50' : '−1';
  document.querySelector('.probe-limits').lastElementChild.textContent =
    state.mode === 'section' ? '0.50' : '1';
  $('specimen-note').textContent =
    state.mode === 'surface'
      ? 'y = (x² − z²) / 2 · 拖动观察曲面，切换模式查看局部与截面。'
      : state.mode === 'tangent'
        ? `参数 (u, v) = (${state.probe.toFixed(2)}, 0.30) · 移动切点，观察切平面的方向。`
        : `y = ${(state.probe * 0.5).toFixed(3)} · 亮线表示水平面与曲面的真实交线。`;
  $('interaction-hint').textContent = inside
    ? '拖动旋转 · 方向键观察 · Esc 返回'
    : '点按聚焦 / 展开 · 拖动只旋转 · Enter 选择';
  $('motion-toggle').textContent = motion() ? '动效 · 开' : '动效 · 关';
  $('motion-toggle').setAttribute('aria-pressed', String(motion()));
  $('motion-toggle').disabled = reduced.matches;
  $('motion-toggle').title = reduced.matches ? '跟随系统减少动态效果设置' : '开关场景动效';
  if (state.stage === 'lesson') {
    const chapter = CHAPTERS.find((item) => item.id === state.chapter);
    $('lesson-title').textContent = chapter.title;
    // Authored local lesson markup; no remote content or user input is parsed.
    if ($('lesson-content').dataset.chapter !== chapter.id) {
      $('lesson-content').innerHTML = chapter.html;
      $('lesson-content').dataset.chapter = chapter.id;
    }
  }
  scene?.update(state);
}
function dispatch(action) {
  const before = state;
  state = reduceState(state, action);
  render();
  if (before.stage !== state.stage) {
    if (state.stage === 'lesson') {
      $('lesson-title').focus({ preventScroll: true });
      $('lesson-panel').scrollIntoView({ behavior: 'instant', block: 'nearest' });
    } else if (state.stage === 'observe') {
      $('study-panel').focus({ preventScroll: true });
      if (before.stage === 'lesson') {
        if (innerWidth <= 900) window.scrollTo({ top: 0, behavior: 'instant' });
        else document.querySelector('.content-column').scrollTop = 0;
      }
    } else if (before.stage === 'observe' || before.stage === 'lesson') {
      $('primary-action').focus({ preventScroll: true });
      if (innerWidth < 900) window.scrollTo({ top: 0, behavior: 'instant' });
    }
  }
}
$('primary-action').onclick = () => dispatch({ type: 'activate' });
$('skip-study').onclick = () => dispatch({ type: 'observe' });
$('back-stage').onclick = () => dispatch({ type: 'back' });
$('lesson-back').onclick = () => dispatch({ type: 'back' });
document.querySelectorAll('#observation-tabs button[data-mode]').forEach((button) => {
  button.onclick = () => dispatch({ type: 'mode', mode: button.dataset.mode });
});
$('probe').oninput = (event) => dispatch({ type: 'probe', value: Number(event.target.value) });
$('motion-toggle').onclick = () => {
  userMotion = !motion();
  render();
  scene?.refresh();
};
reduced.addEventListener('change', () => {
  render();
  scene?.refresh();
});
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') {
    event.preventDefault();
    dispatch({ type: 'back' });
  }
});
function atmosphere() {
  const now = new Date(),
    mood = tokyoMood(now);
  document.body.dataset.mood = mood;
  $('tokyo-time').textContent =
    `${new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Tokyo', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(now)} JST`;
  scene?.setMood(mood);
}
render();
atmosphere();
setInterval(() => {
  if (!document.hidden) atmosphere();
}, 60000);
try {
  const { createLaboratory } = await import('./scene.js?v=31');
  scene = await createLaboratory({
    canvas: $('lab-canvas'),
    anchor,
    activate: () => dispatch({ type: 'activate' }),
    motion,
  });
  scene.update(state);
  atmosphere();
  document.body.dataset.ready = 'true';
} catch (error) {
  console.warn('Laboratory preview:', error);
  anchor.hidden = true;
  $('fallback').hidden = false;
  document.body.dataset.ready = 'fallback';
}
