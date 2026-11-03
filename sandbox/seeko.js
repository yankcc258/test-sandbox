// 希可（鲸鱼娘女仆）住进沙盒（露娜，v26）。形象和台词都沿用老知序（yank-study-lab 的 pet.js /
// pet-life.js / pet-grudge.js / pet-lines.js），这里只是把她放进三个区域：
//   白天：大多待在工作台，在桌面、窗台、手记、平板旁和自己的小窝之间跑来跑去，跟着 3D 场景的位置走；
//         偶尔在实验室、复习区「偶遇」——从屏幕边探出头，提醒背单词、喝水，待一会儿再跑走。
//   晚上（23:00–6:00，东京时间）：窝在工作台的小窝里睡觉，飘 Z、说梦话；不会出现在另外两个区域。
//   戳：平时回一句；连戳到生气会记仇；睡着时戳一下迷糊，马上再戳就暴怒，并记进记仇本。
//   摸头（在她身上来回划）：开心，抵一笔账（每天最多 3 次）。长按或右键：翻开记仇本。
// 沙盒的记仇本只存在这个浏览器里（localStorage），和正式站的记仇本无关。
// 立绘目录（以目录里的 README 为基准解析，链接检查能确认目录存在）
const ASSETS = new URL('../assets/seeko/README.md', import.meta.url);
const MOODS = [
  'idle',
  'happy',
  'run',
  'sleep',
  'sleepy',
  'wake',
  'pout',
  'smirk',
  'smug',
  'surprised',
  'peek',
  'wave',
  'read',
  'meh',
  'strike',
  'pat',
  'bleh',
  'onigiri',
];
const pick = (a) => a[Math.floor(Math.random() * a.length)];
const rand = (a, b) => a + Math.random() * (b - a);

// ---------- 台词（摘自老知序 pet-lines.js / pet-life.js，原样保留语气） ----------
const POKE = [
  ['哦鲸鲸……戳什么戳，Yank 你很闲吗？', 'meh'],
  ['干嘛啦，我在想晚饭吃什么。', 'onigiri'],
  ['（duang）……再戳要收费了，一下一碗白饭。', 'smirk'],
  ['哼，戳我也不会帮你写作业的。', 'bleh'],
  ['叫我希可，不许叫鱼。', 'meh'],
  ['有这功夫不如去背两个单词？', 'smug'],
  ['别闹，我在摸鱼……不对，我在认真工作。', 'surprised'],
  ['戳完记得去喝水，别又忘了。', 'happy'],
  ['（duang～）……弹回来了。很好玩是吧？', 'bleh'],
  ['你戳我的速度要是拿去写报告，早写完了。', 'meh'],
  ['我在思考人生……不对，鲸生。别打扰我。', 'idle'],
  ['（噗——喷你一脸水）戳鲸鱼是要付出代价的，Yank 少爷～', 'smirk'],
  ['本鲸当年可是深海女仆学院的首席！……现在？现在是女仆法定休息时间。', 'smug'],
  ['（哼起鲸歌）呜～～……听不懂？那是你的问题。', 'happy'],
];
const CHATTER = [
  ['（晃尾鳍）今天也要努力哦……我先去吃个饭。', 'onigiri'],
  ['别一直盯着屏幕了，看看远处，眼睛会谢谢你的。', 'happy'],
  ['Yank，坐太久了，站起来伸个懒腰。', 'happy'],
  ['水杯空了吧？去接水，顺便帮我也接一杯。', 'smirk'],
  ['（趴在桌上）好无聊……Yank 讲个笑话来听听。', 'meh'],
  ['今天的你比昨天的你多会了一点点，大概。', 'smug'],
];
// 偶遇：在实验室、复习区冒出来时说的
const MEET = {
  lab: [
    ['（从屏幕边探头）……Yank 在学什么？我就路过，不是来监督的。', 'peek'],
    ['学累了？去喝口水再回来，本鲸帮你看着。', 'happy'],
    ['今天的单词背了没？别想骗我，我刚从复习区过来。', 'smirk'],
  ],
  review: [
    ['戳我不如戳单词，Yank，那边还在等你翻面呢。', 'smirk'],
    ['（扒着屏幕边）……有单词在排队等你复习，它们都快长蘑菇了。', 'meh'],
    ['复习完记得喝水。我先回工作台了，别想我。', 'wave'],
  ],
};
const ANGRY = ['💢 Yank！！再戳一下试试？我真的会走的！', '💢 停！手！我已经警告过你了哦！'];
const GROGGY = [
  '……唔？（揉眼睛）几点了……Yank？',
  '……谁啊……我刚梦到第三碗白饭……',
  '（眼罩推上去）……干嘛……',
];
const MAD = [
  '💢 Yank！！我好不容易睡着的！！你知道鲸鱼的睡眠有多宝贵吗！！',
  '💢 梦里的 token 都被你吓跑了！！赔我！！',
  '💢 再吵我睡觉，明天的点评我就只写「差」一个字！',
];
const BACK_TO_SLEEP = [
  '……哼。（翻身，继续睡）',
  '……不跟你说了，睡了。zzz',
  '（把枕头抱紧）……别再戳了……',
];
const SLEEP_TALK = [
  '……白饭……还有一碗……嘿嘿……',
  '……这个 token 是我的……不许抢……',
  '……Yank 的作业……我帮你吃掉了……',
  '……第五碗……再来……',
];
const PAT = [
  ['……（眯眼）就、就这一下哦。', 'pat'],
  ['嘿嘿……啊不是，我才没有很开心。', 'pat'],
  ['再往左一点……不对，谁让你摸了！', 'pat'],
];

