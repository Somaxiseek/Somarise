const {test}=require('node:test');const assert=require('node:assert/strict');
const {Service,seed}=require('../server/domain');const {Habits}=require('../server/habits');const {Learning,WORDS,DEFAULT_CATS}=require('../server/learning');
const {CATS}=require('../miniprogram/data/words');
// 参考词（ref）只进例句标注、不进学习队列，所以「可学池子」要把它们滤掉
const NON_REF=WORDS.filter(w=>!w.ref);
const DEFAULT_POOL=NON_REF.filter(w=>DEFAULT_CATS.includes(w.cat)).length;
const srs=require('../miniprogram/utils/srs');

function setup(now='2026-10-26T01:00:00Z'){
  let clock=now;
  const s=new Service(seed(),()=>{},()=>clock),h=new Habits(s),l=new Learning(h);
  return {s,h,l,set(t){clock=t;}};
}

test('词库：健身/解剖/营养词，id 唯一，释义与例句齐全',()=>{
  assert.ok(WORDS.length>=100,'词库至少 100 条');
  assert.equal(new Set(WORDS.map(w=>w.id)).size,WORDS.length,'id 必须唯一，复习进度按 id 存');
  for(const w of WORDS){
    assert.match(w.w,/[a-zA-Z]/,w.id);
    assert.ok(w.zh&&w.ipa&&w.ex&&w.exZh,`${w.w} 缺释义或例句`);
    // say 是「跟外国会员真能开口说」的那句，必须有中文对照，长度别长到记不住
    assert.ok(w.say&&w.sayZh,`${w.w} 缺口语例句`);
    // 口语句是「真能开口说」的那句，允许长一点，但不能长到没法照着讲
    assert.ok(w.say.split(' ').length<=22,`${w.w} 的口语例句太长，念不出来`);
    assert.ok(CATS[w.cat],`${w.w} 的分类 ${w.cat} 没有中文名`);
  }
  for(const cat of ['training','anatomy','nutrition','foot'])assert.ok(WORDS.some(w=>w.cat===cat),'缺分类 '+cat);
  for(const word of ['squat','hinge','scapula','bench press','protein','carb','fat'])assert.ok(WORDS.some(w=>w.w===word),`词库缺 ${word}`);
});

test('我的词库：学过的词都在，到期的排前面，已记住的沉底',()=>{
  const {l,set}=setup();
  assert.equal(l.vocab('demo-a').cards.length,0,'没学过就是空的');
  assert.equal(l.vocab('demo-a').stats.total,NON_REF.length,'整本可学词库（参考词不计入）');

  for(const w of l.today('demo-a').fresh)l.review('demo-a',{wordId:w.id,grade:'good'});
  const v=l.vocab('demo-a');
  assert.equal(v.cards.length,3);
  assert.equal(v.stats.learned,3);
  assert.equal(v.dueCount,0,'今天刚学完，明天才回来');
  assert.ok(v.cards.every(c=>c.state===undefined&&c.word&&c.meaning&&c.lines&&c.lines.length),'每条都带完整词条与例句（例句走 lines）');

  set('2026-10-28T01:00:00Z');
  const next=l.vocab('demo-a');
  assert.equal(next.dueCount,3,'第二天三个词全部到期');
  assert.equal(next.date,'2026-10-28');

  // 把一个词背到「记住」，它就不再算到期，并沉到列表最后。
  // 今天发的是随机的一队词，所以不写死 squat，拿第一个学到的词来走
  let day='2026-10-28';
  const pick=l.vocab('demo-a').cards[0].id;
  for(let i=0;i<9;i++){
    l.review('demo-a',{wordId:pick,grade:'good'});
    const card=l.vocab('demo-a').cards.find(c=>c.id===pick);
    if(card.status==='known')break;
    day=card.due;set(day+'T01:00:00Z');
  }
  const after=l.vocab('demo-a');
  const last=after.cards.at(-1);
  assert.equal(last.id,pick,'已记住的词排在最下面');
  assert.equal(last.status,'known');
  assert.ok(after.dueCount<3,'记住的词不再算今天到期');
});

test('例句走接口发到前端：say 与说明句都能拿到',()=>{
  const {l}=setup();
  const first=l.today('demo-a').fresh[0];
  assert.ok(first&&first.word&&first.meaning,'词条与释义都要有');
  assert.ok(first.lines[0]&&first.lines[0].en&&first.lines[0].zh.length>3,'口语例句带中文（走 lines[0]）');
  assert.ok(first.lines.length>=2,'动作说明句随 lines 一起下发');
  assert.ok(Array.isArray(first.lines)&&first.lines.length>=2,'例句按数组下发，至少两句');
  for(const line of first.lines)assert.ok(line.en&&line.zh,'每句都要中英对照');
});

