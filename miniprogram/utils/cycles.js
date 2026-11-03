// 周期看板：从 /home 返回派生「看自己任务达成情况」的数据。
// 纯函数，无副作用，方便单测；前端只渲染，不重算口径。
//
// 数据来源（都已经在 /home 里，所以周期看板不用再开一个接口）：
//   - home.goals.week：本周各「周目标」项（心肺/抗阻/饮水周规则/英语周规则），
//     每项带 current / target / percent / closed / color / label / unit。
//   - home.habits.achievements.closedWeeks：所有已闭环周（周一日期）的数组，
//     这是服务端「周闭环」的唯一口径（月度奖章、排行榜都用它）。
//
// 时间算法与服务端 domain.js 的 monday/shift 完全一致，保证两端数能对上。
function shift(d, n) { return new Date(Date.parse(d + 'T12:00:00Z') + n * 86400000).toISOString().slice(0, 10); }
function monday(todayStr) {
  const off = (new Date(todayStr + 'T12:00:00Z').getUTCDay() + 6) % 7;
  return new Date(Date.parse(todayStr + 'T12:00:00Z') - off * 86400000).toISOString().slice(0, 10);
}

// 一个窗口内（从 fromMonday 到 today，含两端）闭环周的数量
function countClosed(closed, fromMonday, today) {
  let n = 0, m = fromMonday;
  while (m <= today) { if (closed.has(m)) n++; m = shift(m, 7); }
  return n;
}

// home：/home 的完整返回（至少含 goals.week 与 habits.achievements.closedWeeks）
function deriveCycles(home) {
  home = home || {};
  const goals = home.goals || {};
  const ach = (home.habits && home.habits.achievements) || {};
  const today = goals.today || home.today || new Date().toISOString().slice(0, 10);
  const weekStart = goals.weekStart || monday(today);

  // 本周目标：week 里没被隐藏、且真的定了线（target>0）的项才是考核项。
  // 没定线的是「仅记录」，画成 30 / 0 只会让人以为哪里错了。
  const weekGoals = (goals.week || [])
    .filter(it => it && it.hidden !== true && Number(it.target) > 0)
    .map(it => ({
      key: it.key,
      label: it.label,
      current: it.current,
      target: it.target,
      unit: it.unit || '',
      percent: Math.max(0, Math.min(100, Number(it.percent) || 0)),
      closed: !!it.closed,
      color: it.color || '#5C738A'
    }));
  const anyWeekly = weekGoals.length > 0;
  const weekClosed = anyWeekly && weekGoals.every(g => g.closed);

  const closed = new Set(ach.closedWeeks || []);

  // 本月：本日历月内、周一落在本月的「自然周」（与月度奖章同口径）。
  // 先用周一归到当月 1 号所在周，若那个周一落在上月，则顺延一周，避免把上月的尾巴周算进本月。
  const monthStart = today.slice(0, 7) + '-01';
  const nextMonth = shift(monthStart, 32).slice(0, 7) + '-01';
  let m0 = monday(monthStart);
  if (m0 < monthStart) m0 = shift(m0, 7);
  const monthMondays = [];
  for (let m = m0; m < nextMonth; m = shift(m, 7)) monthMondays.push(m);

  // 一个窗口 = 一串「周一起点」；闭合周在集合里就是完成。
  // 用日期数组而不是只数个数，前端才能把每一周画成一段（闭合=亮、未闭合=灰），
  // 一眼看出「哪几周坚持了」，比单根灰条直观得多。
  function weekList(startMonday, n) {
    const arr = []; let m = startMonday;
    for (let i = 0; i < n; i++) { arr.push(m); m = shift(m, 7); }
    return arr;
  }
  const windows = [
    { key: 'month', label: '本月', unit: '周', weeks: monthMondays },
    { key: 'quarter', label: '近12周', unit: '周', weeks: weekList(shift(weekStart, -7 * 11), 12) },
    { key: 'half', label: '近半年', unit: '周', weeks: weekList(shift(weekStart, -7 * 25), 26) },
    { key: 'year', label: '近1年', unit: '周', weeks: weekList(shift(weekStart, -7 * 51), 52) }
  ].map(w => {
    const segments = w.weeks.map(m => closed.has(m));
    return {
      key: w.key, label: w.label, unit: w.unit,
      total: w.weeks.length,
      completed: segments.filter(Boolean).length,
      segments
    };
  });

  return { today, weekStart, weekGoals, weekClosed, anyWeekly, windows };
}

