const { test } = require('node:test');
const assert = require('node:assert/strict');
const { deriveCycles, board, monday, shift } = require('../miniprogram/utils/cycles');

// 造一个 /home fixtures：today=2026-10-29(周四)，本周一=2026-10-26
const TODAY = '2026-10-29';
const WEEK_START = monday(TODAY); // 2026-10-26

function homeWith(week, closedWeeks) {
  return {
    today: TODAY,
    goals: { today: TODAY, weekStart: WEEK_START, weekEnd: shift(WEEK_START, 6), week },
    habits: { achievements: { closedWeeks: closedWeeks || [] } }
  };
}

// 生成「最近 12 周」的周一，模拟一批闭环周（再故意去掉 1 个，便于验证 <total）
function quarterClosedWeeks() {
  const weeks = [];
  for (let i = 0; i < 12; i++) weeks.push(shift(WEEK_START, -7 * (11 - i)));
  weeks.splice(8, 1); // 去掉第 9 个（2026-10-05，落在本月），剩 11 个
  return weeks;
}

test('deriveCycles 取出本周各周目标，并隐藏项已过滤', () => {
  const week = [
    { key: 'cardio', label: '心肺', current: 120, target: 150, unit: '分钟', percent: 80, closed: false, color: '#D93B36', hidden: false },
    { key: 'strength', label: '抗阻', current: 3, target: 3, unit: '天', percent: 100, closed: true, color: '#3D6EDC', hidden: false },
    { key: 'water', label: '饮水', current: 5, target: 5, unit: '天', percent: 100, closed: true, color: '#06B6D4', hidden: true } // 隐藏
  ];
  const c = deriveCycles(homeWith(week, []));
  assert.equal(c.anyWeekly, true);
  assert.equal(c.weekGoals.length, 2, '隐藏项不进看板');
  assert.deepEqual(c.weekGoals.map(g => g.key), ['cardio', 'strength']);
  const cardio = c.weekGoals[0];
  assert.equal(cardio.current, 120);
  assert.equal(cardio.target, 150);
  assert.equal(cardio.closed, false);
  assert.equal(cardio.color, '#D93B36');
  assert.equal(c.weekClosed, false, '有一项没闭环 → 本周未闭环');
});

test('deriveCycles 本周全部闭环 → weekClosed=true', () => {
  const week = [
    { key: 'cardio', label: '心肺', current: 150, target: 150, unit: '分钟', percent: 100, closed: true, color: '#D93B36', hidden: false },
    { key: 'strength', label: '抗阻', current: 3, target: 3, unit: '天', percent: 100, closed: true, color: '#3D6EDC', hidden: false }
  ];
  const c = deriveCycles(homeWith(week, []));
  assert.equal(c.weekClosed, true);
});

test('deriveCycles 没有周目标 → anyWeekly=false', () => {
  const c = deriveCycles(homeWith([], []));
  assert.equal(c.anyWeekly, false);
  assert.equal(c.weekGoals.length, 0);
});

test('deriveCycles 各窗口闭环周数（月/季度/半年/年）与服务端口径一致', () => {
  const closed = quarterClosedWeeks(); // 11 个，去掉的是本月 2026-10-05
  const c = deriveCycles(homeWith([], closed));
  const byKey = Object.fromEntries(c.windows.map(w => [w.key, w]));

  assert.equal(byKey.quarter.total, 12);
  assert.equal(byKey.quarter.completed, 11, '近12周闭环 11 周');

  assert.equal(byKey.half.total, 26);
  assert.equal(byKey.half.completed, 11, '近半年里只有这 11 周闭环');

  assert.equal(byKey.year.total, 52);
  assert.equal(byKey.year.completed, 11, '近1年里只有这 11 周闭环');

  // 本月（2026-10）自然周：10-05/10-12/10-19/10-26 共 4 周；10-05 被去掉 → 3 周
  assert.equal(byKey.month.total, 4, '本月 4 个自然周');
  assert.equal(byKey.month.completed, 3, '本月已闭环 3 周（10-05 未闭环）');

  // segments：前端按周画小格子条用的原始数据，长度和 true 个数要和 total/completed 对上
  for (const w of c.windows) {
    assert.equal(w.segments.length, w.total, w.key + ' 段数=周数');
    assert.equal(w.segments.filter(Boolean).length, w.completed, w.key + ' 亮起的段数=已闭环周数');
  }
  assert.deepEqual(byKey.month.segments, [false, true, true, true], '本月格子条：10-05 未闭环、后三周亮');
});

test('deriveCycles 月末边界：跨月的周按周一归属', () => {
  // 2026-11-01 是周日，2026-11-02 是周一。构造 11 月初场景验证 month 只数本月的周。
  const t = '2026-11-03';
  const ws = monday(t); // 2026-11-02
  const home = {
    today: t,
    goals: { today: t, weekStart: ws, weekEnd: shift(ws, 6), week: [] },
    habits: { achievements: { closedWeeks: [ws] } } // 仅本周闭环
  };
  const c = deriveCycles(home);
  const month = c.windows.find(w => w.key === 'month');
  // 11 月自然周：11-02 起；11-02 之前的周一(10-26)归属10月，不计入
  assert.ok(month.total >= 4 && month.total <= 5, '11月自然周数合理: ' + month.total);
  assert.equal(month.completed, 1, '本月只闭环了本周(11-02)');
});

test('没定线的项（target 0）不算本周考核，也不会画成 30 / 0', () => {
  const t = '2026-10-29', ws = monday(t);
  const home = {
    today: t,
    goals: {
      today: t, weekStart: ws, weekEnd: shift(ws, 6),
      week: [
        { key: 'cardio', label: '心肺', current: 30, target: 0, unit: '等效分钟', percent: 0, closed: false, color: '#D93B36' },
        { key: 'strength', label: '抗阻', current: 1, target: 3, unit: '天', percent: 33, closed: false, color: '#3D6EDC' }
      ]
    },
    habits: { achievements: { closedWeeks: [] } }
  };
  const b = board(home);
  assert.deepEqual(b.weekGoals.map(g => g.key), ['strength'], '仅记录项不进考核，`0` 目标不显示');
  assert.equal(b.anyWeekly, true);
  const month = b.windows.find(w => w.key === 'month');
  assert.ok(typeof month.note === 'string' && month.note.length > 0, '窗口卡要有自己的注释');
  const quarter = b.windows.find(w => w.key === 'quarter');
  assert.equal(quarter.percent, 0);
  assert.notEqual(quarter.note, '0 / 12 周已闭环', '注释不再重复标题里的数字');
});
