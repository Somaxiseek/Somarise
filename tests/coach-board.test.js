const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createApp } = require('../server/http');

// 教练端两块看板：
//   总看板  /coach/board?period=day|week|month|year   横轴是人，一人一列
//   个人页  /coach/members/:id/person                 五项卡 + 可左右滑的每日图
// 这里盯的是口径，不是排版：
//   - 体测给的是**变化量**，而且不是「今天减昨天」——先试本周期均值 vs 上一周期均值，
//     不够就退回最近两次的差值。
//   - 周平均饮水百分比 = 每天百分比加起来 ÷ 有记录的天数，不截到 100%。
//   - 周期最短是周（个人页），日视图只在总看板上。
function shanghaiToday() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}

async function open() {
  const { server, store } = createApp({ memory: true });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const base = 'http://127.0.0.1:' + server.address().port;
  const request = async (p, method = 'GET', body, token) => {
    const r = await fetch(base + p, { method, headers: { Authorization: 'Bearer ' + (token || ''), 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
    return { status: r.status, data: await r.json() };
  };
  return { request, close: async () => { await new Promise(r => server.close(r)); store.close(); } };
}

// 把 demo-a 这一天造全：饮水定线 2000 喝了 1500、跑两次各 30 分钟、练了两次、体测两组
async function seed(request, member) {
  const today = shanghaiToday();
  const earlier = new Date(Date.parse(today + 'T12:00:00Z') - 3 * 86400000).toISOString().slice(0, 10);
  const home = (await request('/home', 'GET', null, member)).data;
  const wp = home.habits.projects.find(p => p.kind === 'hydration');
  assert.equal((await request('/goals', 'PATCH', { key: 'water', target: 2000 }, member)).status, 200);
  // 1500 / 2000 = 75%
  assert.equal((await request('/projects/' + wp.id + '/water', 'PUT', { date: today, amountMl: 1500, confirmed: true, requestId: 'w-1', revision: 0 }, member)).status, 200);
  const run = (distanceM) => request('/activities', 'POST', { type: 'running', intensity: 'moderate', durationSec: 1800, distanceM, timeZone: 'Asia/Shanghai', visibility: 'private', confirmed: true, occurredAt: today + 'T00:00:00+08:00' }, member);
  assert.equal((await run(3000)).status, 200);
  assert.equal((await run(2000)).status, 200);
  const rp = (await request('/strength-project', 'POST', {}, member)).data;
  assert.equal((await request('/projects/' + rp.id + '/checkins', 'POST', { date: today, part: 'lower', amount: 12, confirmed: true }, member)).status, 200);
  assert.equal((await request('/projects/' + rp.id + '/checkins', 'POST', { date: today, part: 'upper', amount: 8, confirmed: true }, member)).status, 200);
  assert.equal((await request('/body-metrics', 'PUT', { date: earlier, weightKg: 69.2, waistCm: 79 }, member)).status, 200);
  assert.equal((await request('/body-metrics', 'PUT', { date: today, weightKg: 68.5, waistCm: 78 }, member)).status, 200);
  return { today, earlier };
}

test('总看板：横轴是人，日/周/月/年 四档，一格给出四项', async t => {
  const { request, close } = await open();
  t.after(close);
  const member = (await request('/local-session', 'POST', { userId: 'demo-a' })).data.token;
  const other = (await request('/local-session', 'POST', { userId: 'demo-b' })).data.token;
  const coach = (await request('/local-coach-session', 'POST', {})).data.token;
  await seed(request, member);

  // 没授权之前：教练列表是空的，会员自己也进不去总看板
  assert.equal((await request('/coach/board', 'GET', null, coach)).data.members.length, 0);
  assert.equal((await request('/coach/board', 'GET', null, member)).status, 403, '只有教练能看总看板');

  const invite = (await request('/coach/invite', 'GET', null, coach)).data;
  await request('/coach/link', 'POST', { code: invite.code, consent: true, name: '小林' }, member);
  await request('/coach/link', 'POST', { code: invite.code, consent: true, name: '小陈' }, other);

  const week = (await request('/coach/board?period=week', 'GET', null, coach)).data;
  assert.equal(week.members.length, 2, '横轴是人：一个人一列');
  assert.ok(week.range && week.range.label, '要给出这一档的时间范围');
  const me = week.members.find(m => m.name === '小林');
  const blank = week.members.find(m => m.name === '小陈');

  assert.deepEqual(
    { sessions: me.cardio.sessions, minutes: me.cardio.minutes, strength: me.strength.sessions, water: me.water.avgPercent },
    { sessions: 2, minutes: 60, strength: 2, water: 75 },
    '流量 = 次数 + 时间；饮水 = 完成百分比（1500/2000 = 75%）'
  );
  assert.equal(me.water.days, 1);
  assert.equal(me.water.metDays, 0, '75% 不算达标');
  // 体测给的是变化量，不是绝对值
  assert.equal(me.body.weight.delta, -0.7, '体重变化 69.2 → 68.5');
  assert.equal(me.body.waist.delta, -1, '腰围变化 79 → 78');
  assert.ok(me.body.latest && me.body.latest.weightKg === 68.5);

  // 什么都没记的人：全是空，不能变成 0 假装达标
  assert.equal(blank.cardio.sessions, 0);
  assert.equal(blank.water.avgPercent, null);
  assert.equal(blank.body.weight.delta, null);
  assert.equal(blank.body.weight.text, '还没有记录');

  // 四档周期：日视图的窗口就是一天，年视图按月给点
  const day = (await request('/coach/board?period=day', 'GET', null, coach)).data;
  const dayMe = day.members.find(m => m.name === '小林');
  assert.equal(dayMe.from, dayMe.to, '日视图 from === to');
  assert.equal(dayMe.grain, 'day');
  const month = (await request('/coach/board?period=month', 'GET', null, coach)).data;
  assert.ok(/年 \d+ 月/.test(month.range.label), '月视图的标签要带年月');
  const year = (await request('/coach/board?period=year', 'GET', null, coach)).data;
  const yearMe = year.members.find(m => m.name === '小林');
  assert.equal(yearMe.grain, 'month', '年视图按月聚合，365 根柱子没人看得清');
  assert.equal(yearMe.cardio.sessions, 2, '年视图把整年的都算进来');
});

test('个人页：五张卡 + 五项可左右滑的每日图，最短周期是周', async t => {
  const { request, close } = await open();
  t.after(close);
  const member = (await request('/local-session', 'POST', { userId: 'demo-a' })).data.token;
  const coach = (await request('/local-coach-session', 'POST', {})).data.token;
  await seed(request, member);
  const invite = (await request('/coach/invite', 'GET', null, coach)).data;
  await request('/coach/link', 'POST', { code: invite.code, consent: true, name: '小林' }, member);
  const id = (await request('/coach/members', 'GET', null, coach)).data[0].id;

  const p = (await request('/coach/members/' + id + '/person?period=week', 'GET', null, coach)).data;
  assert.equal(p.name, '小林');
  assert.equal(p.cards.length, 5, '最上面五项：有氧 / 力量 / 周均饮水 / 体重差值 / 腰围差值');
  assert.deepEqual(
    p.cards.map(c => c.value + (c.unit || '')),
    ['2次', '2次', '75%', '-0.7kg', '-1cm'],
    '体重跟维度分开两张卡，各给各的变化量'
  );
  assert.equal(p.cards[0].sub, '60 等效分钟', '有氧既给次数也给时间');
  assert.equal(p.cards[2].sub, '记了 1 天');
  assert.ok(p.cards[3].sub.length > 0, '差值要说明是跟谁比的');

  // 五项各自一串每日数据，左右滑一页一项
  assert.deepEqual(p.metrics.map(m => m.key), ['cardio', 'strength', 'water', 'weight', 'waist']);
  const water = p.metrics.find(m => m.key === 'water');
  const todayPoint = water.points[water.points.length - 1];
  assert.equal(todayPoint.value, 75);
  assert.equal(todayPoint.text, '1500 ml · 75%');
  const weight = p.metrics.find(m => m.key === 'weight');
  assert.equal(weight.points[weight.points.length - 1].value, 68.5);
  assert.ok(weight.points.every(pt => pt.has || pt.text === '没测'), '没测的那天不画点，但列表里要说清楚');

  // 月视图还是按天给点；年视图按月
  const m = (await request('/coach/members/' + id + '/person?period=month', 'GET', null, coach)).data;
  assert.equal(m.grain, 'day');
  // 月视图从 1 号铺到今天（不显示未来天数），天数 = 当月已过天数；用上海今天避免跨时区/跨月边界的脆弱断言
  const shDay = new Date(Date.now() + 8 * 3600 * 1000).toISOString().slice(0, 10);
  assert.equal(m.days, Number(shDay.slice(8, 10)), '月视图从 1 号铺到今天，天数 = 当月已过天数');
  const y = (await request('/coach/members/' + id + '/person?period=year', 'GET', null, coach)).data;
  assert.equal(y.grain, 'month');
  assert.ok(y.metrics[0].points.length >= 1 && y.metrics[0].points.length <= 12);

  // 别人名下的会员一律 404；教练仍然是只读的
  assert.equal((await request('/coach/members/nope/person', 'GET', null, coach)).status, 404);
  assert.equal((await request('/coach/members/' + id + '/person', 'GET', null, member)).status, 403);
  assert.equal((await request('/coach/members/' + id + '/checkins', 'POST', { type: 'running', intensity: 'moderate', durationSec: 600, distanceM: 1000, date: shanghaiToday() }, coach)).status, 404);
});

test('饮水的周平均：每天百分比加起来 ÷ 有记录的天数，喝超了算超的', async t => {
  const { request, close } = await open();
  t.after(close);
  const member = (await request('/local-session', 'POST', { userId: 'demo-a' })).data.token;
  const coach = (await request('/local-coach-session', 'POST', {})).data.token;
  const today = shanghaiToday();
  const home = (await request('/home', 'GET', null, member)).data;
  const wp = home.habits.projects.find(p => p.kind === 'hydration');
  await request('/goals', 'PATCH', { key: 'water', target: 2000 }, member);
  // 目标 2000：喝 2500 就是 125%，不许抹平成 100%
  await request('/projects/' + wp.id + '/water', 'PUT', { date: today, amountMl: 2500, confirmed: true, requestId: 'w-1', revision: 0 }, member);

  const invite = (await request('/coach/invite', 'GET', null, coach)).data;
  await request('/coach/link', 'POST', { code: invite.code, consent: true, name: '小林' }, member);
  const id = (await request('/coach/members', 'GET', null, coach)).data[0].id;

  const board = (await request('/coach/board?period=day', 'GET', null, coach)).data;
  assert.equal(board.members[0].water.avgPercent, 125, '喝超了就如实给 125%');
  assert.equal(board.members[0].water.metDays, 1);

  const p = (await request('/coach/members/' + id + '/person?period=week', 'GET', null, coach)).data;
  assert.equal(p.cards[2].value, 125, '卡片上就是 125，不是被抹平过的 100');
  assert.equal(p.cards[2].unit, '%');
});

// ── 训练结构 mix + 抗阻强度分布（2026-10-30 用户定稿）────────────────
test('总看板 mix：心肺/抗阻分段固定色，自建运动类别按项目色分段', async t => {
  const { request, close } = await open();
  t.after(close);
  const member = (await request('/local-session', 'POST', { userId: 'demo-a' })).data.token;
  const coach = (await request('/local-coach-session', 'POST', {})).data.token;
  await seed(request, member);   // 心肺 2 次、抗阻 2 次（都是默认中等强度）
  const invite = (await request('/coach/invite', 'GET', null, coach)).data;
  await request('/coach/link', 'POST', { code: invite.code, consent: true, name: '小林' }, member);

  // 会员自建一个「算作运动」的类别 + 项目，打一次卡
  const cat = (await request('/categories', 'POST', { name: '瑜伽', sport: true }, member)).data;
  const proj = (await request('/projects', 'POST', { categoryId: cat.id, name: '哈他瑜伽', goal: { period: 'weekly', target: 2 } }, member)).data;
  const today = shanghaiToday();
  assert.equal((await request('/projects/' + proj.id + '/checkins', 'POST', { date: today, confirmed: true }, member)).status, 200);

  const week = (await request('/coach/board?period=week', 'GET', null, coach)).data;
  const me = week.members.find(m => m.name === '小林');
  const byKey = Object.fromEntries(me.mix.map(x => [x.key, x]));
  assert.equal(byKey.cardio.count, 2); assert.equal(byKey.cardio.color, '#D93B36');
  assert.equal(byKey.strength.count, 2); assert.equal(byKey.strength.color, '#3D6EDC');
  assert.ok(byKey['瑜伽'] && byKey['瑜伽'].count === 1, '自建运动类别进乐高柱');
  assert.deepEqual(
    me.strengthIntensity,
    { low: 0, moderate: 2, vigorous: 0 },
    '没登记强度的老打卡按中等算'
  );
});

test('个人页带 strengthIntensity：教练能看出这一阵偏轻还是偏重', async t => {
  const { request, close } = await open();
  t.after(close);
  const member = (await request('/local-session', 'POST', { userId: 'demo-a' })).data.token;
  const coach = (await request('/local-coach-session', 'POST', {})).data.token;
  await seed(request, member);
  const invite = (await request('/coach/invite', 'GET', null, coach)).data;
  await request('/coach/link', 'POST', { code: invite.code, consent: true, name: '小林' }, member);
  const rp = (await request('/strength-project', 'POST', {}, member)).data;
  const today = shanghaiToday();
  await request('/projects/' + rp.id + '/checkins', 'POST', { date: today, part: 'full', intensity: 'low', confirmed: true }, member);
  const linkId = (await request('/coach/board?period=week', 'GET', null, coach)).data.members[0].id;
  const person = (await request('/coach/members/' + linkId + '/person?period=week', 'GET', null, coach)).data;
  assert.equal(person.strengthIntensity.low, 1);
  assert.equal(person.strengthIntensity.vigorous, 0);
  assert.ok(Array.isArray(person.mix), '个人页也带训练结构');
});