// 个人视图（周期看板）的「本月强度构成」：全部从 /home 现成字段派生，纯前端、不新增接口。
// 周 / 月的时间分布由 heatmap() 的柱图承担，这里只算强度（饼图用）。
// 时区一律用 home.user.timeZone，和 domain.js 的 day() 同一套，归到「天」不串时区。
const { dateKey, CARDIO_TYPES } = require('./guidelines');
const { INTENSITY } = require('./tokens');

function intensityMix(home) {
  home = home || {};
  const zone = (home.user && home.user.timeZone) || 'Asia/Shanghai';
  const today = dateKey(Date.now(), zone);

  // 本月强度构成（按次数）：低 / 中 / 高。
  // 有氧的强度跟着「一次有氧」记，抗阻的强度现在打卡时也要登记（低/中/高，
  // 与有氧共用一套词），两股合成一张饼，才说得出「这个月练得偏轻还是偏重」。
  const monthStart = today.slice(0, 7) + '-01';
  const bucket = { low: 0, moderate: 0, vigorous: 0 };
  for (const a of (home.activities || [])) {
    if (CARDIO_TYPES.indexOf(a.type) < 0) continue;
    const d = dateKey(a.occurredAt, zone);
    if (d < monthStart || d > today) continue;
    const k = a.intensity === 'low' ? 'low' : (a.intensity === 'vigorous' ? 'vigorous' : 'moderate');
    bucket[k]++;
  }
  for (const s of (home.habits && home.habits.strengthSessions) || []) {
    if (s.date < monthStart || s.date > today) continue;
    const k = s.intensity === 'low' ? 'low' : (s.intensity === 'vigorous' ? 'vigorous' : 'moderate');
    bucket[k]++;
  }
  const intensityTotal = bucket.low + bucket.moderate + bucket.vigorous;
  const intensity = withPct([
    { key: 'low', label: '低强度', value: bucket.low, color: INTENSITY.low },
    { key: 'moderate', label: '中等', value: bucket.moderate, color: INTENSITY.moderate },
    { key: 'vigorous', label: '高强度', value: bucket.vigorous, color: INTENSITY.vigorous }
  ], intensityTotal);

  return { zone, today, intensity, intensityTotal };
}

// 百分比取整后要让三块加起来还是 100：整数部分先floor，剩下的按小数部分从大到小补。
// 32.4 / 32.4 / 35.2 直接四舍五入会得到 32/32/35=99，图例看着就像算错了。
function withPct(list, total) {
  if (!total) return list.map(it => Object.assign({}, it, { pct: 0 }));
  const exact = list.map(it => it.value / total * 100);
  const out = list.map((it, i) => Object.assign({}, it, { pct: Math.floor(exact[i]) }));
  let rest = 100 - out.reduce((n, it) => n + it.pct, 0);
  exact.map((e, i) => [e - Math.floor(e), i])
    .sort((a, b) => b[0] - a[0])
    .forEach(pair => { if (rest > 0) { out[pair[1]].pct++; rest--; } });
  return out;
}

