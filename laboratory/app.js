import { initialState, reduceState, tokyoMood } from './state.js?v=34';
import { DISCIPLINES, getCourse } from './course-data.js?v=34';
import { mountCourseWorkspace } from './course-workspace.js?v=34';
import { mountArchive, disciplineCourses } from './archive.js?v=34';
import { buildModelPoses } from './assembly-models.js?v=34';
const $ = (id) => document.getElementById(id);
let state = initialState(),
  scene = null,
  archive = null;
let userMotion = new URLSearchParams(location.search).get('motion') !== '0';
const reduced = matchMedia('(prefers-reduced-motion: reduce)'),
  motion = () => userMotion && !reduced.matches;
const parameters = new Map();
const defaultProbe = (id) => parameters.get(id) ?? buildModelPoses(id).metadata.probeDefault;
const anchor = document.createElement('button');
anchor.type = 'button';
anchor.id = 'math-anchor';
anchor.className = 'model-anchor';
anchor.onclick = () => dispatch({ type: 'activate' });
document.querySelector('.scene-viewport').append(anchor);
const open = (c) => {
  if (c) dispatch({ type: 'chapter', chapter: c, probe: defaultProbe(c.id) });
};
const workspace = mountCourseWorkspace({
  open,
  back: () => dispatch({ type: 'back' }),
  onProgress: () => {
    archive?.refresh();
    scene?.refresh();
  },
});
archive = mountArchive({
  select: (c) => {
    if (!c) return;
    workspace.recordVisit(c.id, 'details');
    dispatch({ type: 'select', chapter: c, probe: defaultProbe(c.id) });
  },
  open,
  discipline: (id) => dispatch({ type: 'discipline', id }),
  hover: (id) => scene?.setHover(id),
  progress: (id) => workspace.getProgress(id),
  visits: (id) => workspace.getVisits(id),
});
function render() {
  document.body.dataset.stage = state.stage;
  document.body.dataset.selection = String(!!state.chapter);
  document.body.classList.toggle('motion-off', !motion());
  const d = DISCIPLINES.find((d) => d.id === state.discipline),
    inside = ['observe', 'lesson'].includes(state.stage);
  $('scene-subject').textContent = d.en;
  $('stage-eyebrow').textContent =
    state.stage === 'overview'
      ? 'ZHIXU / FIELD OF STUDY'
      : `${d.en} / ${state.stage === 'focus' ? 'FOCUS' : 'COURSE ARCHIVE'}`;
  const title =
    state.stage === 'overview'
      ? '从结构，进入理解。'
      : state.stage === 'focus'
        ? `${d.name}，近一些。`
        : `${d.name} · 学科目录`;
  $('stage-title').replaceChildren(
    ...title.match(/[^，]+，?/g).map((part) => {
      const span = document.createElement('span');
      span.textContent = part;
      return span;
    }),
  );
  $('stage-copy').textContent =
    state.stage === 'overview'
      ? '沿着同一条螺旋，找到学科、章节和正在理解的问题。'
      : state.stage === 'focus'
        ? '再点一次，这一段薄片按章节松开。也可以直接进入目录。'
        : '选一章，薄片在身旁组成观察对象。';
  $('primary-action').hidden = inside;
  $('skip-study').hidden = inside;
  $('primary-action').textContent = state.stage === 'overview' ? `聚焦${d.name} →` : '展开章节 →';
  $('back-stage').hidden = state.stage === 'overview';
  $('back-stage').textContent = '← 收拢回总览';
  $('study-panel').hidden = !inside;
  $('chapters-title').textContent = `${d.name} · 课程目录`;
  anchor.hidden = inside || !scene;
  anchor.textContent = `${d.name} · ${state.stage === 'overview' ? '聚焦' : '展开'} ↗`;
  $('lab-canvas').setAttribute(
    'aria-label',
    inside
      ? '螺旋章节目录与所选观察对象，可拖动旋转；下方有完整文字目录'
      : `${d.name}螺旋，点击聚焦后再点击展开章节`,
  );
  $('motion-toggle').textContent = motion() ? '动效 · 开' : '动效 · 关';
  $('motion-toggle').setAttribute('aria-pressed', String(motion()));
  $('motion-toggle').disabled = reduced.matches;
  $('interaction-hint').textContent = inside
    ? '点击章节选中 · Enter 直接学习 · ↑↓ 换章 · Esc 返回'
    : '点按聚焦 / 展开 · 拖动旋转 · 下方选择学科';
  workspace.update(state);
  $('observer-controls').hidden = !state.chapter;
  if (state.chapter) {
    const model = buildModelPoses(state.chapter, state.probe),
      m = model.metadata;
    $('probe').min = m.probeMin;
    $('probe').max = m.probeMax;
    $('probe').step = m.probeStep;
    $('probe').value = state.probe;
    $('probe').disabled = !m.interactive;
    document.querySelector('.probe-control').hidden = !m.interactive;
    $('probe-label').textContent = m.probeLabel;
    $('probe-value').textContent = Number(state.probe.toFixed(3));
    $('probe').setAttribute('aria-valuetext', `${m.probeLabel} ${state.probe}`);
    const limits = document.querySelector('.probe-limits');
    limits.firstElementChild.textContent = m.probeMin;
    limits.lastElementChild.textContent = m.probeMax;
    limits.children[1].textContent = '';
    $('specimen-note').textContent = m.readout || m.description;
    document.querySelector('.observer-heading h2').textContent = m.title;
    document.querySelector('.observation-disclaimer').textContent = m.description;
  }
  archive.update(state);
  scene?.update(state);
}
function dispatch(action) {
  const before = state;
  const next = reduceState(state, action);
  workspace.beforeChange(next);
  state = next;
  render();
  if (action.type === 'select') {
    if (innerWidth > 900) document.querySelector('.content-column').scrollTop = 0;
    else
      document
        .querySelector('.scene-viewport')
        .scrollIntoView({ behavior: 'instant', block: 'start' });
  }
  if (before.stage !== state.stage) {
    if (state.stage === 'lesson') workspace.focus();
    else if (state.stage === 'observe') {
      if (before.stage === 'lesson' && innerWidth <= 900)
        window.scrollTo({ top: 0, behavior: 'instant' });
      $('study-panel').focus({ preventScroll: true });
    } else {
      $('primary-action').focus({ preventScroll: true });
      if (innerWidth <= 900) window.scrollTo({ top: 0, behavior: 'instant' });
    }
  }
}
$('primary-action').onclick = () => dispatch({ type: 'activate' });
$('skip-study').onclick = () => dispatch({ type: 'observe' });
$('back-stage').onclick = () => dispatch({ type: 'back' });
$('probe').oninput = (e) => {
  const v = Number(e.target.value);
  parameters.set(state.chapter, v);
  dispatch({ type: 'probe', value: v });
};
$('motion-toggle').onclick = () => {
  userMotion = !motion();
  render();
};
reduced.addEventListener('change', render);
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    e.preventDefault();
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
  const { createLaboratory } = await import('./scene.js?v=34');
  scene = await createLaboratory({
    canvas: $('lab-canvas'),
    anchor,
    activate: () => dispatch({ type: 'activate' }),
    motion,
    labels: archive.labels,
    courses: disciplineCourses,
    progress: (id) => workspace.getProgress(id),
    select: (id) => {
      const c = getCourse(id);
      workspace.recordVisit(c.id, 'details');
      dispatch({ type: 'select', chapter: c, probe: defaultProbe(c.id) });
    },
  });
  scene.update(state);
  atmosphere();
  document.body.dataset.ready = 'true';
  render();
} catch (error) {
  console.warn('Laboratory preview:', error);
  anchor.hidden = true;
  $('fallback').hidden = false;
  document.body.dataset.ready = 'fallback';
}
