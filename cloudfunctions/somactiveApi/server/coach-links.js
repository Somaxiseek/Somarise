'use strict';
// 教练与会员的关联，只由会员本人授权建立。
//
// 之前是教练在 App 里手填一个名字「新建会员」——那个名字背后没有任何账号，
// 填完也永远不会产生数据，等于给自己记了个备注。现在反过来：
//   教练出示六位教练码 → 会员在「我的 → 教练授权」里输入并同意 → 关联建立，
//   教练侧的会员看板自动出现 TA，任何一方都可以随时解除。
//
// 存储只有三张表，云上是 shared_ 前缀的共享记录，本地是 db 里的同名字段：
//   shared_coach_invites  [{coachId, code, createdAt, updatedAt}]
//   shared_coach_members  [{id, coachId, memberUid, name, origin, createdAt, consentedAt}]
//   shared_coach_remarks  [{coachId, memberUid, remark, updatedAt}]  教练的私人备注（10-30）
// 一个会员同一时间只授权给一位教练（重新授权给另一位 = 换人）。
const { randomUUID, randomInt } = require('node:crypto');
const { fail } = require('./domain');

const INVITES = 'shared_coach_invites';
const MEMBERS = 'shared_coach_members';
const REMARKS = 'shared_coach_remarks';
// 去掉 I / O / 0 / 1：这个码是要念出来、手打进去的
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const CODE_LEN = 6;

function normalizeCode(raw) {
  return String(raw == null ? '' : raw).toUpperCase().replace(/[^A-Z0-9]/g, '');
}

async function read(store, key) {
  const value = await store.get(key);
  return Array.isArray(value) ? value : [];
}
async function write(store, key, value) {
  await store.set(key, value);
}

function freshCode(taken) {
  for (let i = 0; i < 24; i++) {
    let out = '';
    for (let j = 0; j < CODE_LEN; j++) out += ALPHABET[randomInt(ALPHABET.length)];
    if (!taken.includes(out)) return out;
  }
  fail('教练码生成失败，请再试一次', 500);
}

// 教练码：一位教练一个，第一次打开教练端时生成。
// 「换一个」只影响之后的授权，已经授权过的会员不受影响。
async function issueCode(store, coachId, { rotate = false } = {}) {
  const list = await read(store, INVITES);
  const hit = list.find(x => x.coachId === coachId);
  if (hit && !rotate) return { code: hit.code };
  const code = freshCode(list.map(x => x.code));
  const now = new Date().toISOString();
  const next = hit
    ? list.map(x => (x.coachId === coachId ? { ...x, code, updatedAt: now } : x))
    : list.concat({ coachId, code, createdAt: now });
  await write(store, INVITES, next);
  return { code };
}

async function coachByCode(store, raw) {
  const code = normalizeCode(raw);
  if (code.length !== CODE_LEN) return '';
  const hit = (await read(store, INVITES)).find(x => x.code === code);
  return hit ? hit.coachId : '';
}

// 备注独立成表（键 = 教练×会员）：撤回/解除把关联记录删掉，备注却该留下来——
// 会员过阵子重新授权，教练写的那个名字还在。换一位教练 = 新的一对，备注不跟过去。
async function remarkMap(store) {
  const map = new Map();
  for (const r of await read(store, REMARKS)) {
    if (r.remark) map.set(r.coachId + '|' + r.memberUid, r.remark);
  }
  return map;
}

function shape(link, remark) {
  return {
    id: link.id,
    coachId: link.coachId,
    memberUid: link.memberUid,
    name: link.name || '',
    // 教练的私人备注（用户 10-30）：只有教练侧的接口带它，会员侧一律剥掉
    remark: remark || '',
    origin: link.origin || 'consent',
    authorizedAt: link.consentedAt || link.createdAt
  };
}

async function linkOf(store, memberUid) {
  const hit = (await read(store, MEMBERS)).find(x => x.memberUid === memberUid);
  if (!hit) return null;
  return shape(hit, (await remarkMap(store)).get(hit.coachId + '|' + hit.memberUid));
}