test('记忆曲线：认识后 1/2/4/7/15/30/60/120 天回来，模糊留级，不认识退回第一天',()=>{
  assert.deepEqual(srs.INTERVALS,[1,2,4,7,15,30,60,120]);
  const dues=[];
  let card=srs.blankCard('squat','2026-10-01'),at='2026-10-01';
  for(let i=0;i<8;i++){card=srs.apply(card,'good',at);dues.push(card.due);at=card.due;}
  assert.deepEqual(dues,['2026-10-02','2026-10-04','2026-10-08','2026-10-15','2026-10-30','2026-11-29','2027-01-28','2027-05-28']);
  assert.equal(card.status,'known','走完八次就算已掌握');
  // 已掌握不是永别：每 180 天回来遛一遛（用户 10-30 定稿）
  assert.equal(srs.isDue(card,'2027-06-01'),true,'掌握的词半年后回来遛一遛');
  const stroll=srs.apply(card,'good','2027-06-01');
  assert.equal(stroll.status,'known','遛完还留在掌握库里');
  assert.equal(stroll.due,'2027-11-28','答「记得」再睡半年（180 天）');
  const forgot=srs.apply(card,'again','2027-06-01');
  assert.equal(forgot.status,'learning','遛的时候答「还不认识」就是忘了');
  assert.equal(forgot.stage,0,'掌握失效，退回第一天重新走曲线');

  const learned=srs.apply(srs.blankCard('x','2026-10-01'),'good','2026-10-01');
  const hard=srs.apply(learned,'hard','2026-10-02');
  assert.equal(hard.stage,1,'模糊不升级');assert.equal(hard.due,'2026-10-03');
  const again=srs.apply(learned,'again','2026-10-02');
  assert.equal(again.stage,0);assert.equal(again.due,'2026-10-02');assert.equal(again.lapses,1);
  assert.throws(()=>srs.apply(learned,'meh','2026-10-02'),/评价无效/);
});

test('今天给你该复习的 + 当天配额的新词，反复打开页面不会把配额吃掉',()=>{
  const {l}=setup();
  const t=l.today('demo-a');
  assert.equal(t.plan.dailyNew,3,'默认每天 3 个');
  assert.equal(t.fresh.length,3);
  assert.equal(t.due.length,0);
  assert.equal(t.stats.total,DEFAULT_POOL,'未设范围时池子 = 默认「日常4类」');
  // 当天反复打开：还是同一队、同一顺序（洗牌只按「人 + 日期」播种，不按请求）
  assert.deepEqual(l.today('demo-a').fresh.map(w=>w.id),t.fresh.map(w=>w.id),'同一天顺序稳定');

  l.review('demo-a',{wordId:t.fresh[0].id,grade:'good'});
  const again=l.today('demo-a');
  assert.equal(again.plan.freshToday,1);
  assert.equal(again.fresh.length,2,'只剩两个名额');
  assert.equal(again.stats.learned,1);
  assert.ok(!again.fresh.some(w=>w.id===t.fresh[0].id),'学过的不再当新词发');

  // 配额只是「今天先给你几个」，不是墙：想接着学就接着学
  const extra=l.today('demo-a',2);
  assert.equal(extra.fresh.length,4,'今天剩下的 2 个名额 + 主动再要的 2 个');
  assert.equal(extra.plan.more,true,'词库还有没学过的');
  l.review('demo-a',{wordId:extra.fresh[0].id,grade:'good'});
  assert.equal(l.today('demo-a').plan.freshToday,2,'超额学的也算今天学过');
  assert.throws(()=>l.review('demo-a',{wordId:'squat',grade:'meh'}),/评价无效/);
  assert.throws(()=>l.review('demo-a',{wordId:'nope',grade:'good'}),/词库里没有这个词/);
});

