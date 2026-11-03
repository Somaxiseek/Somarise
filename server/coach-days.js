'use strict';
// 教练要看的是「每一天」，不是「本周达标几天」。
//
// 之前给教练的只有一个周环：饮水那格写着「本周达标 4/7 天」，教练根本看不到
// TA 那天到底喝了多少。这里按天摊开：体测 / 心肺 / 抗阻 / 饮水，一天一行，
// 饮水给的是当天毫升数 + 完成百分比——喝 1500 / 目标 2000 就是 75%，
// 喝到 2500 就是 125%，**不截到 100%**（喝超了也是事实，不该被抹平）。
//
// 口径全部复用 Goals：心肺按强度折算等效分钟（中等 ×1、高强 ×2、低强不计训练量），
// 抗阻同一天记几次只算一个训练日，饮水分次累加。教练看到的数字和会员自己看到的
// 是同一个数，只是这里按天列出来。
//
// 这一层的输出有两个用处，所以先把原始数据做成「按天索引」：
//   daily()  → 最近 N 天（会员详情页用）
//   series() → 任意 from/to 区间（总看板的日/周/月/年、个人页的周/月/年用）
// 索引只扫一遍表，年视图（365 天 × 多个会员）也不会一遍遍过滤数组。
const { day, shift } = require('./domain');
const { CARDIO_TYPES } = require('../miniprogram/utils/guidelines');
const { RULES } = require('../miniprogram/utils/sports');
const { sportOf, BUILTIN_SPORT } = require('./habits');

const WEEKDAY = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
const PART_LABEL = { upper: '上肢', lower: '下肢', full: '全身' };
const MAX_DAYS = 90;

function dayLabel(date, today) {
  if (date === today) return '今天';
  if (date === shift(today, -1)) return '昨天';
  return date.slice(5).replace('-', '/') + ' ' + WEEKDAY[new Date(date + 'T00:00:00Z').getUTCDay()];
}
// 没有目标线（仅记录）就没有百分比：只报喝了多少，不报完成了多少
function percent(value, target) {
  return target > 0 ? Math.round(value / target * 100) : null;
}
// 目标按「那一天生效的那条」取，改过线也不会拿新线去衡量旧日子
function targetOn(goals, uid, key, date) {
  const g = goals.effective(uid, key, date);
  if (!g || g.recordOnly === true) return 0;
  return Number(g.target) > 0 ? Number(g.target) : 0;
}

// 把会员的四类记录按日期归拢：一天一个槽位，缺的就是没记。
// 只扫一遍数组——年视图要跑 365 天 × 每个会员，不能每天都 filter 一遍全表。
function buildIndex(ctx, uid) {
  const { service, habits, goals } = ctx;
  const user = service.user(uid);
  const tz = (user && user.timeZone) || 'Asia/Shanghai';
  const today = day(service.clock(), tz);
  const db = service.db;
  const byDate = new Map();
  const slot = (date) => {
    let r = byDate.get(date);
    if (!r) { r = { date, acts: [], checks: [], sport: [], ml: 0, entries: 0, metric: null }; byDate.set(date, r); }
    return r;
  };
  const resistance = new Set((db.projects || []).filter(p => p.userId === uid && p.kind === 'resistance').map(p => p.id));
  // 其他运动：类别挂了 sport 标记、又不是内置心肺/抗阻的打卡项目（瑜伽、球类……）。
  // 强度与类别名跟着走，教练看板的「训练结构」乐高柱按类别分段就靠这份索引。
  const cats = new Map((db.categories || []).filter(c => c.userId === uid).map(c => [c.id, c]));
  const otherSport = new Map((db.projects || []).filter(p => {
    if (p.userId !== uid || p.sportType) return false;
    if (['resistance', 'hydration', 'learning'].indexOf(p.kind) >= 0) return false;
    const c = cats.get(p.categoryId);
    return !!(c && sportOf(c) && BUILTIN_SPORT.indexOf(c.name) < 0);
  }).map(p => {
    const c = cats.get(p.categoryId);
    return [p.id, { label: c.name, color: p.color || '#5C738A' }];
  }));
  for (const a of (db.activities || [])) {
    if (a.userId !== uid || CARDIO_TYPES.indexOf(a.type) < 0) continue;
    slot(day(a.occurredAt, tz)).acts.push(a);
  }
  for (const c of (db.checkins || [])) {
    if (c.userId !== uid) continue;
    if (resistance.has(c.projectId)) { slot(c.date).checks.push(c); continue; }
    const meta = otherSport.get(c.projectId);
    if (meta) slot(c.date).sport.push({ label: meta.label, color: meta.color, intensity: c.intensity || 'moderate' });
  }
  for (const e of (db.water_entries || [])) {
    if (e.userId !== uid) continue;
    const r = slot(e.date);
    r.ml += Number(e.amountMl) || 0;
    r.entries++;
  }
  // 同一天量了多次就取最后一次（按日期升序扫，后来者覆盖）
  const metrics = (db.body_metrics || []).filter(e => e.userId === uid).sort((a, b) => a.date.localeCompare(b.date));
  for (const m of metrics) slot(m.date).metric = m;
  return { uid, tz, today, byDate, goals, habits, metrics, resistance };
}

