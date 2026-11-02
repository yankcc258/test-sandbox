import { toolPreviews, toolOverview, toolScreenshot } from './tools.js?v=24';
import { atmosphere, createFocusTimer } from './atmosphere.js?v=24';

const $ = (s) => document.querySelector(s);
const params = new URLSearchParams(location.search);
const preference = matchMedia('(prefers-reduced-motion: reduce)');
let motion = params.get('motion') !== '0' && !preference.matches;
let mood = ['day', 'dusk', 'night'].includes(params.get('light')) ? params.get('light') : 'auto';
let scene = null,
  lamp = true,
  lampTouched = false,
  active = null,
  lastFocus = null,
  panelAnimation = null,
  closing = false,
  tab = 'tools',
  previewTool = null;
let notes = '',
  themeKey = '',
  projected = {};
const timer = createFocusTimer();
const dialog = $('#detail'),
  body = $('#detail-body');
const timeFormatter = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Asia/Tokyo',
  hourCycle: 'h23',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
});
const dateFormatter = new Intl.DateTimeFormat('zh-CN', {
  timeZone: 'Asia/Tokyo',
  month: '2-digit',
  day: '2-digit',
});
const weekdays = new Intl.DateTimeFormat('zh-CN', { timeZone: 'Asia/Tokyo', weekday: 'long' });
const names = { day: '晨光', dusk: '黄昏', night: '深夜' };
const sections = {
  tablet: ['01 / PERSONAL TERMINAL', '个人终端'],
  specimen: ['02 / MATERIAL STUDY', '流形试样'],
  report: ['03 / FIELD NOTES', '研究手记'],
  sky: ['04 / BEYOND', '窗外与天空'],
  art: ['WALL STUDIES / 01—02', '墙面画作'],
  about: ['ZHIXU / WORKSTATION STUDY', '关于这处工作台'],
};
function diagram(type = 'material') {
  return (
    '<svg class="diagram" viewBox="0 0 700 140" role="img" aria-label="曲面与连接的示意图"><path d="M45 70 C115 -15 225 -15 305 70 S495 155 565 70 S650 -15 665 70"/><path d="M45 70 C115 155 225 155 305 70 S495 -15 565 70 S650 155 665 70"/><ellipse cx="305" cy="70" rx="44" ry="58"/><ellipse cx="305" cy="70" rx="19" ry="58"/><circle cx="45" cy="70" r="4"/><circle cx="565" cy="70" r="4"/><text x="45" y="132">' +
    (type === 'sky' ? 'OBSERVE → QUESTION → EXPLORE' : 'STRUCTURE → INTERFACE → CONNECTION') +
    '</text></svg>'
  );
}
function tabletPage() {
  body.innerHTML =
    '<div class="tablet-layout"><nav class="tablet-tabs" aria-label="个人终端页面"><small>PERSONAL / 03</small><button data-tab="today"><small>01</small>今日概览</button><button data-tab="tools"><small>02</small>个人工具</button><button data-tab="focus"><small>03</small>专注试用</button><button data-tab="notes"><small>04</small>随手记</button><p>把复杂的世界，<br>拆成今天能弄懂的<br>一小步。</p></nav><section class="tablet-page" id="tablet-page"></section></div>';
  renderTab();
}
function renderTab() {
  document
    .querySelectorAll('[data-tab]')
    .forEach((b) => b.setAttribute('aria-current', b.dataset.tab === tab ? 'page' : 'false'));
  const page = $('#tablet-page');
  page.classList.toggle('tools-page', tab === 'tools');
  if (tab === 'tools') {
    page.innerHTML = previewTool ? toolScreenshot(previewTool) : toolOverview();
  } else if (tab === 'today') {
    const now = new Date();
    page.innerHTML =
      '<small class="eyebrow">PERSONAL RESEARCH / 工作概览</small><h3>从一个问题开始。</h3><p class="lede">读一段材料，留下一点思考。<br>让好奇心有一个可以停靠、也可以继续出发的位置。</p><div class="today-strip"><time>' +
      dateFormatter.format(now).replace('月', '.').replace('日', '') +
      '</time><div><strong>' +
      weekdays.format(now) +
      ' · 东京</strong>当前日期 / 个人研究时段</div></div><div class="quick-actions"><button data-tab="focus"><strong>留出一段专注时间 ↗</strong><small>25 分钟 · 可暂停、可继续</small></button><button data-tab="notes"><strong>记下此刻的问题 ↗</strong><small>一张留在本次页面里的便笺</small></button></div><div class="tool-shortcuts"><button data-tab="tools">个人工具 · 七项界面预览 ↗</button></div>';
  } else if (tab === 'focus') {
    page.innerHTML =
      '<small class="eyebrow">FOCUS / 只做眼前这一件事</small><h3>给思考一点完整的时间。</h3><div class="timer" id="timer" role="timer" aria-label="剩余专注时间">25:00</div><div class="actions"><button class="primary" id="timer-toggle">开始专注</button><button id="timer-reset">重新计时</button></div><p class="subtle" id="timer-status" role="status">此计时仅用于范本体验，不会写入学习记录。</p>';
    updateTimer();
  } else {
    page.innerHTML =
      '<small class="eyebrow">FIELD NOTE / 随手记</small><h3>先把问题留下来。</h3><p class="lede">一个没想通的连接，一条还没有验证的猜想。</p><label class="notes-label" for="notes">研究便笺</label><textarea class="notes" id="notes" placeholder="此刻，你在想什么？" maxlength="4000"></textarea><p class="note-status">仅保留在当前页面；关闭面板不会丢失，刷新后清空。<span id="note-count"></span></p>';
    $('#notes').value = notes;
    $('#note-count').textContent = ' · ' + notes.length + ' / 4000';
  }
}
function content(id) {
  if (id === 'tablet') return tabletPage();
  const common = '<article class="reading">';
  if (id === 'specimen')
    body.innerHTML =
      common +
      '<small class="eyebrow">M-01 / 结构研究 · 原创曲面模型</small><h3>一张曲面，<br>两种材料的交界。</h3><p>试样把连续的象牙白曲面固定在细小的钛金属构件上。柔和的几何与精确的接点，在同一件物体里保持各自的特征。</p>' +
      diagram() +
      '<dl><dt>形态</dt><dd>莫比乌斯带 · 连续曲面</dd><dt>支撑</dt><dd>钛金属支杆与局部夹持</dd><dt>空间位置</dt><dd>桌面左侧的独立试样柜</dd></dl><p class="subtle">这是用于比较材质和空间关系的视觉试样，没有对应真实实验测量。</p></article>';
  if (id === 'report')
    body.innerHTML =
      common +
      '<small class="eyebrow">RESEARCH NOTE / 001 · 设计手记</small><h3>连接材料，连接记忆。</h3><p>学习让知识进入，复习让连接留下。工作台把这些连接带回一个人的日常：一张正在读的纸，一个尚未完成的问题，一扇可以望向天空的窗。</p>' +
      diagram() +
      '<h4>01 / 结构与生命</h4><p>脊柱区的骨架承担记忆的组织，工作台上的材料试样则把同样的关系缩小到手边。研究的对象清楚可见，周围留给人操作和思考的空间。</p><h4>02 / 计算与记录</h4><p>平板沿用复习区的深色玻璃和细线层级。研究、专注与便笺在同一个终端里展开，返回时仍然坐在原来的桌前。</p><h4>03 / 向天空提问</h4><p>窗台上的纸飞机还没有出发。视线越过桌面和地平线，先把一个问题留给远方。</p><p class="subtle">本篇为范本中的原创示例手记。</p><button class="paper-preview-link" data-preview="papers">每周论文 · 界面预览 ↗</button></article>';
  if (id === 'sky')
    body.innerHTML =
      common +
      '<small class="eyebrow">LEARN → RECALL → BEYOND</small><h3>天空并非极限。</h3><p>从这张桌子望出去，仍然是地面上的天空。窗台的纸飞机，留给下一次出发。</p>' +
      diagram('sky') +
      '<h4>观星台 · 内容预览</h4><p>看看银河、行星轨道与东京今日天象。星空页面保留为独立内容预览，可以随时返回工作台。</p><a class="action-link" href="../preview/starfield/?from=workstation">进入星空预览 ↗</a><p class="subtle">工作台与星空之间的飞行演变动画留待后续设计。</p></article>';
  if (id === 'about')
    body.innerHTML =
      common +
      '<small class="eyebrow">ZHIXU / 03 · WORKSTATION</small><h3>研究，也是一种生活。</h3><p>这是一处与实验室、脊柱区共用石墨、象牙白和钛金属的个人研究空间。窗景和室内光随东京时段变化。白天的光落在桌面上，画灯照着墙上的研究；平板、手记与材料试样承载桌前的日常。</p><h4>这一版可以体验</h4><p>拖动观察空间，打开平板和研究手记，查看材料试样，切换台灯，预览晨光、黄昏与深夜。平板的“个人工具”可以查看课表、番茄钟、餐盘、日历、论文、希可和特蕾莎陪学的界面截图。另有专注试用与便笺可以实际使用，但不写入正式数据。</p><h4>仍在设计中</h4><p>工作台与实验室、脊柱区的连续镜头，纸飞机到星空的过渡，以及个人工具的正式数据接入。</p><a class="action-link" href="../">返回沙盒目录 ↗</a></article>';
  if (id === 'art')
    body.innerHTML =
      '<article class="art-gallery"><p class="lede">把研究对象留在桌上，把尚未回答的问题挂在墙上。</p><div class="art-pair"><figure><img src="art/continuum.png" alt="连续体：象牙色曲面与细密分枝交织的原创抽象画" width="1086" height="1448" /><figcaption><small>01 / CONTINUUM</small><h3>连续体</h3><p>形态折转，连接延伸。生命与材料之间，一条尚未闭合的思路。</p></figcaption></figure><figure><img src="art/distant-field.png" alt="远场：深青灰色空间中的轨迹、薄膜与远方天体" width="1086" height="1448" /><figcaption><small>02 / DISTANT FIELD</small><h3>远场</h3><p>从一段轨迹望向远处。计算、生命与天空，共用同一个未完成的问题。</p></figcaption></figure></div><p class="subtle">ZHIXU · 2026 · 原创生成作品</p></article>';
}
function animatePanel(opening, id) {
  panelAnimation?.cancel();
  if (!motion) return Promise.resolve();
  // 露娜：平板用开机动画展开 / 收回（boot.js）
  if (id === 'tablet' && window.zxBoot) return window.zxBoot.animate(opening, dialog);
  const p = projected[id] || { x: innerWidth / 2, y: innerHeight * 0.65 };
  const x = (p.x - innerWidth / 2) * 0.45,
    y = (p.y - innerHeight / 2) * 0.45;
  const compact = { opacity: 0, transform: 'translate(' + x + 'px,' + y + 'px) scale(.83)' };
  const full = { opacity: 1, transform: 'translate(0,0) scale(1)' };
  panelAnimation = dialog.animate(opening ? [compact, full] : [full, compact], {
    duration: opening ? 620 : 340,
    easing: 'cubic-bezier(.2,.75,.2,1)',
  });
  return panelAnimation.finished.catch(() => {});
}
function select(id, trigger) {
  if (id === 'seeko') {
    tab = 'tools';
    previewTool = 'seeko';
    id = 'tablet';
  }
  if (id === 'lamp') return toggleLamp();
  // 露娜：纸飞机起飞，一路飞进星空（flight.js）
  if (id === 'sky' && window.zxFlight) return void window.zxFlight.start();
  if (!sections[id]) return;
  if (closing) {
    panelAnimation?.cancel();
    closing = false;
  }
  lastFocus =
    trigger ||
    document.querySelector('.object-dock [data-object="' + id + '"]') ||
    (id === 'art' ? $('#art-button') : null) ||
    $('#about-button');
  active = id;
  document.querySelectorAll('details[open]').forEach((d) => (d.open = false));
  $('#detail-code').textContent = sections[id][0];
  $('#detail-title').textContent = sections[id][1];
  content(id);
  document.body.classList.add('detail-open');
  scene?.focus(id);
  if (!dialog.open) dialog.showModal();
  animatePanel(true, id);
  $('#close-detail').focus({ preventScroll: true });
}
async function close() {
  if (!dialog.open || closing) return;
  closing = true;
  scene?.reset();
  await animatePanel(false, active);
  if (!closing) return;
  dialog.close();
  active = null;
  closing = false;
  document.body.classList.remove('detail-open');
  lastFocus?.focus({ preventScroll: true });
}
function toggleLamp() {
  lamp = !lamp;
  lampTouched = true;
  scene?.lamp(lamp);
  updateLamp();
}
function updateLamp() {
  $('#lamp-control').setAttribute('aria-pressed', String(lamp));
  $('#lamp-control').textContent = '灯 · ' + (lamp ? '开' : '关');
  const b = $('.hotspots [data-object="lamp"]');
  b.setAttribute('aria-pressed', String(lamp));
  b.querySelector('span').innerHTML = '<small>LIGHT / LOCAL</small>台灯 · ' + (lamp ? '开' : '关');
}
function syncMotion() {
  if (preference.matches) motion = false;
  $('#motion').setAttribute('aria-pressed', String(motion));
  $('#motion').textContent = '动效 · ' + (motion ? '开' : '关');
  document.body.classList.toggle('motion-off', !motion);
  scene?.motion(motion);
  if (!motion) panelAnimation?.finish();
}
function refreshAtmosphere() {
  const a = atmosphere(new Date(), mood);
  $('#period').textContent =
    mood === 'auto' ? '东京 · ' + names[a.phase] : names[a.phase] + ' · 预览';
  const key = JSON.stringify(a);
  if (key === themeKey) return;
  themeKey = key;
  for (const k of ['bg', 'surface']) document.documentElement.style.setProperty('--' + k, a[k]);
  document.body.dataset.period = a.phase;
  scene?.atmosphere(a);
  if (!lampTouched) {
    lamp = a.phase !== 'day';
    scene?.lamp(lamp);
    updateLamp();
  }
}
function updateTimer() {
  if (!$('#timer')) return;
  const n = timer.seconds;
  $('#timer').textContent =
    String(Math.floor(n / 60)).padStart(2, '0') + ':' + String(n % 60).padStart(2, '0');
  $('#timer-toggle').textContent = timer.running
    ? '暂停'
    : n === 0
      ? '本段结束'
      : n === 1500
        ? '开始专注'
        : '继续专注';
  $('#timer-toggle').disabled = n === 0;
  $('#timer-status').textContent =
    n === 0
      ? '这一段时间结束了。可以休息片刻，再重新开始。'
      : timer.running
        ? '正在计时。可以收起终端，计时会继续。'
        : '仅在当前页面计时，不会写入学习记录。';
}
document
  .querySelectorAll('[data-object]')
  .forEach((b) => b.addEventListener('click', () => select(b.dataset.object, b)));
