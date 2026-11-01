import { SAMPLE_WORDS, createVocabSession } from './recall-vocab.js?v=17';
import { LIBRARY_WORDS } from './recall-workbench-data.js?v=17';
import { drawSpecimen } from './recall-specimen.js?v=17';

export const escapeText = (value = '') =>
  String(value).replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
  );
const e = escapeText;
const libraries = {
  sample: { name: '词义巩固 · 8 个示例', lang: 'en', words: SAMPLE_WORDS },
  chem: { name: '化学术语 · 100 词', lang: 'en', words: LIBRARY_WORDS.chem },
  ja: { name: '大学与理科日语 · 100 词', lang: 'ja', words: LIBRARY_WORDS.ja },
};

// The study session survives tab switches and returning to the spine. Library and
// preferences are separate surfaces, so their content never crowds the active card.
export function createVocabWorkbench(root, options = {}) {
  let view = 'overview',
    completed = 0,
    deck = 'chem',
    search = '',
    page = 0;
  const scroll = new Map();
  root.className = 'vocab-host wb';
  root.dataset.view = view;
  root.innerHTML = `<nav class="wb-rail" aria-label="背单词工作区">
    <div class="wb-rail-heading"><span>02 / LEXICON</span><strong>记忆皮层</strong></div>
    <div class="wb-tabs">${[
      ['overview', '本轮概览'],
      ['preview', '新词预览'],
      ['practice', '专注练习'],
      ['library', '词库浏览'],
      ['settings', '学习偏好'],
    ]
      .map(
        ([id, title], i) =>
          `<button type="button" data-wb-tab="${id}"${i === 0 ? ' aria-current="page"' : ''}><small>0${i + 1}</small><span>${title}</span></button>`,
      )
      .join('')}</div>
    <figure class="wb-organ"><canvas width="300" height="230" aria-hidden="true"></canvas><figcaption>ZH-01 · BRAIN<br>记忆生命体 / 神经连接</figcaption></figure>
    <p class="wb-rail-foot">沙盒 · 容量预览</p>
  </nav>
  <div class="wb-main" tabindex="0" aria-label="工作区内容"></div>
  <aside class="wb-context"><small class="wb-kicker">SESSION / 本轮</small><div class="wb-session-no">01<span>词义巩固</span></div>
    <dl><div><dt>练习词条</dt><dd>8 个示例</dd></div><div><dt>已巩固</dt><dd data-wb-completed>0 / 8</dd></div><div><dt>记忆评价</dt><dd>4 档</dd></div></dl>
    <div class="wb-context-note"><i></i><p>先回想，再核对。<br>暂时想不起的词，<br>会在这一轮再次遇见。</p></div>
    <p class="wb-footnote">练习记录仅保留在本页。词库浏览与练习相互独立。</p>
  </aside>`;
  const main = root.querySelector('.wb-main');
  const coreHost = document.createElement('div');
  const prefs = document.createElement('section');
  prefs.className = 'wb-preferences';
  prefs.innerHTML = `<div class="wb-page-heading"><small class="wb-kicker">PREFERENCES</small><h3>学习偏好</h3><p>设置与练习分开，留出稳定的阅读空间。</p></div>
    <p class="wb-notice">参数布局预览：可调整本页选项，示例练习仍固定为 8 词，不运行正式 FSRS 调度。</p>
    <fieldset><legend>学习节律</legend><label><span>每天新词<small>主站按当天已学数量计算剩余额度。</small></span><select aria-label="每天新词"><option>10 个</option><option selected>20 个</option><option>30 个</option><option>50 个</option></select></label>
    <label><span>新词预览分组<small>主站先预览，再逐个回想。</small></span><select aria-label="新词预览分组"><option>每 5 个一组</option><option>每 10 个一组</option><option>全部看完再考</option></select></label>
    <label><span>目标记忆率<small>主站据此计算下次复习时间。</small></span><select aria-label="目标记忆率"><option>85% · 复习少</option><option selected>90% · 推荐</option><option>95% · 记得牢</option></select></label></fieldset>
    <fieldset><legend>发音</legend><label><span>声音<small>接入主站后沿用设备声音与原有偏好。</small></span><select aria-label="声音" disabled><option>设备声音 · 接入时读取</option></select></label><label><span>语速</span><select aria-label="语速"><option>0.8 ×</option><option selected>1.0 ×</option><option>1.2 ×</option></select></label></fieldset>`;
  const session = createVocabSession(coreHost, {
    ...options,
    fourGrades: true,
    onStart: () => {
      options.onStart?.();
    },
    onProgress: (state) => {
      completed = state.completedKeys.length;
      root.querySelector('[data-wb-completed]').textContent = `${completed} / 8`;
      options.onProgress?.(state);
    },
    onDone: (state) => {
      // The shared specimen reports remembered + very familiar as remembered;
      // the four separate ratings remain visible in this session's report.
      options.onDone?.({
        ...state,
        tally: {
          again: state.tally.again,
          hard: state.tally.hard,
          good: state.tally.good + (state.tally.easy || 0),
        },
      });
      root.dataset.focus = 'report';
    },
  });
  const overview = () => `<section class="wb-overview">
    <div class="wb-page-heading"><small class="wb-kicker">LEXICON / MEMORY CORTEX</small><h3>让记忆，<br>再清晰一点。</h3><p>今天的练习、完整词库与学习偏好，<br>各自有一处安静的位置。</p></div>
    <div class="wb-metrics"><div><b>08</b><span>本轮示例词</span></div><div><b>${String(completed).padStart(2, '0')}</b><span>已巩固</span></div><div><b>200</b><span>可浏览术语</span></div></div>
    <div class="wb-startline"><div><strong>${session.finished ? '本轮练习已完成' : session.started ? '继续刚才的回想' : '从一组新词开始'}</strong><p>${session.started ? '保留队列、翻面状态与本轮进度。' : '先浏览词义与例句，再逐个回想。'}</p></div><button class="vs-primary" type="button" data-wb-go="${session.started ? 'practice' : 'preview'}">${session.finished ? '查看报告' : session.started ? '继续练习' : '查看新词'} <span>↗</span></button></div>
    <div class="wb-secondary-links"><button type="button" data-wb-go="library"><small>LIBRARY</small><b>打开完整词表 <span>↗</span></b><p>化学术语与日语词汇 · 搜索、逐条展开</p></button><button type="button" data-wb-go="settings"><small>PREFERENCES</small><b>调整学习偏好 <span>↗</span></b><p>新词数量、预览分组、发音与记忆率</p></button></div>
  </section>`;
  function preview() {
    main.innerHTML = `<section class="wb-preview"><div class="wb-page-heading"><small class="wb-kicker">FIRST CONTACT / 先认识一下</small><h3>本轮 8 个新词</h3><p>词义与例句完整展开。看完后进入专注练习。</p></div><ol class="wb-preview-list">${SAMPLE_WORDS.map((w, i) => `<li><span class="wb-word-index">${String(i + 1).padStart(2, '0')}</span><div><h4>${e(w.w)} <small>${e(w.pos)}</small></h4><p>${e(w.zh)}</p><p class="wb-example">${e(w.ex)}</p><p class="wb-muted">${e(w.exZh)}</p></div></li>`).join('')}</ol><div class="wb-inline-action"><span>仅本轮示例 · 8 个词</span><button class="vs-primary" type="button" data-wb-go="practice">${session.started ? '继续练习' : '看完了，开始回想'} <span>↗</span></button></div></section>`;
  }
  function library() {
    main.innerHTML = `<section class="wb-library"><div class="wb-page-heading"><small class="wb-kicker">LEXICON ARCHIVE</small><h3>词库浏览</h3><p>主站自编词条的完整内容预览，不含个人学习记录。</p></div>
    <div class="wb-library-tools"><label><span>词库</span><select data-wb-deck>${Object.entries(
      libraries,
    )
      .map(
        ([id, d]) => `<option value="${id}"${id === deck ? ' selected' : ''}>${e(d.name)}</option>`,
      )
      .join(
        '',
      )}</select></label><label><span>搜索词条</span><input type="search" data-wb-search value="${e(search)}" placeholder="单词、中文或日文" /></label></div>
    <div class="wb-results" aria-live="polite"></div><div class="wb-word-list"></div><div class="wb-pagination"></div></section>`;
    main.querySelector('[data-wb-deck]').onchange = (ev) => {
      deck = ev.target.value;
      page = 0;
      updateLibrary();
    };
    main.querySelector('[data-wb-search]').oninput = (ev) => {
      search = ev.target.value;
      page = 0;
      updateLibrary();
    };
    updateLibrary();
  }
  function updateLibrary() {
    const words = libraries[deck].words.filter((w) =>
      [w.w, w.zh, w.ja, w.ex].join(' ').toLowerCase().includes(search.trim().toLowerCase()),
    );
    const pages = Math.max(1, Math.ceil(words.length / 20));
    page = Math.min(page, pages - 1);
    main.querySelector('.wb-results').textContent =
      `${words.length} 条结果 · 第 ${page + 1} / ${pages} 页`;
    main.querySelector('.wb-word-list').innerHTML =
      words
        .slice(page * 20, page * 20 + 20)
        .map(
          (w, i) =>
            `<details class="wb-word-row"><summary><small>${String(page * 20 + i + 1).padStart(3, '0')}</small><b lang="${libraries[deck].lang}">${e(w.w)}<em>${e(w.pos)}</em></b><span>${e(w.zh)}</span><i aria-hidden="true">＋</i></summary><div class="wb-word-detail">${w.ja ? `<p lang="ja">${e(w.ja)}</p>` : ''}<p class="wb-example">${e(w.ex)}</p>${w.exZh ? `<p class="wb-muted">${e(w.exZh)}</p>` : ''}</div></details>`,
        )
        .join('') || '<p class="wb-empty">没有匹配的词条，换一个关键词试试。</p>';
    main.querySelector('.wb-pagination').innerHTML =
      `<button type="button" data-page="-1"${page === 0 ? ' disabled' : ''}>← 上一页</button><span>${page + 1} / ${pages}</span><button type="button" data-page="1"${page === pages - 1 ? ' disabled' : ''}>下一页 →</button>`;
    main.querySelectorAll('[data-page]').forEach(
      (b) =>
        (b.onclick = () => {
          page += Number(b.dataset.page);
          updateLibrary();
          main.scrollTop = 0;
          main.querySelector('[data-wb-search]').focus({ preventScroll: true });
        }),
    );
  }
  function show(next, focus = true) {
    scroll.set(view, main.scrollTop);
    if (view === 'practice') {
      session.pause();
      options.onPause?.();
    }
    view = next;
    root.dataset.view = view;
    root.dataset.focus =
      view === 'practice' ? (session.finished ? 'report' : 'practice') : 'browse';
    root.querySelectorAll('[data-wb-tab]').forEach((b) => {
      if (b.dataset.wbTab === view) b.setAttribute('aria-current', 'page');
      else b.removeAttribute('aria-current');
    });
    if (view === 'practice') {
      main.replaceChildren(coreHost);
      if (!session.started) session.start();
      else {
        session.resume();
        if (!session.finished) options.onStart?.();
      }
    } else if (view === 'library') library();
    else if (view === 'settings') main.replaceChildren(prefs);
    else if (view === 'preview') preview();
    else main.innerHTML = overview();
    main.scrollTop = scroll.get(view) || 0;
    if (focus) {
      const target = main.querySelector('.vs-flip,.vs-grade,[data-act="back"],h3') || main;
      if (target.tagName === 'H3') target.tabIndex = -1;
      target.focus({ preventScroll: true });
    }
  }
  root.addEventListener('click', (ev) => {
    const tab = ev.target.closest('[data-wb-tab],[data-wb-go]');
    if (tab) show(tab.dataset.wbTab || tab.dataset.wbGo);
  });
  drawSpecimen(root.querySelector('.wb-organ canvas').getContext('2d'), 'vocab', 150, 115, 0.95);
  show('overview', false);
  return {
    key(event) {
      return view === 'practice' && session.key(event);
    },
    pause() {
      session.pause();
    },
    resume() {
      if (view === 'practice') session.resume();
    },
    get started() {
      return session.started;
    },
    get active() {
      return view === 'practice' && session.started && !session.finished;
    },
    get finished() {
      return session.finished;
    },
  };
}