// ---------- 记仇本（和老知序同一套规则；沙盒里只存在这个浏览器） ----------
const BOOK_KEY = 'zhixu-sandbox-grudge',
  GRUDGE = {
    angry: { label: '连戳到我生气', cost: 1 },
    woke: { label: '把我从睡梦里戳醒', cost: 1 },
  };
function loadBook() {
  try {
    const b = JSON.parse(localStorage.getItem(BOOK_KEY) || 'null');
    if (b && Array.isArray(b.items)) return b;
  } catch {}
  return { items: [], paid: {} };
}
function saveBook(b) {
  try {
    localStorage.setItem(BOOK_KEY, JSON.stringify(b));
  } catch {}
}
const owed = (b) => b.items.reduce((n, x) => n + x.left, 0);
export function grudgeAdd(b, type, now = Date.now()) {
  // 同一种账 10 分钟内只记一笔（老知序的规则）
  if (b.items.some((x) => x.type === type && now - x.at < 600000)) return false;
  b.items.unshift({ type, at: now, left: GRUDGE[type].cost });
  b.items = b.items.slice(0, 60);
  return true;
}
export function grudgePat(b, now = Date.now()) {
  const day = new Date(now).toISOString().slice(0, 10);
  b.paid[day] ||= 0;
  if (b.paid[day] >= 3) return null;
  // 先还最早的那笔
  const x = [...b.items].reverse().find((i) => i.left > 0);
  if (!x) return null;
  x.left -= 1;
  b.paid[day] += 1;
  return x;
}
// 东京时间的夜里（23:00–6:00，老知序的默认作息）
const tokyoHour = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Asia/Tokyo',
  hour: '2-digit',
  hourCycle: 'h23',
});
export function seekoNight(d = new Date()) {
  const h = Number(tokyoHour.format(d));
  return h >= 23 || h < 6;
}

