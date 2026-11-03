const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createApp } = require('../server/http');

// 教练要的是「每一天」，不是「本周达标几天」——尤其是饮水：
// 目标是 2000，喝了 1500 就是 75%，喝到 2500 就是 125%，不能截回 100%。
// 这里在本地演示服务端上把一天的真实数据造出来，再问 /days 要回来看数字对不对。
// 运动记录带时刻：写成「今天 12:00」的话，过了零点它就是未来时间，服务端会拒，
// 这个测试每天零点之后就会红一次。所以固定写今天 00:00，永远在过去。
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

test('/days 按天给出体测 / 心肺 / 抗阻 / 饮水，饮水的百分比不截到 100%', async t => {
  const { request, close } = await open();
  t.after(close);
  const member = (await request('/local-session', 'POST', { userId: 'demo-a' })).data.token;
  const today = shanghaiToday();
  const stamp = today;

  // 把这一天造全：饮水定线 2000、跑了 30 分钟、练了下肢、测了体重腰围
  const home = (await request('/home', 'GET', null, member)).data;
  const waterProject = home.habits.projects.find(p => p.kind === 'hydration');
  assert.ok(waterProject, '演示账号要有饮水项目');
  assert.equal((await request('/goals', 'PATCH', { key: 'water', target: 2000 }, member)).status, 200);

  const put = (amountMl, requestId, revision) => request('/projects/' + waterProject.id + '/water', 'PUT',
    { date: stamp, amountMl, confirmed: true, requestId, revision }, member);
  assert.equal((await put(1500, 'w-1', 0)).status, 200);
  assert.equal((await request('/activities', 'POST', { type: 'running', intensity: 'moderate', durationSec: 1800, distanceM: 3000, timeZone: 'Asia/Shanghai', visibility: 'private', confirmed: true, occurredAt: stamp + 'T00:00:00+08:00' }, member)).status, 200);
  const resistance = (await request('/strength-project', 'POST', {}, member)).data;
  assert.equal((await request('/projects/' + resistance.id + '/checkins', 'POST', { date: stamp, part: 'lower', amount: 12, confirmed: true }, member)).status, 200);
  assert.equal((await request('/body-metrics', 'PUT', { date: stamp, weightKg: 68.5, waistCm: 78 }, member)).status, 200);

  const first = (await request('/days?days=7', 'GET', null, member)).data;
  assert.equal(first.rows.length, 7, '要 7 行，一天一行');
  assert.equal(first.rows[0].date, today, '最近的排最前');
  const row = first.rows[0];
  assert.deepEqual(
    { ml: row.water.ml, target: row.water.target, percent: row.water.percent },
    { ml: 1500, target: 2000, percent: 75 },
    '1500 / 2000 就是 75%'
  );
  assert.equal(row.cardio.minutes, 30, '中等强度 30 分钟 = 30 等效分钟');
  assert.equal(row.cardio.sessions, 1);
  assert.equal(row.strength.done, true);
  assert.equal(row.strength.parts[0], '下肢');
  assert.deepEqual({ kg: row.body.weightKg, cm: row.body.waistCm }, { kg: 68.5, cm: 78 }, '体测要给教练看');

  // 喝到 2500：超了就是 125%，不许抹平成 100%
  assert.equal((await put(2500, 'w-2', 1)).status, 200);
  const second = (await request('/days?days=7', 'GET', null, member)).data;
  assert.deepEqual(
    { ml: second.rows[0].water.ml, percent: second.rows[0].water.percent },
    { ml: 2500, percent: 125 },
    '喝超了要如实显示 125%'
  );

  // 没定线就只报毫升数，不报百分比（跟 App 里「仅记录」一个口径）
  const noTarget = await open();
  t.after(noTarget.close);
  const m2 = (await noTarget.request('/local-session', 'POST', { userId: 'demo-b' })).data.token;
  const home2 = (await noTarget.request('/home', 'GET', null, m2)).data;
  const wp2 = home2.habits.projects.find(p => p.kind === 'hydration');
  // 演示账号自带一条系统建议量（体重 × 35ml），这里显式改成「仅记录」，才测得到没定线的样子
  assert.equal((await noTarget.request('/goals', 'PATCH', { key: 'water', recordOnly: true, applyNow: true }, m2)).status, 200);
  assert.equal((await noTarget.request('/projects/' + wp2.id + '/water', 'POST', { date: stamp, amountMl: 800, confirmed: true, requestId: 'w-3' }, m2)).status, 200);
  const d2 = (await noTarget.request('/days?days=3', 'GET', null, m2)).data;
  assert.equal(d2.rows[0].water.ml, 800);
  assert.equal(d2.rows[0].water.target, 0, '没有目标线就不算百分比');
  assert.equal(d2.rows[0].water.percent, null);
  assert.equal(d2.rows.length, 3, 'days 参数要生效');
});

test('教练通过 /coach/members/:id/days 看到的是会员本人的每一天', async t => {
  const { request, close } = await open();
  t.after(close);
  const member = (await request('/local-session', 'POST', { userId: 'demo-a' })).data.token;
  const coach = (await request('/local-coach-session', 'POST', {})).data.token;
  const today = shanghaiToday();
  const stamp = today;

  const home = (await request('/home', 'GET', null, member)).data;
  const waterProject = home.habits.projects.find(p => p.kind === 'hydration');
  await request('/goals', 'PATCH', { key: 'water', target: 2000 }, member);
  await request('/projects/' + waterProject.id + '/water', 'PUT', { date: stamp, amountMl: 1500, confirmed: true, requestId: 'w-1', revision: 0 }, member);

  // 没授权：教练看不到
  assert.equal((await request('/coach/members', 'GET', null, coach)).data.length, 0);
  const invite = (await request('/coach/invite', 'GET', null, coach)).data;
  await request('/coach/link', 'POST', { code: invite.code, consent: true, name: '小林' }, member);
  const id = (await request('/coach/members', 'GET', null, coach)).data[0].id;

  const days = (await request('/coach/members/' + id + '/days?days=7', 'GET', null, coach)).data;
  assert.equal(days.rows[0].water.ml, 1500);
  assert.equal(days.rows[0].water.percent, 75);
  assert.equal(days.totals.waterDays, 1);

  // 教练是只读的：代记、改目标这两条写入路径已经撤掉
  assert.equal((await request('/coach/members/' + id + '/checkins', 'POST', { type: 'running', intensity: 'moderate', durationSec: 1800, distanceM: 3000, date: today }, coach)).status, 404);
  assert.equal((await request('/coach/members/' + id + '/goals', 'PATCH', { key: 'cardio', target: 150 }, coach)).status, 404);

  // 不是自己名下的会员一律 404
  assert.equal((await request('/coach/members/nope/days', 'GET', null, coach)).status, 404);

  // 教练看到的体测：/home 里也带着
  await request('/body-metrics', 'PUT', { date: stamp, weightKg: 70, waistCm: 80 }, member);
  const home3 = (await request('/coach/members/' + id + '/home', 'GET', null, coach)).data;
  assert.equal(home3.body.latest.weightKg, 70, '教练要能看到体测（体测是调计划的依据）');
  assert.equal(home3.learningToday, undefined, '学习进度仍然不分享');
});
