// Static artboards for browser screenshots. No API, storage, timer or AI calls.
const seekoImage = new URL('./assets/seeko-read.webp', import.meta.url).href;
const theresaImage = new URL('./assets/theresa.png', import.meta.url).href;
const stamp = '<div class="date"><b>11.02</b>MON · TOKYO</div>';
const heading = (code, title, description) =>
  `<div class="heading"><div><small class="kicker">${code}</small><h1>${title}</h1><p>${description}</p></div>${stamp}</div>`;
const chip = (label, active = false) =>
  `<span class="chip${active ? ' active' : ''}">${label}</span>`;
const item = (time, title, text, tail = '') =>
  `<div class="item"><span class="num">${time}</span><div><strong>${title}</strong><p>${text}</p></div><span class="tail">${tail}</span></div>`;
const task = (title, detail) =>
  `<div class="task"><i></i><div>${title}<small>${detail}</small></div></div>`;

const artboards = {
  schedule: () =>
    heading('01 / SCHEDULE & ATTENDANCE', '课表与出席', '把一周的安排，放在眼前。') +
    `<div class="bar">${chip('本周课表', true)}${chip('出席簿')}${chip('作业')}<span class="meta">11.02 — 11.08 · 第 6 周</span></div><div class="split"><section><div class="week"><span></span>${['一 02', '二 03', '三 04', '四 05', '五 06'].map((d, i) => `<div class="day ${i === 0 ? 'today' : ''}">${d}</div>`).join('')}${[
      ['09:00', ['高等数学', 'A-201'], null, ['物理化学', 'B-302'], null, ['材料导论', 'A-105']],
      ['10:50', ['材料力学', 'B-204'], ['学术日语', 'C-108'], null, ['高等数学', 'A-201'], null],
      [
        '13:30',
        null,
        ['材料实验', '实验室 02'],
        ['学术英语', 'C-203'],
        null,
        ['研究讨论', '研讨室'],
      ],
    ]
      .map(
        ([time, ...slots]) =>
          `<span class="time">${time}</span>${slots.map((s) => `<div class="slot ${s ? 'filled' : ''}">${s ? `<b>${s[0]}</b><small>${s[1]}</small>` : ''}</div>`).join('')}`,
      )
      .join(
        '',
      )}</div><div class="today-list"><div class="section-label">MONDAY / 周一 <span class="tag">2 节课 · 示例</span></div>${item('09:00', '高等数学', 'A-201 · 90 分钟', '第 1 节')}${item('10:50', '材料力学', 'B-204 · 90 分钟', '第 2 节')}<div class="pane"><small class="kicker">NEXT / 周二</small><p>学术日语 · 材料实验</p></div></div></section><aside class="side"><div class="section-label">接下来要做</div>${task('整理材料实验记录', '11.04 前 · 示例作业')}${task('完成本周练习', '11.06 前 · 示例作业')}<div class="attendance"><div class="line"></div><h3>出席簿</h3><p>出席、迟到、缺席与停课，<br>回到课程里查看。</p><span class="quiet">查看课程记录 ↗</span></div></aside></div>`,
  pomodoro: () =>
    heading('02 / FOCUS SESSION', '番茄钟', '给一个问题，留一段完整的时间。') +
    `<div class="bar">${chip('专注', true)}${chip('短休息')}${chip('长休息')}<span class="meta">SESSION / 01</span></div><div class="focus-layout"><section><div class="dial"><svg viewBox="0 0 300 300" aria-hidden="true"><circle cx="150" cy="150" r="135" fill="none" stroke="#95b5a923" stroke-width="1"/><circle cx="150" cy="150" r="123" fill="none" stroke="#7f95872c" stroke-width="2"/><circle cx="150" cy="150" r="123" fill="none" stroke="#c7d891" stroke-width="2" stroke-dasharray="705 773" transform="rotate(-90 150 150)"/><path d="M150 9v8m141 133h-8M150 291v-8M9 150h8" stroke="#9eb3a1"/></svg><div class="dial-center"><small>TIME TO THINK</small><strong>25:00</strong><small>准备开始 · 静态预览</small><div class="cycle"><i></i><i></i><i></i><i></i></div></div></div><div class="focus-actions"><span class="primary">开始专注</span><span class="quiet">重新计时</span></div></section><section class="focus-notes"><div class="section-label">这一段，想弄懂什么？</div><h2>读完一页，写下一个问题。</h2><p>把任务拆小一点，让注意力有一个落点。</p><div class="line"></div><div class="setting-row"><span>专注时长</span><b>25 <small>min</small></b></div><div class="setting-row"><span>短休息 / 长休息</span><b>05 / 15 <small>min</small></b></div><div class="setting-row"><span>长休息间隔</span><b>4 <small>轮</small></b></div></section></div>`,
  meals: () =>
    heading('03 / MEALS · WATER · MOVEMENT', '餐盘与锻炼', '研究之外，也照顾好每天的生活。') +
    `<div class="metrics"><div><b>02<em>/ 03</em></b><small>餐次记录 · 示例</small></div><div><b>1.25<em>L</em></b><small>饮水记录 · 示例</small></div><div><b>4,200</b><small>步行记录 · 示例</small></div></div><div class="split"><section><div class="section-label">写下吃了什么</div><div class="write-field">例如：午餐吃了米饭、烤鱼和蔬菜。<br>也可以从食物库选，或添加一张照片。</div><div class="field-actions"><span class="small">文字 / 照片 / 食物库</span><span class="primary">记一餐</span></div><div class="line"></div><div class="section-label">今天的餐盘</div><div class="meal"><span class="time">08:20</span><div><strong>鸡蛋、吐司与牛奶</strong><small>早餐 · 示例条目</small></div></div><div class="meal"><span class="time">12:30</span><div><strong>米饭、烤鱼与蔬菜</strong><small>午餐 · 示例条目</small></div></div></section><aside class="side"><h3>手边的一杯水</h3><div class="water">${'<i></i>'.repeat(8)}</div><span class="quiet">＋ 250 ml</span><div class="move"><div class="line"></div><h3>今天，动一动</h3><p>散步 / 骑行 / 自定义活动</p><span class="quiet">记录活动 ↗</span><div class="line"></div><p>希可的每日点评<br><span class="small">预留在餐盘记录之后</span></p></div></aside></div>`,
  calendar: () => {
    const dates = [
      26,
      27,
      28,
      29,
      30,
      31,
      ...Array.from({ length: 30 }, (_, i) => i + 1),
      1,
      2,
      3,
      4,
      5,
      6,
    ];
    return (
      heading('04 / PERSONAL CALENDAR', '学习日历', '让零散的进展，慢慢连成一条线。') +
      `<div class="bar">${chip('2026 年 11 月', true)}${chip('‹')}${chip('今天')}${chip('›')}<span class="meta">MONTH / 11</span></div><div class="split"><section><div class="calendar">${['一', '二', '三', '四', '五', '六', '日'].map((d) => `<div class="cal-head">${d}</div>`).join('')}${dates.map((d, i) => `<div class="cal-cell ${i < 6 || i > 35 ? 'out' : ''} ${i === 7 ? 'selected' : ''}">${d}<div class="dots">${i === 7 ? '<i></i><i></i>' : i === 9 || i === 14 || i === 18 ? '<i></i>' : ''}</div></div>`).join('')}</div><div class="legend"><span><i></i>课程与学习</span><span><i></i>生活与专注</span><span>示例标记</span></div></section><aside class="side"><div class="section-label">11.02 / 星期一 <span class="tag">选中日期</span></div>${item('01', '课程安排', '高等数学 · 材料力学')}${item('02', '专注时段', '一段完整的阅读时间')}${item('03', '生活记录', '餐盘与饮水')}<p class="small">当天的学习与生活，在这里汇合。</p></aside></div>`
    );
  },
  papers: () =>
    heading('05 / WEEKLY PAPERS', '每周论文', '从一篇论文，走近一个研究方向。') +
    `<div class="bar">${chip('本期阅读', true)}${chip('我的收藏')}${chip('阅读方向')}<span class="meta">ISSUE / 001 · 版式示例</span></div><div class="split"><section><article class="paper-card"><div class="paper-strip"><span class="tag">结构材料</span><span class="small">☆ 收藏</span></div><h2>多孔结构：<br>形态怎样影响性能</h2><span class="meta">READING DIRECTION / 阅读方向示意</span><p class="abstract">这里放论文的中文概述、推荐理由与日文摘要，帮助判断它是否值得继续读下去。</p><blockquote>读之前，先带着一个问题：<br>作者改变了什么，又观察到了什么？</blockquote><span class="quiet">完整摘要 ↗</span> <span class="quiet">希可 · 大白话</span></article><div class="paper-row"><span class="meta">02</span><div><strong>推进系统材料：从环境条件出发</strong><p>第二篇的列表预览 · 非真实论文推荐</p></div></div></section><aside class="side"><div class="section-label">阅读线索</div><div class="saved"><small>STRUCTURE</small><h3>结构材料</h3><p>结构 / 界面 / 性能</p></div><div class="saved"><small>PROPULSION</small><h3>推进系统材料</h3><p>高温 / 环境 / 寿命</p></div><p>收藏有价值的线索，<br>留给下一次深入阅读。</p></aside></div>`,
  seeko: () =>
    heading('06 / SEEKO · PERSONAL ASSISTANT', 'Seeko · 希可', '住在桌旁，也陪你把问题想清楚。') +
    `<div class="companion"><section><div class="character"><i class="orbit"></i><img src="${seekoImage}" alt="希可捧着书" /></div><div class="char-label">SEEKO / RESEARCH COMPANION</div></section><section><div class="say"><small>一句问候 · 展示台词</small><p>“先把书翻开。<br>问题可以慢慢想，我又不会跑。”</p></div><div class="companion-actions"><div><strong>讲讲这个知识点 ↗</strong><small>把复杂的内容拆开</small></div><div><strong>今天的安排 ↗</strong><small>课表、待办与休息</small></div><div><strong>聊两句 ↗</strong><small>桌旁的一点陪伴</small></div><div><strong>衣柜与休息 ↗</strong><small>保留熟悉的希可</small></div></div><div class="message"><span>想问希可什么？</span><span>↗</span></div></section></div>`,
  theresa: () =>
    heading('07 / THERESA · STUDY TOGETHER', '特蕾莎的陪学', '今天也一起弄懂一点。') +
    `<div class="bar">${chip('一起读', true)}${chip('想一想')}${chip('学习记录')}<span class="meta">大狼陪你学</span></div><div class="split"><section><div class="theresa-intro"><img src="${theresaImage}" alt="特蕾莎头像"/><div><h2>不着急，我们一步一步来。</h2><p>读一回，想一想，再展开答案。</p></div></div><article class="reading-demo"><small class="kicker">01 / 从问题开始</small><h2>先把已知条件列出来。</h2><p>面对一道陌生的题，先读清楚题目在问什么。把已知量、未知量和限制条件分别写下来，再寻找它们之间的连接。</p><div class="thought"><small class="kicker">想一想</small><p>如果只用一句话，<br>你会怎样描述这个问题？</p></div><span class="quiet">＋ 展开思路与答案</span><p class="small">陪学版式示例 · 本段为原创展示内容</p></article></section><aside class="side"><div class="section-label">陪学目录</div><div class="lesson-row active"><small class="meta">01</small><b>从问题开始</b></div><div class="lesson-row"><small class="meta">02</small><b>把思路连起来</b></div><div class="lesson-row"><small class="meta">03</small><b>回头看一眼</b></div><p>不用急着点开答案。<br>先给自己一点思考的时间。</p></aside></div>`,
};
const requested = new URLSearchParams(location.search).get('tool');
const id = Object.hasOwn(artboards, requested) ? requested : 'schedule';
document.body.className = id === 'calendar' ? 'calendar-page' : id;
document.querySelector('#preview').innerHTML =
  `<div class="mast"><strong>知序 ZHIXU / PERSONAL</strong><span class="preview-tag">界面预览 · 示例内容</span></div>${artboards[id]()}<footer class="foot"><span>WORKSTATION OS / 03</span><span>展示数据 · 不代表实际记录</span></footer>`;