async function membersOf(store, coachId) {
  const remarks = await remarkMap(store);
  return (await read(store, MEMBERS))
    .filter(x => x.coachId === coachId)
    .sort((a, b) => String(b.consentedAt || b.createdAt).localeCompare(String(a.consentedAt || a.createdAt)))
    .map(x => shape(x, remarks.get(x.coachId + '|' + x.memberUid)));
}

// 会员授权：同一位会员重新授权会刷新称呼与时间；换一位教练就是换人，不会留两条。
async function authorize(store, { memberUid, coachId, name }) {
  const list = await read(store, MEMBERS);
  const now = new Date().toISOString();
  const existing = list.find(x => x.memberUid === memberUid);
  const link = {
    id: (existing && existing.id) || randomUUID(),
    coachId,
    memberUid,
    name,
    origin: 'consent',
    createdAt: (existing && existing.createdAt) || now,
    consentedAt: now
  };
  await write(store, MEMBERS, list.filter(x => x.memberUid !== memberUid).concat(link));
  return shape(link, (await remarkMap(store)).get(coachId + '|' + memberUid));
}

// 教练给会员写备注（用户 10-30）：微信昵称经常认不出人，教练自己记一个真名/标签。
// 传空串 = 清掉。上限 30 字，和授权称呼同一档。
async function setRemark(store, coachId, id, raw) {
  const remark = String(raw == null ? '' : raw).trim();
  if (remark.length > 30) fail('备注最多 30 字');
  const list = await read(store, MEMBERS);
  const hit = list.find(x => x.id === id && x.coachId === coachId);
  if (!hit) fail('这位会员已解除授权', 404);
  const others = (await read(store, REMARKS)).filter(x => !(x.coachId === coachId && x.memberUid === hit.memberUid));
  if (remark) others.push({ coachId, memberUid: hit.memberUid, remark, updatedAt: new Date().toISOString() });
  await write(store, REMARKS, others);
  return shape(hit, remark);
}

// 会员撤回授权：只断开关联，一条记录都不删。
async function revoke(store, memberUid) {
  const list = await read(store, MEMBERS);
  const next = list.filter(x => x.memberUid !== memberUid);
  if (next.length !== list.length) await write(store, MEMBERS, next);
  return { ok: true, revoked: next.length !== list.length };
}

// 教练解除某位会员：同样只断开关联。会员的数据是 TA 自己的，教练无权删。
async function unlink(store, coachId, id) {
  const list = await read(store, MEMBERS);
  const hit = list.find(x => x.id === id && x.coachId === coachId);
  if (!hit) fail('这位会员已解除授权', 404);
  await write(store, MEMBERS, list.filter(x => x.id !== id));
  return { ok: true };
}

// 教练能看到的那部分：周目标、闭环周、打卡记录、**体测**。
// 体测（体重/腰围）本来就该给教练看——教练拿着它调计划，藏起来等于废掉一半用处
// （10-29 用户点名：教练要看体测数据）。
// 不出去的只有学习进度（英文打卡）和 Somaxis 绑定：那是会员自己的事，
// 授权页上写了「看不到这些」，接口里就不能顺手带出去。
function visibleHome(home) {
  const h = home || {};
  const u = h.user || {};
  return {
    user: { id: u.id || '', nickname: u.nickname || '', avatar: u.avatar || '', timeZone: u.timeZone || 'Asia/Shanghai' },
    goals: h.goals || {},
    habits: { achievements: (h.habits && h.habits.achievements) || {} },
    activities: Array.isArray(h.activities) ? h.activities : [],
    body: h.body || { latest: null, week: { weightKg: null, waistCm: null, count: 0 }, trail: [] }
  };
}

module.exports = {
  INVITES,
  MEMBERS,
  REMARKS,
  CODE_LEN,
  normalizeCode,
  issueCode,
  coachByCode,
  linkOf,
  membersOf,
  authorize,
  setRemark,
  revoke,
  unlink,
  visibleHome
};