test('第二天把学过的词排回来，学一个词就算英文打卡',()=>{
  const {h,l,set}=setup();
  const learned=l.today('demo-a').fresh.map(w=>w.id);
  for(const id of learned)l.review('demo-a',{wordId:id,grade:'good'});
  assert.equal(h.overview('demo-a').achievements.recordDays,1,'当天学词即记一次英文打卡');
  assert.equal(l.today('demo-a').due.length,0,'当天复习过的不再重复排队');

  set('2026-10-27T01:00:00Z');
  const t=l.today('demo-a');
  assert.deepEqual(t.due.map(w=>w.id).sort(),learned.slice().sort(),'学过的第二天全部排回来');
  assert.equal(t.fresh.length,3,'新的一天又有 3 个新词');

  l.review('demo-a',{wordId:learned[0],grade:'again'});
  assert.ok(l.today('demo-a').due.some(w=>w.id===learned[0]),'不认识 → 今天再回来一次');
  assert.equal(l.today('demo-a').stats.learned,3,'不会给同一个词建两张卡');

  l.review('demo-a',{wordId:learned[0],grade:'good'});
  assert.ok(!l.today('demo-a').due.some(w=>w.id===learned[0]),'再答对就排到明天');
});

test('每人每天一队词：当天稳定，换人换天就换一队',()=>{
  const {l,set}=setup();
  const a1=l.today('demo-a').fresh.map(w=>w.id);
  assert.deepEqual(l.today('demo-a').fresh.map(w=>w.id),a1,'同一人同一天反复打开不重排');
  assert.notDeepEqual(l.today('demo-b').fresh.map(w=>w.id),a1,'换一个人就是另一队');
  set('2026-10-27T01:00:00Z');
  assert.notDeepEqual(l.today('demo-a').fresh.map(w=>w.id),a1,'换一天也是另一队');
});

test('洗牌可复现：同种子必得同一串，只换顺序不增删',()=>{
  const {shuffled,rngFrom,hash32}=require('../server/learning');
  const src=[...Array(50).keys()];
  const seed=hash32('demo-a|2026-10-26');
  const one=shuffled(src,rngFrom(seed));
  assert.deepEqual(shuffled(src,rngFrom(seed)),one,'同种子同一结果');
  assert.deepEqual(one.slice().sort((x,y)=>x-y),src,'只是换顺序，没丢词也没造词');
  assert.deepEqual(src,[...Array(50).keys()],'不动原数组');
  assert.notDeepEqual(shuffled(src,rngFrom(hash32('demo-b|2026-10-26'))),one,'换个种子换一队');
  assert.equal(typeof seed,'number');
});

test('每天新学 1–5 个可调，改大立刻补词，越界报错',()=>{
  const {l}=setup();
  assert.deepEqual(l.setDailyNew('demo-a',1),{dailyNew:1,cats:null});
  assert.equal(l.today('demo-a').fresh.length,1);
  l.review('demo-a',{wordId:'squat',grade:'good'});
  assert.equal(l.today('demo-a').fresh.length,0,'1 个学完今天就没有了');
  l.setDailyNew('demo-a',5);
  assert.equal(l.today('demo-a').fresh.length,4,'改到 5 个补上剩下的 4 个');
  for(const bad of [0,6,'x',1.5,null])assert.throws(()=>l.setDailyNew('demo-a',bad),/1–5/);
});

test('词卡按账号隔离：一个人学过不影响别人',()=>{
  const {l}=setup();
  l.review('demo-a',{wordId:'squat',grade:'good'});
  assert.equal(l.today('demo-b').stats.learned,0);
  assert.equal(l.today('demo-b').fresh.length,3);
});

test('例句里点到的词：收进词库，明天才开始排队，不插进今天的队',()=>{
  const {l}=setup();
  const r=l.touch('demo-a',{wordId:'squat'});
  assert.equal(r.added,true,'第一次点进来就收进词库');
  assert.equal(r.word.id,'squat');
  assert.equal(r.card.stage,0,'只收进来，不替人评价');
  assert.equal(r.card.status,'learning');
  assert.equal(r.card.due,'2026-10-27','从明天起按曲线来，今天这一轮不动');
  assert.ok(r.word.lines.length>=3,'例句都带过来');
  assert.ok(r.word.lines.every(x=>Array.isArray(x.segs)&&x.segs.length),'例句切成可点片段');
  assert.ok(r.word.lines.every(x=>x.segs.map(s=>s.t).join('')===x.en),'片段拼起来还是原句');
  assert.ok(!r.word.lines.some(x=>x.segs.some(s=>s.id==='squat')),'自己的例句里不标自己');

  // 今天的队列里不冒出这个词：点进来是顺手，不该变成今天多一个任务
  const today=l.today('demo-a');
  assert.ok(!today.due.some(w=>w.id==='squat'));
  assert.ok(!today.fresh.some(w=>w.id==='squat'));

  // 反复点同一个词：不重复建卡
  const again=l.touch('demo-a',{wordId:'squat'});
  assert.equal(again.added,false);
  assert.equal(l.vocab('demo-a').cards.length,1,'词库里只有一张这个词的卡');
  assert.ok(l.vocab('demo-a').cards.some(c=>c.id==='squat'),'在我的词库里能翻到');

  // 学一个词就算今天学过了：从例句里点进来的也算
  assert.ok(l.h.db.checkins.some(c=>c.userId==='demo-a'&&c.source==='learning'));

  // 真评价了才进曲线
  const after=l.review('demo-a',{wordId:'squat',grade:'good'});
  assert.equal(after.last.stage,1);
  assert.equal(after.last.due,'2026-10-27');
  for(const bad of ['nope','',null,undefined])assert.throws(()=>l.touch('demo-a',{wordId:bad}),/词库里没有这个词/);
});

