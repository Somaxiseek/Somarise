// 底部导航的跳转逻辑：不靠模拟器点，直接对着真实的 dock.js 打桩跑一遍。
// 2026-10-30：成就不再是 tab，中间那格从「＋」改成「看板」（会员 cycle / 教练 coach）。
const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');

const DOCK = path.join(__dirname, '..', 'miniprogram', 'components', 'dock', 'dock.js');

// stack = 页面栈里的 route 列表，最后一个是当前页
function load(stack, opts = {}) {
  const calls = [];
  const events = [];
  global.wx = {
    reLaunch: o => calls.push({ kind: 'reLaunch', url: o.url }),
    navigateBack: o => calls.push({ kind: 'navigateBack', delta: o.delta }),
    getStorageSync: () => ''
  };
  global.getCurrentPages = () => stack.map(r => ({ route: r }));
  global.getApp = () => ({ globalData: { isCoach: !!opts.coach } });
  let def = null;
  global.Component = d => { def = d; };
  delete require.cache[require.resolve(DOCK)];
  require(DOCK);
  assert.ok(def && def.methods, 'dock 组件要能加载');
  def.methods.triggerEvent = (name, detail) => events.push({ name, detail });
  def.methods.data = {};
  return { m: def.methods, calls, events };
}

test('看板：会员点中间那格进 cycle', () => {
  const { m, calls } = load(['pages/home/home']);
  m.tapBoard();
  assert.deepEqual(calls, [{ kind: 'reLaunch', url: '/pages/cycle/cycle' }]);
});

test('看板：教练点的也是自己的看板，不再被身份拦去教练端', () => {
  // 2026-10-30 修：以前按 isCoach 分流，教练永远打不开自己的新看板（个人卡/热力图/饼图）。
  const { m, calls } = load(['pages/home/home'], { coach: true });
  m.tapBoard();
  assert.deepEqual(calls, [{ kind: 'reLaunch', url: '/pages/cycle/cycle' }]);
});

test('看板：已经在看板页就只发 same 事件，别再 reLaunch 一遍', () => {
  const { m, calls, events } = load(['pages/cycle/cycle']);
  m.tapBoard();
  assert.equal(calls.length, 0);
  assert.deepEqual(events, [{ name: 'same', detail: { key: 'cycle' } }]);
});

test('成就不再是导航页：dock 上没有 tapAchievements', () => {
  const { m } = load(['pages/home/home']);
  assert.equal(typeof m.tapAchievements, 'undefined');
});

test('从别的页点「打卡」只回首页停住，不带 ?log=1、不自动开记录页（2026-11-02 定稿）', () => {
  const { m, calls } = load(['pages/home/home', 'pages/cycle/cycle']);
  m.tapLog();
  assert.deepEqual(calls, [{ kind: 'reLaunch', url: '/pages/home/home' }]);
});

test('从看板点「我的」走 reLaunch，栈不会越点越深', () => {
  const { m, calls } = load(['pages/home/home', 'pages/cycle/cycle']);
  m.tapAccount();
  assert.deepEqual(calls, [{ kind: 'reLaunch', url: '/pages/account/account' }]);
});