// 交给页面 / 组件直接渲染的形态：窗口百分比、日期区间文案、每张卡的注释都在这里算一次。
// 「会员周期看板」「教练端我的看板」「会员页」三处共用，别再各写一套（分享图踩过这个坑）。
function board(home) {
  const c = deriveCycles(home);
  const weekEnd = c.weekStart ? shift(c.weekStart, 6) : '';
  const windows = c.windows.map(w => {
    const percent = w.total ? Math.round(w.completed / w.total * 100) : 0;
    let note = '每周目标全部达成，才算这周闭环';
    if (w.key === 'month') note = (w.completed === w.total && w.total > 0) ? '本月已集齐，月度奖章到手' : '每月全部周闭环 → 月度奖章';
    return Object.assign({}, w, { percent, note });
  });
  return {
    today: c.today,
    weekStart: c.weekStart,
    weekEnd,
    weekRange: c.weekStart ? c.weekStart.slice(5).replace('-', '/') + '–' + weekEnd.slice(5).replace('-', '/') : '',
    weekGoals: c.weekGoals,
    weekClosed: c.weekClosed,
    anyWeekly: c.anyWeekly,
    windows
  };
}

// 日历热力图（年 / 周 / 月 三视图）的数据：全部从 /home 现成字段派生，纯前端、不新增接口。
// 年和「周 / 月」柱用的都是同一套「当天动了几个项目」的口径：
//   level = 心肺(非散步)?1:0 + 散步?1:0 + 抗阻?1:0   （0–3，越深当天练得越全）
// 颜色用明亮青（与水同系，参考 fastlog / 各类打卡 APP 的贡献网格）。
//   饮水只有近 7 天、体测只有近 7 天轨迹，拿不到全年，故不进热力图，避免把「没数据」画成「没练」。
function heatmap(home) {
  home = home || {};
  const zone = (home.user && home.user.timeZone) || 'Asia/Shanghai';
  const today = dateKey(Date.now(), zone);
  const weekStart = monday(today);

  const cardioDay = {}, walkDay = {};
  for (const a of (home.activities || [])) {
    if (CARDIO_TYPES.indexOf(a.type) < 0) continue;
    const d = dateKey(a.occurredAt, zone);
    if (d > today) continue;
    if (a.type === 'walking') walkDay[d] = true;
    else cardioDay[d] = true;
  }
  const strength = new Set();
  // 其他运动：用户自建、挂了「算作运动」标记的类别（瑜伽、球类……）。
  // 打卡日和心肺/抗阻一样算「动了」，这张图才配叫运动热力图。
  const otherSport = new Set();
  for (const c of (home.habits && home.habits.categories) || []) {
    const builtin = c.name === '心肺训练' || c.name === '抗阻训练';
    const isSport = builtin || c.sport === true;
    for (const p of c.projects || []) {
      if (p.kind === 'resistance') { for (const d of (p.progress && p.progress.days) || []) strength.add(d); continue; }
      if (!isSport || builtin || p.sportType) continue; // 心肺类项目已按 activities 算过
      if (p.kind === 'hydration' || p.kind === 'learning') continue;
      for (const d of (p.progress && p.progress.days) || []) otherSport.add(d);
    }
  }
  // 三档封顶：一天不管动了五样还是三样，颜色只到最深档
  const levelOf = d => Math.min(3, (cardioDay[d] ? 1 : 0) + (walkDay[d] ? 1 : 0) + (strength.has(d) ? 1 : 0) + (otherSport.has(d) ? 1 : 0));

  // 闭环的那几周（服务端 goals.closedWeeks 算好的周一日期）：一年网格下面要摆一排小标记。
  // 这是「成就感」的来源——不是又一根灰条，而是一颗能数的星星。
  const closedWeeks = new Set(((home.habits && home.habits.achievements) || {}).closedWeeks || []);

  // 开始日：最早一条记录的日子（运动打卡 / 自建项目进度都算凭证）。
  // 在那之前的格子不是「没练」，是「还没开始」——画成浅青灰填充（用户 10-30：
  // 与白底细框的「还没到」区分开，才知道自己是从哪天开始记的、已经走了多久）。
  let startDay = '';
  const touchDay = d => { if (d && d <= today && (!startDay || d < startDay)) startDay = d; };
  Object.keys(cardioDay).forEach(touchDay);
  Object.keys(walkDay).forEach(touchDay);
  strength.forEach(touchDay);
  otherSport.forEach(touchDay);
  for (const c of (home.habits && home.habits.categories) || []) {
    for (const p of c.projects || []) {
      for (const d of (p.progress && p.progress.days) || []) touchDay(d);
    }
  }

  // 年视图网格铺满当年一整年（1/1 → 12/31，用户 10-30：年热力图就该是 365 个格子）：
  //   开始之前的日子 → pre（浅青灰填充，说明「那时候还没开始用」）
  //   还没到的日子   → future（白底细框，一眼看出今年还剩多少）
  //   打卡过的日子   → 照常上热度
  // 列仍按周一对齐（7 行网格），首尾两列会带一点相邻年份的日子，口径不变。
  // 统计（活跃天/连续）仍走「最近 53 周」的滚动窗口——「近一年活跃天」的口径不跟着换年。
  const cellFor = d => {
    const future = d > today;
    const pre = !!(startDay && d < startDay);
    return { date: d, future, pre, today: d === today, level: (future || pre) ? 0 : levelOf(d) };
  };
  const yearStart = today.slice(0, 4) + '-01-01';
  const yearEnd = today.slice(0, 4) + '-12-31';
  const gridStart = monday(yearStart);
  const gridEnd = monday(yearEnd);
  const COLS = Math.round((Date.parse(gridEnd + 'T12:00:00Z') - Date.parse(gridStart + 'T12:00:00Z')) / (7 * 86400000)) + 1;
  const columns = [], monthLabels = [], closedMarks = [];
  let prevMonth = -1, todayCol = -1;
  for (let c = 0; c < COLS; c++) {
    const mon = shift(gridStart, 7 * c);
    if (mon <= today && today <= shift(mon, 6)) todayCol = c;
    closedMarks.push(closedWeeks.has(mon) ? 1 : 0);
    // 月份标签取这一列里第一个「落在本年内」的日子：1/1 在第一列，
    // 所以 1 月的标签会打在第一列上，哪怕那一列的周一是去年 12 月。
    let labelMonth = -1;
    for (let r = 0; r < 7; r++) { const d = shift(mon, r); if (d >= yearStart && d <= yearEnd) { labelMonth = Number(d.slice(5, 7)); break; } }
    if (labelMonth > 0 && labelMonth !== prevMonth) { monthLabels.push(String(labelMonth)); prevMonth = labelMonth; }
    else monthLabels.push('');
    const col = [];
    for (let r = 0; r < 7; r++) col.push(cellFor(shift(mon, r)));
    columns.push(col);
  }

  // 统计用的滚动窗口：最近 53 周（含本周），口径与「近一年活跃天」一致
  const flat = [];
  for (let c = 52; c >= 0; c--) {
    const mon = shift(weekStart, -7 * c);
    for (let r = 0; r < 7; r++) flat.push(cellFor(shift(mon, r)));
  }

  // 统计：近一年活跃天 / 最长连续 / 当前连续（当前连续允许截止于今天或昨天，断更不报「你断了」）
  let activeDays = 0, longest = 0, run = 0;
  for (const cell of flat) {
    if (cell.future || cell.pre) continue;
    if (cell.level > 0) { activeDays++; run++; if (run > longest) longest = run; }
    else run = 0;
  }
  let lastActive = -1, lastNonFuture = -1;
  for (let i = flat.length - 1; i >= 0; i--) {
    if (!flat[i].future && lastNonFuture < 0) lastNonFuture = i;
    if (!flat[i].future && flat[i].level > 0 && lastActive < 0) { lastActive = i; break; }
  }
  let current = 0;
  if (lastActive >= 0 && lastNonFuture - lastActive <= 1) {
    for (let i = lastActive; i >= 0; i--) {
      if (flat[i].future) continue;
      if (flat[i].level > 0) current++; else break;
    }
  }

  // 周：本周 7 天（柱），值 = 项目数
  // cls 是柱子的深浅档（l1/l2/l3），和年网格同一套梯度：一天练得越全，颜色越深。
  // 高度不走 v/3：动一项就给 42% 太矮了，看着像没记；三档分别是 42 / 72 / 100。
  const WEEK_PCT = [0, 42, 72, 100];
  const wd = ['一', '二', '三', '四', '五', '六', '日'];
  let weekActive = 0;
  const week = [];
  for (let r = 0; r < 7; r++) {
    const d = shift(weekStart, r);
    const future = d > today;
    const pre = !!(startDay && d < startDay);
    const v = (future || pre) ? 0 : levelOf(d);
    if (v > 0) weekActive++;
    week.push({ label: wd[r], value: v, future, pre, today: d === today, cls: v ? 'l' + v : '', pct: WEEK_PCT[v] });
  }

  // 月：最近 12 个月，每月活跃天数（柱）
  const buckets = {};
  for (const cell of flat) {
    if (cell.future || cell.level === 0) continue;
    const ym = cell.date.slice(0, 7);
    buckets[ym] = (buckets[ym] || 0) + 1;
  }
  const todayDate = new Date(today + 'T12:00:00Z');
  const month = [];
  let monthMax = 1;
  for (let k = 11; k >= 0; k--) {
    const dt = new Date(Date.UTC(todayDate.getUTCFullYear(), todayDate.getUTCMonth() - k, 1));
    const ym = dt.toISOString().slice(0, 7);
    const v = buckets[ym] || 0;
    if (v > monthMax) monthMax = v;
    month.push({ label: String(dt.getUTCMonth() + 1), value: v, month: dt.getUTCMonth() + 1 });
  }
  month.forEach(m2 => { m2.pct = Math.round(m2.value / monthMax * 100); });
  // 最勤的那个月单独标出来（并列时取最近的那个）：柱图顶上给一颗星，一眼看得见
  let bestMonth = null;
  month.forEach(m2 => { if (m2.value > 0 && (!bestMonth || m2.value >= bestMonth.v)) bestMonth = { m: m2.month, v: m2.value }; });
  if (bestMonth) month.forEach(m2 => { m2.best = m2.month === bestMonth.m && m2.value === bestMonth.v; });

  return { columns, monthLabels, closedMarks, todayCol, startDay, stats: { activeDays, longest, current }, week, weekActive, month, bestMonth };
}

