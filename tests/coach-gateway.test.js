const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createGateway, EXPECTED_APPID, identity } = require('../server/mobile-gateway');

// 教练会员路由走的是 createGateway 里的事务分支（handleCoach → serveMember），
// 不经过 route()，所以 tests/gateway-routes.test.js 的静态扫描看不到它们。
// 这条测试用真 gateway + 内存事务仓库盯住整条授权链：
// 教练码 → 会员本人同意 → 教练自动看到看板 → 任一方解除 → 记录一条都不少。
// 起因：上一版是教练手填一个名字「新建会员」，那个名字背后没有账号，
// 永远不会产生数据，等于给自己记了个备注。
const coachOpenid = 'coach-openid-for-test';
const memberOpenid = 'plain-member-openid';
const otherOpenid = 'another-member-openid';

function setup() {
  const prev = process.env.Somarise_COACH_USER_IDS;
  process.env.Somarise_COACH_USER_IDS = identity({ APPID: EXPECTED_APPID, OPENID: coachOpenid });
  let data = new Map(), chain = Promise.resolve();
  const repository = {
    transaction(fn) {
      const task = chain.then(async () => {
        const next = structuredClone(data);
        const result = await fn({ get: async k => next.get(k) || null, set: async (k, v) => { next.set(k, structuredClone(v)); } });
        data = next;
        return result;
      });
      chain = task.catch(() => {});
      return task;
    }
  };
  const gateway = createGateway(repository);
  return {
    restore: () => { if (prev === undefined) delete process.env.Somarise_COACH_USER_IDS; else process.env.Somarise_COACH_USER_IDS = prev; },
    call: (openid, path, method = 'GET', body = {}) => gateway({ path, method, body }, { APPID: EXPECTED_APPID, OPENID: openid })
  };
}

test('会员本人授权之后，教练才看得到 TA 的看板（云网关）', async () => {
  const { call, restore } = setup();
  try {
    // 一开始谁也没授权谁
    const before = await call(memberOpenid, '/coach/link');
    assert.equal(before.status, 200);
    assert.equal(before.data.link, null);

    // 教练码只有教练能拿到，而且同一个教练的码是稳定的
    assert.equal((await call(memberOpenid, '/coach/invite')).status, 403);
    const invite = await call(coachOpenid, '/coach/invite');
    assert.equal(invite.status, 200);
    assert.match(invite.data.code, /^[A-Z2-9]{6}$/, '六位、去掉了 I/O/0/1 这类看错就废的字符');
    assert.equal((await call(coachOpenid, '/coach/invite')).data.code, invite.data.code);

    // 没点同意、码打错了，一律授权不成立
    assert.equal((await call(memberOpenid, '/coach/link', 'POST', { code: invite.data.code, name: '小林' })).status, 400, '没有同意就不算授权');
    assert.equal((await call(memberOpenid, '/coach/link', 'POST', { code: 'ZZZZZZ', consent: true, name: '小林' })).status, 400, '码不对');
    assert.equal((await call(coachOpenid, '/coach/link', 'POST', { code: invite.data.code, consent: true, name: '自己' })).status, 400, '不能授权给自己');

    // 会员输入教练码并同意 → 关联建立
    const granted = await call(memberOpenid, '/coach/link', 'POST', { code: invite.data.code.toLowerCase(), consent: true, name: '小林' });
    assert.equal(granted.status, 200, '码不分大小写，念给对面听也不会错');
    assert.equal(granted.data.name, '小林');

    const mine = await call(memberOpenid, '/coach/link');
    assert.equal(mine.data.link.name, '小林');
    assert.equal(mine.data.coach.active, true);

    // 教练这边自动出现，不用任何「新增」动作
    const list = await call(coachOpenid, '/coach/members');
    assert.equal(list.status, 200);
    assert.ok(Array.isArray(list.data), '列表要直接返回数组，前端按数组渲染');
    assert.equal(list.data.length, 1);
    assert.equal(list.data[0].name, '小林');
    assert.ok(list.data[0].authorizedAt, '要带授权时间，教练才知道这是什么时候连上的');
    const id = list.data[0].id;

    // 手填名字建会员那条路已经关掉
    assert.equal((await call(coachOpenid, '/coach/members', 'POST', { name: '张三' })).status, 400);

    // 看板结构齐全（周期看板由 goals.week + closedWeeks 派生）
    const home = await call(coachOpenid, '/coach/members/' + id + '/home');
    assert.equal(home.status, 200);
    assert.ok(Array.isArray(home.data.goals.week));
    assert.ok(home.data.habits && home.data.habits.achievements);
    // 体测是教练调计划的依据，必须给（用户 10-29 点名）；学习进度和 Somaxis 绑定仍然不分享
    assert.ok(home.data.body, '教练要能看到体测');
    assert.equal(home.data.learningToday, undefined, '学习进度不分享');
    assert.equal(home.data.link, undefined, 'Somaxis 绑定不分享');

    // 每日明细：体测 / 心肺 / 抗阻 / 饮水，一天一行
    const days = await call(coachOpenid, '/coach/members/' + id + '/days?days=7');
    assert.equal(days.status, 200);
    assert.equal(days.data.rows.length, 7);
    assert.ok(days.data.rows[0].water && days.data.rows[0].cardio && days.data.rows[0].strength, '一天要同时给出饮水/心肺/抗阻');

    // 教练是只读的：改目标、代记一笔的连接口都没有
    assert.equal((await call(coachOpenid, '/coach/members/' + id + '/goals', 'PATCH', { key: 'cardio', target: 150 })).status, 404);
    assert.equal((await call(coachOpenid, '/coach/members/' + id + '/checkins', 'POST', { type: 'running', intensity: 'moderate', durationSec: 1800, distanceM: 3000, date: '2026-10-29' })).status, 404);

    // 别的会员看不到这条关联，也进不了教练接口
    assert.equal((await call(otherOpenid, '/coach/link')).data.link, null);
    assert.equal((await call(otherOpenid, '/coach/members')).status, 403);
    assert.equal((await call(memberOpenid, '/coach/members/' + id + '/home')).status, 403);
    assert.equal((await call(otherOpenid, '/coach/members/' + id + '/home')).status, 403);

    // 教练解除：关联消失，但会员的记录一条都没删
    assert.equal((await call(coachOpenid, '/coach/members/' + id, 'DELETE')).status, 200);
    assert.equal((await call(coachOpenid, '/coach/members')).data.length, 0);
    assert.equal((await call(coachOpenid, '/coach/members/' + id + '/home')).status, 404);
    assert.equal((await call(coachOpenid, '/coach/members/' + id + '/days')).status, 404);
    assert.equal((await call(memberOpenid, '/home')).status, 200, '会员自己的记录不受影响');
    assert.equal((await call(memberOpenid, '/coach/link')).data.link, null);

    // 重新授权；换码之后老码作废，但已经授权的会员不受影响
    const again = await call(memberOpenid, '/coach/link', 'POST', { code: invite.data.code, consent: true, name: '小林' });
    assert.equal(again.status, 200);
    assert.equal((await call(coachOpenid, '/coach/members')).data.length, 1);

    const rotated = await call(coachOpenid, '/coach/invite', 'POST');
    assert.match(rotated.data.code, /^[A-Z2-9]{6}$/);
    assert.notEqual(rotated.data.code, invite.data.code);
    assert.equal((await call(otherOpenid, '/coach/link', 'POST', { code: invite.data.code, consent: true, name: '小张' })).status, 400, '老码立刻失效');
    assert.equal((await call(otherOpenid, '/coach/link', 'POST', { code: rotated.data.code, consent: true, name: '小张' })).status, 200, '新码可用');
    assert.equal((await call(coachOpenid, '/coach/members')).data.length, 2, '换码不影响已经授权的会员');

    // 会员自己撤回：教练那边同样立刻看不到
    assert.equal((await call(memberOpenid, '/coach/link', 'DELETE')).status, 200);
    assert.equal((await call(coachOpenid, '/coach/members')).data.length, 1);
    assert.equal((await call(memberOpenid, '/coach/link')).data.link, null);
  } finally { restore(); }
});

