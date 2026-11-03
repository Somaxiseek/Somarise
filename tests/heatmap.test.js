// 日历热力图（年/周/月 三视图）的数据派生测试。
// 全部从 /home 现成字段算，不依赖后端；重点覆盖：列数/行数、当天项目数(0–3)、
// 未来日期忽略、时区归并、月份标签边界、活跃天/最长连续/当前连续统计。
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { heatmap, monday } = require('../miniprogram/utils/cycles');

const shift = (d, n) => new Date(Date.parse(d + 'T12:00:00Z') + n * 86400000).toISOString().slice(0, 10);
const todayKey = (zone) => new Intl.DateTimeFormat('en-CA', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
const ISO = (d, zone) => zone === 'Asia/Shanghai' ? d + 'T12:00:00+08:00' : d + 'T12:00:00Z';

function cardio(type, d, zone) {
  return { type, occurredAt: ISO(d, zone), timeZone: zone, durationSec: 1800, distanceM: 5000, intensity: 'moderate' };
}

// 当年周对齐网格的列数：从 1/1 所在周的周一到 12/31 所在周的周一
function colsOfYear(year) {
  const gs = monday(year + '-01-01'), ge = monday(year + '-12-31');
  return Math.round((Date.parse(ge + 'T12:00:00Z') - Date.parse(gs + 'T12:00:00Z')) / (7 * 86400000)) + 1;
}

test('空数据：结构齐全、统计归零、年网格铺满当年一整年', () => {
  const h = heatmap({});
  const year = todayKey('Asia/Shanghai').slice(0, 4);
  const n = colsOfYear(year);
  assert.equal(h.columns.length, n, '年网格从 1/1 所在周铺到 12/31 所在周');
  h.columns.forEach(col => assert.equal(col.length, 7, '每列 7 天'));
  const cells = h.columns.flat();
  assert.equal(cells.length, n * 7, `整年格子都在（${n * 7} 格，周对齐含首尾）`);
  assert.ok(cells.some(c => c.date === year + '-01-01'), '1 月 1 日在网格里');
  assert.ok(cells.some(c => c.date === year + '-12-31'), '12 月 31 日也在');
  assert.ok(cells.filter(c => c.future).length > 0, '还没到的日子也是格子（白底细框），不是藏起来');
  assert.equal(h.week.length, 7, '周视图 7 根柱');
  assert.equal(h.month.length, 12, '月视图 12 根柱');
  assert.deepEqual(h.stats, { activeDays: 0, longest: 0, current: 0 });
  assert.ok(h.monthLabels.length === n && h.monthLabels.some(x => x !== ''), '月份标签跟列数一致且含非空');
  assert.ok(h.monthLabels[0] === '1', '1 月的标签打在第一列');
  assert.ok(h.todayCol >= 0 && h.todayCol < n, '今天在哪一列要报出来（开局滚动定位用）');
});

test('当天项目数按 心肺/散步/抗阻 去重计数，最高 3', () => {
  const zone = 'Asia/Shanghai';
  const today = todayKey(zone);
  const y = shift(today, -1); // 昨天
  const home = {
    user: { timeZone: zone },
    activities: [
      cardio('running', today, zone),     // 今天：心肺
      cardio('walking', y, zone),         // 昨天：散步
      cardio('running', y, zone)          // 昨天：心肺（与散步同日 → 抗阻当天也记）
    ],
    habits: { categories: [{ name: '抗阻训练', projects: [{ kind: 'resistance', progress: { days: [y] } }] }] }
  };
  const h = heatmap(home);
  const find = (d) => { for (const col of h.columns) for (const c of col) if (c.date === d) return c; return null; };
  assert.equal(find(today).level, 1, '今天只心肺 → 1');
  assert.equal(find(y).level, 3, '昨天心肺+散步+抗阻 → 3');
  assert.equal(h.stats.activeDays, 2, '近一年活跃 2 天');
  assert.equal(h.stats.longest, 2, '昨天与今天连续 → 最长 2');
  assert.equal(h.stats.current, 2, '当前连续 2 天（截止今天）');
});

test('未来日期不计入热力图', () => {
  const zone = 'Asia/Shanghai';
  const today = todayKey(zone);
  const tmr = shift(today, 1);
  const home = {
    user: { timeZone: zone },
    activities: [cardio('running', tmr, zone)],
    habits: { categories: [] }
  };
  const h = heatmap(home);
  const cell = (() => { for (const col of h.columns) for (const c of col) if (c.date === tmr) return c; })();
  assert.ok(cell && cell.future, '明天的格子标记为未来');
  assert.equal(cell.level, 0, '未来日期 level 强制 0');
  assert.equal(h.stats.activeDays, 0, '未来记录不进统计');
});

test('非心肺类型（如游泳）也进心肺口径；散步不折算分钟', () => {
  const zone = 'Asia/Shanghai';
  const today = todayKey(zone);
  const home = {
    user: { timeZone: zone },
    activities: [
      { type: 'swimming', occurredAt: ISO(today, zone), timeZone: zone, durationSec: 1200, distanceM: 1000, intensity: 'moderate' },
      { type: 'walking', occurredAt: ISO(today, zone), timeZone: zone, durationSec: 0, distanceM: 0, intensity: 'low' }
    ],
    habits: { categories: [] }
  };
  const h = heatmap(home);
  const cell = (() => { for (const col of h.columns) for (const c of col) if (c.date === today) return c; return null; })();
  assert.equal(cell.level, 2, '游泳+散步 → 2（散步只算「动了」，不折算训练量）');
});

test('时区隔离：用 UTC 时区的用户按 UTC 归并', () => {
  const zone = 'UTC';
  const today = todayKey(zone);
  const home = {
    user: { timeZone: zone },
    activities: [cardio('running', today, zone)],
    habits: { categories: [] }
  };
  const h = heatmap(home);
  const cell = (() => { for (const col of h.columns) for (const c of col) if (c.date === today) return c; return null; })();
  assert.equal(cell.level, 1, 'UTC 用户的今天按 UTC 算');
});

// 「成就感」那三样标记：闭环的周打星、今天加环、最勤的月标金
// （2026-10-30：原来的四张「N/M 周闭环」灰条卡删掉后，这些标记负责把成绩讲出来）
test('闭环周打星、今天加环、最勤月标金', () => {
  const zone = 'Asia/Shanghai';
  const today = todayKey(zone);
  const home = {
    user: { timeZone: zone },
    activities: [cardio('running', today, zone)],
    habits: {
      categories: [],
      achievements: { closedWeeks: [monday(today)] }
    }
  };
  const h = heatmap(home);
  assert.equal(h.closedMarks.length, colsOfYear(todayKey(zone).slice(0, 4)), '一列（一周）一个标记位');
  assert.equal(h.closedMarks.reduce((a, b) => a + b, 0), 1, '只闭环了本周 → 只有一颗星');
  assert.equal(h.closedMarks[h.todayCol], 1, '星星点在今天所在的那一列');

  const cell = (() => { for (const col of h.columns) for (const c of col) if (c.date === today) return c; return null; })();
  assert.equal(cell.today, true, '今天的格子要能认出来，才画得了那个环');
  assert.equal(h.columns.flat().filter(c => c.today).length, 1, '今天只有一个');

  assert.ok(h.bestMonth && h.bestMonth.v === 1, '本月动了 1 天 → 最勤的月就是 1 天');
  assert.equal(h.month.filter(m => m.best).length, 1, '最勤的月只标一个');
  assert.equal(h.week.filter(d => d.today).length, 1, '周视图里今天也要能认出来');
});

// ── 「运动热力图」要算上自建运动类别（2026-10-30 用户定稿）────────────
function cellOf(h, d) {
  for (const col of h.columns) for (const c of col) if (c.date === d) return c;
  return null;
}

test('自建「算作运动」的类别：打卡日进热力图，生活类别不进', () => {
  const zone = 'Asia/Shanghai';
  const today = todayKey(zone);
  const d1 = shift(today, -1), d2 = shift(today, -2), d3 = shift(today, -3);
  const home = {
    user: { timeZone: zone },
    activities: [],
    habits: {
      categories: [
        { name: '瑜伽', sport: true, projects: [{ kind: 'generic', progress: { days: [d1] } }] },
        { name: '阅读', projects: [{ kind: 'generic', progress: { days: [d2] } }] },
        { name: '抗阻训练', projects: [{ kind: 'resistance', progress: { days: [d3] } }] }
      ]
    }
  };
  const h = heatmap(home);
  assert.equal(cellOf(h, d1).level, 1, '瑜伽打卡日算「动了」');
  assert.equal(cellOf(h, d2).level, 0, '阅读不算运动');
  assert.equal(cellOf(h, d3).level, 1, '抗阻照旧');
});

test('级别封顶 3：一天动了五样也只到最深档', () => {
  const zone = 'Asia/Shanghai';
  const today = todayKey(zone);
  const d = shift(today, -1);
  const home = {
    user: { timeZone: zone },
    activities: [cardio('running', d, zone), cardio('cycling', d, zone)],
    habits: { categories: [
      { name: '抗阻训练', projects: [{ kind: 'resistance', progress: { days: [d] } }] },
      { name: '瑜伽', sport: true, projects: [{ kind: 'generic', progress: { days: [d] } }] }
    ] }
  };
  const h = heatmap(home);
  assert.equal(cellOf(h, d).level, 3, '心肺+散步类+抗阻+瑜伽 = 4，封顶 3');
});

// ── 「还没开始」的日子也放上（用户 10-30）────────────────────────────
// 开始日之前的格子不是「没练」（青蓝空格），是「还没开始」（浅青灰填充）——
// 不然整片青蓝看起来像已经记了一整年，看不出自己是从哪天起步的；
// 还没到的日子则是白底细框（fut），今年还剩多少一眼看得出。
test('第一条记录之前的日子标记 pre，统计不受它们影响', () => {
  const zone = 'Asia/Shanghai';
  const today = todayKey(zone);
  const d1 = shift(today, -2), d2 = shift(today, -1), d3 = shift(today, -10);
  const home = {
    user: { timeZone: zone },
    activities: [cardio('running', d1, zone)],
    habits: { categories: [{ name: '抗阻训练', projects: [{ kind: 'resistance', progress: { days: [d2] } }] }] }
  };
  const h = heatmap(home);
  assert.equal(h.startDay, d1, '开始日 = 最早的记录（两天前的心肺）');
  const before = cellOf(h, d3);
  assert.equal(before.pre, true, '开始之前的格子标记 pre');
  assert.equal(before.level, 0);
  const started = cellOf(h, d1);
  assert.equal(started.pre, false, '开始当天不算 pre');
  assert.equal(started.level, 1, '开始当天照常算活跃');
  const fresh = cellOf(h, today);
  assert.equal(fresh.pre, false);
  // 统计：pre 的日子既不算活跃也不算「断了连续」
  assert.equal(h.stats.activeDays, 2);
  assert.equal(h.stats.current, 2);
  // 组件渲染层要有对应的样式钩子：pre 浅青灰填充、fut 白底细框
  const wxml = require('node:fs').readFileSync('miniprogram/components/chart-heat/chart-heat.wxml', 'utf8');
  assert.match(wxml, /item\.pre\?'pre':''/, '格子要带 pre 的样式类');
  assert.match(wxml, /item\.future\?'fut':''/, '格子要带 fut 的样式类');
  const wxss = require('node:fs').readFileSync('miniprogram/components/chart-heat/chart-heat.wxss', 'utf8');
  assert.match(wxss, /\.ch-cell\.pre/, '还没开始（浅青灰填充）的样式要存在');
  assert.match(wxss, /\.ch-cell\.fut/, '还没到（白底细框）的样式要存在');
});

test('空数据没有开始日：整片网格不标 pre', () => {
  const h = heatmap({});
  assert.equal(h.startDay, '');
  assert.equal(h.columns.flat().filter(c => c.pre).length, 0);
});
