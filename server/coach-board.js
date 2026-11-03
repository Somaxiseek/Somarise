'use strict';
// 教练端的两块看板，口径全部复用 Goals / Habits，只是换个切法：
//
//   总看板  /coach/board?period=day|week|month|year  横轴是人，一人一列
//   个人页  /coach/members/:id/person                一个人，五项卡 + 可左右滑的每日图
//
// 三条口径是用户点名要的，改代码前先看这里：
//  1. **体测给的是变化量，不是绝对值**。而且不是「今天减昨天」——没人天天上秤。
//     先试「本周期均值 − 上一周期均值」，任一侧没数据就退回「最近两次的差值」，
//     只有一次记录就如实说「只有一次」。
//  2. **饮水的周平均百分比 = 把每一天的百分比加起来 ÷ 这一周有记录的天数**。
//     喝 1500/2000 是 75%、2500/2000 是 125%，**不截到 100%**。
//  3. 心肺按等效分钟（中等 ×1、高强 ×2、低强不计训练量但分钟照记）。
//
// 日视图只做在总看板上（教练最常问的是「今天谁还没动」），个人页最短就是周——
// 个人页的五项里三项是「周均 / 较上周」，单日算不出平均，硬做只会得到一张空表。
const { shift } = require('./domain');
const days = require('./coach-days');
const { TOKENS } = require('../miniprogram/utils/tokens');

const PERIODS = ['day', 'week', 'month', 'year'];
const PERIOD_LABEL = { day: '日', week: '周', month: '月', year: '年' };
const PREV_LABEL = { day: '较上次', week: '较上周', month: '较上月', year: '较去年' };
const WEEKDAY = days.WEEKDAY;

const pad = (n) => (n < 10 ? '0' + n : String(n));
function monday(d) { return shift(d, -((new Date(d + 'T12:00:00Z').getUTCDay() + 6) % 7)); }
function monthEnd(y, m) { return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10); }
function round1(v) { return Math.round(v * 10) / 10; }
function isDate(v) { return typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v); }
function md(date) { return date.slice(5).replace('-', '/'); }
function avg(nums) { return nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : null; }
function fmtDelta(v) {
  if (v == null) return '—';
  const r = round1(v);
  return (r > 0 ? '+' : '') + r;
}

// 周期窗口。week 从周一起算，与 App 里的周口径一致；
// 窗口末端一律夹到「今天」——本周还没到的那几天不该占着柱子
function windowOf(period, today, anchor) {
  const base = isDate(anchor) ? anchor : today;
  if (period === 'day') {
    return { period, from: base, to: base, prevFrom: shift(base, -1), prevTo: shift(base, -1), label: md(base) + ' ' + WEEKDAY[new Date(base + 'T12:00:00Z').getUTCDay()], grain: 'day' };
  }
  if (period === 'week') {
    const from = monday(base);
    const to = shift(from, 6) > today ? today : shift(from, 6);
    return { period, from, to, prevFrom: shift(from, -7), prevTo: shift(from, -1), label: md(from) + '–' + md(to), grain: 'day' };
  }
  if (period === 'month') {
    const y = Number(base.slice(0, 4)), m = Number(base.slice(5, 7));
    const end = monthEnd(y, m);
    const py = m === 1 ? y - 1 : y, pm = m === 1 ? 12 : m - 1;
    return {
      period, from: y + '-' + pad(m) + '-01', to: end > today ? today : end,
      prevFrom: py + '-' + pad(pm) + '-01', prevTo: monthEnd(py, pm),
      label: y + ' 年 ' + m + ' 月', grain: 'day'
    };
  }
  const y = Number(base.slice(0, 4));
  const end = y + '-12-31';
  return {
    period, from: y + '-01-01', to: end > today ? today : end,
    prevFrom: (y - 1) + '-01-01', prevTo: (y - 1) + '-12-31',
    label: y + ' 年', grain: 'month'
  };
}

// 体测差值：优先本周期均值 vs 上一周期均值，退回最近两次的差值。
// 拿不到就说拿不到（delta=null），不编一个数出来
function bodyChange(cur, prev, all) {
  const ca = avg(cur.map(x => x.value)), pa = avg(prev.map(x => x.value));
  if (cur.length && prev.length) {
    return { delta: round1(ca - pa), mode: 'avg', last: cur[cur.length - 1].value, count: cur.length, prevCount: prev.length };
  }
  if (!all.length) return { delta: null, mode: 'none' };
  const last = all[all.length - 1];
  const before = all.filter(x => x.date < last.date);
  if (!before.length) return { delta: null, mode: 'single', last: last.value, lastDate: last.date };
  const prevOne = before[before.length - 1];
  return { delta: round1(last.value - prevOne.value), mode: 'delta', last: last.value, prev: prevOne.value, lastDate: last.date, prevDate: prevOne.date };
}

