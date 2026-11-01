import { drawSpecimen } from './recall-specimen.js?v=16';
// 背单词示例：一组可以真正使用的单词卡（示例数据，不接正式站）。
//   正面：单词、音标、词性。翻面（空格 / 回车 / 点卡片）：释义、例句、例句翻译。
//   评分（1 忘了 / 2 模糊 / 3 记得）：忘了的卡隔三张再出现，模糊的卡放到队尾再出现一次，记得的卡完成。
//   按钮说明本轮回队行为；不冒充正式间隔调度。一组结束后报告唯一完成数和首次回想分布。
// 只操作传入的容器，不读写页面其他部分。

export const SAMPLE_WORDS = [
  {
    w: 'ephemeral',
    ipa: '/ɪˈfem(ə)rəl/',
    pos: 'adj.',
    zh: '短暂的；转瞬即逝的',
    ex: 'Fame in the age of social media is often ephemeral.',
    exZh: '社交媒体时代的名气往往转瞬即逝。',
  },
  {
    w: 'lucid',
    ipa: '/ˈluːsɪd/',
    pos: 'adj.',
    zh: '清晰易懂的；神志清醒的',
    ex: 'She gave a lucid explanation of how enzymes work.',
    exZh: '她把酶的作用原理讲得清清楚楚。',
  },
  {
    w: 'tenacious',
    ipa: '/təˈneɪʃəs/',
    pos: 'adj.',
    zh: '顽强的；坚持不懈的',
    ex: 'A tenacious learner reviews even on busy days.',
    exZh: '坚持不懈的学习者在忙碌的日子里也会复习。',
  },
  {
    w: 'candor',
    ipa: '/ˈkændər/',
    pos: 'n.',
    zh: '坦率；直言',
    ex: 'I appreciated the candor of his feedback.',
    exZh: '我很感激他反馈时的坦率。',
  },
  {
    w: 'austere',
    ipa: '/ɔːˈstɪr/',
    pos: 'adj.',
    zh: '朴素的；严峻的',
    ex: 'The lab had an austere, minimalist interior.',
    exZh: '实验室内部朴素而极简。',
  },
  {
    w: 'consolidate',
    ipa: '/kənˈsɑːlɪdeɪt/',
    pos: 'v.',
    zh: '巩固；合并',
    ex: 'Sleep helps the brain consolidate new memories.',
    exZh: '睡眠帮助大脑巩固新的记忆。',
  },
  {
    w: 'retrieve',
    ipa: '/rɪˈtriːv/',
    pos: 'v.',
    zh: '取回；检索（记忆）',
    ex: 'Testing yourself forces you to retrieve what you learned.',
    exZh: '自我测试迫使你提取学过的内容。',
  },
  {
    w: 'synapse',
    ipa: '/ˈsɪnæps/',
    pos: 'n.',
    zh: '突触',
    ex: 'Signals cross the synapse in less than a millisecond.',
    exZh: '信号在不到一毫秒内穿过突触。',
  },
];

const GRADES = [
  { key: '1', id: 'again', label: '忘了', next: '隔三张再试' },
  { key: '2', id: 'hard', label: '模糊', next: '本轮再看' },
  { key: '3', id: 'good', label: '记得', next: '完成此词' },
];

