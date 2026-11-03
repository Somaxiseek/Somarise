const { test } = require('node:test');
const assert = require('node:assert/strict');
const { AVATARS, get } = require('../miniprogram/data/pixel-avatars');
const { profileStats } = require('../miniprogram/utils/cycles');

// 头像数据：20 款成品图。错了在真机上就是「一片空白」——组件不会报错，
// 所以「id 对得上文件」这件事必须在这里守。
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', 'miniprogram');

test('头像目录：20 款、id 唯一且小写、每款都有对应图片文件', () => {
  assert.equal(AVATARS.length, 20);
  const ids = new Set();
  for (const a of AVATARS) {
    assert.match(a.id, /^[a-z]{2,12}$/, a.id + ' 的 id 只能是 2–12 个小写字母（要过服务端 px: 校验）');
    assert.ok(!ids.has(a.id), 'id 不能重复：' + a.id);
    ids.add(a.id);
    assert.ok(a.label && a.label.length <= 6, a.id + ' 要有 6 字以内的中文名');
    assert.equal(a.src, '/assets/avatars/' + a.id + '.png');

    const file = path.join(ROOT, a.src.replace(/^\//, ''));
    assert.ok(fs.existsSync(file), a.id + ' 缺图：' + file);
    const buf = fs.readFileSync(file);
    // PNG 魔数 + 尺寸：宽高必须是 224（真机最大 170rpx，够用；再大就是白吃包体）
    assert.equal(buf.slice(1, 4).toString(), 'PNG', a.id + ' 不是 PNG');
    const w = buf.readUInt32BE(16);
    const h = buf.readUInt32BE(20);
    assert.equal(w, 224, a.id + ' 宽应为 224，实际 ' + w);
    assert.equal(h, 224, a.id + ' 高应为 224，实际 ' + h);
    // 单张压到 10KB 以内。主包只剩几十 KB，一张跑偏就会全组超标
    assert.ok(buf.length <= 10 * 1024, a.id + ' 有 ' + Math.round(buf.length / 1024) + 'KB，超过 10KB');
  }
});

test('头像目录：20 张加起来不超过 160KB（主包余额有限，别悄悄涨回去）', () => {
  let total = 0;
  for (const a of AVATARS) total += fs.statSync(path.join(ROOT, a.src.replace(/^\//, ''))).size;
  assert.ok(total <= 160 * 1024, '20 张共 ' + Math.round(total / 1024) + 'KB，超过 160KB');
});

test('头像取值：px: 前缀可有可无，旧 id 能映射到新款，未知 id 与空值都退化成 null', () => {
  assert.equal(get('px:grey').id, 'grey');
  assert.equal(get('grey').id, 'grey');
  assert.equal(get('px:duck').id, 'duck');
  // 上一版字符网格的 id 还留在老账号里，不能因为换了画风就变成「没有头像」
  assert.equal(get('px:cat').id, 'orange');
  assert.equal(get('px:blackcat').id, 'tuxedo');
  assert.equal(get('px:fox').id, 'calico');
  // 16 款那版有、这一版没画的暹罗猫：映射到同色系的布偶，别让人突然没头像
  assert.equal(get('px:siamese').id, 'ragdoll');
  // 24 款那版被砍掉的 4 只：已经有人选过，得落到最近的同类
  assert.equal(get('px:poodle').id, 'shihtzu');
  assert.equal(get('px:hedgehog').id, 'hamster');
  assert.equal(get('px:cockatiel').id, 'bluebird');
  assert.equal(get('px:turtle').id, 'rabbit');
  for (const bad of ['', null, undefined, 'px:', 'px:nope', 'cat2', 'px:GREY']) {
    assert.equal(get(bad), null, String(bad) + ' 不该解析出头像');
  }
});

// 顶部头像卡的三个数字。连续天不在这里（页面直接取 heatmap().stats），
// 这里只管累计天数 / 累计分钟 / 单日峰值，且三种项目都算「这天记过」。
test('头像卡统计：三种记录都算一天，分钟只累计有氧，单日最长取峰值', () => {
  const day = n => new Date(Date.now() - n * 86400000).toISOString().slice(0, 10);
  const at = n => day(n) + 'T12:00:00Z';
  const home = {
    user: { timeZone: 'UTC' },
    activities: [
      { type: 'running', occurredAt: at(6), durationSec: 1800 },   // 30 分
      { type: 'running', occurredAt: at(5), durationSec: 3600 },   // 60 分
      { type: 'walking', occurredAt: at(4), durationSec: 0 }       // 散步不计分钟，但算记录
    ],
    habits: { categories: [{ projects: [{ kind: 'resistance', progress: { days: [day(3)] } }] }] }
  };
  const s = profileStats(home);
  assert.equal(s.totalDays, 4, '心肺 / 散步 / 抗阻各算一天，散步一天也算');
  assert.equal(s.totalMin, 90, '只累计心肺分钟（散步 = 0）');
  assert.equal(s.bestDay, 60, '单日最长 = 那天 60 分，不是总和');
});

test('头像卡统计：空账号不报错，三个数字都是 0', () => {
  for (const home of [{}, null, { activities: [], habits: { categories: [] } }]) {
    const s = profileStats(home);
    assert.deepEqual(s, { totalDays: 0, totalMin: 0, bestDay: 0 });
  }
});

test('头像卡统计：未来日期的记录不计（补录到明天不算「累计」）', () => {
  const day = n => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);
  const s = profileStats({
    user: { timeZone: 'UTC' },
    activities: [{ type: 'running', occurredAt: day(1) + 'T12:00:00Z', durationSec: 600 }]
  });
  assert.equal(s.totalDays, 0);
  assert.equal(s.totalMin, 0);
});

// 服务端不能只信前端：头像只收 px: 预设 id，任何图片地址一律拒。
// 这条守的是「不做上传」这个决定——不然哪天有人塞个 URL 进来，头像就成了 UGC 图床。
test('服务端头像白名单：只收 px:xxx，图片地址与畸形 id 一律 400', async (t) => {
  const { createApp } = require('../server/http');
  const { server, store } = createApp({ memory: true });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  t.after(async () => { await new Promise(r => server.close(r)); store.close(); });

  const base = 'http://127.0.0.1:' + server.address().port;
  const request = async (p, method = 'GET', body, token) => {
    const r = await fetch(base + p, {
      method,
      headers: { Authorization: 'Bearer ' + (token || ''), 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined
    });
    return { status: r.status, data: await r.json() };
  };
  const tok = (await request('/local-session', 'POST', { userId: 'demo-a' })).data.token;

  assert.equal((await request('/profile', 'PATCH', { nickname: '小林', avatar: 'px:cat' }, tok)).status, 200);
  assert.equal((await request('/home', 'GET', null, tok)).data.user.avatar, 'px:cat', '/home 原样带回头像');

  for (const bad of ['https://evil.example/a.png', 'px:../x', 'px:CAT', 'cat', 'px:cat ', 'px:' + 'a'.repeat(20)]) {
    const r = await request('/profile', 'PATCH', { nickname: '小林', avatar: bad }, tok);
    assert.equal(r.status, 400, JSON.stringify(bad) + ' 应该被拒');
  }

  // 清空 = 回到昵称首字（组件 mete 到 null 就退化成字母头像）
  await request('/profile', 'PATCH', { nickname: '小林', avatar: '' }, tok);
  assert.equal((await request('/home', 'GET', null, tok)).data.user.avatar, '');
});
