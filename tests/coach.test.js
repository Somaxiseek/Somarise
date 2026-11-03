const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createApp } = require('../server/http');

// 教练端会员看板（本地演示服务端）：和云端同一份授权逻辑（server/coach-links.js）。
// 教练码 → 会员本人同意 → 教练自动看到看板 → 任一方解除 → 记录一条都不少。
// 本地这里刚好能验证「会员是真的账号」：demo-a 既是被教练看的那个人，也能自己登进来看记录。
test('会员本人授权之后，教练才看得到 TA 的看板（本地演示）', async t => {
  const { server, store } = createApp({ memory: true });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  t.after(async () => { await new Promise(r => server.close(r)); store.close(); });
  const base = 'http://127.0.0.1:' + server.address().port;
  const request = async (p, method = 'GET', body, token) => {
    const r = await fetch(base + p, { method, headers: { Authorization: 'Bearer ' + (token || ''), 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
    return { status: r.status, data: await r.json() };
  };

  const member = (await request('/local-session', 'POST', { userId: 'demo-a' })).data.token;
  const coach = (await request('/local-coach-session', 'POST', {})).data.token;

  // 没授权时：教练的会员列表是空的，会员这边也查不到关联
  assert.equal((await request('/coach/link', 'GET', null, member)).data.link, null);
  assert.equal((await request('/coach/members', 'GET', null, member)).status, 403, '会员进不了教练接口');
  assert.equal((await request('/coach/invite', 'GET', null, member)).status, 403, '教练码只有教练能拿');

  // 教练码：六位、稳定
  const invite = (await request('/coach/invite', 'GET', null, coach)).data;
  assert.match(invite.code, /^[A-Z2-9]{6}$/);
  assert.equal((await request('/coach/invite', 'GET', null, coach)).data.code, invite.code);

  // 没同意 / 码不对，都建不起来
  assert.equal((await request('/coach/link', 'POST', { code: invite.code, name: '小林' }, member)).status, 400);
  assert.equal((await request('/coach/link', 'POST', { code: 'ZZZZZZ', consent: true, name: '小林' }, member)).status, 400);
  assert.equal((await request('/coach/link', 'POST', { code: invite.code, consent: true, name: '对方' }, coach)).status, 403, '教练会话不能给自己授权');

  // 会员输入教练码并同意
  const granted = await request('/coach/link', 'POST', { code: invite.code.toLowerCase(), consent: true, name: '小林' }, member);
  assert.equal(granted.status, 200);
  assert.equal(granted.data.name, '小林');

  // 教练这边自动出现
  const list = (await request('/coach/members', 'GET', null, coach)).data;
  assert.equal(list.length, 1);
  assert.equal(list[0].name, '小林');
  assert.ok(list[0].authorizedAt);
  assert.equal(list[0].memberUid, 'demo-a', '关联到的是会员真实的账号，不是教练编出来的档案');
  const id = list[0].id;

  // 手填名字建会员那条路已经关掉
  assert.equal((await request('/coach/members', 'POST', { name: '张三' }, coach)).status, 400);

  // 看板结构齐全：体测要给教练看（那是调计划的依据），学习进度不分享
  const empty = (await request('/coach/members/' + id + '/home', 'GET', null, coach)).data;
  assert.ok(empty.goals && Array.isArray(empty.goals.week));
  assert.ok(empty.habits && empty.habits.achievements);
  assert.ok(empty.body, '教练要能看到体测');
  assert.equal(empty.learningToday, undefined, '学习进度不分享');

  // 每日明细：一天一行，饮水带完成百分比
  const days = (await request('/coach/members/' + id + '/days?days=7', 'GET', null, coach)).data;
  assert.equal(days.rows.length, 7);
  assert.equal(typeof days.rows[0].water.ml, 'number');

  // 教练是只读的：改目标、代记一笔的接口都撤了
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  assert.equal((await request('/coach/members/' + id + '/goals', 'PATCH', { key: 'cardio', target: 150 }, coach)).status, 404);
  assert.equal((await request('/coach/members/' + id + '/checkins', 'POST', { type: 'running', intensity: 'moderate', durationSec: 1800, distanceM: 3000, date: today }, coach)).status, 404);

  // 不是自己名下的会员一律 404，不泄露存在性
  assert.equal((await request('/coach/members/unrelated/home', 'GET', null, coach)).status, 404);
  assert.equal((await request('/coach/members/unrelated/days', 'GET', null, coach)).status, 404);

  // 教练解除：关联消失，会员的记录一条都没删
  assert.equal((await request('/coach/members/' + id, 'DELETE', null, coach)).status, 200);
  assert.equal((await request('/coach/members', 'GET', null, coach)).data.length, 0);
  assert.equal((await request('/coach/members/' + id + '/home', 'GET', null, coach)).status, 404);
  assert.equal((await request('/home', 'GET', null, member)).status, 200, '会员自己的记录不受影响');
  assert.equal((await request('/coach/link', 'GET', null, member)).data.link, null);

  // 会员重新授权；教练换码后老码作废，新码照常可用
  assert.equal((await request('/coach/link', 'POST', { code: invite.code, consent: true, name: '小林' }, member)).status, 200);
  const rotated = (await request('/coach/invite', 'POST', null, coach)).data;
  assert.notEqual(rotated.code, invite.code);
  assert.equal((await request('/coach/link', 'POST', { code: invite.code, consent: true, name: '小林' }, member)).status, 400, '旧码在换码之后作废');
  assert.equal((await request('/coach/link', 'POST', { code: rotated.code, consent: true, name: '小林' }, member)).status, 200, '新码可用');
});

// 教练备注（用户 10-30）：微信昵称认不出人，教练记一个真名/标签。
// 只属于这条关联、只有教练看得到；会员侧的任何响应都不带出去。
test('教练备注：本地与云端同一份逻辑，会员侧看不到', async t => {
  const { server, store } = createApp({ memory: true });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  t.after(async () => { await new Promise(r => server.close(r)); store.close(); });
  const base = 'http://127.0.0.1:' + server.address().port;
  const request = async (p, method = 'GET', body, token) => {
    const r = await fetch(base + p, { method, headers: { Authorization: 'Bearer ' + (token || ''), 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
    return { status: r.status, data: await r.json() };
  };

  const member = (await request('/local-session', 'POST', { userId: 'demo-a' })).data.token;
  const coach = (await request('/local-coach-session', 'POST', {})).data.token;
  const invite = (await request('/coach/invite', 'GET', null, coach)).data;
  await request('/coach/link', 'POST', { code: invite.code, consent: true, name: 'Seek' }, member);
  const id = (await request('/coach/members', 'GET', null, coach)).data[0].id;

  // 写备注 → 教练侧列表/总看板/个人页都带出来
  assert.equal((await request('/coach/members/' + id + '/remark', 'PATCH', { remark: ' 林小二 ' }, coach)).data.remark, '林小二', '两端去空格');
  assert.equal((await request('/coach/members', 'GET', null, coach)).data[0].remark, '林小二');
  assert.equal((await request('/coach/board?period=week', 'GET', null, coach)).data.members[0].remark, '林小二');
  assert.equal((await request('/coach/members/' + id + '/person', 'GET', null, coach)).data.remark, '林小二');

  // 会员侧剥干净：link 与授权回包都不带备注
  assert.equal((await request('/coach/link', 'GET', null, member)).data.link.remark, undefined);

  // 空串清掉；31 字拒绝；会员与无关会话都写不进
  assert.equal((await request('/coach/members/' + id + '/remark', 'PATCH', { remark: '' }, coach)).data.remark, '');
  assert.equal((await request('/coach/members/' + id + '/remark', 'PATCH', { remark: '字'.repeat(31) }, coach)).status, 400);
  assert.equal((await request('/coach/members/' + id + '/remark', 'PATCH', { remark: 'x' }, member)).status, 403);
  assert.equal((await request('/coach/members/unrelated/remark', 'PATCH', { remark: 'x' }, coach)).status, 404);
});