function when(ms) {
  const d = new Date(ms),
    f = new Intl.DateTimeFormat('zh-CN', {
      timeZone: 'Asia/Tokyo',
      month: 'numeric',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  return f.format(d);
}

// ---------- 希可本体 ----------
// region：'workstation' | 'lab' | 'review'
// spots（只有工作台）：在 3D 场景里能站的位置 → () => {x, y, scale, visible}
export function createSeeko({ region, spots = null, motion = () => true, hidden = () => false }) {
  const params = new URLSearchParams(location.search),
    force = params.get('seeko'); // day / night / meet / off：测试用
  if (force === 'off') return null;
  const night = () =>
    force === 'night' ? true : force === 'day' || force === 'meet' ? false : seekoNight();
  // 偶遇：白天、在实验室或复习区、本标签页 10 分钟内没遇到过、三成概率
  if (region !== 'workstation') {
    if (night() && force !== 'meet') return null;
    let met = 0;
    try {
      met = Number(sessionStorage.getItem('zhixu-seeko-met') || 0);
    } catch {}
    if (force !== 'meet' && (Date.now() - met < 600000 || Math.random() > 0.3)) return null;
    try {
      sessionStorage.setItem('zhixu-seeko-met', String(Date.now()));
    } catch {}
  }
  const el = document.createElement('div');
  el.className = `seeko seeko-${region}`;
  el.innerHTML = `<p class="seeko-bubble" role="status" hidden></p><button type="button" class="seeko-body" aria-label="希可（戳一下；长按或右键打开记仇本）"><img alt="" draggable="false" /></button><div class="seeko-z" aria-hidden="true"></div>`;
  document.body.append(el);
  const img = el.querySelector('img'),
    bubble = el.querySelector('.seeko-bubble'),
    body = el.querySelector('.seeko-body'),
    zs = el.querySelector('.seeko-z');
  // 先把所有表情载入，换表情时不闪
  for (const m of MOODS) new Image().src = new URL(m + '.webp', ASSETS).href;
  let mood = 'idle',
    moodUntil = 0,
    sleep = null, // null | 'asleep' | 'groggy' | 'mad'
    sleepUntil = 0,
    groggyAt = 0,
    pokes = [],
    warned = 0,
    bubbleTimer = 0,
    spot = 'nest',
    from = null,
    hop = null,
    nextMove = Date.now() + rand(8000, 16000),
    nextChat = Date.now() + rand(60000, 120000),
    nextTalk = Date.now() + rand(40000, 90000),
    leaving = false,
    book = loadBook();
  function setMood(m, ms = 0) {
    if (!MOODS.includes(m)) m = 'idle';
    mood = m;
    moodUntil = ms ? Date.now() + ms : 0;
    img.src = new URL(m + '.webp', ASSETS).href;
    el.dataset.mood = m;
  }
  function say(text, m, ms = 5000) {
    bubble.textContent = text;
    bubble.hidden = false;
    if (m) setMood(m, ms);
    clearTimeout(bubbleTimer);
    bubbleTimer = setTimeout(() => (bubble.hidden = true), ms);
  }
  const base = () => (sleep === 'asleep' ? 'sleep' : spot === 'notes' ? 'read' : 'idle');

  // ---- 位置 ----
  function place() {
    // 没有 3D 场景（无 WebGL）时，在工作台右下角待着
    if (region === 'workstation' && !spots) {
      el.classList.add('fallback');
      el.classList.toggle('away', hidden());
      return;
    }
    if (region === 'workstation') {
      const s = hop ? null : spots?.[spot]?.();
      let p = s;
      if (hop) {
        // 在两个位置之间跳过去：屏幕上走一段弧线
        const a = spots[hop.from]?.(),
          b = spots[hop.to]?.(),
          k = Math.min(1, (Date.now() - hop.at) / hop.ms),
          e = k * k * (3 - 2 * k);
        if (a && b)
          p = {
            x: a.x + (b.x - a.x) * e,
            y: a.y + (b.y - a.y) * e - Math.sin(Math.PI * k) * 60,
            scale: a.scale + (b.scale - a.scale) * e,
            visible: a.visible || b.visible,
          };
        if (k >= 1) {
          spot = hop.to;
          hop = null;
          setMood(base());
        }
      }
      if (!p) return el.classList.add('away');
      el.classList.toggle('away', !p.visible || hidden());
      el.style.setProperty('--x', `${p.x}px`);
      el.style.setProperty('--y', `${p.y}px`);
      el.style.setProperty('--s', p.scale.toFixed(3));
    } else el.classList.toggle('away', hidden());
  }
  // ---- 每帧 ----
  function tick() {
    // A covered/background character must not compete with flight or WebGL.
    // Wall-clock deadlines still catch up on the next visible update.
    if (document.hidden || hidden()) {
      el.classList.add('away');
      setTimeout(() => requestAnimationFrame(tick), 200);
      return;
    }
    const now = Date.now(),
      isNight = night();
    if (moodUntil && now > moodUntil) {
      moodUntil = 0;
      setMood(base());
    }
    if (region === 'workstation') {
      // 睡觉：夜里回窝；被戳醒过了一会儿再接着睡；天亮醒来
      if (sleep && sleep !== 'asleep' && now > sleepUntil) {
        const wasMad = sleep === 'mad';
        sleep = isNight ? 'asleep' : null;
        el.classList.remove('angry');
        if (sleep && wasMad) say(pick(BACK_TO_SLEEP), 'sleep', 4000);
        else setMood(base());
      } else if (!sleep && isNight && now > sleepUntil && !hop) {
        if (spot !== 'nest') move('nest');
        else {
          sleep = 'asleep';
          setMood('sleep');
          nextTalk = now + rand(40000, 90000);
        }
      } else if (sleep === 'asleep' && !isNight) {
        sleep = null;
        say('（伸懒腰）……早，Yank。我睡得可好了，你呢？', 'happy', 7000);
      }
      if (sleep === 'asleep' && now > nextTalk) {
        nextTalk = now + rand(120000, 240000);
        say(pick(SLEEP_TALK), 'sleep', 6000);
      }
      // 白天在桌上跑来跑去，时不时自言自语
      if (!sleep && !isNight && !hop && now > nextMove && motion()) {
        nextMove = now + rand(15000, 35000);
        const choices = Object.keys(spots || {}).filter(
          (k) => k !== spot && (k !== 'nest' || Math.random() < 0.3),
        );
        if (choices.length) move(pick(choices));
      }
      if (!sleep && !isNight && now > nextChat && bubble.hidden) {
        nextChat = now + rand(120000, 240000);
        const line = Math.random() < 0.25 && owed(book) ? grudgeLine() : null;
        if (line) say(line, 'meh', 7000);
        else {
          const [t, m] = pick(CHATTER);
          say(t, m, 6000);
        }
      }
    }
    zs.hidden = sleep !== 'asleep';
    el.classList.toggle('sleeping', sleep === 'asleep');
    place();
    requestAnimationFrame(tick);
  }
  function move(to) {
    if (!spots?.[to] || !motion()) {
      spot = to;
      return;
    }
    hop = { from: spot, to, at: Date.now(), ms: 1400 };
    setMood('run');
  }

  // ---- 偶遇：从屏幕边探头、走进来、说一句、再跑走 ----
  function meet() {
    const side = params.get('seekoSide') || (Math.random() < 0.5 ? 'left' : 'right');
    el.dataset.side = side;
    setMood('peek');
    el.classList.add('peeking');
    setTimeout(() => {
      el.classList.remove('peeking');
      el.classList.add('in');
      const [t, m] = pick(MEET[region]);
      say(t, m, 7000);
    }, 1600);
    setTimeout(leave, 26000);
  }
  function leave() {
    if (leaving) return;
    leaving = true;
    say(pick(['我回工作台了。', '走了，别想我。', '（跑走）']), 'run', 1600);
    el.classList.add('leaving');
    setTimeout(() => el.remove(), 1500);
  }

  // ---- 戳、摸头、记仇本 ----
  function grudgeLine() {
    const open = book.items.filter((x) => x.left > 0);
    if (!open.length) return null;
    const x = pick(open);
    return pick([
      `（翻开记仇本）${when(x.at)}，你${GRUDGE[x.type].label}。这笔还没还呢，Yank 少爷～`,
      `记仇本上还挂着 ${owed(book)} 分。摸头可以抵账，懂？`,
    ]);
  }
  // 正在被戳或摸的时候先别跑开
  const hold = (now) => (nextMove = Math.max(nextMove, now + 20000));
  function record(type) {
    if (grudgeAdd(book, type)) saveBook(book);
  }
  function poke() {
    const now = Date.now();
    hold(now);
    el.classList.remove('duang');
    void el.offsetWidth;
    el.classList.add('duang');
    if (sleep === 'asleep') {
      sleep = 'groggy';
      groggyAt = now;
      sleepUntil = now + 20000;
      return say(pick(GROGGY), 'sleepy', 12000);
    }
    if (sleep === 'groggy' && now - groggyAt < 12000) {
      sleep = 'mad';
      sleepUntil = now + 14000;
      el.classList.add('angry');
      record('woke');
      return say(pick(MAD), 'wake', 12000);
    }
    if (sleep) return;
    pokes = pokes.filter((t) => now - t < 6000).concat(now);
    if (pokes.length >= 6 && !warned) {
      warned = now;
      return say(pick(ANGRY), 'strike', 5000);
    }
    if (warned && now - warned < 15000) {
      record('angry');
      pokes = [];
      warned = 0;
      return say('（在记仇本上记下一笔）……红笔。', 'strike', 5000);
    }
    if (Math.random() < 0.15 && owed(book)) return say(grudgeLine(), 'meh', 6000);
    const [t, m] = pick(POKE);
    say(t, m, 5000);
  }
  function pat() {
    if (sleep === 'asleep') return;
    hold(Date.now());
    const [t, m] = pick(PAT);
    const paid = grudgePat(book);
    if (paid) {
      saveBook(book);
      say(
        owed(book)
          ? `（在记仇本上划掉一笔）……「${GRUDGE[paid.type].label}」那笔算你还了一分。还欠 ${owed(book)} 分，别得意。`
          : '（啪地合上记仇本）……全还清了。哼，这次就放过你，Yank。',
        owed(book) ? 'pat' : 'smug',
        6000,
      );
    } else say(t, m, 4000);
  }
  function openBook() {
    const rows = book.items
      .slice(0, 12)
      .map(
        (x) =>
          `<li class="${x.left ? '' : 'paid'}"><span>${when(x.at)}</span>${GRUDGE[x.type].label}<b>${x.left ? `欠 ${x.left}` : '✓ 已还'}</b></li>`,
      )
      .join('');
    bubble.innerHTML = `<b class="seeko-book-title">📕 希可的记仇本 · 欠 ${owed(book)} 分</b>${rows ? `<ul>${rows}</ul>` : '<span>……一页都没写。哼，算你最近老实。</span>'}<small>连戳到生气 1 分、睡觉被戳醒 1 分；摸头还 1 分（每天最多 3 次）。沙盒里只记在这个浏览器。</small>`;
    bubble.hidden = false;
    setMood(owed(book) ? 'smirk' : 'smug', 9000);
    clearTimeout(bubbleTimer);
    bubbleTimer = setTimeout(() => (bubble.hidden = true), 9000);
  }
  // 点一下是戳；按住 0.5 秒或右键是记仇本；在她身上来回划是摸头
  let press = 0,
    longFired = false,
    strokes = [];
  body.addEventListener('pointerdown', (e) => {
    longFired = false;
    clearTimeout(press);
    press = setTimeout(() => {
      longFired = true;
      openBook();
    }, 520);
    strokes = [];
    e.stopPropagation();
  });
  body.addEventListener('pointerup', (e) => {
    clearTimeout(press);
    e.stopPropagation();
    if (!longFired) poke();
  });
  body.addEventListener('pointerleave', () => clearTimeout(press));
  body.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    openBook();
  });
  body.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      poke();
    }
  });
  // 在她身上来回划（鼠标悬停划过，或手指按住左右蹭）：方向变了 4 次算摸头
  let lastX = null;
  body.addEventListener('pointermove', (e) => {
    if (lastX === null) return void (lastX = e.clientX);
    const dx = e.clientX - lastX;
    if (Math.abs(dx) < 4) return;
    lastX = e.clientX;
    const dir = Math.sign(dx),
      now = Date.now();
    if (strokes.at(-1)?.dir !== dir) strokes.push({ dir, at: now });
    strokes = strokes.filter((s) => now - s.at < 1400);
    if (strokes.length >= 5) {
      strokes = [];
      // 按着划的话，这一下不算戳，也不翻记仇本
      clearTimeout(press);
      if (e.buttons) longFired = true;
      pat();
    }
  });
  body.addEventListener('pointerleave', () => (lastX = null));

  // ---- 开始 ----
  if (region === 'workstation') {
    spot = night() ? 'nest' : 'desk';
    if (night()) {
      sleep = 'asleep';
      setMood('sleep');
    } else setMood('idle');
  } else meet();
  requestAnimationFrame(tick);
  const api = {
    el,
    get state() {
      return { region, spot, sleep, mood, owed: owed(book), hop: !!hop };
    },
    poke,
    pat,
    openBook,
    move,
    leave,
    sleepNow() {
      move('nest');
      spot = 'nest';
      hop = null;
      sleep = 'asleep';
      setMood('sleep');
    },
  };
  window.zxSeeko = api;
  return api;
}
