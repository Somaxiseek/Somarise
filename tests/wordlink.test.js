const {test}=require('node:test');const assert=require('node:assert/strict');
const {annotate,hits,forms,MIN_SINGLE}=require('../miniprogram/utils/wordlink');
const {WORDS,BY_ID}=require('../miniprogram/data/words');

// 拼回去：片段只是把句子切开，一个字都不能少、不能多
const flat=segs=>segs.map(s=>s.t).join('');
const marks=(text,selfId)=>annotate(text,selfId).filter(s=>s.id).map(s=>s.id);

test('例句切成片段：拼起来跟原句一模一样，标点空格都在',()=>{
  const s='Keep your chest up in the squat — three seconds down.';
  assert.equal(flat(annotate(s,'')),s,'不能改动原句');
  const segs=annotate(s,'squat');
  assert.ok(segs.length>=1&&segs.every(x=>typeof x.t==='string'),'每段都有文字');
  // 换一句有别的词的：切出来的片段里，带 id 的那段就是能点的词
  const hit=annotate('A deadlift is a hip hinge, not a squat.','squat').filter(x=>x.id);
  assert.equal(hit.length,2);
  assert.deepEqual(hit.map(x=>x.t),['deadlift','hip hinge']);
});

test('句里出现别的词库词就标出来，点开能去那个词',()=>{
  assert.deepEqual(marks('A deadlift is a hip hinge, not a squat.','squat'),['deadlift','hip-hinge']);
  // scapula / lats 是例句参考词，句子里出现就标出来；自身（scapula）做 selfId 时不标自己
  assert.deepEqual(marks('Scapula and lats work together.','scapula'),['lats']);
  assert.deepEqual(marks('Scapula and lats work together.',''),['scapula','lats']);
});

test('短语当一个整体：bench press 不拆成两个词',()=>{
  const segs=annotate('Two sets of bench press left.','');
  const hit=segs.filter(s=>s.id);
  // bench press 必须作为一个整体（不拆成 bench + press 两个可点片段）
  const bp=hit.find(s=>s.id==='bench-press');
  assert.ok(bp,'bench press 作为一个整体被标出');
  assert.equal(bp.t,'bench press','整段连成一个可点的整体，不拆开');
  // sets / left 现在也是词库词，整句共三个可点片段
  assert.equal(hit.length,3,'sets + bench press + left 三个可点片段');
});

test('太短的单词不作数：set / row / fat 不标，免得点开是打扰',()=>{
  // MIN_SINGLE=4：三个字母及以下的单词在句子里多半是别的意思
  assert.ok(MIN_SINGLE>=4);
  // set/row/fat/low 三个字母及以下仍不标（MIN_SINGLE）；sets / left 是例句参考词（≥4 字母）照标
  assert.deepEqual(marks('One more set and this row is low.',''),[]);
  assert.deepEqual(marks('Two sets left now.',''),['sets','left']);
});

test('词形变化也认得：squats / squatted / squatting 都指向 squat',()=>{
  for(const s of ['Three squats left.','He squatted deeper.','Keep squatting down.']){
    assert.ok(marks(s,'').includes('squat'),s);
  }
  // 变形规则自身要收口：每个词都至少能变出复数
  assert.ok(forms('squat').includes('squats'));
  assert.ok(forms('study').includes('studies'));
});

test('自己的例句不标自己：点来点去还在原地没意义',()=>{
  // squat 的句子里出现 squat 不标；sets、slowly 是词库词，照标
  assert.deepEqual(marks('Squat with sets slowly.','squat'),['sets','slowly']);
  assert.deepEqual(marks('Squat with sets slowly.','deadlift'),['squat','sets','slowly']);
});

test('hits 去重：一个词出现多次只报一次',()=>{
  assert.deepEqual(hits('A squat, a hinge, and another squat.',''),['squat','hinge']);
});

test('整库抽检：切句子永远不抛错、不改动原文',()=>{
  const samples=['The barbell loads the spine axially.','Water has no calories.','Pull-ups build the lats.'];
  for(const s of samples)for(const w of WORDS.slice(0,50)){
    assert.equal(flat(annotate(s,w.id)),s);
  }
});
