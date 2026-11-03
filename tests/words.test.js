const {test}=require('node:test');const assert=require('node:assert/strict');
const {WORDS,BY_ID,CATS}=require('../miniprogram/data/words');
const {ROOTS,lookup,explainParts}=require('../miniprogram/data/roots');

// 词库扩到三千条之后，最容易坏的是「数据本身」：少字段、id 撞车、词根拆了却解释不出来。
// 这一组测试守的就是数据，不测业务逻辑（业务在 learning.test.js）。

test('词库规模与分类：够三千条，七个分类都有词、都有中文名',()=>{
  assert.ok(WORDS.length>=2500,`现在只有 ${WORDS.length} 条`);
  for(const [key,label] of Object.entries(CATS)){
    assert.ok(label&&label.length<=6,`${key} 的中文名要好念：${label}`);
    assert.ok(WORDS.some(w=>w.cat===key),`分类 ${key} 里一条词都没有`);
  }
  assert.equal(BY_ID.size,WORDS.length,'id 不能重复，复习进度按 id 存');
  for(const w of WORDS)assert.equal(BY_ID.get(w.id).w,w.w);
});

test('每个词条都能直接上屏：音标、释义、口语例句、说明句齐全，例句念得出来',()=>{
  const bad=[];
  for(const w of WORDS){
    for(const k of (w.ref?['ipa','pos','zh','say','sayZh']:['ipa','pos','zh','say','sayZh','ex','exZh'])){
      if(!w[k]||typeof w[k]!=='string'||!w[k].trim())bad.push(`${w.w} 缺 ${k}`);
    }
    if(w.ipa&&!/^\/.+\/$/.test(w.ipa))bad.push(`${w.w} 的音标没有用 /…/ 包起来：${w.ipa}`);
    if(w.say&&w.say.trim().split(/\s+/).length>22)bad.push(`${w.w} 的口语例句超过 22 个词`);
  }
  assert.deepEqual(bad.slice(0,10),[],`共 ${bad.length} 处：`+bad.slice(0,10).join('；'));
});

test('每个词至少三句例句：say/ex/ex2 齐全，第四句可无可有，句子都要带中文',()=>{
  const bad=[];
  for(const w of WORDS){
    for(const k of (w.ref?['say','ex']:['say','ex','ex2'])){
      if(!w[k]||!String(w[k]).trim())bad.push(`${w.w} 缺 ${k}`);
    }
    // 例句和翻译成对：只有英文没有中文，页面上就是一句看不懂的话
    for(const [en,zh] of [['say','sayZh'],['ex','exZh'],['ex2','ex2Zh'],['ex3','ex3Zh']]){
      if(w[en]&&(!w[zh]||!String(w[zh]).trim()))bad.push(`${w.w} 有 ${en} 却没有 ${zh}`);
    }
    if(!w.ref&&w.ex3&&!w.ex2)bad.push(`${w.w} 有第四句却没有第三句`);
  }
  assert.deepEqual(bad.slice(0,10),[],`共 ${bad.length} 处：`+bad.slice(0,10).join('；'));
  const four=WORDS.filter(w=>w.ex3).length;
  assert.ok(four>=100,`只有 ${four} 个词有四句，太少了`);
  assert.ok(four<WORDS.length,'四句要留给一部分词，全都有就不是「3~4 句不等」了');
});

test('补例句的表不写废条目：按原形匹配不上就是白写，直接报出来',()=>{
  const {THIRD,FOURTH}=require('../miniprogram/data/words-lines');
  const idOf=t=>String(t||'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');
  const known=new Set(WORDS.map(w=>w.id));
  const orphans=[...THIRD,...FOURTH].filter(x=>!known.has(idOf(x.w))).map(x=>x.w);
  assert.deepEqual(orphans.slice(0,10),[],`共 ${orphans.length} 条对不上任何词：`+orphans.slice(0,10).join('、'));
  const dup=new Set();const clash=[];
  for(const x of THIRD){if(dup.has(idOf(x.w)))clash.push(x.w);dup.add(idOf(x.w));}
  assert.deepEqual(clash,[],'同一个词写了两条第三句');
  for(const x of [...THIRD,...FOURTH]){
    assert.ok(x.en&&x.en.trim(),`${x.w} 没写英文`);
    assert.ok(x.zh&&x.zh.trim(),`${x.w} 没写中文`);
  }
});

test('词根拆分：拼得回原词，每段点开都有话说（不是空白弹窗）',()=>{
  const split=WORDS.filter(w=>Array.isArray(w.parts)&&w.parts.length>1);
  assert.ok(split.length>=200,`只有 ${split.length} 条带词根拆分，太少了`);
  for(const w of split){
    const flat=w.w.toLowerCase().replace(/[^a-z0-9]/g,'');
    assert.equal(w.parts.join('').toLowerCase().replace(/[^a-z0-9]/g,''),flat,`${w.w} 的 parts 拼不回原词`);
    const shown=explainParts(w.parts);
    assert.equal(shown.length,w.parts.length);
    for(const seg of shown){
      assert.ok(seg.zh&&seg.zh.length,`${w.w} 的「${seg.t}」点开是空白的`);
      assert.ok(seg.type,`${w.w} 的「${seg.t}」没写这段是什么（前缀/后缀/词根/独立单词）`);
    }
  }
});

test('词根库：前后缀与词根都有释义和例句，前缀写成 "un-"、后缀写成 "-ness"',()=>{
  const keys=Object.keys(ROOTS);
  assert.ok(keys.length>=300,`词根库只有 ${keys.length} 条`);
  for(const [key,val] of Object.entries(ROOTS)){
    assert.ok(val.zh&&val.zh.trim(),`${key} 没有中文释义`);
    assert.ok(['前缀','后缀','词根','构词','词尾','专名','自由词'].includes(val.t),`${key} 的 t 不认识：${val.t}`);
    if(val.t==='前缀')assert.ok(key.endsWith('-'),`前缀要写成 un- 这种：${key}`);
    if(val.t==='后缀')assert.ok(key.startsWith('-'),`后缀要写成 -ness 这种：${key}`);
    assert.ok(Array.isArray(val.ex)&&val.ex.length>=1,`${key} 至少要给一个例词`);
  }
});

test('查词根：带不带横线、大小写、英文词尾变化都能认出来',()=>{
  const zhOf=p=>{const h=lookup(p,0,2);return h&&h.zh;};
  assert.ok(zhOf('ness')&&zhOf('ness')===zhOf('-ness'),'后缀带不带横线都要认得');
  assert.ok(zhOf('hyper'),'前缀 hyper 要认得');
  assert.equal(zhOf('Achilles'),zhOf('achilles'),'专有名词大小写不敏感');
  assert.ok(zhOf('tendin'),'去掉英文词尾（-itis/-osis）后要能认回词干');
  const seg=explainParts(['fish','ing']).find(s=>s.t==='fish');
  assert.ok(['独立单词','自由词','构词'].includes(seg.type),'自由词那一段要说清楚它是什么（独立单词/自由词/构词），不能留空');
});
