'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { parseOcrItems } = require('../server/ocr-parse');

const NOW = Date.parse('2026-10-30T10:00:00+08:00');

test('华为样式：大字数值和小字单位是两个块，标签还在下面一行', () => {
  const { draft } = parseOcrItems(['户外跑步', '5.02', '公里', '距离', '32:15', '时长', '6\'25"', '配速', '平均心率', '148', 'bpm', '今天 07:35'], { now: NOW });
  assert.equal(draft.type, 'running');
  assert.equal(draft.distanceM, 5020);
  assert.equal(draft.durationSec, 1935);
  assert.equal(draft.heartRate, 148);
  assert.equal(draft.source, 'ocr');
  assert.equal(draft.confirmed, false);
  assert.match(draft.occurredAt, /^2026-10-30T07:35:00\+08:00$/);
  assert.ok(!draft.warnings.some((w) => /没读到日期/.test(w)));
});

test('苹果样式：时长只有 mm:ss，没有「时长」两个字也读得出', () => {
  const { draft } = parseOcrItems(['户外跑步', '5.02 公里', '32:15', '148 次/分'], { now: NOW });
  assert.equal(draft.type, 'running');
  assert.equal(draft.distanceM, 5020);
  assert.equal(draft.durationSec, 1935);
  assert.equal(draft.heartRate, 148);
});

test('散步 + 昨天的截图，日期跟着截图走', () => {
  const { draft } = parseOcrItems(['步行', '3.2 公里', '45:10 时长', '昨天 18:20'], { now: NOW });
  assert.equal(draft.type, 'walking');
  assert.equal(draft.distanceM, 3200);
  assert.equal(draft.durationSec, 2710);
  assert.equal(draft.occurredAt, '2026-10-29T18:20:00+08:00');
});

test('只有配速没有时长：按配速×距离推算，并提示核对', () => {
  const { draft } = parseOcrItems(['跑步', '5 公里', '7\'00"'], { now: NOW });
  assert.equal(draft.distanceM, 5000);
  assert.equal(draft.durationSec, 2100);
  assert.ok(draft.warnings.some((w) => /推算/.test(w)));
});

test('只认出类型：数字留空 + 逐项提示，绝不编数字', () => {
  const { draft } = parseOcrItems(['跑步'], { now: NOW });
  assert.equal(draft.type, 'running');
  assert.equal(draft.distanceM, 0);
  assert.equal(draft.durationSec, 0);
  assert.equal(draft.heartRate, null);
  assert.ok(draft.warnings.some((w) => /没读到距离/.test(w)));
  assert.ok(draft.warnings.some((w) => /没读到时长/.test(w)));
  assert.ok(draft.warnings.some((w) => /仅供参考/.test(w)));
});

test('空白图片：返回空草稿让调用方提示换图', () => {
  const out = parseOcrItems([], { now: NOW });
  assert.equal(out.draft, null);
  assert.ok(out.warnings.length > 0);
});

test('骑行截图不串成跑步', () => {
  const { draft } = parseOcrItems(['骑行', '18.6 公里', '1:02:30', '心率 132'], { now: NOW });
  assert.equal(draft.type, 'cycling');
  assert.equal(draft.distanceM, 18600);
  assert.equal(draft.durationSec, 3750);
  assert.equal(draft.heartRate, 132);
});
