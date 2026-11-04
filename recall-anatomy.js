// 七个生命系统的「解剖 · 信号」读数（露娜）。每个系统都有自己的几处结构和两种信号分子，
// 大脑只是其中之一，不单独多出内容。
// 数值来源分两种，页面上都标出来：
//   - 实时：背单词示例的本轮练习（今日复习、背单词、复习记录）和东京时间（褪黑素）；
//   - 示例：笔记、错题、测验、设置这几类目前只有示例数据，读数直接取自同一份示例，不另外编造。
// 这是界面叙事的隐喻，不是医学或神经科学模型；信号分子里有神经递质，也有激素（如皮质醇、肾上腺素）。
const clamp = (v) => Math.max(0, Math.min(1, v));
const pad = (n) => String(n).padStart(2, '0');
const tokyoHour = () =>
  Number(
    new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Asia/Tokyo',
      hour: 'numeric',
      hourCycle: 'h23',
    }).format(new Date()),
  ) +
  new Date().getMinutes() / 60;
const pick = (text, re, fallback = '—') => text.match(re)?.[1] ?? fallback;

// 每个系统：结构（名称、对应什么、数值）和两种信号（名称、作用、水平 0–1、读数）
function readings(id, d) {
  const { life, entries, tally, dopamine } = d;
  const today = entries[0],
    notes = entries[2],
    mistakes = entries[3],
    quiz = entries[4],
    log = entries[5],
    settings = entries[6];
  const limit = settings.count,
    total = today.count;
  switch (id) {
    case 'today':
      return {
        source: 'live',
        lead: '四个腔室，对应今日的四类来源',
        parts: [
          ['右心房', '单词', life.left],
          ['左心房', '笔记', notes.count],
          ['右心室', '测验', quiz.count],
          ['左心室', '错题', mistakes.count],
        ],
        signals: [
          [
            '肾上腺素',
            '复习进行时升高，节律加快',
            life.active ? 0.78 : 0.18,
            life.active ? '巩固中' : '静息',
          ],
          [
            '乙酰胆碱',
            '完成得越多，节律越平稳',
            life.total ? life.done / life.total : 0,
            `已完成 ${life.done} / ${life.total} 词`,
          ],
        ],
      };
    case 'vocab':
      return {
        source: 'live',
        lead: '一个词从回想到稳定，经过的四处',
        parts: [
          ['前额叶', '正在回想的卡', life.active ? '回想中' : '空闲'],
          ['海马体', '本轮还在巩固', life.left],
          ['杏仁体', '首次回想模糊或忘了', tally.hard + tally.again],
          ['皮层', '已经稳定', life.done],
        ],
        signals: [
          ['多巴胺', '答对时的奖励脉冲', dopamine, dopamine > 0.5 ? '刚刚想起来' : '基线'],
          [
            '去甲肾上腺素',
            '还剩多少要回想，警觉就有多高',
            life.total ? life.left / life.total : 0,
            `还剩 ${life.left} 词`,
          ],
        ],
      };
    case 'notes': {
      const [a, b] = [...notes.line.matchAll(/(\S+) (\d+)/g)].map((m) => `${m[1]} ${m[2]}`);
      return {
        source: 'sample',
        lead: '知识点是神经元，关联是突触',
        parts: [
          ['神经元', '到期知识点', notes.count],
          ['突触簇', a && b ? `${a} · ${b}` : '按学科成簇', notes.line.split('·').length],
          ['髓鞘', '复习过多次、回想很快的', '待接入'],
        ],
        signals: [
          [
            '乙酰胆碱',
            '编码新关联',
            total ? notes.count / total : 0,
            `占今日 ${Math.round((notes.count / Math.max(1, total)) * 100)}%`,
          ],
          [
            'GABA',
            '抑制过载，给今天留余量',
            limit ? clamp(1 - total / limit) : 0,
            `距上限还有 ${Math.max(0, limit - total)} 项`,
          ],
        ],
      };
    }
    case 'mistakes':
      return {
        source: 'sample',
        lead: '断点先暴露出来，再长出新的连接',
        parts: [
          ['断点', mistakes.line, mistakes.count],
          ['新生连接', '本页已回访', 0],
          ['瘢痕', '反复错的题', '待接入'],
        ],
        signals: [
          [
            '组胺',
            '新的断点会引起反应',
            total ? mistakes.count / total : 0,
            `${mistakes.count} 道待回访`,
          ],
          ['BDNF', '脑源性神经营养因子，修复连接', 0, '本页尚未回访'],
        ],
      };
    case 'quiz': {
      const per = Number(pick(quiz.line, /每份 (\d+) 题/, 0)),
        minutes = Number(pick(quiz.line, /约 (\d+) 分钟/, 0));
      return {
        source: 'sample',
        lead: '输入新的刺激，看能不能独立回应',
        parts: [
          ['感受器', '待输入的题目', per * quiz.count],
          ['传入神经', '已作答', 0],
          ['反射弧', '独立答对的比例', '待接入'],
        ],
        signals: [
          [
            '腺苷',
            '越久越累，适合分开做',
            clamp((minutes * quiz.count) / 60),
            `约 ${minutes * quiz.count} 分钟`,
          ],
          ['内啡肽', '完成一份后释放', 0, '还没完成'],
        ],
      };
    }
    case 'log': {
      const h = tokyoHour(),
        melatonin = clamp(0.5 + 0.5 * Math.cos(((h - 2) / 24) * Math.PI * 2));
      return {
        source: 'live',
        lead: '每一轮巩固，都留下新的一代',
        parts: [
          ['干细胞', '本轮要学的词', life.total],
          ['分化细胞', '已经巩固的', life.done],
          ['谱系', '完成的轮次', log.count],
        ],
        signals: [
          ['血清素', '节律稳定，坚持下来', clamp(log.count), `本页完成 ${log.count} 轮`],
          [
            '褪黑素',
            '夜里升高；睡眠帮助记忆巩固',
            melatonin,
            `东京 ${pad(Math.floor(h))}:${pad(Math.floor((h % 1) * 60))}`,
          ],
        ],
      };
    }
    case 'settings':
      return {
        source: 'sample',
        lead: '几处腺体，管住负荷和节律',
        parts: [
          ['下丘脑', '提醒时间', pick(settings.note, /提醒时间 (\d+:\d+)/)],
          ['垂体', '每日上限', limit],
          ['甲状腺', '间隔（天）', pick(settings.line, /间隔 ([\d /]+?) 天/).replace(/ /g, '')],
          ['肾上腺', '新词每日', Number(pick(settings.note, /新词每日 (\d+)/, 0))],
        ],
        signals: [
          ['皮质醇', '负荷越重越高', limit ? clamp(total / limit) : 0, `今日 ${total} / ${limit}`],
          [
            '甲状腺素',
            '新词进来的速度',
            limit ? clamp(Number(pick(settings.note, /新词每日 (\d+)/, 0)) / limit) : 0,
            `每日 ${pick(settings.note, /新词每日 (\d+)/)} 个`,
          ],
        ],
      };
    default:
      return null;
  }
}

