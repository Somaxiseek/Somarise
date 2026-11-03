'use strict';
// 性能探针：把「打开一个页面到底慢在哪」拆成三块来量 ——
//   ① 网络：这个页面发了几趟请求、每趟多久、回来多少字节
//   ② 本地：loaded 之前本地还要算多久（渲染/聚合/热力图都在这段时间里）
//   ③ 数据量：页面 data 一共多少（≈ 逻辑层要传给视图层的字节数，真机上最吃这一项）
// 用法：node scripts/perf.js [页面名片段…]；不带参数跑默认清单。
const automator = require('miniprogram-automator');

const PAGES = [
  { name: 'home 首页', url: '/pages/home/home' },
  { name: 'cycle 看板', url: '/pages/cycle/cycle' },
  { name: 'learn 学习', url: '/pages/learn/learn' },
  { name: 'account 我的', url: '/pages/account/account' },
  { name: 'vocab 词库', url: '/pages/vocab/vocab' },
  { name: 'body 体测', url: '/pages/body/body' },
  { name: 'achievements 成就', url: '/pages/achievements/achievements' },
  { name: 'coach 教练端', url: '/pages/coach/coach' },
  // 基线对照：这两个页面几乎不发请求，用来量「什么都不做也要多久」的工具基线
  { name: '[基线] goals', url: '/pages/goals/goals' },
  { name: '[基线] select', url: '/pages/select/select' }
];

// ---- 交互计时：点了以后多久才看到东西 ----
function CALL_RING_MANAGE() { var ps = getCurrentPages(); var p = ps[ps.length - 1]; if (p && p.ringManage) p.ringManage(); }
function CALL_RING_CLOSE() { var ps = getCurrentPages(); var p = ps[ps.length - 1]; if (p && p.ringEditorClose) p.ringEditorClose(); }
function RING_OPEN() { var ps = getCurrentPages(); var p = ps[ps.length - 1]; return !!(p && p.data && p.data.ringEditor); }
function RING_LOADED() {
  var ps = getCurrentPages(); var p = ps[ps.length - 1];
  var c = p && p.selectComponent ? p.selectComponent('#ringEditor') : null;
  return !!(c && c.data && c.data.loaded);
}
function RING_PREVIEW() {
  var ps = getCurrentPages(); var p = ps[ps.length - 1];
  var c = p && p.selectComponent ? p.selectComponent('#ringEditor') : null;
  return !!(c && c.data && c.data.preview && c.data.preview.length);
}

async function timed(mp, fire, cond) {
  await mp.evaluate(RESET_NET);
  const t0 = Date.now();
  await mp.evaluate(fire);
  for (let i = 0; i < 100; i++) {
    try { if (await mp.evaluate(cond)) return { ms: Date.now() - t0, net: await mp.evaluate(READ_NET) }; } catch (e) { }
    await new Promise(r => setTimeout(r, 50));
  }
  return { ms: -1, net: await mp.evaluate(READ_NET) };
}

// 在小程序里挂网络探针（一次性，挂在 wx 上，跨页面有效）
function HOOK_NET() {
  var app = getApp();
  if (!app.__net) app.__net = [];
  if (app.__netHooked) return;
  app.__netHooked = true;
  var req = wx.request;
  wx.request = function (o) {
    var t0 = Date.now();
    var s = o.success, f = o.fail;
    o.success = function (r) {
      app.__net.push({ p: String(o.url || '').split('?')[0].replace(/^https?:\/\/[^/]+/, '') || o.url, ms: Date.now() - t0, size: JSON.stringify(r && r.data || '').length });
      if (s) s(r);
    };
    o.fail = function (e) { app.__net.push({ p: o.url, ms: Date.now() - t0, size: 0, fail: 1 }); if (f) f(e); };
    return req(o);
  };
  if (wx.cloud && wx.cloud.callFunction) {
    var cf = wx.cloud.callFunction;
    wx.cloud.callFunction = function (o) {
      var t0 = Date.now();
      var s = o.success, f = o.fail;
      var path = (o.data && o.data.path) || '';
      o.success = function (r) {
        app.__net.push({ p: '☁ ' + path, ms: Date.now() - t0, size: JSON.stringify(r && r.result && r.result.data || '').length });
        if (s) s(r);
      };
      o.fail = function (e) { app.__net.push({ p: '☁ ' + path, ms: Date.now() - t0, size: 0, fail: 1 }); if (f) f(e); };
      return cf(o);
    };
  }
}
function RESET_NET() { var a = getApp(); a.__net = []; }
function READ_NET() { var a = getApp(); return a.__net || []; }
function LOADED() { var ps = getCurrentPages(); var p = ps[ps.length - 1]; return !!(p && p.data && p.data.loaded); }
function DATA_SIZE() {
  var ps = getCurrentPages(); var p = ps[ps.length - 1];
  if (!p || !p.data) return 0;
  try { return JSON.stringify(p.data).length; } catch (e) { return -1; }
}

