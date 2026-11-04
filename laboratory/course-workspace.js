import { COURSES, getCourse } from './course-data.js?v=36';
import { createCourseSessions, compareExample } from './course-session.js?v=36';

const $ = (id) => document.getElementById(id);
const chapterId = (state) =>
  typeof state.chapter === 'string' ? state.chapter : state.chapter?.id;
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

export function mountCourseWorkspace({ open, back, onProgress: initialListener }) {
  const sessions = createCourseSessions();
  const views = new Map();
  const listeners = new Set();
  if (typeof initialListener === 'function') listeners.add(initialListener);
  const changedIds = new Set();
  let notificationQueued = false;

  // Notifications run after the current render/event. A directory may render in
  // its callback without re-entering workspace.update while it is building DOM.
  function notify(id) {
    if (!id) return;
    changedIds.add(id);
    if (notificationQueued) return;
    notificationQueued = true;
    queueMicrotask(() => {
      notificationQueued = false;
      const ids = [...changedIds];
      changedIds.clear();
      for (const listener of listeners) listener({ ids, scope: 'page' });
    });
  }
  function recordVisit(id, action) {
    const visit = sessions.recordVisit(id, action);
    if (visit) notify(id);
    return visit;
  }

  const viewport = document.querySelector('.scene-viewport');
  const controls = $('observer-controls');
  const viewportHome = document.createComment('course viewport home');
  const controlsHome = document.createComment('course controls home');
  viewport.before(viewportHome);
  controls.before(controlsHome);
  const reader = $('course-reader');
  const reading = $('course-reading');
  const practice = $('course-practice');
  const observer = $('course-observer');
  let active = false;
  let course = null;
  let session = null;
  let view = null;
  let forms = [];
  let entrance = null;
  let restoreVersion = 0;
  let dx = 0.1;
  let dy = -0.2;

  function viewFor(id) {
    if (!views.has(id)) {
      views.set(id, {
        tab: 'reading',
        selectedSection: 'prerequisites',
        collapsed: innerWidth <= 900,
        positions: {
          reading: { desktop: 0, mobile: null, anchor: null },
          practice: { desktop: 0, mobile: null, anchor: null },
        },
        observerScroll: 0,
        details: new Set(),
      });
    }
    return views.get(id);
  }

  const sessionBar = element('div', 'course-session-bar');
  const progressText = element('p', 'course-page-progress');
  progressText.id = 'course-page-progress';
  progressText.setAttribute('role', 'status');
  const readToggle = button(
    '标记本章读完',
    () => {
      if (!session) return;
      session.setRead(!session.progress().read);
      renderProgress();
      notify(course.id);
    },
    'course-read-toggle',
  );
  readToggle.id = 'course-read-toggle';
  readToggle.setAttribute('aria-describedby', 'course-page-progress');
  sessionBar.append(progressText, readToggle);
  document.querySelector('.course-header').after(sessionBar);

  function captureDetails() {
    if (!view) return;
    view.details = new Set(
      [...reader.querySelectorAll('details[data-detail-key][open]')].map(
        (node) => node.dataset.detailKey,
      ),
    );
  }
  function tagDetail(node, key) {
    node.dataset.detailKey = key;
    node.open = view.details.has(key);
  }

  function rememberPosition() {
    if (!active || !view) return;
    captureDetails();
    const panel = view.tab === 'reading' ? reading : practice;
    const position = view.positions[view.tab];
    const mobile = innerWidth <= 900;
    const frameTop = mobile
      ? 0
      : reader.getBoundingClientRect().top + document.querySelector('.course-tabs').offsetHeight;
    const candidates = [...panel.querySelectorAll('.course-section, .exercise-card')];
    let anchor = candidates[0];
    for (const node of candidates) {
      if (node.getBoundingClientRect().top <= frameTop + 2) anchor = node;
      else break;
    }
    position.anchor = anchor
      ? { id: anchor.id, offset: anchor.getBoundingClientRect().top - frameTop }
      : null;
    if (mobile) {
      position.mobile =
        window.scrollY <= 1 ? null : Math.max(0, -panel.getBoundingClientRect().top);
      if (position.mobile === null) position.anchor = null;
    } else {
      position.desktop = reader.scrollTop;
      if (reader.scrollTop <= 1) position.anchor = null;
    }
    view.observerScroll = observer.scrollTop;
  }

  function restorePosition(entry = false) {
    if (!active || !view) return;
    const position = view.positions[view.tab];
    const mobile = innerWidth <= 900;
    const anchor = position.anchor && $(position.anchor.id);
    if (anchor) {
      // Restore a section/question and its visual offset. This stays meaningful
      // when a different chapter, header height or observer layout intervenes.
      const frameTop = mobile
        ? 0
        : reader.getBoundingClientRect().top + document.querySelector('.course-tabs').offsetHeight;
      const delta = anchor.getBoundingClientRect().top - frameTop - position.anchor.offset;
      if (mobile)
        window.scrollTo({ top: Math.max(0, window.scrollY + delta), behavior: 'instant' });
      else reader.scrollTop += delta;
    } else if (mobile) {
      const panel = view.tab === 'reading' ? reading : practice;
      const top =
        position.mobile === null
          ? entry
            ? 0
            : reader.getBoundingClientRect().top + window.scrollY
          : panel.getBoundingClientRect().top + window.scrollY + position.mobile;
      window.scrollTo({ top: Math.max(0, top), behavior: 'instant' });
    } else reader.scrollTop = position.desktop;
    observer.scrollTop = view.observerScroll;
  }

  function restoreAfterRender(entry = false) {
    const version = ++restoreVersion;
    const id = course?.id;
    const tab = view?.tab;
    queueMicrotask(() => {
      if (version !== restoreVersion || !active || course?.id !== id || view?.tab !== tab) return;
      // Root sets the model title, description and probe controls after update.
      // Let that layout settle before restoring a mobile reading position.
      restorePosition(entry);
    });
  }

  function markSection() {
    if (!view) return;
    $('course-toc')
      .querySelectorAll('[data-section]')
      .forEach((node) => {
        const current =
          node.dataset.section === (view.tab === 'practice' ? 'practice' : view.selectedSection);
        if (current) node.setAttribute('aria-current', 'location');
        else node.removeAttribute('aria-current');
      });
  }
  function showTab() {
    document.body.dataset.courseTab = view.tab;
    reading.hidden = view.tab !== 'reading';
    practice.hidden = view.tab !== 'practice';
    document.querySelectorAll('.course-tabs button[data-course-tab]').forEach((node) => {
      node.setAttribute('aria-pressed', String(node.dataset.courseTab === view.tab));
    });
    markSection();
  }
  function switchTab(next) {
    if (!view || !['reading', 'practice'].includes(next) || next === view.tab) return;
    rememberPosition();
    view.tab = next;
    showTab();
    restorePosition();
    reader.focus({ preventScroll: true });
  }
  function jumpTo(id) {
    switchTab('reading');
    view.selectedSection = id;
    markSection();
    const section = $('course-' + id);
    if (!section) return;
    section.focus({ preventScroll: true });
    section.scrollIntoView({ behavior: 'instant', block: 'start' });
    rememberPosition();
  }
  function applyCollapsed(value) {
    if (!view) return;
    view.collapsed = Boolean(value);
    document.body.dataset.observer = value ? 'collapsed' : 'open';
    observer.hidden = Boolean(value);
    $('observer-toggle').setAttribute('aria-expanded', String(!value));
    $('observer-toggle').textContent = value ? '展开观察区 ↗' : '收起观察区';
  }
  function expandObserver() {
    rememberPosition();
    applyCollapsed(false);
    restorePosition();
  }
  function openCase() {
    if (course?.id !== 'math-partials') return;
    rememberPosition();
    applyCollapsed(false);
    $('case-observation').focus({ preventScroll: true });
    $('case-observation').scrollIntoView({ behavior: 'instant', block: 'nearest' });
  }

  function renderProgress() {
    if (!session) return;
    const result = session.progress();
    const complete = result.total > 0 && result.correct === result.total;
    $('practice-count').textContent = result.correct + ' / ' + result.total;
    $('practice-summary').textContent =
      '本页已核对 ' +
      result.checked +
      ' / ' +
      result.total +
      ' · 最近答对 ' +
      result.correct +
      ' 题' +
      (complete ? '。本章本轮练习完成。' : '。可修改答案后再次核对。');
    $('practice-summary').dataset.complete = String(complete);
    progressText.textContent =
      '仅本页 · ' +
      (result.read ? '已手动标记读完' : '尚未标记读完') +
      ' · 最近答对 ' +
      result.correct +
      ' / ' +
      result.total;
    readToggle.textContent = result.read ? '撤销本章已读' : '标记本章读完';
    readToggle.setAttribute('aria-pressed', String(result.read));
  }

  function renderFeedback(feedback, question, result) {
    feedback.replaceChildren();
    feedback.hidden = !result;
    if (!result) return;
    feedback.dataset.status = result.status;
    const labels = {
      correct: '回答正确',
      partial: '还差一些',
      wrong: '再检查一次',
      unknown: '请对照解析',
      invalid: '尚未核对',
    };
    feedback.append(
      element('strong', '', labels[result.status] || '核对结果'),
      element('p', '', result.reason || ''),
    );
    if (result.status === 'invalid') return;
    if (question.explanation)
      feedback.append(element('p', 'answer-explanation', question.explanation));
    if (question.choiceExplanations?.length) {
      const list = element('ol');
      question.choiceExplanations.forEach((text, index) => {
        list.append(element('li', '', question.choices[index] + '：' + text));
      });
      feedback.append(list);
    }
    if (question.reinforce || question.reinforceAnswer) {
      const reinforce = element('details');
      reinforce.append(element('summary', '', '再想一步'));
      if (question.reinforce) reinforce.append(element('p', '', question.reinforce));
      if (question.reinforceAnswer) reinforce.append(element('p', '', question.reinforceAnswer));
      tagDetail(reinforce, question.id + ':reinforce');
      feedback.append(reinforce);
    }
  }

  function buildExercises() {
    forms = [];
    $('exercise-list').replaceChildren();
    const owner = session;
    const ownerId = course.id;
    for (const question of course.questions) {
      const form = element('form', 'exercise-card');
      form.id = 'exercise-' + question.index;
      form.dataset.question = question.id;
      form.noValidate = true;
      form.append(
        element(
          'p',
          'eyebrow',
          'EXERCISE ' +
            String(question.index + 1).padStart(2, '0') +
            (question.skill ? ' / ' + question.skill : ''),
        ),
      );
      const fieldset = element('fieldset');
      fieldset.append(element('legend', '', question.prompt));
      const draft = owner.getDraft(question.id);
      const choice = question.type === 'single' || question.type === 'multi';
      if (choice) {
        fieldset.append(
          element(
            'p',
            'question-type',
            question.type === 'single' ? '单选题 · 请选择一项' : '多选题 · 请选择所有成立的结论',
          ),
        );
        question.choices.forEach((text, index) => {
          const label = element('label', 'choice-option');
          const input = element('input');
          input.type = question.type === 'single' ? 'radio' : 'checkbox';
          input.name = 'answer';
          input.value = String(index);
          input.checked = Array.isArray(draft) && draft.includes(index);
          label.append(input, element('span', '', text));
          fieldset.append(label);
        });
      } else {
        const id = 'answer-' + question.index;
        const label = element(
          'label',
          'answer-label',
          '你的答案' + (question.unit ? '（' + question.unit + '）' : ''),
        );
        label.htmlFor = id;
        const input = element(
          'input',
          question.type === 'number' ? 'numeric-answer' : 'text-answer',
        );
        input.id = id;
        input.name = 'answer';
        input.type = 'text';
        input.inputMode = question.type === 'number' && !question.unit ? 'decimal' : 'text';
        input.autocomplete = 'off';
        input.spellcheck = false;
        input.setAttribute('aria-describedby', 'feedback-' + question.index);
        input.placeholder =
          question.type === 'number'
            ? question.unit
              ? '输入数值，可附单位'
              : '输入数值'
            : question.type === 'expression'
              ? '输入含 x 的表达式'
              : '输入文字答案';
        input.value = draft === undefined ? '' : String(draft);
        fieldset.append(label, input);
      }
      form.append(fieldset);
      if (question.hints?.length) {
        const hint = element('details', 'exercise-hints');
        hint.append(element('summary', '', '需要提示'));
        for (const text of question.hints) hint.append(element('p', '', text));
        tagDetail(hint, question.id + ':hints');
        form.append(hint);
      }
      const actions = element('div', 'exercise-actions');
      const submit = element('button', 'check-answer', '核对答案');
      submit.type = 'submit';
      actions.append(submit);
      if (ownerId === 'math-partials' && [1, 2].includes(question.index)) {
        actions.append(button('对照本章算例 ↗', openCase));
      }
      form.append(actions);
      const feedback = element('div', 'answer-feedback');
      feedback.id = 'feedback-' + question.index;
      feedback.setAttribute('role', 'status');
      form.append(feedback);
      renderFeedback(feedback, question, owner.getResult(question.id));
      const readAnswer = () =>
        choice
          ? [...form.querySelectorAll('input:checked')].map((node) => Number(node.value))
          : form.querySelector('[name="answer"]').value;
      form.oninput = () => {
        owner.setDraft(question.id, readAnswer());
        feedback.hidden = true;
        renderProgress();
        notify(ownerId);
      };
      form.onsubmit = (event) => {
        event.preventDefault();
        captureDetails();
        owner.setDraft(question.id, readAnswer());
        const result = owner.check(question);
        renderFeedback(feedback, question, result);
        if (result.status === 'invalid') form.querySelector('input')?.focus();
        renderProgress();
        notify(ownerId);
      };
      $('exercise-list').append(form);
      forms.push(form);
    }
  }

  function buildCourse(nextCourse) {
    course = nextCourse;
    session = sessions.get(course.id);
    view = viewFor(course.id);
    document.body.dataset.courseId = course.id;
    $('course-title').textContent = course.title;
    document.querySelector('.course-heading .eyebrow').textContent =
      'COURSE / ' +
      String(COURSES.findIndex((item) => item.id === course.id) + 1).padStart(2, '0') +
      ' · ' +
      course.subject;
    $('course-scope').textContent = '主站课程快照 · 阅读与作答仅本页有效，刷新清空';
    $('case-observation').hidden = course.id !== 'math-partials';
    reading.replaceChildren();
    $('course-toc').replaceChildren(element('p', 'eyebrow', 'CONTENTS / 本章目录'));
    const introduction = element('div', 'course-lead');
    if (course.subtitle) introduction.append(element('p', 'course-description', course.subtitle));
    const duration = Number.isFinite(course.duration) ? '预计 ' + course.duration + ' 分钟 · ' : '';
    introduction.append(
      element(
        'p',
        'course-duration',
        duration + '完整正文与 ' + course.questions.length + ' 道原题',
      ),
    );
    reading.append(introduction);
    for (const [index, section] of course.sections.entries()) {
      const nav = button(String(index + 1).padStart(2, '0') + '  ' + section.title, () =>
        jumpTo(section.id),
      );
      nav.dataset.section = section.id;
      $('course-toc').append(nav);
      const block = element('section', 'course-section');
      block.id = 'course-' + section.id;
      block.tabIndex = -1;
      block.append(element('h2', '', section.title));
      const prose = element('div', 'course-prose');
      // Only pinned authored HTML enters this document; user answers are text.
      prose.innerHTML = section.html;
      prose.querySelectorAll('details').forEach((node, detailIndex) => {
        tagDetail(node, section.id + ':reading:' + detailIndex);
      });
      block.append(prose);
      if (course.id === 'math-partials' && section.id === 'example') {
        block.append(button('在侧边对照这个例题 ↗', openCase, 'observation-link'));
      }
      if (section.id === 'concept') {
        block.append(button('展开侧边观察区 ↗', expandObserver, 'observation-link'));
      }
      if (section.id === 'review') {
        block.append(
          button(
            '进入本章 ' + course.questions.length + ' 道练习 →',
            () => switchTab('practice'),
            'primary-action',
          ),
        );
      }
      reading.append(block);
    }
    if (!course.sections.some((section) => section.id === view.selectedSection)) {
      view.selectedSection = course.sections[0]?.id || '';
    }
    const practiceNav = button('练习与检验  →', () => switchTab('practice'));
    practiceNav.dataset.section = 'practice';
    $('course-toc').append(practiceNav);
    buildExercises();
    renderProgress();
  }

  $('observer-toggle').onclick = () => {
    if (!view) return;
    rememberPosition();
    applyCollapsed(!view.collapsed);
    restorePosition();
  };
  $('course-return').onclick = back;
  document.querySelectorAll('.course-tabs button[data-course-tab]').forEach((node) => {
    node.onclick = () => switchTab(node.dataset.courseTab);
  });
  $('practice-to-reading').onclick = () => switchTab('reading');
  $('practice-reset').onclick = () => {
    if (!session) return;
    session.reset();
    forms.forEach((form) => {
      form.reset();
      form.querySelector('.answer-feedback').hidden = true;
      form.querySelectorAll('details').forEach((node) => (node.open = false));
    });
    captureDetails();
    renderProgress();
    notify(course.id);
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
      'df = 12 × ' +
      formatted(dx) +
      ' + 4 × (' +
      formatted(dy) +
      ')；精确值由两个状态的函数值相减。';
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
  renderCase();

  return {
    beforeChange(next) {
      // Capture before the root changes stage attributes or swaps the course.
      if (active && (next.stage !== 'lesson' || chapterId(next) !== course.id)) {
        restoreVersion++;
        rememberPosition();
      }
    },
    update(state) {
      if (document.body.classList.contains('motion-off')) entrance?.cancel();
      const requested = state.stage === 'lesson' ? getCourse(chapterId(state)) : null;
      const nextActive = Boolean(requested);
      const changedCourse = requested && requested.id !== course?.id;
      if (nextActive === active && !changedCourse) return;
      const wasActive = active;
      entrance?.cancel();
      active = nextActive;
      $('course-workspace').hidden = !active;
      if (active) {
        if (changedCourse) buildCourse(requested);
        document.querySelector('.observer-stage').append(viewport);
        $('observer-controls-home').append(controls);
        applyCollapsed(view.collapsed);
        showTab();
        renderProgress();
        restoreAfterRender(true);
        recordVisit(course.id, 'study');
        if (wasActive && changedCourse) $('course-title').focus({ preventScroll: true });
        if (!document.body.classList.contains('motion-off')) {
          entrance = $('course-workspace').animate([{ opacity: 0.55 }, { opacity: 1 }], {
            duration: 160,
            easing: 'ease-out',
          });
        }
      } else {
        restoreVersion++;
        viewportHome.after(viewport);
        controlsHome.after(controls);
      }
    },
    focus() {
      $('course-title').focus({ preventScroll: true });
    },
    getProgress(id) {
      return sessions.getProgress(id);
    },
    getVisits(id) {
      return sessions.getVisits(id);
    },
    recordVisit,
    onProgress(callback) {
      if (typeof callback !== 'function') return () => {};
      listeners.add(callback);
      return () => listeners.delete(callback);
    },
  };
}