function bodyText(change, period) {
  if (change.mode === 'none') return '还没有记录';
  if (change.mode === 'single') return '只有一次记录';
  if (change.mode === 'delta') return '较上次';
  return PREV_LABEL[period] || '较上一周期';
}

// ── 训练结构（乐高柱的数据，2026-10-30 用户定稿）────────────────────
// 像记账软件的分类汇总：这个周期里「心肺 / 抗阻 / 瑜伽这类自建运动」各做了几次。
// 前两段颜色固定（与全站圆环同源 tokens），自建类别用项目自己的颜色；
// 按次数从多到少排，心肺/抗阻永远在最前面，一屏扫过去就能看清每个人的结构。
function mixOf(rows) {
  let cardio = 0, strength = 0;
  const strengthIntensity = { low: 0, moderate: 0, vigorous: 0 };
  const others = new Map();
  for (const r of rows) {
    cardio += r.cardio.sessions;
    strength += r.strength.sessions;
    for (const k of (r.strength.intensities || [])) strengthIntensity[k] = (strengthIntensity[k] || 0) + 1;
    for (const x of (r.sport || [])) {
      const key = x.label;
      let m = others.get(key);
      if (!m) { m = { key, label: x.label, color: x.color, count: 0 }; others.set(key, m); }
      m.count++;
    }
  }
  const mix = [
    { key: 'cardio', label: '心肺', color: TOKENS.cardio, count: cardio },
    { key: 'strength', label: '抗阻', color: TOKENS.strength, count: strength }
  ].concat([...others.values()].sort((a, b) => b.count - a.count));
  return { mix: mix.filter(m => m.count > 0), strengthIntensity };
}

function summarize(rows) {
  const s = {
    recordedDays: 0,
    cardio: { sessions: 0, minutes: 0, rawMinutes: 0, days: 0 },
    strength: { sessions: 0, days: 0 },
    water: { ml: 0, days: 0, avgPercent: null, metDays: 0 },
    bodyDays: 0
  };
  let sum = 0, n = 0;
  for (const r of rows) {
    if (r.recorded) s.recordedDays++;
    if (r.cardio.sessions) { s.cardio.days++; s.cardio.sessions += r.cardio.sessions; s.cardio.minutes += r.cardio.minutes; s.cardio.rawMinutes += r.cardio.rawMinutes; }
    if (r.strength.sessions) { s.strength.days++; s.strength.sessions += r.strength.sessions; }
    if (r.water.ml > 0) { s.water.ml += r.water.ml; s.water.days++; }
    // 周平均饮水量完成百分比：每一天的百分比加起来 ÷ 有记录的天数
    if (r.water.percent != null) { sum += r.water.percent; n++; if (r.water.percent >= 100) s.water.metDays++; }
    if (r.body) s.bodyDays++;
  }
  s.water.avgPercent = n ? Math.round(sum / n) : null;
  return s;
}

