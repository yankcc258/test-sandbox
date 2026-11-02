// Static screenshots only. The terminal never mounts the artboard source or connects live tools.
export const toolPreviews = [
  {
    id: 'schedule',
    desktopHeight: 656,
    mobileHeight: 777,
    number: '01',
    title: '课表与出席',
    english: 'SCHEDULE',
    summary: '课程安排、出席簿与作业。',
    alt: '一周课表、待办作业与出席记录的界面预览。',
    desktop: new URL('./previews/schedule-desktop.jpg', import.meta.url).href,
    mobile: new URL('./previews/schedule-mobile.jpg', import.meta.url).href,
  },
  {
    id: 'pomodoro',
    desktopHeight: 727,
    mobileHeight: 826,
    number: '02',
    title: '番茄钟',
    english: 'FOCUS',
    summary: '专注、休息，留出完整的时间。',
    alt: '25 分钟专注、短休息和长休息设置的界面预览。',
    desktop: new URL('./previews/pomodoro-desktop.jpg', import.meta.url).href,
    mobile: new URL('./previews/pomodoro-mobile.jpg', import.meta.url).href,
  },
  {
    id: 'meals',
    desktopHeight: 791,
    mobileHeight: 826,
    number: '03',
    title: '餐盘与锻炼',
    english: 'DAILY LIFE',
    summary: '餐次、饮水与日常活动。',
    alt: '示例餐次、饮水及活动记录的界面预览。',
    desktop: new URL('./previews/meals-desktop.jpg', import.meta.url).href,
    mobile: new URL('./previews/meals-mobile.jpg', import.meta.url).href,
  },
  {
    id: 'calendar',
    desktopHeight: 760,
    mobileHeight: 985,
    number: '04',
    title: '学习日历',
    english: 'CALENDAR',
    summary: '把学习与生活放进同一条时间线。',
    alt: '2026 年 11 月日历及选中日期的示例安排。',
    desktop: new URL('./previews/calendar-desktop.jpg', import.meta.url).href,
    mobile: new URL('./previews/calendar-mobile.jpg', import.meta.url).href,
  },
  {
    id: 'papers',
    desktopHeight: 818,
    mobileHeight: 758,
    number: '05',
    title: '每周论文',
    english: 'READING',
    summary: '阅读方向、摘要与收藏。',
    alt: '结构材料和推进系统材料的论文阅读版式，标题为示例。',
    desktop: new URL('./previews/papers-desktop.jpg', import.meta.url).href,
    mobile: new URL('./previews/papers-mobile.jpg', import.meta.url).href,
  },
  {
    id: 'seeko',
    desktopHeight: 666,
    mobileHeight: 779,
    number: '06',
    title: 'Seeko · 希可',
    english: 'COMPANION',
    summary: '讲知识、聊两句，也记得休息。',
    alt: '希可捧书的形象、展示台词与学习和生活入口。',
    desktop: new URL('./previews/seeko-desktop.jpg', import.meta.url).href,
    mobile: new URL('./previews/seeko-mobile.jpg', import.meta.url).href,
  },
  {
    id: 'theresa',
    desktopHeight: 806,
    mobileHeight: 759,
    number: '07',
    title: '特蕾莎的陪学',
    english: 'STUDY TOGETHER',
    summary: '一起读，想一想，再展开答案。',
    alt: '特蕾莎的陪学目录、阅读内容与思考题的界面预览。',
    desktop: new URL('./previews/theresa-desktop.jpg', import.meta.url).href,
    mobile: new URL('./previews/theresa-mobile.jpg', import.meta.url).href,
  },
];
export function toolOverview() {
  return `<div class="tools-heading"><small class="eyebrow">PERSONAL TOOLS / 07</small><h3>学习，也在日常里。</h3><p class="lede">让安排、研究与陪伴，回到这张桌前。</p><span class="preview-label">界面截图 · 示例内容</span></div><div class="tool-grid">${toolPreviews.map((t) => `<button class="tool-card" data-preview="${t.id}"><span class="tool-number">${t.number}<i>↗</i></span><small>${t.english}</small><strong>${t.title}</strong><p>${t.summary}</p><span class="tool-card-foot">查看界面预览</span></button>`).join('')}</div><p class="tools-note">这轮先看入口和界面排布。图内按钮、记录和对话仅作展示。</p>`;
}
export function toolScreenshot(id) {
  const index = toolPreviews.findIndex((t) => t.id === id);
  if (index < 0) return toolOverview();
  const t = toolPreviews[index];
  const previous = toolPreviews[(index + toolPreviews.length - 1) % toolPreviews.length];
  const next = toolPreviews[(index + 1) % toolPreviews.length];
  return `<div class="preview-toolbar"><button data-preview-back>← 全部工具</button><span>${t.number} / 07</span><span class="preview-label">静态预览</span><a class="preview-original desktop-original" href="${t.desktop}" target="_blank" rel="noopener">查看原图 ↗</a><a class="preview-original mobile-original" href="${t.mobile}" target="_blank" rel="noopener">查看原图 ↗</a></div><div class="preview-heading"><small class="eyebrow">${t.english}</small><h3 tabindex="-1" id="preview-title">${t.title}</h3><p>${t.summary}</p></div><figure class="tool-screenshot"><picture><source media="(max-width: 699px)" srcset="${t.mobile}" width="390" height="${t.mobileHeight}"><img src="${t.desktop}" alt="${t.alt}" width="1120" height="${t.desktopHeight}" decoding="async"></picture><figcaption>界面截图 · 示例内容 · 未连接正式数据或 AI 对话</figcaption></figure><nav class="preview-pagination" aria-label="切换工具预览"><button data-preview="${previous.id}" aria-label="上一个：${previous.title}">← ${previous.title}</button><button data-preview="${next.id}" aria-label="下一个：${next.title}">${next.title} →</button></nav>`;
}