test('教练备注：只有教练看得到，重授权不丢（用户 10-30）', async () => {
  const { call, restore } = setup();
  try {
    const invite = await call(coachOpenid, '/coach/invite');
    await call(memberOpenid, '/coach/link', 'POST', { code: invite.data.code, consent: true, name: 'Seek' });
    const id = (await call(coachOpenid, '/coach/members')).data[0].id;

    // 教练写备注 → 列表、总看板、个人页都带出来
    const saved = await call(coachOpenid, '/coach/members/' + id + '/remark', 'PATCH', { remark: '林小二' });
    assert.equal(saved.status, 200);
    assert.equal(saved.data.remark, '林小二');
    assert.equal((await call(coachOpenid, '/coach/members')).data[0].remark, '林小二');
    const board = await call(coachOpenid, '/coach/board?period=week');
    assert.equal(board.data.members[0].remark, '林小二');
    const person = await call(coachOpenid, '/coach/members/' + id + '/person');
    assert.equal(person.data.remark, '林小二');

    // 会员侧任何响应都不带备注：link、授权回包都剥干净
    const mine = await call(memberOpenid, '/coach/link');
    assert.equal(mine.data.link.remark, undefined, '备注不能顺着会员侧的 link 漏出去');

    // 会员重新授权（刷新称呼）备注不丢；空串 = 清掉
    await call(memberOpenid, '/coach/link', 'DELETE');
    await call(memberOpenid, '/coach/link', 'POST', { code: invite.data.code, consent: true, name: '新称呼' });
    const relinked = (await call(coachOpenid, '/coach/members')).data[0];
    assert.equal(relinked.remark, '林小二', '重授权备注跟人走');
    assert.equal(relinked.name, '新称呼');
    const cleared = await call(coachOpenid, '/coach/members/' + relinked.id + '/remark', 'PATCH', { remark: '  ' });
    assert.equal(cleared.status, 200);
    assert.equal(cleared.data.remark, '');

    // 越权：会员不能写备注，别人的教练也不能
    assert.equal((await call(memberOpenid, '/coach/members/' + relinked.id + '/remark', 'PATCH', { remark: 'x' })).status, 403);
    assert.equal((await call(otherOpenid, '/coach/members/' + relinked.id + '/remark', 'PATCH', { remark: 'x' })).status, 403);
    // 30 字上限
    assert.equal((await call(coachOpenid, '/coach/members/' + relinked.id + '/remark', 'PATCH', { remark: '字'.repeat(31) })).status, 400);
  } finally { restore(); }
});