// 单个人在一段窗口里的全部指标（总看板一格 / 个人页五张卡都从这里出）
function summary(ctx, uid, period, opts) {
  const o = opts || {};
  const idx = days.buildIndex(ctx, uid);
  const w = isDate(o.from) && isDate(o.to)
    ? { period, from: o.from, to: o.to, prevFrom: o.prevFrom || o.from, prevTo: o.prevTo || o.to, label: o.label || (md(o.from) + '–' + md(o.to)), grain: o.grain || 'day' }
    : windowOf(PERIODS.indexOf(period) >= 0 ? period : 'week', idx.today, o.anchor);
  const rows = [];
  for (let d = w.from; d <= w.to; d = shift(d, 1)) rows.push(days.rowAt(idx, d));

  const s = summarize(rows);
  // 总看板的进度条要按会员自己的目标算完成度：周目标 ÷7 折算到窗口天数
  // （窗口末端已夹到今天，周三看周视图就是 3 天的量，不会拿满周的线压人）。
  // 没设目标（仅记录）就给 null——前端只画数字，不画假进度。
  const goals = ctx.goals || null;
  // 查目标用窗口末（end）：周中才定的线不能整周判成仅记录（与周卡同一口径）
  const effOf = (key) => (goals && typeof goals.effective === 'function' ? goals.effective(uid, key, w.to) : null);
  const windowTarget = (g) => (g && g.period === 'weekly' && g.recordOnly !== true && Number(g.target) > 0)
    ? Math.round(Number(g.target) / 7 * rows.length * 10) / 10
    : null;
  const dailyTarget = (g) => (g && g.period === 'daily' && g.recordOnly !== true && Number(g.target) > 0) ? Number(g.target) : null;
  s.targets = {
    cardio: windowTarget(effOf('cardio')),        // 本窗口等效分钟分母
    strength: windowTarget(effOf('strength')),    // 本窗口训练天数分母
    waterMl: dailyTarget(effOf('water'))          // 每日毫升（总看板用日均百分比，这里备用）
  };
  const met = idx.metrics;
  const pick = (field) => met.filter(m => m[field] != null).map(m => ({ date: m.date, value: Number(m[field]) }));
  const allWeight = pick('weightKg'), allWaist = pick('waistCm');
  const inRange = (list) => list.filter(x => x.date >= w.from && x.date <= w.to);
  const inPrev = (list) => list.filter(x => x.date >= w.prevFrom && x.date <= w.prevTo);
  const weight = bodyChange(inRange(allWeight), inPrev(allWeight), allWeight);
  const waist = bodyChange(inRange(allWaist), inPrev(allWaist), allWaist);
  const latest = met.length ? met[met.length - 1] : null;
  const { mix, strengthIntensity } = mixOf(rows);

  return {
    period: w.period,
    from: w.from,
    to: w.to,
    label: w.label,
    grain: w.grain,
    today: idx.today,
    days: rows.length,
    recordedDays: s.recordedDays,
    cardio: s.cardio,
    strength: s.strength,
    // 训练结构：这个周期里心肺 / 抗阻 / 自建运动各几次（乐高柱数据）
    mix,
    strengthIntensity,
    water: s.water,
    targets: s.targets,
    body: {
      weight: { delta: weight.delta, mode: weight.mode, text: bodyText(weight, w.period), last: weight.last == null ? null : weight.last, lastDate: weight.lastDate || null },
      waist: { delta: waist.delta, mode: waist.mode, text: bodyText(waist, w.period), last: waist.last == null ? null : waist.last, lastDate: waist.lastDate || null },
      latest: latest ? { date: latest.date, weightKg: latest.weightKg == null ? null : latest.weightKg, waistCm: latest.waistCm == null ? null : latest.waistCm } : null,
      days: s.bodyDays
    }
  };
}

// 个人页顶部五张卡：有氧次数 / 力量次数 / 周均饮水百分比 / 体重差值 / 腰围差值
function cards(sum, period) {
  const water = sum.water;
  return [
    {
      key: 'cardio', label: period === 'week' ? '本周有氧' : (PERIOD_LABEL[period] + '度有氧'),
      value: sum.cardio.sessions, unit: '次',
      sub: sum.cardio.minutes ? sum.cardio.minutes + ' 等效分钟' : '还没动'
    },
    {
      key: 'strength', label: period === 'week' ? '本周力量' : (PERIOD_LABEL[period] + '度力量'),
      value: sum.strength.sessions, unit: '次',
      sub: sum.strength.days ? '练了 ' + sum.strength.days + ' 天' : '还没练'
    },
    {
      key: 'water',
      label: period === 'week' ? '周均饮水' : (PERIOD_LABEL[period] + '均饮水'),
      value: water.avgPercent == null ? '—' : water.avgPercent, unit: water.avgPercent == null ? '' : '%',
      sub: water.days ? '记了 ' + water.days + ' 天' + (water.metDays ? ' · ' + water.metDays + ' 天达标' : '') : '还没记'
    },
    { key: 'weight', label: '体重差值', value: fmtDelta(sum.body.weight.delta), unit: 'kg', sub: sum.body.weight.text },
    { key: 'waist', label: '腰围差值', value: fmtDelta(sum.body.waist.delta), unit: 'cm', sub: sum.body.waist.text }
  ];
}

// 一个指标在窗口里的一串点：周/月视图按天，年视图按月（365 根柱子没人看得清）
function pointsOf(rows, key, grain) {
  if (grain === 'month') {
    const buckets = new Map();
    for (const r of rows) {
      const b = r.date.slice(0, 7);
      let x = buckets.get(b);
      if (!x) { x = { key: b, label: Number(b.slice(5)) + ' 月', rows: [] }; buckets.set(b, x); }
      x.rows.push(r);
    }
    return [...buckets.values()].map(b => pointOf(b.rows, key, b.label, b.key));
  }
  return rows.map(r => pointOf([r], key, r.date.slice(8) + '日', r.date));
}

