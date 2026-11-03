// 品牌改名不能碰「内部标识」。
// 2026-10-30 的事故：全站 somactive→Somarise 时，云函数里的集合名也被改成
// Somarise_trial_data，重新部署后代码去读一个空集合，表现成「账号被重置成新成员、
// 所有记录消失」——真实数据一直躺在 somactive_trial_data 里，只是没人读它。
// 这类标识一改就是静默数据失踪，所以拿测试钉死：只许是下面这些值。
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');

test('云函数集合名固定为 somactive_trial_data（数据库标识不随品牌改名）', () => {
  const src = read('cloudfunctions/somactiveApi/index.js');
  const m = src.match(/COLLECTION\s*=\s*'([^']+)'/);
  assert.ok(m, '云函数里应能找到 COLLECTION 常量');
  assert.equal(m[1], 'somactive_trial_data', '集合名被改了：老数据会读不到，看起来像数据被清空');
  assert.ok(!/COLLECTION\s*=\s*'Somarise/.test(src), '云函数不应把集合名指向 Somarise_*');
});

test('云函数目录仍是 somactiveApi（函数名属内部标识）', () => {
  assert.ok(fs.existsSync(path.join(root, 'cloudfunctions/somactiveApi/index.js')), 'somactiveApi 目录不应被改名');
  const client = read('miniprogram/utils/api.js');
  assert.ok(/somactiveApi/.test(client), '客户端调用的云函数名应保持 somactiveApi');
  assert.ok(!/name:\s*'somariseApi'/.test(client), '客户端不应调用改名后的云函数');
});

test('本地存储 key 前缀保持 somactive（历史数据兼容）', () => {
  const files = ['miniprogram/app.js', 'miniprogram/pages/home/home.js', 'miniprogram/utils/api.js'];
  const hits = [];
  for (const f of files) {
    if (!fs.existsSync(path.join(root, f))) continue;
    const src = read(f);
    if (/getStorageSync\(|setStorageSync\(/.test(src)) hits.push([f, src]);
  }
  assert.ok(hits.length > 0, '应能在若干入口文件里看到存储读写');
  for (const [f, src] of hits) {
    const keys = src.match(/['"`](somactive|Somarise)[.\-][^'"`]*['"`]/g) || [];
    for (const k of keys) {
      assert.ok(!/^['"`]Somarise[.\-]/.test(k), `${f} 里出现大写品牌前缀的存储 key：${k}`);
    }
  }
});

test('云端音频前缀保持 somactive/audio', () => {
  const src = read('cloudfunctions/somactiveApi/index.js');
  const bad = src.match(/Somarise\/audio/g) || [];
  assert.equal(bad.length, 0, '音频前缀被改了会导致所有发音 404');
});