// 顶部个人卡片的数字：累计记录天数 / 累计有氧分钟 / 单日最长分钟。
// 连续天数故意不在这里算——页面直接用 heatmap().stats 里的 longest / current，
// 保证「头像卡」和「热力图卡」说的永远是同一个数（两个地方各算一遍迟早会对不上）。
// 口径与 heatmap 一致：心肺 + 散步 + 抗阻，按用户时区归日，未来日期不计。
function profileStats(home) {
  home = home || {};
  const zone = (home.user && home.user.timeZone) || 'Asia/Shanghai';
  const today = dateKey(Date.now(), zone);

  const days = Object.create(null);
  const touch = d => days[d] || (days[d] = { cardio: 0, walk: 0, strength: 0, min: 0 });
  for (const a of (home.activities || [])) {
    if (CARDIO_TYPES.indexOf(a.type) < 0) continue;
    const d = dateKey(a.occurredAt, zone);
    if (d > today) continue;
    const row = touch(d);
    if (a.type === 'walking') row.walk = 1;
    else { row.cardio = 1; row.min += Math.round((a.durationSec || 0) / 60); }
  }
  for (const c of (home.habits && home.habits.categories) || []) {
    for (const p of c.projects || []) {
      if (p.kind !== 'resistance') continue;
      for (const d of (p.progress && p.progress.days) || []) if (d <= today) touch(d).strength = 1;
    }
  }

  let totalDays = 0, totalMin = 0, bestDay = 0;
  for (const d in days) {
    const r = days[d];
    if (!r.cardio && !r.walk && !r.strength) continue;
    totalDays++;
    totalMin += r.min;
    if (r.min > bestDay) bestDay = r.min;
  }
  return { totalDays, totalMin, bestDay };
}

module.exports = { deriveCycles, board, intensityMix, heatmap, profileStats, monday, shift, countClosed };
