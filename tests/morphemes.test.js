'use strict';
// 词根词缀拆分（用户 10-30：「这个单词你没有把它的词根或者词缀分开来」）。
// 原则：只拆难词、拆就拆对、拆不了宁可不显示。
const test = require('node:test');
const assert = require('node:assert');
const { WORDS } = require('../miniprogram/data/words');
const levels = require('../miniprogram/data/word-levels');
const m = require('../miniprogram/utils/morphemes');

const byWord = new Map(WORDS.map(w => [w.w.toLowerCase(), w]));

test('招牌难词拆得出、拆得对', () => {
  const j = s => { const w = byWord.get(s); const r = m.split(w, levels.level(w)); return r && m.join(r.parts); };
  assert.match(j('monounsaturated fat'), /mono-（一）/);
  assert.match(j('monounsaturated fat'), /saturat（饱和）/);
  assert.match(j('carbohydrate'), /carb（碳）.*hydr（水）/);
  assert.match(j('metabolism'), /meta-（变\/超）/);
  assert.match(j('procrastination'), /crastin（明天）/);
  assert.match(j('mobility'), /mob（动）.*ility/);
});

test('宁缺毋滥：短词不拆，拆不了的返回 null', () => {
  assert.equal(m.splitToken('squat'), null);      // 入门词，不拆
  assert.equal(m.splitToken('water'), null);
  assert.equal(m.split({ w: 'apple' }, 1), null); // 入门档不拆
  assert.equal(m.split({ w: 'wobblecraft' }, 3), null); // 词典里盖不住的假词
});

test('拆分每段都带释义，入门词永不拆', () => {
  const parts = m.splitToken('unsaturated');
  assert.ok(Array.isArray(parts) && parts.every(p => p.t && p.zh));
  // 全词库扫一遍：入门档一律 null，其余拆出来的必须有释义
  for (const w of WORDS) {
    const l = levels.level(w);
    const r = m.split(w, l);
    if (l < 2) assert.equal(r, null, `${w.w} 是入门词，不该拆`);
    else if (r) assert.ok(r.parts.every(p => p.t && p.zh), `${w.w} 拆分段缺释义`);
  }
});