function pointOf(rows, key, label, id) {
  if (key === 'cardio') {
    const minutes = rows.reduce((a, r) => a + r.cardio.minutes, 0);
    const sessions = rows.reduce((a, r) => a + r.cardio.sessions, 0);
    return { id, label, value: minutes, has: sessions > 0, text: sessions ? minutes + ' 分 · ' + sessions + ' 次' : '没练' };
  }
  if (key === 'strength') {
    const sessions = rows.reduce((a, r) => a + r.strength.sessions, 0);
    return { id, label, value: sessions, has: sessions > 0, text: sessions ? sessions + ' 次' : '没练' };
  }
  if (key === 'water') {
    const ml = rows.reduce((a, r) => a + r.water.ml, 0);
    const pcts = rows.filter(r => r.water.percent != null).map(r => r.water.percent);
    const pct = pcts.length ? Math.round(avg(pcts)) : null;
    return {
      id, label, value: pct == null ? 0 : pct, has: ml > 0,
      text: ml > 0 ? ml + ' ml' + (pct == null ? '' : ' · ' + pct + '%') : '没记'
    };
  }
  if (key === 'weight') {
    const vals = rows.filter(r => r.body && r.body.weightKg != null).map(r => r.body.weightKg);
    const v = vals.length ? round1(avg(vals)) : null;
    return { id, label, value: v, has: v != null, text: v == null ? '没测' : v + ' kg' };
  }
  const vals = rows.filter(r => r.body && r.body.waistCm != null).map(r => r.body.waistCm);
  const v = vals.length ? round1(avg(vals)) : null;
  return { id, label, value: v, has: v != null, text: v == null ? '没测' : v + ' cm' };
}

// 个人页：五张卡 + 五项可左右滑的每日图
function person(ctx, uid, period, opts) {
  const o = opts || {};
  const idx = days.buildIndex(ctx, uid);
  const p = PERIODS.indexOf(period) >= 0 ? period : 'week';
  const w = isDate(o.from) && isDate(o.to) ? windowOf(p, idx.today, o.anchor) : windowOf(p, idx.today, o.anchor);
  const rows = [];
  for (let d = w.from; d <= w.to; d = shift(d, 1)) rows.push(days.rowAt(idx, d));
  const sum = summary(ctx, uid, p, { from: w.from, to: w.to, prevFrom: w.prevFrom, prevTo: w.prevTo, label: w.label, grain: w.grain });
  const METRICS = [
    { key: 'cardio', label: '有氧', unit: '等效分钟', hint: '中等 ×1、高强 ×2，散步照记分钟但不计训练量' },
    { key: 'strength', label: '力量', unit: '次', hint: '同一天记几次都算，一天一格' },
    { key: 'water', label: '饮水', unit: '完成百分比', hint: '每天的毫升 ÷ 当天目标，喝超了就是超过 100%' },
    { key: 'weight', label: '体重', unit: 'kg', hint: '只画真测过的那天' },
    { key: 'waist', label: '腰围', unit: 'cm', hint: '只画真测过的那天' }
  ];
  return {
    period: p,
    from: w.from,
    to: w.to,
    label: w.label,
    grain: w.grain,
    today: idx.today,
    days: rows.length,
    cards: cards(sum, p),
    // 训练结构与抗阻强度分布：教练要能看出「这一阵练得偏轻还是偏重」
    mix: sum.mix,
    strengthIntensity: sum.strengthIntensity,
    metrics: METRICS.map(m => Object.assign({}, m, { points: pointsOf(rows, m.key, w.grain) }))
  };
}

// 路由层把 query 直接喂进来：period / anchor / from / to / prevFrom / prevTo / grain
function optsOf(q) {
  const get = (k) => (q && typeof q.get === 'function' ? q.get(k) : '') || '';
  return { period: get('period') || 'week', anchor: get('anchor'), from: get('from'), to: get('to'), prevFrom: get('prevFrom'), prevTo: get('prevTo'), label: get('label'), grain: get('grain') };
}

module.exports = { PERIODS, PERIOD_LABEL, windowOf, summary, person, cards, pointsOf, bodyChange, fmtDelta, monday, optsOf };