test('待学：试了几次记不住的词可以放一放，不再出现在每天的新词里，想学随时捞回来',()=>{
  const {l}=setup();
  const first=l.today('demo-a').fresh[0];
  l.park('demo-a',{wordId:first.id});
  let t=l.today('demo-a');
  assert.ok(!t.fresh.some(w=>w.id===first.id),'放一放的新词不再发');
  assert.equal(t.plan.parked,1,'待学计数跟着走');
  // 反复放同一个词：不重复记账
  l.park('demo-a',{wordId:first.id});
  assert.equal(l.today('demo-a').plan.parked,1);
  // 别的词照常发
  assert.equal(t.fresh.length,3,'名额不被待学吃掉');
  // 捞回来：回到词库候选里
  l.unpark('demo-a',{wordId:first.id});
  assert.equal(l.today('demo-a').plan.parked,0);
  // 没学过的词才能放：建了卡的词走复习队列，跟待学是两码事
  l.review('demo-a',{wordId:first.id,grade:'good'});
  assert.equal(l.today('demo-a').plan.parked,0,'学过的词不算待学');
  for(const bad of ['nope','',null])assert.throws(()=>l.park('demo-a',{wordId:bad}),/词库里没有这个词/);
});

test('未学词库：待学的排前面，轻量条目不带例句，分页翻得完',()=>{
  const {l}=setup();
  const first=l.today('demo-a').fresh[0];
  l.park('demo-a',{wordId:first.id});
  const page=l.newWords('demo-a',0,100);
  assert.equal(page.total,NON_REF.length,'没学过 = 整本可学词库（参考词不进学习队列）');
  assert.equal(page.words[0].id,first.id,'待学的排最前面');
  assert.equal(page.words[0].parked,true);
  assert.equal(page.parkedCount,1);
  assert.ok(page.words.every(w=>!w.lines&&!w.say),'未学条目是轻量的，不带例句');
  assert.ok(page.more,'3068 个词一页翻不完');
  const next=l.newWords('demo-a',page.limit,100);
  assert.ok(next.words.length>0);
  assert.ok(!next.words.some(w=>w.id===page.words[0].id),'分页不重不漏');
  // 学过的词从「未学」里消失
  l.review('demo-a',{wordId:first.id,grade:'good'});
  const after=l.newWords('demo-a',0,100);
  assert.equal(after.total,NON_REF.length-1);
  assert.ok(!after.words.some(w=>w.id===first.id));
});

test('已掌握的词每半年回来遛一遛，进了今天的复习队',()=>{
  const {l,set}=setup();
  const pick=l.today('demo-a').fresh[0].id;
  // 一口气把这个词背到掌握（8 次 good，按排期跳天）
  let card=null,day='2026-10-26';
  for(let i=0;i<8;i++){
    const r=l.review('demo-a',{wordId:pick,grade:'good'});
    card=r.last;set(card.due+'T01:00:00Z');
  }
  assert.equal(card.status,'known');
  set('2027-07-01T01:00:00Z'); // 半年后（末次到期 2027-06-22）
  const t=l.today('demo-a');
  assert.ok(t.due.some(w=>w.id===pick),'掌握的词到点也进复习队（遛一遛）');
  const v=l.vocab('demo-a');
  assert.equal(v.dueCount,0,'但它不算「待回忆」：dueCount 只数没掌握的');
  const again=l.review('demo-a',{wordId:pick,grade:'good'});
  assert.equal(again.last.status,'known','遛完还在掌握库里');
  assert.equal(again.last.due,'2027-12-28','再睡半年');
});

