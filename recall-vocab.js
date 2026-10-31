// 背单词示例：一组可以真正使用的单词卡（示例数据，不接正式站）。
//   正面：单词、音标、词性。翻面（空格 / 回车 / 点卡片）：释义、例句、例句翻译。
//   评分（1 忘了 / 2 模糊 / 3 记得）：忘了的卡隔三张再出现，模糊的卡放到队尾再出现一次，记得的卡完成。
//   每个按钮上显示示例的下次复习间隔。一组结束后给出统计，并通过 onDone 告诉页面完成了几张。
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
  { key: '1', id: 'again', label: '忘了', next: '1 分钟后' },
  { key: '2', id: 'hard', label: '模糊', next: '1 天后' },
  { key: '3', id: 'good', label: '记得', next: '3 天后' },
];

export function createVocabSession(
  root,
  { words = SAMPLE_WORDS, remaining = words.length, onProgress, onDone } = {},
) {
  const queue = words.map((w, k) => ({ ...w, k, seen: 0 })),
    tally = { again: 0, hard: 0, good: 0 },
    done = new Set(),
    total = words.length,
    t0 = Date.now();
  let card = null,
    flipped = false,
    finished = false;
  const esc = (s) =>
    s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  // 例句里把单词本身标出来（只匹配词首，兼容 consolidate / consolidates 等变形）
  const mark = (ex, w) =>
    esc(ex).replace(
      new RegExp(`\\b(${w.slice(0, Math.max(4, w.length - 2))}\\w*)`, 'i'),
      '<mark>$1</mark>',
    );

  function render() {
    if (finished) return renderSummary();
    card = queue[0];
    const pct = (done.size / total) * 100;
    root.innerHTML = `
      <div class="vs">
        <div class="vs-progress" role="progressbar" aria-valuemin="0" aria-valuemax="${total}" aria-valuenow="${done.size}">
          <i style="width:${pct}%"></i>
          <span>${done.size} / ${total}</span>
        </div>
        <button type="button" class="vs-card${flipped ? ' flipped' : ''}" aria-label="${flipped ? '已翻面' : '翻面'}">
          <span class="vs-word">${esc(card.w)}</span>
          <span class="vs-ipa">${esc(card.ipa)} · ${esc(card.pos)}</span>
          ${
            flipped
              ? `<span class="vs-zh">${esc(card.zh)}</span>
                 <span class="vs-ex">${mark(card.ex, card.w)}</span>
                 <span class="vs-exzh">${esc(card.exZh)}</span>`
              : `<span class="vs-tap">先在心里回想释义，再翻面 <kbd>空格</kbd></span>`
          }
        </button>
        <div class="vs-actions">
          ${
            flipped
              ? GRADES.map(
                  (g) =>
                    `<button type="button" class="vs-grade ${g.id}" data-g="${g.id}"><b>${g.label}</b><small>${g.next}</small><kbd>${g.key}</kbd></button>`,
                ).join('')
              : `<button type="button" class="vs-flip">翻面 · 看释义 <kbd>空格</kbd></button>`
          }
        </div>
      </div>`;
    root.querySelector('.vs-card').onclick = flip;
    root.querySelector('.vs-flip')?.addEventListener('click', flip);
    root.querySelectorAll('.vs-grade').forEach((b) => (b.onclick = () => grade(b.dataset.g)));
  }
  function flip() {
    if (finished || flipped) return;
    flipped = true;
    render();
  }
  function grade(id) {
    if (finished || !flipped) return;
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
      onDone?.({ completed: total, tally: { ...tally } });
    }
    render();
  }
  function renderSummary() {
    const mins = Math.max(1, Math.round((Date.now() - t0) / 60000)),
      left = Math.max(0, remaining - total);
    root.innerHTML = `
      <div class="vs vs-done">
        <small>CONSOLIDATED / 连接已稳定</small>
        <h3>本轮巩固 <b>${total}</b> 个词</h3>
        <p class="vs-duration">约 ${mins} 分钟 · 本轮示例已记录</p>
        <div class="vs-tally">
          <span><b>${tally.good}</b>记得</span>
          <span><b>${tally.hard}</b>模糊</span>
          <span><b>${tally.again}</b>忘了</span>
        </div>
        <p>${left ? `背单词还有 ${left} 个到期。` : '本轮示例单词已完成。'}${tally.again + tally.hard ? '忘了和模糊的词已经在本组里重新过了一遍。' : '这组单词均在首次回想时记得。'}</p>
        <p class="vs-scope">其余系统仍是内容预览，本次成果只计入这 ${total} 个示例单词。</p>
        <div class="vs-actions">
          <button type="button" class="vs-flip" data-act="back">返回生命体 · 查看连接 <kbd>ESC</kbd></button>
        </div>
      </div>`;
    root.querySelector('[data-act="back"]').onclick = () =>
      root.dispatchEvent(new CustomEvent('vs-back', { bubbles: true }));
  }
  // 键盘：空格 / 回车翻面，1 2 3 评分；返回 true 表示已处理
  function key(e) {
    if (finished) return false;
    if (!flipped && (e.key === ' ' || e.key === 'Enter')) return (flip(), true);
    const g = GRADES.find((x) => x.key === e.key);
    if (flipped && g) return (grade(g.id), true);
    return false;
  }
  render();
  return {
    key,
    get finished() {
      return finished;
    },
  };
}