$('#about-button').addEventListener('click', (e) => select('about', e.currentTarget));
$('#art-button').addEventListener('click', (e) => select('art', e.currentTarget));
$('#close-detail').addEventListener('click', close);
$('#back-detail').addEventListener('click', close);
dialog.addEventListener('cancel', (e) => {
  e.preventDefault();
  close();
});
dialog.addEventListener('click', (e) => {
  if (e.target === dialog) {
    const r = dialog.getBoundingClientRect();
    if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom)
      close();
  }
});
$('#motion').addEventListener('click', () => {
  motion = !motion;
  syncMotion();
});
preference.addEventListener('change', () => {
  motion = !preference.matches && params.get('motion') !== '0';
  syncMotion();
});
$('#reset-view').addEventListener('click', () => scene?.reset());
$('#lamp-control').addEventListener('click', toggleLamp);
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && !dialog.open) {
    document.querySelectorAll('details[open]').forEach((d) => {
      d.open = false;
      d.querySelector('summary').focus();
    });
    scene?.reset();
  }
});
document.addEventListener('pointerdown', (e) =>
  document.querySelectorAll('details[open]').forEach((d) => {
    if (!d.contains(e.target)) d.open = false;
  }),
);
document.querySelectorAll('[data-mood]').forEach((b) =>
  b.addEventListener('click', () => {
    mood = b.dataset.mood;
    $('#moods').open = false;
    document
      .querySelectorAll('[data-mood]')
      .forEach((x) => x.setAttribute('aria-pressed', String(x.dataset.mood === mood)));
    refreshAtmosphere();
  }),
);
body.addEventListener('click', (e) => {
  const target = e.target.closest('button');
  if (!target) return;
  if (target.dataset.preview && toolPreviews.some((t) => t.id === target.dataset.preview)) {
    previewTool = target.dataset.preview;
    tab = 'tools';
    if (active === 'tablet') renderTab();
    else select('tablet');
    body.scrollTop = 0;
    $('#preview-title')?.focus({ preventScroll: true });
  }
  if (target.hasAttribute('data-preview-back')) {
    const previous = previewTool;
    previewTool = null;
    renderTab();
    body.scrollTop = 0;
    body.querySelector('[data-preview="' + previous + '"]')?.focus();
  }
  if (target.dataset.tab) {
    tab = target.dataset.tab;
    if (tab === 'tools') previewTool = null;
    renderTab();
    body.scrollTop = 0;
    document.querySelector('.tablet-tabs [data-tab="' + tab + '"]')?.focus();
  }
  if (target.id === 'timer-toggle') {
    timer.running ? timer.pause() : timer.start();
    updateTimer();
  }
  if (target.id === 'timer-reset') {
    timer.reset();
    updateTimer();
  }
});
body.addEventListener('input', (e) => {
  if (e.target.id === 'notes') {
    notes = e.target.value;
    $('#note-count').textContent = ' · ' + notes.length + ' / 4000';
  }
});
function tick() {
  $('#clock').textContent = timeFormatter.format(new Date());
  updateTimer();
  refreshAtmosphere();
}
syncMotion();
tick();
setInterval(tick, 1000);
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) tick();
});
try {
  await document.fonts.ready;
  if (params.get('view') === 'fallback') throw new Error('Fallback preview');
  const { createScene } = await import('./scene.js?v=24');
  scene = createScene($('#scene'), {
    motion,
    onSelect: select,
    onHover(id) {
      document.querySelectorAll('.hotspots [data-object]').forEach((b) => {
        b.classList.toggle('is-hovered', b.dataset.object === id);
      });
    },
    onProject(points) {
      projected = points;
      for (const b of document.querySelectorAll('.hotspots [data-object]')) {
        const p = points[b.dataset.object];
        if (!p) continue;
        b.style.left = p.x + 'px';
        b.style.top = p.y + 'px';
        b.classList.toggle('visible', p.visible);
        b.tabIndex = -1;
        b.style.visibility = p.visible ? 'visible' : 'hidden';
      }
    },
  });
  themeKey = '';
  refreshAtmosphere();
  scene.lamp(lamp);
  // 露娜的动画模块（luna.js）用：场景、当前时段、物件在屏幕上的位置
  window.zxStation = { scene, mood: () => mood, anchor: (id) => projected[id] };
  // 只包含原型状态的检查入口，无正式数据或网络请求。
  window.zhixuWorkstation = {
    stats: () => scene.stats(),
    get active() {
      return active;
    },
    get motion() {
      return motion;
    },
    get mood() {
      return mood;
    },
  };
} catch (error) {
  document.body.classList.add('no-webgl');
  if (params.get('view') !== 'fallback') console.warn('工作台使用无 WebGL 回退：', error.message);
}
$('#scene-status').hidden = true;