// 一天一行。索引里没有这天就返回空行（不代表失败，就是没记）
function rowAt(idx, date) {
  const { uid, tz, today, byDate, goals, habits } = idx;
  const s = byDate.get(date) || { date, acts: [], checks: [], sport: [], ml: 0, entries: 0, metric: null };
  let weightedSec = 0, rawSec = 0;
  for (const a of s.acts) {
    const sec = Math.max(0, Number(a.durationSec) || 0);
    rawSec += sec;
    weightedSec += sec * (a.intensity === 'vigorous' ? 2 : (a.intensity === 'low' ? 0 : 1));
  }
  const cardioMinutes = Math.round(weightedSec / 60);
  const cardioRawMinutes = Math.round(rawSec / 60);

  const parts = [];
  for (const c of s.checks) {
    const label = PART_LABEL[c.part];
    if (label && parts.indexOf(label) < 0) parts.push(label);
  }
  const strengthAmount = s.checks.reduce((sum, c) => sum + (Number(c.amount) || 0), 0);

  const ml = s.ml;
  const waterTarget = targetOn(goals, uid, 'water', date);
  const metric = s.metric;
  const englishTarget = targetOn(goals, uid, 'english', date);
  const words = habits && habits.goals ? goals.englishWords(uid, date) : 0;

  const items = s.acts.map(a => ({
    type: a.type,
    label: (RULES[a.type] || {}).label || '运动',
    minutes: Math.round((Number(a.durationSec) || 0) / 60),
    km: Number(a.distanceM) > 0 ? Math.round(a.distanceM / 100) / 10 : 0,
    intensity: a.intensity || 'moderate',
    // 散步（低强度）照记分钟，但不计训练量——教练要看「动了没有」和「练了多少」两件事
    counted: a.intensity !== 'low'
  }));

  const recorded = ml > 0 || s.acts.length > 0 || s.checks.length > 0 || s.sport.length > 0 || !!metric || words > 0;
  return {
    date,
    label: dayLabel(date, today),
    weekday: WEEKDAY[new Date(date + 'T00:00:00Z').getUTCDay()],
    isToday: date === today,
    recorded,
    water: { ml, target: waterTarget, percent: ml > 0 ? percent(ml, waterTarget) : null, entries: s.entries },
    cardio: { minutes: cardioMinutes, rawMinutes: cardioRawMinutes, sessions: s.acts.length, items },
    // intensities 给强度分布用；sport = 其他运动类别的打卡（乐高柱的第三段往后）
    strength: { sessions: s.checks.length, parts, amount: strengthAmount, done: s.checks.length > 0, intensities: s.checks.map(c => c.intensity || 'moderate') },
    sport: s.sport.map(x => ({ label: x.label, color: x.color, intensity: x.intensity })),
    body: metric ? { weightKg: metric.weightKg == null ? null : metric.weightKg, waistCm: metric.waistCm == null ? null : metric.waistCm } : null,
    english: { words, target: englishTarget, percent: percent(words, englishTarget) }
  };
}

// 一段区间内的每一天（含两端）。年视图 365 天也只是 365 次查表
function series(ctx, uid, from, to) {
  const idx = buildIndex(ctx, uid);
  const rows = [];
  if (from > to) return { idx, rows };
  for (let d = from; d <= to; d = shift(d, 1)) rows.push(rowAt(idx, d));
  return { idx, rows };
}

function daily(ctx, uid, days) {
  const idx = buildIndex(ctx, uid);
  const n = Math.min(Math.max(Math.round(Number(days)) || 30, 1), MAX_DAYS);
  const from = shift(idx.today, -(n - 1));
  const rows = [];
  for (let i = 0; i < n; i++) rows.push(rowAt(idx, shift(idx.today, -i)));

  const totals = { recordDays: 0, waterMl: 0, waterDays: 0, cardioMinutes: 0, cardioRawMinutes: 0, cardioDays: 0, strengthDays: 0, strengthSessions: 0, bodyDays: 0, englishWords: 0 };
  for (const r of rows) {
    if (r.recorded) totals.recordDays++;
    if (r.water.ml > 0) { totals.waterMl += r.water.ml; totals.waterDays++; }
    if (r.cardio.sessions) { totals.cardioDays++; totals.cardioMinutes += r.cardio.minutes; totals.cardioRawMinutes += r.cardio.rawMinutes; }
    if (r.strength.sessions) { totals.strengthDays++; totals.strengthSessions += r.strength.sessions; }
    if (r.body) totals.bodyDays++;
    totals.englishWords += r.english.words;
  }
  const latestMetric = idx.metrics[idx.metrics.length - 1] || null;
  return {
    timeZone: idx.tz,
    today: idx.today,
    from,
    to: idx.today,
    days: n,
    waterTarget: targetOn(idx.goals, uid, 'water', idx.today),
    latestBody: latestMetric ? { date: latestMetric.date, weightKg: latestMetric.weightKg ?? null, waistCm: latestMetric.waistCm ?? null } : null,
    totals,
    // 最近的排最前：教练打开就是想看这两天
    rows
  };
}

module.exports = { daily, series, buildIndex, rowAt, dayLabel, percent, targetOn, WEEKDAY, MAX_DAYS };
