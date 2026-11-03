import { BODY_INFO } from './body-info.js?v=29';
import { skyDay, skyClock } from './orbit-sky.js';

const byId = (id) => document.getElementById(id);
const stamp = (date) => `${skyDay(new Date(date))} · ${skyClock(new Date(date))} JST`;
function rows(target, values) {
  target.replaceChildren(
    ...values.map(([label, value]) => {
      const row = document.createElement('div');
      const dt = document.createElement('dt');
      const dd = document.createElement('dd');
      dt.textContent = label;
      dd.textContent = value;
      row.append(dt, dd);
      return row;
    }),
  );
}
export function createBodyPanel(request, onSelect, onClose) {
  const panel = byId('body-detail');
  let savedScroll = 0;
  let selected = null,
    generation = 0,
    lastTrigger = null;
  const nav = byId('body-nav');
  for (const [id, info] of Object.entries(BODY_INFO)) {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = info.name;
    button.dataset.body = id;
    button.setAttribute('aria-label', `查看${info.name}详情`);
    button.setAttribute('aria-pressed', 'false');
    button.onclick = () => onSelect(id, button);
    nav.append(button);
  }
  async function refresh() {
    if (!selected) return;
    const id = selected,
      token = ++generation;
    byId('body-status').textContent = '正在计算东京观测信息…';
    try {
      const { observation: o } = await request({ type: 'body', body: id, timestamp: Date.now() });
      if (token !== generation || id !== selected) return;
      byId('body-time').textContent = stamp(o.timestamp);
      const values = o.observer
        ? [
            ['观察位置', '东京 · 35.68°N / 139.69°E'],
            ['观察原点', '地球表面'],
          ]
        : [
            ['距地心', `${Math.round(o.distanceKm).toLocaleString('zh-CN')} km`],
            ['方位角 · 北起顺时针', `${o.azimuth.toFixed(1)}°`],
            [
              '视高度',
              `${o.altitude.toFixed(1)}° · ${o.altitude >= 0 ? '地平线上方' : '地平线下方'}`,
            ],
            ['下次升起', o.rise ? stamp(o.rise) : '未来 48 小时内无'],
            ['下次落下', o.set ? stamp(o.set) : '未来 48 小时内无'],
          ];
      if (typeof o.illumination === 'number')
        values.push(['月面照亮比例', `${(o.illumination * 100).toFixed(1)}%`]);
      rows(byId('body-observation'), values);
      byId('body-status').textContent = o.observer
        ? '日月与行星的观测位置以东京为基准。'
        : '按真实时刻计算；地平线上方不代表已满足天气、日光等观测条件。';
    } catch {
      if (token !== generation || id !== selected) return;
      byId('body-status').textContent = '观测计算暂不可用。基础档案仍可阅读，稍后会自动重试。';
    }
  }
  function close() {
    onClose();
  }
  byId('body-close').onclick = close;
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && selected) {
      event.preventDefault();
      close();
    }
  });
  return {
    refresh,
    open(id, trigger) {
      const info = BODY_INFO[id];
      if (!info) return;
      const wasOpen = !!selected;
      if (!wasOpen) {
        lastTrigger = trigger || document.activeElement;
        savedScroll = window.scrollY;
      }
      selected = id;
      panel.hidden = false;
      document.body.classList.add('body-focused');
      if (innerWidth <= 900) window.scrollTo({ top: 0, behavior: 'instant' });
      byId('body-title').textContent = info.name;
      byId('body-subtitle').textContent = info.en;
      byId('body-kind').textContent = info.kind;
      byId('body-description').textContent = info.description;
      byId('body-time').textContent = 'TOKYO · 真实时刻';
      rows(byId('body-facts'), info.facts);
      byId('body-observation').replaceChildren();
      byId('body-source').textContent = info.source.label;
      byId('body-source').href = info.source.url;
      nav
        .querySelectorAll('button')
        .forEach((button) =>
          button.setAttribute('aria-pressed', String(button.dataset.body === id)),
        );
      (panel.querySelector('.body-detail-content') || panel).scrollTop = 0;
      // Canvas/label clicks need an accessible reading destination. Switching
      // with the persistent nav keeps keyboard focus on that navigation.
      if (!trigger?.closest('#body-nav')) byId('body-close').focus({ preventScroll: true });
      refresh();
    },
    hide() {
      if (!selected) return;
      selected = null;
      generation++;
      panel.hidden = true;
      document.body.classList.remove('body-focused');
      if (innerWidth <= 900) window.scrollTo({ top: savedScroll, behavior: 'instant' });
      nav.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', 'false'));
      if (lastTrigger?.isConnected) lastTrigger.focus({ preventScroll: true });
    },
  };
}