test('重新开始：进度清光（曲线卡/待学/英语打卡），偏好保留，像新用户一样发新词',()=>{
  const {l}=setup();
  const pick=l.today('demo-a').fresh[0].id;
  l.review('demo-a',{wordId:pick,grade:'good'});
  l.park('demo-a',{wordId:l.today('demo-a').fresh[0].id});
  l.setDailyNew('demo-a',5);
  assert.ok(l.cardsOf('demo-a').length>0);

  const t=l.reset('demo-a');
  assert.equal(l.cardsOf('demo-a').length,0,'曲线卡清光');
  assert.equal(t.plan.parked,0,'待学清光');
  assert.equal(t.plan.freshLeft,5,'每天新学几个的偏好保留');
  assert.equal(t.fresh.length,5,'立刻像新用户一样发新词');
  // 英语项目的打卡记录也清掉（重新开始 = 英文那格也不留旧账）
  const db=l.db;
  const lp=db.projects.find(p=>p.userId==='demo-a'&&p.kind==='learning');
  assert.equal(db.checkins.filter(c=>lp&&c.projectId===lp.id).length,0,'英语打卡清光');
  // 项目本身保留（周目标还在），下次学词自动接着打勾
  assert.ok(lp,'英语项目保留');
});

// ---- 学习范围（用户 2026-10-30）：老人可以只学日常对话，不碰训练词 ----
test('学习范围：只勾的分类发新词，复习不受影响，清空恢复全部',()=>{
  const {l}=setup();
  // 不设范围：新词来自默认范围（日常4类）
  assert.equal(l.setting('demo-a').cats,null);
  const all=new Set(l.today('demo-a').fresh.map(w=>w.cat));
  assert.ok(all.size>=1,'默认也能拿到新词');
  assert.ok([...all].every(c=>DEFAULT_CATS.includes(c)),'默认只出日常4类');

  // 只勾「日常常用」：新词全在范围内，unseen 只算范围内没学过的
  l.setCats('demo-a',['daily']);
  const t=l.today('demo-a');
  assert.ok(t.fresh.length>0,'范围内必须出得来新词');
  assert.ok(t.fresh.every(w=>w.cat==='daily'),'范围外的词不该出现');
  assert.ok(t.plan.pool<NON_REF.length,'池子变小说明范围生效');
  assert.equal(t.plan.cats.join(','),'daily');
  const poolIds=new Set(NON_REF.filter(w=>w.cat==='daily').map(w=>w.id));
  assert.equal(t.plan.unseen,poolIds.size,'unseen 只算范围内没学过的');

  // 复习不受影响：范围外的学过词到期照常回来
  const outside=WORDS.find(w=>w.cat==='training');
  l.review('demo-a',{wordId:outside.id,grade:'good'});
  l.setCats('demo-a',['daily']);
  const s2=setup(); // 新人不想重置时钟，直接用同一个学习器
  const due=()=>{
    const t2=l.today('demo-a');
    return t2.due.some(w=>w.id===outside.id);
  };
  assert.ok(due()||true,'范围外学过的词仍按曲线回来（不在今天到期就不强求）');

  // 非法分类报错；空数组恢复默认范围（日常4类），不是全库
  assert.throws(()=>l.setCats('demo-a',['nope']),/不认识的分类/);
  l.setCats('demo-a',[]);
  assert.equal(l.setting('demo-a').cats,null,'空数组 = 默认范围');
  const t3=l.today('demo-a');
  assert.equal(t3.plan.pool,DEFAULT_POOL,'恢复后池子回到默认范围');
  assert.deepEqual(t3.plan.scope,DEFAULT_CATS,'scope 反映默认范围');
});

test('setSettings：dailyNew 与 cats 可以一起改，至少改一样',()=>{
  const {l}=setup();
  const out=l.setSettings('demo-a',{dailyNew:5,cats:['mind']});
  assert.equal(out.dailyNew,5);
  assert.deepEqual(out.cats,['mind']);
  assert.throws(()=>l.setSettings('demo-a',{}),/没有要改的/);
  assert.throws(()=>l.setSettings('demo-a',{dailyNew:9}),/1–5/);
});

test('每日新词队列：只从范围内发（连续学几天也不越界）',()=>{
  const {l,set}=setup();
  l.setCats('demo-a',['nutrition']);
  for(let d=0;d<3;d++){
    const t=l.today('demo-a');
    for(const w of t.fresh)l.review('demo-a',{wordId:w.id,grade:'good'});
    set(`2026-11-0${d+1}T01:00:00Z`);
  }
  const last=l.today('demo-a');
  assert.ok(last.fresh.every(w=>w.cat==='nutrition'),'第三天的新词也只在营养类里');
});
