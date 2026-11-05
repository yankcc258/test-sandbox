import { COURSES, DISCIPLINES, TRACKS, getCourse } from './course-data.js?v=39';
const $ = (id) => document.getElementById(id);
function el(tag, cls, text) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text !== undefined) n.textContent = text;
  return n;
}
export function disciplineCourses(id) {
  const d = DISCIPLINES.find((d) => d.id === id);
  return (d?.tracks ?? []).flatMap((t) =>
    (TRACKS.find((x) => x.id === t)?.units ?? []).map(getCourse).filter(Boolean),
  );
}
export function mountArchive({ select, open, discipline, hover, progress, visits }) {
  let state = null,
    query = '',
    track = '',
    detailTab = 'overview',
    labelOrder = '';
  const labels = new Map();
  const overlay = el('nav', 'chapter-labels');
  overlay.setAttribute('aria-label', '章节目录');
  overlay.setAttribute('aria-describedby', 'archive-legend');
  overlay.hidden = true;
  const directoryTitle = el('p', 'chapter-labels-title');
  overlay.append(directoryTitle);
  document.querySelector('.lab-main').append(overlay);
  const progressText = (id) => {
    const p = progress(id);
    return `${p.read ? '已读' : '未标记读完'} · 最近答对 ${p.correct}/${p.total}`;
  };
  const resultNames = {
    unanswered: '未作答',
    correct: '答对',
    wrong: '待再试',
    partial: '部分答对',
    unknown: '未判定',
  };
  const resultText = (id) =>
    progress(id)
      .results.map((status, i) => `第 ${i + 1} 题${resultNames[status] ?? '未判定'}`)
      .join('，');
  const describeChapter = (button, course) => {
    button.setAttribute(
      'aria-label',
      `${course.title}；${progressText(course.id)}。本页最近结果：${resultText(course.id)}。`,
    );
  };
  function marks(id) {
    const p = progress(id),
      row = el('span', 'question-marks');
    row.setAttribute('aria-hidden', 'true');
    for (const [index, status] of p.results.entries()) {
      const mark = el('i');
      mark.dataset.result = status;
      mark.title = `第 ${index + 1} 题：${resultNames[status] ?? '未判定'}`;
      row.append(mark);
    }
    row.dataset.read = String(p.read);
    return row;
  }
  const selectCourse = (id) => {
    detailTab = 'overview';
    select(getCourse(id));
  };
  for (const c of COURSES) {
    const b = el('button', 'chapter-label');
    b.type = 'button';
    b.dataset.chapter = c.id;
    b.hidden = true;
    b.append(
      el('span', 'label-leader'),
      el('strong', '', c.title.split('：')[0]),
      el('small', '', progressText(c.id)),
      marks(c.id),
    );
    b.onclick = () => selectCourse(c.id);
    b.onpointerenter = () => hover(c.id);
    b.onpointerleave = () => hover(null);
    b.onfocus = () => hover(c.id);
    b.onblur = () => hover(null);
    b.onkeydown = (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        open(c);
      } else navigate(e, c.id);
    };
    overlay.append(b);
    labels.set(c.id, b);
  }
  const chooseDiscipline = (id) => {
    query = '';
    track = '';
    $('archive-search').value = '';
    $('archive-track').value = '';
    discipline(id);
  };
  for (const d of DISCIPLINES) {
    const b = el('button', 'discipline-button');
    b.type = 'button';
    b.dataset.discipline = d.id;
    b.append(
      el('span', '', d.name),
      el(
        'small',
        '',
        disciplineCourses(d.id).length ? `${disciplineCourses(d.id).length} 章` : '规划中',
      ),
    );
    b.onclick = () => chooseDiscipline(d.id);
    b.onkeydown = (e) => {
      if (['ArrowLeft', 'ArrowRight'].includes(e.key)) navigate(e, null);
      else if (e.key === 'ArrowDown') {
        e.preventDefault();
        const first = filtered()[0];
        if (first) focusChapter(first.id);
      }
    };
    $('discipline-list').append(b);
  }
  $('archive-search').oninput = (e) => {
    query = e.target.value.trim().toLocaleLowerCase();
    renderList();
  };
  $('archive-track').onchange = (e) => {
    track = e.target.value;
    renderList();
  };
  $('archive-clear').onclick = () => {
    query = '';
    track = '';
    $('archive-search').value = '';
    $('archive-track').value = '';
    renderList();
  };
  function filtered() {
    return (query ? COURSES : disciplineCourses(state.discipline)).filter(
      (c) =>
        (!track || c.track === track) &&
        (!query || `${c.title} ${c.id} ${c.subtitle}`.toLocaleLowerCase().includes(query)),
    );
  }
  function navigate(e, id) {
    if (!['ArrowDown', 'ArrowUp', 'ArrowLeft', 'ArrowRight'].includes(e.key)) return;
    e.preventDefault();
    if (['ArrowLeft', 'ArrowRight'].includes(e.key)) {
      const ds = DISCIPLINES;
      const i = ds.findIndex((d) => d.id === state.discipline);
      const nextId = ds[(i + (e.key === 'ArrowRight' ? 1 : -1) + ds.length) % ds.length].id;
      chooseDiscipline(nextId);
      document
        .querySelector(`.discipline-button[data-discipline="${nextId}"]`)
        ?.focus({ preventScroll: true });
      return;
    }
    const list = filtered(),
      index = list.findIndex((c) => c.id === id),
      next = list[(index + (e.key === 'ArrowDown' ? 1 : -1) + list.length) % list.length];
    if (next) {
      selectCourse(next.id);
      focusChapter(next.id);
    }
  }
  function focusChapter(id) {
    const label = labels.get(id);
    const node =
      label?.getClientRects().length && !label.hidden
        ? label
        : $('chapter-list').querySelector(`[data-chapter="${id}"]`);
    node?.focus({ preventScroll: true });
    if (node && overlay.contains(node)) {
      const item = node.getBoundingClientRect(),
        viewport = overlay.getBoundingClientRect();
      if (item.top < viewport.top + 6) overlay.scrollTop += item.top - viewport.top - 6;
      else if (item.bottom > viewport.bottom - 6)
        overlay.scrollTop += item.bottom - viewport.bottom + 6;
    }
  }
  function renderLabels() {
    const courses = disciplineCourses(state.discipline),
      active = new Set(courses.map((c) => c.id)),
      order = courses.map((c) => c.id).join('|'),
      d = DISCIPLINES.find((d) => d.id === state.discipline);
    overlay.hidden = state.stage !== 'observe' || !!query || !!track || !courses.length;
    overlay.setAttribute('aria-label', `${d.name}章节目录`);
    directoryTitle.textContent = `${d.name} · ${courses.length} 章`;
    for (const [id, button] of labels) {
      button.hidden = !active.has(id);
      if (!active.has(id)) continue;
      button.querySelector('small').textContent = progressText(id);
      button.querySelector('.question-marks').replaceWith(marks(id));
      button.setAttribute('aria-pressed', String(id === state.chapter));
      describeChapter(button, getCourse(id));
    }
    // Reorder only when the subject changes. A progress refresh must preserve
    // the focused button and its position in this scrollable DOM directory.
    if (order !== labelOrder) {
      for (const c of courses) overlay.append(labels.get(c.id));
      overlay.scrollTop = 0;
      labelOrder = order;
    }
  }
  function renderList() {
    const focused = document.activeElement?.closest('#chapter-list [data-chapter]')?.dataset
      .chapter;
    const list = filtered();
    document.body.dataset.archiveSearch = String(
      !!query || !!track || !disciplineCourses(state.discipline).length,
    );
    document.body.dataset.catalogDensity =
      disciplineCourses(state.discipline).length > 6 ? 'dense' : 'normal';
    renderLabels();
    $('chapter-list').replaceChildren();
    $('archive-count').textContent = `${list.length} 章 · 本页试学`;
    if (!list.length) {
      const d = DISCIPLINES.find((d) => d.id === state.discipline);
      $('chapter-list').append(
        el(
          'p',
          'archive-empty',
          query ? '没有匹配的章节。' : `此学科尚无课程。规划方向：${d.planned.join('、')}。`,
        ),
      );
      return;
    }
    for (const c of list) {
      const b = el('button', 'chapter-entry archive-entry');
      b.type = 'button';
      b.dataset.chapter = c.id;
      b.setAttribute('aria-pressed', String(c.id === state.chapter));
      describeChapter(b, c);
      b.append(
        el('small', '', String(COURSES.indexOf(c) + 1).padStart(2, '0')),
        el('strong', '', c.title),
        el('span', '', progressText(c.id)),
        marks(c.id),
      );
      b.onclick = () => selectCourse(c.id);
      b.onpointerenter = () => hover(c.id);
      b.onpointerleave = () => hover(null);
      b.onfocus = () => hover(c.id);
      b.onblur = () => hover(null);
      b.onkeydown = (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          open(c);
        } else navigate(e, c.id);
      };
      $('chapter-list').append(b);
    }
    if (focused) focusChapter(focused);
  }
  function renderDetails() {
    const focusTab = document.activeElement?.dataset.detailTab;
    const target = $('chapter-detail');
    target.replaceChildren();
    const c = getCourse(state.chapter);
    if (!c) {
      target.hidden = true;
      return;
    }
    target.hidden = false;
    target.append(el('p', 'eyebrow', 'SELECTED CHAPTER / 观察与学习'), el('h2', '', c.title));
    const tabs = el('div', 'archive-detail-tabs');
    tabs.setAttribute('role', 'group');
    tabs.setAttribute('aria-label', '章节详情');
    for (const [id, name] of [
      ['overview', '概述'],
      ['history', '学习记录'],
      ['prerequisites', '先修'],
    ]) {
      const b = el('button', '', name);
      b.type = 'button';
      b.dataset.detailTab = id;
      b.setAttribute('aria-pressed', String(detailTab === id));
      b.onclick = () => {
        detailTab = id;
        renderDetails();
      };
      tabs.append(b);
    }
    target.append(tabs);
    const body = el('div', 'archive-detail-body');
    if (detailTab === 'overview') {
      body.append(
        el('p', '', c.subtitle),
        el(
          'p',
          'detail-meta',
          `约 ${c.duration} 分钟 · ${c.questions.length} 道原题 · ${progressText(c.id)}`,
        ),
      );
    }
    if (detailTab === 'prerequisites') {
      const section = c.sections.find((s) => s.id === 'prerequisites');
      if (section) {
        const prose = el('div', 'course-prose');
        prose.innerHTML = section.html;
        body.append(prose);
      } else body.append(el('p', '', '见课程正文中的学习目标。'));
    }
    if (detailTab === 'history') {
      body.append(el('p', '', `${progressText(c.id)}。以下是本页访问记录，刷新清空。`));
      const log = visits(c.id);
      for (const v of log.slice(0, 5)) {
        body.append(
          el(
            'p',
            'detail-meta',
            `${new Intl.DateTimeFormat('zh-CN', { timeZone: 'Asia/Tokyo', hour: '2-digit', minute: '2-digit', second: '2-digit' }).format(v.time)} JST · ${v.action === 'study' ? '进入学习' : '查看详情'}`,
          ),
        );
      }
    }
    target.append(body);
    const start = el('button', 'primary-action', '开始学习 →');
    start.type = 'button';
    start.id = 'start-learning';
    start.onclick = () => open(c);
    target.append(start, el('p', 'detail-meta', '可立即进入；组装动画不会阻塞学习。'));
    if (focusTab)
      target.querySelector(`[data-detail-tab="${focusTab}"]`)?.focus({ preventScroll: true });
  }
  function refresh() {
    if (!state) return;
    renderList();
    renderDetails();
  }
  return {
    labels,
    refresh,
    update(next) {
      const changed = !state || state.discipline !== next.discipline;
      state = next;
      $('discipline-list').hidden = state.stage === 'lesson';
      document
        .querySelectorAll('[data-discipline]')
        .forEach((b) =>
          b.setAttribute('aria-pressed', String(b.dataset.discipline === state.discipline)),
        );
      if (changed) {
        track = '';
        $('archive-track').replaceChildren(new Option('全部方向', ''));
        for (const t of TRACKS.filter((t) =>
          DISCIPLINES.find((d) => d.id === state.discipline).tracks.includes(t.id),
        ))
          $('archive-track').append(new Option(t.name, t.id));
      }
      refresh();
    },
  };
}