const SOURCE = {
  live: '实时 · 来自本页示例练习',
  sample: '示例数据 · 这一类还没接入',
};

export function createAnatomy({ root, toggle, organs, entries, life }) {
  let current = null,
    tally = { again: 0, hard: 0, good: 0 },
    lastDone = 0,
    dopamine = 0.12,
    decay = 0;
  const data = () => ({ life: life(), entries, tally, dopamine });
  function render() {
    if (!current) return;
    const r = readings(current, data()),
      organ = organs[current];
    if (!r) return;
    root.innerHTML = `<header><small>ANATOMY / 解剖 · ${organ.en}</small><h2>${organ.name}</h2><p>${r.lead}</p></header>
<dl class="anatomy-parts">${r.parts
      .map(
        ([name, role, value]) =>
          `<div><dt>${name}</dt><dd><span>${role}</span><b${typeof value === 'number' ? '' : ' class="text"'}>${value}</b></dd></div>`,
      )
      .join('')}</dl>
<section class="anatomy-signals" aria-label="信号分子"><small>SIGNALS / 信号分子 · 示意</small>${r.signals
      .map(
        ([name, role, level, readout], k) =>
          `<div class="signal" data-k="${k}"><p><b>${name}</b><span>${readout}</span></p><i style="--level:${clamp(level).toFixed(3)}"></i><em>${role}</em></div>`,
      )
      .join('')}</section>
<footer><i data-source="${r.source}"></i>${SOURCE[r.source]}</footer>`;
  }
  // 只更新数字和条，不重建整块（多巴胺衰减时每秒会刷几次）
  function refresh() {
    if (!current) return;
    const r = readings(current, data());
    if (!r || root.querySelectorAll('.signal').length !== r.signals.length) return render();
    root.querySelectorAll('.anatomy-parts b').forEach((b, k) => (b.textContent = r.parts[k][2]));
    root.querySelectorAll('.signal').forEach((el, k) => {
      el.querySelector('span').textContent = r.signals[k][3];
      el.querySelector('i').style.setProperty('--level', clamp(r.signals[k][2]).toFixed(3));
    });
  }
  toggle?.addEventListener('click', () => {
    const open = !document.body.classList.contains('anatomy-open');
    document.body.classList.toggle('anatomy-open', open);
    toggle.setAttribute('aria-expanded', String(open));
  });
  return {
    show(id) {
      if (id === current) return refresh();
      current = id;
      render();
    },
    update: refresh,
    // 背单词每次自评：首次回想的统计在 tally 里；答对（这个词完成了）时多巴胺跳一下，再慢慢回落
    grade({ completedKeys, tally: next }) {
      if (next) tally = { ...tally, ...next };
      const done = completedKeys?.length ?? lastDone;
      if (done > lastDone) {
        dopamine = 1;
        clearInterval(decay);
        decay = setInterval(() => {
          dopamine = Math.max(0.12, dopamine * 0.86);
          if (current === 'vocab') refresh();
          if (dopamine <= 0.121) clearInterval(decay);
        }, 300);
      }
      lastDone = done;
      refresh();
    },
  };
}
