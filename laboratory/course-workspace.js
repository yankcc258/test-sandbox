import { COURSE, MATH_CATALOG } from './course-data.js?v=32';
import { createCourseSession, compareExample } from './course-session.js?v=32';

const $ = (id) => document.getElementById(id);
function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}
function button(text, action, className = '') {
  const node = element('button', className, text);
  node.type = 'button';
  node.onclick = action;
  return node;
}

export function mountCourseWorkspace({ open, back }) {
  const session = createCourseSession();
  const viewport = document.querySelector('.scene-viewport');
  const main = document.querySelector('.lab-main');
  const content = document.querySelector('.content-column');
  const controls = $('observer-controls');
  const study = $('study-panel');
  const chapterHeading = study.querySelector('.chapter-heading');
  const reader = $('course-reader');
  const practice = $('course-practice');
  let active = false,
    tab = 'reading',
    selectedSection = 'prerequisites';
  let collapsed = innerWidth <= 900;
  const positions = {
    reading: { desktop: 0, mobile: null },
    practice: { desktop: 0, mobile: null },
  };
  let dx = 0.1,
    dy = -0.2;
  const forms = [];
  let entrance = null;

  $('course-title').textContent = COURSE.title;
  const introduction = element('div', 'course-lead');
  introduction.append(
    element('p', 'course-description', COURSE.subtitle),
    element('p', 'course-duration', `预计 ${COURSE.duration} 分钟 · 完整正文与 5 道原题`),
  );
  $('course-reading').append(introduction);

  for (const [index, item] of MATH_CATALOG.entries()) {
    const entry = button(
      '',
      () => open({ id: COURSE.id, mode: 'tangent' }),
      'chapter-entry course-entry',
    );
    entry.dataset.chapter = item.id;
    entry.disabled = !item.available;
    entry.append(
      element('small', '', String(index + 1).padStart(2, '0')),
      element('strong', '', item.title),
      element('span', '', item.available ? '主站完整课程 · 正文 / 练习 / 观察' : '本轮尚未接入'),
      element('b', '', item.available ? '↗' : '—'),
    );
    if (item.available) entry.classList.add('is-available');
    $('chapter-list').append(entry);
  }

  $('course-toc').append(element('p', 'eyebrow', 'CONTENTS / 本章目录'));
  for (const [index, section] of COURSE.sections.entries()) {
    const nav = button(`${String(index + 1).padStart(2, '0')}  ${section.title}`, () =>
      jumpTo(section.id),
    );
    nav.dataset.section = section.id;
    $('course-toc').append(nav);
    const block = element('section', 'course-section');
    block.id = `course-${section.id}`;
    block.tabIndex = -1;
    block.append(element('h2', '', section.title));
    const prose = element('div', 'course-prose');
    // Pinned, authored course HTML, never interpolated user input.
    prose.innerHTML = section.html;
    block.append(prose);
    if (section.id === 'example')
      block.append(button('在侧边对照这个例题 ↗', () => openCase(), 'observation-link'));
    if (section.id === 'concept')
      block.append(button('展开侧边几何示意 ↗', () => setCollapsed(false), 'observation-link'));
    if (section.id === 'review')
      block.append(button('进入本章 5 道练习 →', () => switchTab('practice'), 'primary-action'));
    $('course-reading').append(block);
  }
  const practiceNav = button('练习与检验  →', () => switchTab('practice'));
  practiceNav.dataset.section = 'practice';
  $('course-toc').append(practiceNav);

  function rememberPosition() {
    if (innerWidth <= 900) {
      // The optional observer precedes the text on phones; remember a position
      // inside the active content rather than an absolute document coordinate.
      positions[tab].mobile = Math.max(
        0,
        -$(tab === 'reading' ? 'course-reading' : 'course-practice').getBoundingClientRect().top,
      );
    } else positions[tab].desktop = reader.scrollTop;
  }
  function restorePosition(entry = false) {
    if (!active) return;
    if (innerWidth <= 900) {
      const saved = positions[tab].mobile;
      const panel = $(tab === 'reading' ? 'course-reading' : 'course-practice');
      const top =
        saved === null
          ? entry
            ? 0
            : reader.getBoundingClientRect().top + window.scrollY
          : panel.getBoundingClientRect().top + window.scrollY + saved;
      window.scrollTo({ top, behavior: 'instant' });
    } else reader.scrollTop = positions[tab].desktop;
  }
  function markSection() {
    $('course-toc')
      .querySelectorAll('[data-section]')
      .forEach((node) => {
        const current =
          node.dataset.section === (tab === 'practice' ? 'practice' : selectedSection);
        if (current) node.setAttribute('aria-current', 'location');
        else node.removeAttribute('aria-current');
      });
  }
  function showTab() {
    document.body.dataset.courseTab = tab;
    $('course-reading').hidden = tab !== 'reading';
    practice.hidden = tab !== 'practice';
    document
      .querySelectorAll('.course-tabs button[data-course-tab]')
      .forEach((node) => node.setAttribute('aria-pressed', String(node.dataset.courseTab === tab)));
    markSection();
  }
  function switchTab(next) {
    if (next === tab) return;
    if (active) rememberPosition();
    tab = next;
    showTab();
    restorePosition();
    reader.focus({ preventScroll: true });
  }
  function jumpTo(id) {
    switchTab('reading');
    selectedSection = id;
    markSection();
    const section = $(`course-${id}`);
    section.focus({ preventScroll: true });
    section.scrollIntoView({ behavior: 'instant', block: 'start' });
    rememberPosition();
  }
  function setCollapsed(value) {
    collapsed = value;
    document.body.dataset.observer = value ? 'collapsed' : 'open';
    $('course-observer').hidden = value;
    $('observer-toggle').setAttribute('aria-expanded', String(!value));
    $('observer-toggle').textContent = value ? '展开观察区 ↗' : '收起观察区';
  }
  function openCase() {
    rememberPosition();
    setCollapsed(false);
    $('case-observation').focus({ preventScroll: true });
    $('case-observation').scrollIntoView({ behavior: 'instant', block: 'nearest' });
  }
  $('observer-toggle').onclick = () => setCollapsed(!collapsed);
  $('course-return').onclick = back;
  document
    .querySelectorAll('.course-tabs button[data-course-tab]')
    .forEach((node) => (node.onclick = () => switchTab(node.dataset.courseTab)));
  $('practice-to-reading').onclick = () => switchTab('reading');

  function summary() {
    const result = session.summary();
    $('practice-count').textContent = `${result.correct} / ${result.total}`;
    $('practice-summary').textContent =
      result.checked === result.total
        ? `本轮已检查 ${result.total} 题 · 答对 ${result.correct} / ${result.total}${result.correct === result.total ? '。本轮练习完成。' : '，可修改答案后再次核对。'}`
        : `本轮已检查 ${result.checked} / ${result.total} · 答对 ${result.correct} 题`;
    $('practice-summary').dataset.complete = String(result.correct === result.total);
  }
  for (const question of COURSE.questions) {
    const form = element('form', 'exercise-card');
    form.id = `exercise-${question.index}`;
    form.noValidate = true;
    form.append(
      element(
        'p',
        'eyebrow',
        `EXERCISE ${String(question.index + 1).padStart(2, '0')} / ${question.skill}`,
      ),
    );
    const fieldset = element('fieldset');
    fieldset.append(element('legend', '', question.prompt));
    if (question.type === 'number') {
      const id = `answer-${question.index}`;
      const label = element('label', 'answer-label', '你的答案');
      label.htmlFor = id;
      const input = element('input', 'numeric-answer');
      input.id = id;
      input.name = 'answer';
      input.type = 'text';
      input.inputMode = 'decimal';
      input.autocomplete = 'off';
      input.spellcheck = false;
      input.setAttribute('aria-describedby', `feedback-${question.index}`);
      input.placeholder = '输入数值';
      fieldset.append(label, input);
    } else {
      fieldset.append(element('p', 'question-type', '多选题 · 请选择所有成立的结论'));
      question.choices.forEach((choice, index) => {
        const label = element('label', 'choice-option');
        const input = element('input');
        input.type = 'checkbox';
        input.name = 'answer';
        input.value = String(index);
        label.append(input, element('span', '', choice));
        fieldset.append(label);
      });
    }
    form.append(fieldset);
    const hint = element('details', 'exercise-hints');
    hint.append(element('summary', '', '需要提示'));
    for (const text of question.hints) hint.append(element('p', '', text));
    form.append(hint);
    const actions = element('div', 'exercise-actions');
    const submit = element('button', 'check-answer', '核对答案');
    submit.type = 'submit';
    actions.append(submit);
    if ([1, 2].includes(question.index)) actions.append(button('对照本章算例 ↗', openCase));
    form.append(actions);
    const feedback = element('div', 'answer-feedback');
    feedback.id = `feedback-${question.index}`;
    feedback.setAttribute('role', 'status');
    feedback.hidden = true;
    form.append(feedback);
    const readAnswer = () =>
      question.type === 'number'
        ? form.elements.answer.value
        : [...form.querySelectorAll('input:checked')].map((node) => Number(node.value));
    form.oninput = () => {
      session.setDraft(question.id, readAnswer());
      feedback.hidden = true;
      summary();
    };
    form.onsubmit = (event) => {
      event.preventDefault();
      session.setDraft(question.id, readAnswer());
      const result = session.check(question);
      feedback.replaceChildren();
      feedback.hidden = false;
      feedback.dataset.status = result.status;
      const label = {
        correct: '回答正确',
        partial: '还差一些',
        wrong: '再检查一次',
        invalid: '尚未核对',
      }[result.status];
      feedback.append(element('strong', '', label), element('p', '', result.reason));
      if (result.status !== 'invalid') {
        feedback.append(element('p', 'answer-explanation', question.explanation));
        if (question.choiceExplanations) {
          const list = element('ol');
          question.choiceExplanations.forEach((text, i) =>
            list.append(element('li', '', `${question.choices[i]}：${text}`)),
          );
          feedback.append(list);
        }
        const reinforce = element('details');
        reinforce.append(
          element('summary', '', '再想一步'),
          element('p', '', question.reinforce),
          element('p', '', question.reinforceAnswer),
        );
        feedback.append(reinforce);
      } else form.querySelector('input')?.focus();
      summary();
    };
    $('exercise-list').append(form);
    forms.push(form);
  }
  $('practice-reset').onclick = () => {
    session.reset();
    forms.forEach((form) => {
      form.reset();
      form.querySelector('.answer-feedback').hidden = true;
      form.querySelectorAll('details').forEach((node) => (node.open = false));
    });
    summary();
  };

  const formatted = (value) =>
    (Math.abs(value) < 0.0000005 ? 0 : value).toFixed(6).replace(/\.?0+$/, '') || '0';
  function renderCase() {
    const result = compareExample(dx, dy);
    $('case-dx').value = String(dx);
    $('case-dy').value = String(dy);
    $('case-dx-value').textContent = formatted(dx);
    $('case-dy-value').textContent = formatted(dy);
    $('case-differential').textContent = formatted(result.differential);
    $('case-exact').textContent = formatted(result.exact);
    $('case-error').textContent = formatted(result.error);
    $('case-explanation').textContent =
      `df = 12 × ${formatted(dx)} + 4 × (${formatted(dy)})；精确值由两个状态的函数值相减。`;
  }
  $('case-dx').oninput = (event) => {
    dx = Number(event.target.value);
    renderCase();
  };
  $('case-dy').oninput = (event) => {
    dy = Number(event.target.value);
    renderCase();
  };
  $('case-half').onclick = () => {
    dx /= 2;
    dy /= 2;
    renderCase();
  };
  $('case-reset').onclick = () => {
    dx = 0.1;
    dy = -0.2;
    renderCase();
  };
  $('case-return').onclick = () => {
    restorePosition();
    reader.focus({ preventScroll: true });
  };
  summary();
  showTab();
  renderCase();
  setCollapsed(collapsed);

  return {
    beforeChange(next) {
      // Capture mobile scroll before the stage attribute changes the page layout.
      if (active && next.stage !== 'lesson') rememberPosition();
    },
    update(state) {
      if (document.body.classList.contains('motion-off')) entrance?.cancel();
      const next = state.stage === 'lesson';
      if (next === active) return;
      active = next;
      entrance?.cancel();
      $('course-workspace').hidden = !active;
      if (active) {
        document.querySelector('.observer-stage').append(viewport);
        $('observer-controls-home').append(controls);
        setCollapsed(collapsed);
        showTab();
        restorePosition(true);
        if (!document.body.classList.contains('motion-off')) {
          entrance = $('course-workspace').animate(
            [
              { opacity: 0.55, transform: 'translateY(5px)' },
              { opacity: 1, transform: 'translateY(0)' },
            ],
            { duration: 190, easing: 'cubic-bezier(.2,.7,.2,1)' },
          );
        }
      } else {
        main.insertBefore(viewport, content);
        study.insertBefore(controls, chapterHeading);
      }
    },
    focus() {
      $('course-title').focus({ preventScroll: true });
    },
  };
}