async function run(mp, page) {
  await mp.evaluate(HOOK_NET);
  await mp.evaluate(RESET_NET);
  const t0 = Date.now();
  await mp.reLaunch(page.url);
  let loaded = false;
  for (let i = 0; i < 100; i++) {
    try { if (await mp.evaluate(LOADED)) { loaded = true; break; } } catch (e) { }
    await new Promise(r => setTimeout(r, 100));
  }
  const ms = Date.now() - t0;
  const net = await mp.evaluate(READ_NET);
  let size = 0; try { size = await mp.evaluate(DATA_SIZE); } catch (e) { }
  const netMs = net.reduce((n, x) => n + x.ms, 0);
  const netBytes = net.reduce((n, x) => n + x.size, 0);
  return {
    name: page.name, ms, loaded,
    netCalls: net.length, netMs, netBytes,
    dataKb: (size / 1024).toFixed(1),
    net: net.map(x => x.p + ' ' + x.ms + 'ms/' + Math.round(x.size / 1024) + 'KB' + (x.fail ? '✗' : '')).join('  ')
  };
}

(async () => {
  const filter = process.argv.slice(2);
  const list = filter.length ? PAGES.filter(p => filter.some(f => p.name.includes(f))) : PAGES;
  const mp = await automator.connect({ wsEndpoint: 'ws://localhost:9420' });
  const rows = [];
  for (const page of list) {
    try { rows.push(await run(mp, page)); }
    catch (e) { rows.push({ name: page.name, ms: -1, loaded: false, netCalls: 0, netMs: 0, netBytes: 0, dataKb: '0', net: 'ERR ' + e.message }); }
  }
  console.log('\n页面                 打开耗时   请求数  网络耗时  响应量   页面data');
  console.log('-'.repeat(76));
  for (const r of rows) {
    console.log(
      String(r.name).padEnd(20),
      String(r.ms + 'ms').padStart(9),
      String(r.netCalls).padStart(7),
      String(r.netMs + 'ms').padStart(9),
      String(Math.round(r.netBytes / 1024) + 'KB').padStart(8),
      String(r.dataKb + 'KB').padStart(9),
      r.loaded ? '' : ' (没 loaded)'
    );
  }
  console.log('\n每页都发了什么请求：');
  for (const r of rows) console.log('  ' + r.name + ' → ' + (r.net || '（无）'));

  // 点圆环 → 浮层出现 → 浮层数据就绪；关掉再开一次，验证缓存命中
  try {
    await mp.reLaunch('/pages/home/home');
    for (let i = 0; i < 60; i++) { try { if (await mp.evaluate(LOADED)) break; } catch (e) { } await new Promise(r => setTimeout(r, 100)); }
    await new Promise(r => setTimeout(r, 2500)); // 给首页预热圆环编辑器留时间
    const open = await timed(mp, CALL_RING_MANAGE, RING_OPEN);
    const ready = await timed(mp, () => { }, RING_LOADED);
    await timed(mp, CALL_RING_CLOSE, function () { return true; });
    const open2 = await timed(mp, CALL_RING_MANAGE, RING_OPEN);
    const ready2 = await timed(mp, () => { }, RING_LOADED);
    const net = open.net.concat(ready.net).map(x => x.p + ' ' + x.ms + 'ms/' + Math.round(x.size / 1024) + 'KB').join('  ');
    console.log('\n点圆环：');
    console.log('  第一次  浮层出现 ' + open.ms + 'ms，数据就绪 +' + ready.ms + 'ms   请求: ' + (net || '（无）'));
    console.log('  第二次  浮层出现 ' + open2.ms + 'ms，数据就绪 +' + ready2.ms + 'ms（缓存命中应接近 0）');
  } catch (e) { console.log('\n点圆环测量失败: ' + e.message); }

  await mp.disconnect();
})().catch(e => { console.error(e); process.exit(1); });
