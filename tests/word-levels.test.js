'use strict';
// 新词难度分级（用户 10-30：「一个人去学英语，一开始接触到的应该是比较简单的单词。
// 我看到 monounsaturated fat，头都大！」）。
// 三档：1 入门 / 2 进阶 / 3 高阶。判断看「常见度」不是词长：
// apartment 九个字母但人人认识 → 入门；leucine 七个字母但很生僻 → 高阶。
const test = require('node:test');
const assert = require('node:assert');
const { WORDS } = require('../miniprogram/data/words');
const levels = require('../miniprogram/data/word-levels');

const byWord = new Map(WORDS.map(w => [w.w.toLowerCase(), w]));
const lv = w => levels.level(byWord.get(w.toLowerCase()));

test('常见度优先于词长：长而常见的词是入门，短而生僻的词是高阶', () => {
  // 长而常见 —— 用户点名的这类，不能因为字母多就判成高阶
  for (const w of ['apartment', 'understand', 'beautiful', 'important', 'restaurant', 'headache'])
    assert.equal(lv(w), 1, `${w} 又长又常见，应该是入门`);
  // 短而生僻 —— 字母不多但没学过的人照样头大
  for (const w of ['leucine', 'talus', 'nocebo', 'tenant'])
    assert.equal(lv(w), 3, `${w} 生僻，应该是高阶`);
});

test('主题词的档位符合直觉', () => {
  assert.equal(lv('squat'), 1);                    // 健身第一课
  assert.equal(lv('deadlift'), 2);                 // 常用但不是第一课
  assert.equal(lv('kettlebell'), 2);
  assert.equal(lv('monounsaturated fat'), 3);      // 「头都大」本尊
  assert.equal(lv('gluteus maximus'), 3);          // 拉丁肌肉名
  assert.equal(lv('calcaneus'), 3);
  assert.equal(lv('rotator cuff'), 2);             // 常见解剖词
  assert.equal(lv('protein'), 1);
  assert.equal(lv('carbohydrate'), 2);             // 长但基础
  assert.equal(lv('hypothesis'), 2);
  assert.equal(lv('epidemiology'), 3);
  assert.equal(lv('procrastination'), 2);          // 长但常用
});

test('每个词都有合法档位；新手第一年基本碰不到高阶词', () => {
  for (const w of WORDS) {
    const l = levels.level(w);
    assert.ok(l >= 1 && l <= 3, `${w.w} 档位非法：${l}`);
  }
  const dist = { 1: 0, 2: 0, 3: 0 };
  WORDS.forEach(w => dist[levels.level(w)]++);
  assert.ok(dist[1] > WORDS.length * 0.4, `入门词要占大头（现在 ${dist[1]}）`);
  assert.ok(dist[3] < WORDS.length * 0.2, `高阶词是少数（现在 ${dist[3]}）`);
});

test('人工清单里不能有词库不存在的词（拼错会静默失效）', () => {
  for (const [name, set] of [['L1_EXTRA', levels.L1_EXTRA], ['L2_FORCE', levels.L2_FORCE], ['L3_FORCE', levels.L3_FORCE]]) {
    for (const key of set) {
      assert.ok(byWord.has(key), `${name} 里的「${key}」在词库中不存在，检查拼写`);
    }
  }
});