export function createVocabSession(
  root,
  { words = SAMPLE_WORDS, onStart, onProgress, onDone } = {},
) {
  const queue = words.map((w, k) => ({ ...w, k, seen: 0 }));
  const tally = { again: 0, hard: 0, good: 0 },
    done = new Set(),
    total = words.length;
  let card = null,
    flipped = false,
    finished = false,
    started = false,
    runningAt = null,
    elapsed = 0;
  const esc = (s) =>
    s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  const mark = (ex, w) =>
    esc(ex).replace(
      new RegExp(`\\b(${w.slice(0, Math.max(4, w.length - 2))}\\w*)`, 'i'),
      '<mark>$1</mark>',
    );
  const dots = () =>
    words
      .map((_, i) => `<i class="${done.has(i) ? 'complete' : card?.k === i ? 'current' : ''}"></i>`)
      .join('');
  const focus = (selector) => {
    if (root.isConnected) root.querySelector(selector)?.focus({ preventScroll: true });
  };
  const plate = () => {
    const ctx = root.querySelector('.vs-anatomy')?.getContext?.('2d');
    if (ctx) drawSpecimen(ctx, 'vocab', 180, 160, 1.28);
  };
  function renderReady() {
    root.innerHTML = `<section class="vs vs-ready" aria-label="准备练习">
      <div class="vs-sessionline"><span>SESSION 01 / 词义巩固</span><span>待开始</span></div>
      <div class="vs-intro">
        <div class="vs-intro-copy"><small class="vs-eyebrow">LEXICON / MEMORY CORTEX</small>
          <h3>让记忆，<br>再清晰一点。</h3>
          <p>先回想，再揭晓。<br>模糊的词，会在本轮再次遇见。</p>
          <div class="vs-intro-count"><b>${String(total).padStart(2, '0')}</b><span>个示例单词<br><small>本轮可随时暂停</small></span></div>
        </div>
        <figure class="vs-plate"><canvas class="vs-anatomy" width="360" height="320" aria-hidden="true"></canvas><figcaption>ZH-01 / BRAIN<br><span>大脑 · 记忆皮层</span></figcaption></figure>
      </div>
      <div class="vs-ready-action"><p>回想 → 翻面 → 自评</p><button type="button" class="vs-primary" data-act="start">开始本轮 <span>↗</span></button></div>
      <details class="vs-details"><summary>本轮说明</summary><p>仅练习这 ${total} 个示例词。遗忘或模糊的词会回到本轮队列，重复练习不重复累计成果。进度只保留在当前页面，刷新后清空。</p></details>
    </section>`;
    root.querySelector('[data-act="start"]').onclick = start;
    plate();
  }
  function start() {
    if (started) return;
    started = true;
    runningAt = Date.now();
    onStart?.();
    renderCard();
    focus('.vs-flip');
  }
  function renderCard() {
    card = queue[0];
    root.innerHTML = `<section class="vs vs-practice" aria-label="单词练习">
      <div class="vs-sessionline"><span>SESSION 01 / 词义巩固</span><span class="vs-status" role="status">${card.seen ? '再次回想' : '先独立回想'}</span></div>
      <div class="vs-progress" role="progressbar" aria-label="本轮已巩固" aria-valuemin="0" aria-valuemax="${total}" aria-valuenow="${done.size}"><div class="vs-segments" aria-hidden="true">${dots()}</div><span>${String(done.size).padStart(2, '0')} / ${String(total).padStart(2, '0')}</span></div>
      <div class="vs-field">
        <span class="vs-card-code">LEX / ${String(card.k + 1).padStart(3, '0')} <i>${card.seen ? 'RECALL AGAIN' : 'RETRIEVAL'}</i></span>
        <button type="button" class="vs-card" aria-label="翻面，查看 ${esc(card.w)} 的释义"><span class="vs-word">${esc(card.w)}</span><span class="vs-ipa">${esc(card.ipa)} <b>${esc(card.pos)}</b></span></button>
        <div class="vs-answer-space">
          <p class="vs-tap">先在心里回想释义，再翻面。</p>
          <div class="vs-answer" hidden><p class="vs-zh">${esc(card.zh)}</p><p class="vs-ex">${mark(card.ex, card.w)}</p><p class="vs-exzh">${esc(card.exZh)}</p></div>
        </div>
      </div>
      <div class="vs-controls"><p class="vs-control-note">给记忆一点时间</p><div class="vs-actions"><button type="button" class="vs-flip vs-primary">翻面 · 看释义 <kbd>空格</kbd></button></div></div>
    </section>`;
    root.querySelector('.vs-card').onclick = flip;
    root.querySelector('.vs-flip').onclick = flip;
  }
  function flip() {
    if (!started || finished || flipped) return;
    flipped = true;
    // 单词与仪器外框保留；释义在预留区域出现，按钮基线不跳动。
    root.querySelector('.vs-tap').hidden = true;
    root.querySelector('.vs-answer').hidden = false;
    root.querySelector('.vs-card').setAttribute?.('aria-label', `${card.w}，释义已展开`);
    root.querySelector('.vs-status').textContent = '释义已展开';
    root.querySelector('.vs-control-note').textContent = '按翻面前的回想情况评价';
    root.querySelector('.vs-actions').innerHTML = GRADES.map(
      (g) =>
        `<button type="button" class="vs-grade ${g.id}" data-g="${g.id}"><b>${g.label}</b><small>${g.id === 'hard' && card.seen ? '完成此词' : g.next}</small><kbd>${g.key}</kbd></button>`,
    ).join('');
    root.querySelectorAll('.vs-grade').forEach((b) => (b.onclick = () => grade(b.dataset.g)));
    focus('.vs-grade');
  }
  function grade(id) {
    if (!started || finished || !flipped || !GRADES.some((g) => g.id === id)) return;
    const c = queue.shift();
    c.seen++;
    if (c.seen === 1) tally[id]++;
    if (id === 'again') queue.splice(Math.min(3, queue.length), 0, c);
    else if (id === 'hard' && c.seen === 1) queue.push(c);
    else done.add(c.k);
    flipped = false;
    onProgress?.({ completedKeys: [...done], tally: { ...tally } });
    if (!queue.length) {
      finished = true;
      pause();
      onDone?.({ completed: total, tally: { ...tally } });
      renderSummary();
      focus('[data-act="back"]');
    } else {
      renderCard();
      focus('.vs-flip');
    }
  }
  function renderSummary() {
    root.innerHTML = `<section class="vs vs-done" aria-label="本轮报告">
      <div class="vs-sessionline"><span>SESSION 01 / 巩固报告</span><span class="vs-stable"><i></i>连接已稳定</span></div>
      <div class="vs-report-heading"><div><small class="vs-eyebrow">CONSOLIDATION COMPLETE</small><h3>本轮巩固 <b>${total}</b> 个词</h3><p class="vs-duration">${elapsed < 60000 ? '练习用时不足 1 分钟' : `练习用时约 ${Math.round(elapsed / 60000)} 分钟`} · 本页示例记录</p></div><span class="vs-report-seal" aria-hidden="true">${String(total).padStart(2, '0')}<small>CONNECTED</small></span></div>
      <div class="vs-segments" aria-hidden="true">${dots()}</div>
      <p class="vs-tally-label">首次回想</p><div class="vs-tally"><span><b>${tally.good}</b>记得</span><span><b>${tally.hard}</b>模糊</span><span><b>${tally.again}</b>忘了</span></div>
      <p class="vs-report-note">${tally.again + tally.hard ? '模糊和遗忘的词，已在本轮重新练习。' : '这组单词，首次回想时都记得。'}<br>返回后，这一次巩固会留在大脑的连接上。</p>
      <div class="vs-actions"><button type="button" class="vs-primary" data-act="back">返回脊柱 · 查看连接 <span>↗</span></button></div>
    </section>`;
    root.querySelector('[data-act="back"]').onclick = () =>
      root.dispatchEvent(new CustomEvent('vs-back', { bubbles: true }));
  }
  function key(e) {
    if (e.repeat || finished) return false;
    if (!started && (e.key === ' ' || e.key === 'Enter')) {
      start();
      return true;
    }
    if (!started) return false;
    if (!flipped && (e.key === ' ' || e.key === 'Enter')) {
      flip();
      return true;
    }
    const g = GRADES.find((x) => x.key === e.key);
    if (flipped && g) {
      grade(g.id);
      return true;
    }
    return false;
  }
  function pause() {
    if (runningAt !== null) elapsed += Math.max(0, Date.now() - runningAt);
    runningAt = null;
  }
  function resume() {
    if (started && !finished && runningAt === null) runningAt = Date.now();
  }
  renderReady();
  return {
    key,
    pause,
    resume,
    get started() {
      return started;
    },
    get finished() {
      return finished;
    },
  };
}
