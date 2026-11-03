// 今日天象与下一个天文事件：用 astronomy-engine（MIT，vendor/astronomy/）在浏览器里按东京计算，不依赖外部接口。
// 传入的 A 是 window.Astronomy；函数本身不读页面，与场景绘制独立。
const SKY_TOKYO = { lat: 35.68, lon: 139.69, height: 40 };
const SKY_PLANETS = [
  ['Mercury', '☿', '水星'],
  ['Venus', '♀', '金星'],
  ['Mars', '♂', '火星'],
  ['Jupiter', '♃', '木星'],
  ['Saturn', '♄', '土星'],
];
// 主要流星雨的极大日（每年大致固定，按东京日期）。
const SKY_SHOWERS = [
  [1, 4, '象限仪座流星雨'],
  [4, 22, '天琴座流星雨'],
  [5, 6, '宝瓶座 η 流星雨'],
  [8, 13, '英仙座流星雨'],
  [10, 21, '猎户座流星雨'],
  [11, 17, '狮子座流星雨'],
  [12, 14, '双子座流星雨'],
  [12, 22, '小熊座流星雨'],
];
const skyDay = (t) =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tokyo' }).format(new Date(t));
const skyClock = (t) =>
  new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Tokyo',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(new Date(t));
// 东京某一天 0 点对应的 UTC 时刻。
const skyMidnight = (day) => new Date(Date.parse(day + 'T00:00:00+09:00'));
function skyPhaseName(e) {
  if (e < 6 || e > 354) return '新月';
  if (e < 84) return '蛾眉月';
  if (e < 96) return '上弦月';
  if (e < 174) return '盈凸月';
  if (e < 186) return '满月';
  if (e < 264) return '亏凸月';
  if (e < 276) return '下弦月';
  return '残月';
}
// 某个时刻在东京地平线以上 5° 的行星，按亮度（星等越小越亮）排序。
function skyVisible(A, observer, time) {
  return SKY_PLANETS.map(([name, sym, cn]) => {
    const eq = A.Equator(name, time, observer, true, true),
      alt = A.Horizon(time, observer, eq.ra, eq.dec, 'normal').altitude;
    return { name, sym, cn, alt, mag: A.Illumination(name, time).mag };
  })
    .filter((p) => p.alt > 5)
    .sort((a, b) => a.mag - b.mag);
}
function orbitSkyToday(A, now = new Date()) {
  const observer = new A.Observer(SKY_TOKYO.lat, SKY_TOKYO.lon, SKY_TOKYO.height),
    day = skyDay(now),
    start = skyMidnight(day);
  const within = (t) => (t && skyDay(t.date) === day ? t.date : null);
  const find = (body, dir) => within(A.SearchRiseSet(body, observer, dir, start, 1));
  const sunrise = find('Sun', 1),
    sunset = find('Sun', -1),
    elongation = A.MoonPhase(now);
  // 「今晚」取日落后一个半小时，「黎明前」取日出前一个小时。
  const evening = new Date(
      (sunset || new Date(start.getTime() + 18 * 3600000)).getTime() + 5400000,
    ),
    dawn = new Date((sunrise || new Date(start.getTime() + 6 * 3600000)).getTime() - 3600000);
  return {
    day,
    sunrise,
    sunset,
    moonrise: find('Moon', 1),
    moonset: find('Moon', -1),
    phase: skyPhaseName(elongation),
    elongation,
    illumination: A.Illumination('Moon', now).phase_fraction,
    tonight: skyVisible(A, observer, evening),
    dawn: skyVisible(A, observer, new Date(dawn.getTime() + 86400000)),
  };
}
// 接下来一年里的天文事件，按时间排好。东京看不到的日月食会注明。
function orbitSkyEvents(A, now = new Date(), days = 400) {
  const observer = new A.Observer(SKY_TOKYO.lat, SKY_TOKYO.lon, SKY_TOKYO.height),
    end = now.getTime() + days * 86400000,
    events = [],
    add = (time, title, note = '', kind = '') => {
      const t = time instanceof Date ? time : time?.date;
      if (t && t.getTime() > now.getTime() && t.getTime() < end)
        events.push({ time: t, title, note, kind });
    };
  add(A.SearchMoonPhase(0, now, 40), '新月', '', 'moon');
  add(A.SearchMoonPhase(180, now, 40), '满月', '', 'moon');
  const quarter = A.SearchMoonQuarter(now);
  if (quarter.quarter % 2)
    add(quarter.time, quarter.quarter === 1 ? '上弦月' : '下弦月', '', 'moon');
  const lunar = A.SearchLunarEclipse(now),
    lunarName = { total: '月全食', partial: '月偏食', penumbral: '半影月食' }[lunar.kind];
  if (lunarName) {
    const eq = A.Equator('Moon', lunar.peak, observer, true, true),
      up = A.Horizon(lunar.peak, observer, eq.ra, eq.dec, 'normal').altitude > 0;
    add(lunar.peak, lunarName, up ? '东京可见' : '东京看不到', 'eclipse');
  }
  const local = A.SearchLocalSolarEclipse(now, observer),
    solar = A.SearchGlobalSolarEclipse(now),
    solarName = (k) => ({ total: '日全食', annular: '日环食', partial: '日偏食' })[k];
  add(local.peak.time, solarName(local.kind), '东京可见', 'eclipse');
  if (Math.abs(solar.peak.date - local.peak.time.date) > 86400000)
    add(solar.peak, solarName(solar.kind), '东京看不到', 'eclipse');
  const year = Number(skyDay(now).slice(0, 4));
  for (const y of [year, year + 1]) {
    const s = A.Seasons(y);
    add(s.mar_equinox, '春分', '', 'season');
    add(s.jun_solstice, '夏至', '', 'season');
    add(s.sep_equinox, '秋分', '', 'season');
    add(s.dec_solstice, '冬至', '', 'season');
    for (const [m, d, name] of SKY_SHOWERS)
      add(
        new Date(
          Date.parse(
            `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}T22:00:00+09:00`,
          ),
        ),
        name,
        '极大',
        'shower',
      );
  }
  for (const [name, , cn] of SKY_PLANETS.slice(2))
    add(A.SearchRelativeLongitude(name, 0, now), `${cn}冲日`, '整夜可见、最亮', 'planet');
  for (const [name, , cn] of SKY_PLANETS.slice(0, 2)) {
    const e = A.SearchMaxElongation(name, now);
    add(
      e.time,
      `${cn}${e.visibility === 'evening' ? '东大距' : '西大距'}`,
      e.visibility === 'evening' ? '黄昏西方天空' : '黎明东方天空',
      'planet',
    );
  }
  return events.sort((a, b) => a.time - b.time);
}
// 「还有几天」按东京日期算：今天、明天、n 天后。
function orbitSkyCountdown(time, now = new Date()) {
  const days = Math.round((skyMidnight(skyDay(time)) - skyMidnight(skyDay(now))) / 86400000);
  return days <= 0 ? '今天' : days === 1 ? '明天' : `${days} 天后`;
}

export { SKY_TOKYO, skyDay, skyClock, orbitSkyToday, orbitSkyEvents, orbitSkyCountdown };
