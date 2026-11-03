const {test}=require('node:test');const assert=require('node:assert/strict');
const {Service,seed}=require('../server/domain');
const {Habits}=require('../server/habits');
const {Learning}=require('../server/learning');
const {Goals}=require('../server/goals');

// 2026-10-28 是周三 → 本周周一 = 2026-10-26，上周周一 = 2026-10-19
const CLOCK='2026-10-28T02:00:00Z';
function setup(){
  const s=new Service(seed(),()=>{},()=>CLOCK);
  const habits=new Habits(s);const learning=new Learning(habits);
  const goals=new Goals(s,habits,learning);habits.goals=goals;
  return {s,habits,learning,goals,uid:'demo-a',other:'demo-b'};
}
function cat(h,uid,name){return h.createCategory(uid,{name});}
function act(s,h,uid,{type='running',date='2026-10-27',minutes=20,distanceM=500}={}){
  const a=s.put(uid,{type,occurredAt:date+'T01:00:00Z',timeZone:'Asia/Shanghai',distanceM,durationSec:minutes*60,visibility:'private',confirmed:true});
  h.attachActivity(uid,a);return a;
}
function find(list,key){const it=list.find(i=>i.key===key);assert.ok(it,'缺少 '+key+' 这一项');return it;}

test('心肺按分钟累计：跑步 20 分钟 + 游泳 25 分钟 = 45/90，且不再按距离门槛过滤',()=>{
  const {s,habits,goals,uid}=setup();
  act(s,habits,uid,{type:'running',date:'2026-10-27',minutes:20,distanceM:500}); // 距离不达标也照记
  act(s,habits,uid,{type:'swimming',date:'2026-10-28',minutes:25,distanceM:100});
  goals.setGoal(uid,'cardio',{target:90,applyNow:true});
  const v=goals.view(uid);
  const cardio=find(v.week,'cardio');
  assert.equal(cardio.current,45,'只算实际分钟，不折算强度');
  assert.equal(cardio.target,90);
  assert.equal(cardio.unit,'等效分钟');
  assert.equal(cardio.periodLabel,'本周');
  assert.equal(cardio.valueText,'45/90 等效分钟');
  assert.equal(cardio.closed,false);
  // 45/90 刚好过半：这时候不说「还差多少」，说「再来 X 就到了」，周目标再带上还剩几天
  assert.equal(cardio.remainText,'再来 45 等效分钟就到了 · 还剩 4 天');
  assert.equal(cardio.noteTone,'strong');
  // 心肺只在「本周」组里，今日组不要求每天有氧
  assert.equal(v.day.some(i=>i.key==='cardio'),false,'心肺不进今日组');
  // 跑步项目自己没有「每周 3 次」的要求：周组里只有心肺一项
  assert.equal(v.week.filter(i=>i.key.indexOf('cat:')===0).length,0,'运动类型不再各自设周目标');
});

test('抗阻：同一天记两条也只算 1 个训练日',()=>{
  const {s,habits,goals,uid}=setup();
  const c=cat(habits,uid,'抗阻训练');
  const p=habits.createProject(uid,{categoryId:c.id,name:'力量训练',kind:'resistance',goal:{period:'weekly',target:3}});
  habits.checkin(uid,p.id,{date:'2026-10-27',confirmed:true,requestId:'r1'});
  habits.checkin(uid,p.id,{date:'2026-10-27',confirmed:true,requestId:'r2'});
  assert.equal(habits.db.checkins.length,2,'两条记录都保留');
  goals.setGoal(uid,'strength',{target:2,applyNow:true});
  const strength=find(goals.view(uid).week,'strength');
  assert.equal(strength.current,1,'同一天只 +1 天');
  assert.equal(strength.valueText,'1/2 天');
  // 同一个 requestId 重试不会写第二遍
  habits.checkin(uid,p.id,{date:'2026-10-27',confirmed:true,requestId:'r1'});
  assert.equal(habits.db.checkins.length,2);
});

test('抗阻：低强度也算一个训练日，不因强度轻就不给算',()=>{
  const {habits,goals,uid}=setup();
  const c=cat(habits,uid,'抗阻训练');
  const p=habits.createProject(uid,{categoryId:c.id,name:'力量训练',kind:'resistance',goal:{period:'weekly',target:3}});
  // 2026-10-26 周一：只记一笔低强度，它仍然要算 1 个训练日（用户 10-30：
  // 低强度也是练了，总比不练强，要鼓励；不能因为强度轻就排除）。
  habits.checkin(uid,p.id,{date:'2026-10-26',confirmed:true,intensity:'low',requestId:'lo1'});
  goals.setGoal(uid,'strength',{target:2,applyNow:true});
  const strength=find(goals.view(uid).week,'strength');
  assert.equal(strength.current,1,'低强度同样算 1 个训练日');
  assert.equal(strength.valueText,'1/2 天');
  // 首页抗阻卡展开的流水（weekRecords）也要带上这一笔，不能把它过滤掉
  const detail=habits.detail(uid,p.id);
  assert.ok(detail.progress.total>=1,'低强度打卡计入项目累计');
});

test('饮水：300+200=500，纠正成 400 后是 400（替换语义，不重复累计）',()=>{
  const {s,habits,goals,uid}=setup();
  const c=cat(habits,uid,'饮水');
  const p=habits.createProject(uid,{categoryId:c.id,name:'饮水',kind:'hydration',hydration:{weightKg:60,coefficient:35},goal:{period:'weekly',target:7}});
  habits.water(uid,p.id,{date:'2026-10-28',amountMl:300,requestId:'w1',confirmed:true});
  habits.water(uid,p.id,{date:'2026-10-28',amountMl:200,requestId:'w2',confirmed:true});
  assert.equal(goals.waterMl(uid,'2026-10-28'),500);
  habits.setWaterTotal(uid,p.id,{date:'2026-10-28',amountMl:400,requestId:'w3',revision:habits.db.projects.find(x=>x.id===p.id).waterVersions['2026-10-28'],confirmed:true});
  assert.equal(goals.waterMl(uid,'2026-10-28'),400,'纠正是替换，不是再加一次');
  // 重试同一 requestId：不再增加
  habits.water(uid,p.id,{date:'2026-10-28',amountMl:200,requestId:'w2',confirmed:true});
  assert.equal(goals.waterMl(uid,'2026-10-28'),400);
  goals.setGoal(uid,'water',{target:1800,applyNow:true});
  const water=find(goals.view(uid).day,'water');
  assert.equal(water.valueText,'400/1800 ml');
  assert.equal(water.periodLabel,'今日');
  // 达到目标后继续记录：数字继续显示，环保持闭合
  habits.setWaterTotal(uid,p.id,{date:'2026-10-28',amountMl:2400,requestId:'w4',revision:habits.db.projects.find(x=>x.id===p.id).waterVersions['2026-10-28'],confirmed:true});
  const after=find(goals.view(uid).day,'water');
  assert.equal(after.current,2400,'超额也如实显示');
  assert.equal(after.closed,true);
  assert.equal(after.percent,100);
});

test('未达目标也是有效记录：显示已记录，不显示未打卡',()=>{
  const {s,habits,goals,uid}=setup();
  const c=cat(habits,uid,'饮水');
  const p=habits.createProject(uid,{categoryId:c.id,name:'饮水',kind:'hydration',hydration:{weightKg:60,coefficient:35},goal:{period:'weekly',target:7}});
  habits.water(uid,p.id,{date:'2026-10-28',amountMl:900,requestId:'w1',confirmed:true});
  goals.setGoal(uid,'water',{target:1800,applyNow:true});
  const v=goals.view(uid);
  const water=find(v.day,'water');
  assert.equal(water.closed,false);
  assert.equal(water.valueText,'900/1800 ml','如实显示进度，不写成未打卡');
  assert.equal(goals.hasRecordOn(uid,'water','2026-10-28'),true);
  assert.equal(v.recordedToday,1,'今日已记录 1 项（按类别去重）');
  // 再分两次喝水，仍然只算 1 项
  habits.water(uid,p.id,{date:'2026-10-28',amountMl:100,requestId:'w2',confirmed:true});
  assert.equal(goals.view(uid).recordedToday,1,'分次喝水不刷高数量');
});

test('周规则：每日项目按「一周至少 N 天」进周环（默认饮水 5 天、英文 7 天，定死可删重设）',()=>{
 const {s,habits,goals,uid}=setup();const c=cat(habits,uid,'饮水');
 const p=habits.createProject(uid,{categoryId:c.id,name:'饮水',kind:'hydration',hydration:{weightKg:60,coefficient:35},goal:{period:'weekly',target:7}});
 s.db.goals=[{userId:uid,key:'water',period:'daily',metric:'ml',target:1000,effectiveFrom:'2026-10-26'}, {userId:uid,key:'water',period:'daily',metric:'ml',target:2000,effectiveFrom:'2026-10-28'}];
 for(const date of ['2026-10-26','2026-10-28'])habits.water(uid,p.id,{date,amountMl:1200,requestId:date,confirmed:true});
 // 周规则默认预置：饮水 5 天（10-29 用户定稿口径）。本周 10-26 喝够 1000、10-28 的线提到 2000 没够到 → 达标 1 天
 const week=goals.view(uid).week;
 assert.deepEqual(week.map(i=>i.key),['water'],'周组 = 心肺抗阻（如有）+ 设了周规则的每日项');
 const wr=week[0];
 assert.equal(wr.target,5,'默认一周 5 天');
 assert.equal(wr.percent,20,'达标 1/5 天 → 20% 的弧');
 assert.equal(wr.closed,false);
 assert.equal(wr.valueText,'达标 1 / 5 天');
 // 算进周闭环（用户 10-29 定稿）：没达标 → met:false，但 checked 计入
 const pm=goals.periodMet(uid,'weekly','2026-10-26','2026-11-01');
 assert.equal(pm.checked,1);assert.equal(pm.met,false);
 // 定死：数字不能改，只能整条删除再重设
 assert.throws(()=>goals.setWeekRule(uid,'water',3),/定死/);
 goals.setWeekRule(uid,'water',null);
 assert.equal(goals.weekRules(uid).water,undefined,'删除后可以重设');
 goals.setWeekRule(uid,'water',3);
 assert.equal(goals.weekRules(uid).water,3);
 // 删掉规则后周环回到两圈（这个场景只剩心肺抗阻，此处为空组）
 goals.setWeekRule(uid,'water',null);
 assert.deepEqual(goals.view(uid).week.map(i=>i.key),[]);
 // 心肺/抗阻本身就是周目标，不收周规则
 assert.throws(()=>goals.setWeekRule(uid,'cardio',3),/周目标/);
 assert.throws(()=>goals.setWeekRule(uid,'water',8),/1-7/);
});

// 日 / 周显隐解绑（用户 10-29）：周化身不再抄每日那条的 hidden，
// 周视图里显隐自己一套，两组互不牵连
test('日/周显隐解绑：日里藏饮水不影响周化身，周里藏的不影响日行',()=>{
 const {s,habits,goals,uid}=setup();const c=cat(habits,uid,'饮水');
 habits.createProject(uid,{categoryId:c.id,name:'饮水',kind:'hydration',hydration:{weightKg:60,coefficient:35},goal:{period:'weekly',target:7}});
 assert.ok(goals.view(uid).week.find(i=>i.key==='water'),'默认就有饮水周规则项');
 goals.setHidden(uid,'water',true); // 日视图里藏
 const v1=goals.view(uid);
 assert.equal(v1.day.find(i=>i.key==='water').hidden,true);
 assert.equal(v1.week.find(i=>i.key==='water').hidden,false,'周化身不跟日视图走');
 goals.setWeekHidden(uid,'water',true); // 周视图里也藏
 const v2=goals.view(uid);
 assert.equal(v2.week.find(i=>i.key==='water').hidden,true);
 assert.equal(v2.day.find(i=>i.key==='water').hidden,true,'日视图的还藏着，互不牵连');
 goals.setHidden(uid,'water',false); // 日视图里打开
 const v3=goals.view(uid);
 assert.equal(v3.day.find(i=>i.key==='water').hidden,false);
 assert.equal(v3.week.find(i=>i.key==='water').hidden,true,'日里打开，周里还藏着');
 goals.setWeekHidden(uid,'water',false);
 const row=goals.list(uid).all.find(i=>i.key==='water');
 assert.equal(row.hidden,false);
 assert.equal(row.weekHidden,false,'list 带周显隐给编辑器');
});

test('休息日不扣分：心肺/抗阻只累计已记录的部分，缺勤不减少进度',()=>{
  const {s,habits,goals,uid}=setup();
  act(s,habits,uid,{type:'running',date:'2026-10-26',minutes:30});
  const c=cat(habits,uid,'抗阻训练');
  const p=habits.createProject(uid,{categoryId:c.id,name:'力量训练',kind:'resistance',goal:{period:'weekly',target:3}});
  habits.checkin(uid,p.id,{date:'2026-10-26',confirmed:true,requestId:'r1'});
  goals.setGoal(uid,'cardio',{target:90,applyNow:true});
  goals.setGoal(uid,'strength',{target:2,applyNow:true});
  const before=goals.view(uid);
  assert.equal(find(before.week,'cardio').current,30);
  assert.equal(find(before.week,'strength').current,1);
  // 周二、周三没有任何记录 → 进度不倒退，也不出现「未打卡」惩罚
  const after=goals.view(uid);
  assert.equal(find(after.week,'cardio').current,30);
  assert.equal(find(after.week,'strength').current,1);
  assert.equal(find(after.week,'cardio').closed,false,'未达目标，但记录仍在');
});

test('隐藏只影响展示，不删数据；只留一个圈也允许',()=>{
  const {s,habits,goals,uid}=setup();
  const c=cat(habits,uid,'饮水');
  const p=habits.createProject(uid,{categoryId:c.id,name:'饮水',kind:'hydration',hydration:{weightKg:60,coefficient:35},goal:{period:'weekly',target:7}});
  habits.water(uid,p.id,{date:'2026-10-28',amountMl:600,requestId:'w1',confirmed:true});
  goals.setGoal(uid,'water',{target:1800,applyNow:true});
  assert.equal(find(goals.view(uid).day,'water').current,600);
  goals.setHidden(uid,'water',true);
  const v=goals.view(uid);
  // 隐藏项占住槽位不画（用户 10-29：环的位置固定，不许跳位），图例由前端 pack 过滤
  assert.deepEqual(v.day.map(i=>i.key),['move','water'],'隐藏后饮水仍占位，只是标记 hidden');
  assert.equal(v.day[1].hidden,true,'隐藏项带 hidden 标记下发');
  assert.equal(v.day[0].recordOnly,true,'运动环只记有没有动过，不设目标');
  assert.equal(v.day[0].done,false);
  assert.equal(goals.waterMl(uid,'2026-10-28'),600,'数据还在');
  assert.equal(goals.achievements(uid).recordDays,1,'成就口径不受隐藏影响');
  goals.setHidden(uid,'water',false);
  assert.equal(find(goals.view(uid).day,'water').current,600,'取消隐藏后回来');
});

test('每周项目允许仅记录',()=>{
  const {s,habits,goals,uid}=setup();
  act(s,habits,uid,{type:'walking',date:'2026-10-27',minutes:45,distanceM:2000});
  assert.equal(goals.setGoal(uid,'cardio',{recordOnly:true}).goal.recordOnly,true);
  assert.equal(goals.setGoal(uid,'strength',{recordOnly:true}).goal.recordOnly,true);
});

test('仅记录显示累计量，不画目标完成率',()=>{
  const {habits,goals,uid}=setup();
  const c=cat(habits,uid,'饮水');
  goals.setGoal(uid,'water',{recordOnly:true,applyNow:true});
  const p=habits.createProject(uid,{categoryId:c.id,name:'饮水',kind:'hydration',hydration:{weightKg:60,coefficient:35},goal:{period:'daily',target:8}});
  let water=find(goals.view(uid).day,'water');
  assert.equal(water.recordOnly,true);
  assert.equal(water.percent,0,'没记过就是空的，不假装');
  assert.equal(water.closed,false);
  assert.equal(water.done,false);
  assert.equal(water.remainText,'记一次就算');
  habits.water(uid,p.id,{date:'2026-10-28',amountMl:600,requestId:'w1',confirmed:true});
  water=find(goals.view(uid).day,'water');
  assert.equal(water.percent,0,'仅记录不伪造完成率');
  assert.equal(water.done,true);
  assert.equal(water.closed,false,'划满只是记过，不是达标');
  assert.equal(water.remainText,'已记录 ✓');
  assert.equal(water.valueText,'600 ml');
  assert.equal(goals.periodMet(uid,'daily','2026-10-28','2026-10-28').met,false,'仅记录不进闭环判定');
});

test('改目标不追溯历史：本周仍按旧目标，新目标下个周期生效',()=>{
  const {s,habits,goals,uid}=setup();
  act(s,habits,uid,{type:'running',date:'2026-10-27',minutes:20});
  const first=goals.setGoal(uid,'cardio',{target:90,applyNow:true});
  assert.equal(first.effectiveFrom,'2026-10-26','首次设置立即作用于本周（周一起算）');
  assert.equal(first.appliesNow,true);
  const second=goals.setGoal(uid,'cardio',{target:150});
  assert.equal(second.effectiveFrom,'2026-11-02','改成下周一生效');
  assert.equal(second.appliesNow,false);
  assert.match(second.appliesText,/2026-11-02/);
  // 本周仍按 90 算，历史周（上周）当时没有目标 → 仅记录
  assert.equal(goals.item(uid,'cardio','weekly','2026-10-26','2026-11-01').target,90);
  assert.equal(goals.item(uid,'cardio','weekly','2026-11-02','2026-11-08').target,150);
  assert.equal(goals.item(uid,'cardio','weekly','2026-10-19','2026-10-25').recordOnly,true);
});

test('补录、编辑、删除都会重算；未来日期不能记',()=>{
  const {s,habits,goals,uid}=setup();
  goals.setGoal(uid,'cardio',{target:90,applyNow:true});
  // 补录上周的一笔
  const back=act(s,habits,uid,{type:'running',date:'2026-10-21',minutes:40});
  assert.equal(goals.item(uid,'cardio','weekly','2026-10-19','2026-10-25').current,40,'补录计入当时那一周');
  assert.equal(goals.item(uid,'cardio','weekly','2026-10-26','2026-11-01').current,0,'不算进本周');
  // 编辑：时长改成 70
  s.put(uid,{...back,durationSec:70*60,occurredAt:'2026-10-21T10:00:00Z',timeZone:'Asia/Shanghai'},back.id);
  assert.equal(goals.item(uid,'cardio','weekly','2026-10-19','2026-10-25').current,70);
  // 删除
  s.remove(uid,back.id);
  assert.equal(goals.item(uid,'cardio','weekly','2026-10-19','2026-10-25').current,0);
  // 未来日期
  assert.throws(()=>act(s,habits,uid,{type:'running',date:'2026-11-30',minutes:20}));
});

test('英语：学完才算，不能点按钮伪造；账号之间数据隔离',()=>{
  const {s,habits,goals,uid,other}=setup();
  const c=cat(habits,uid,'英文学习');
  const p=habits.createProject(uid,{categoryId:c.id,name:'每天学几个词',kind:'learning',goal:{period:'weekly',target:7}},true);
  assert.throws(()=>habits.checkin(uid,p.id,{date:'2026-10-28',confirmed:true}),/自动完成/,'英语不能手动打卡');
  // 真正学过两个词
  habits.db.word_cards.push({id:'c1',userId:uid,wordId:'w1',lastAt:'2026-10-28',learnedAt:'2026-10-28'});
  habits.db.word_cards.push({id:'c2',userId:uid,wordId:'w2',lastAt:'2026-10-28',learnedAt:'2026-10-28'});
  goals.setGoal(uid,'english',{target:3,applyNow:true});
  const english=find(goals.view(uid).day,'english');
  assert.equal(english.current,2);
  assert.equal(english.valueText,'2/3 词');
  // 另一个账号看不到
  assert.equal(goals.englishWords(other,'2026-10-28'),0);
  assert.equal(goals.recordDays(other).size,0);
  assert.equal(goals.achievements(uid).recordDays,1);
});

test('自建习惯：可选周期与指标（次数 / 时长 / 数值），默认不进每日目标',()=>{
  const {habits,goals,uid}=setup();
  const c=habits.createCategory(uid,{name:'每日散步'});
  const p=habits.createProject(uid,{categoryId:c.id,name:'散步',metric:'duration',goal:{period:'weekly',target:3}});
  assert.equal(p.metric,'duration');
  habits.checkin(uid,p.id,{date:'2026-10-27',confirmed:true,amount:25,requestId:'x1'});
  habits.checkin(uid,p.id,{date:'2026-10-28',confirmed:true,amount:20,requestId:'x2'});
  const key='cat:'+c.id;
  goals.setGoal(uid,key,{metric:'duration',period:'weekly',target:60,applyNow:true});
  const item=find(goals.view(uid).week,key);
  assert.equal(item.current,45);
  assert.equal(item.valueText,'45/60 分钟');
  // 也可以设成每日
  goals.setGoal(uid,key,{metric:'duration',period:'daily',target:20,applyNow:true});
  const daily=find(goals.view(uid).day,key);
  assert.equal(daily.current,20,'今日只算今天的');
  assert.equal(daily.periodLabel,'今日');
});

test('成就：首次记录、累计记录天数、完成目标周期（按当时有效目标）',()=>{
  const {s,habits,goals,uid}=setup();
  const empty=goals.achievements(uid);
  assert.equal(empty.recordDays,0);
  assert.equal(find2(empty,'first').earned,false);
  // 目标从上周一起生效（相当于用户上周就设好了），上周跑满 90 分钟
  goals.db.goals.push({id:'g1',userId:uid,key:'cardio',period:'weekly',metric:'minutes',target:90,
    recordOnly:false,hidden:false,effectiveFrom:'2026-10-19',createdAt:CLOCK});
  const past=act(s,habits,uid,{type:'running',date:'2026-10-20',minutes:90});
  const a=goals.achievements(uid);
  assert.equal(find2(a,'first').earned,true,'首次记录');
  assert.equal(a.recordDays,1);
  assert.equal(a.weeklyPeriods,1,'上周达标 = 完成 1 个周目标周期');
  assert.equal(find2(a,'periods-1').earned,true);
  assert.deepEqual(a.closedWeeks,['2026-10-19']);
  // 本周还没过完，不计入已完成周期
  act(s,habits,uid,{type:'running',date:'2026-10-26',minutes:120});
  assert.equal(goals.achievements(uid).weeklyPeriods,1,'未过完的周不算');
  // 删掉上周那笔 → 重算回 0
  s.remove(uid,past.id);
  assert.equal(goals.achievements(uid).weeklyPeriods,0,'删除后重算');
  assert.equal(goals.achievements(uid).recordDays,1,'本周的记录还在');
});

test('成就：每日目标按天达标；饮水记录天数不按杯数',()=>{
  const {habits,goals,uid}=setup();
  const c=cat(habits,uid,'饮水');
  const p=habits.createProject(uid,{categoryId:c.id,name:'饮水',kind:'hydration',hydration:{weightKg:60,coefficient:35},goal:{period:'weekly',target:7}});
  goals.db.goals.push({id:'g2',userId:uid,key:'water',period:'daily',metric:'ml',target:1000,
    recordOnly:false,hidden:false,effectiveFrom:'2026-10-27',createdAt:CLOCK});
  // 昨天分 4 次喝到 1000ml：算 1 个达标日，记录天数也只算 1 天
  [300,300,200,200].forEach((ml,i)=>habits.water(uid,p.id,{date:'2026-10-27',amountMl:ml,requestId:'d'+i,confirmed:true}));
  const a=goals.achievements(uid);
  assert.equal(a.recordDays,1,'记了几杯都只算 1 天');
  assert.equal(a.dailyPeriods,1,'昨天达标 = 1 个日目标周期');
});

test('目标设置校验：正整数、上限、未知项',()=>{
  const {goals,uid}=setup();
  assert.throws(()=>goals.setGoal(uid,'cardio',{target:0}),/正整数/);
  assert.throws(()=>goals.setGoal(uid,'cardio',{target:99999}),/超出范围/);
  assert.throws(()=>goals.setGoal(uid,'nope',{target:10}),/目标项不存在/);
  assert.throws(()=>goals.setGoal(uid,'cat:not-mine',{target:10}),/类别不存在/);
  assert.throws(()=>goals.setGoal(uid,'strength',{target:9}),/超出范围/);
});

function find2(a,id){const b=a.badges.find(x=>x.id===id);assert.ok(b,'缺少成就 '+id);return b;}

test('首次显式设置立即生效：系统的建议量（auto）不算用户设过',()=>{
  const {s,habits,goals,uid}=setup();
  // 系统建议量（老数据迁移 / 体重换算），从今天起生效
  goals.db.goals.push({id:'g-auto',userId:uid,key:'water',period:'daily',metric:'ml',target:2100,
    recordOnly:false,auto:true,hidden:false,effectiveFrom:'2026-10-27',createdAt:CLOCK,note:'migrated'});
  const r=goals.setGoal(uid,'water',{target:1800});
  assert.equal(r.appliesNow,true,'用户第一次明确选择，立即用于当前周期');
  assert.equal(r.effectiveFrom,'2026-10-28','日目标立即生效 = 从今天起');
  // 已有显式目标后，再改默认下周期生效
  const r2=goals.setGoal(uid,'water',{target:2000});
  assert.equal(r2.appliesNow,false);
  assert.match(r2.appliesText,/2026-10-29/);
  assert.equal(goals.item(uid,'water','daily','2026-10-28','2026-10-28').target,1800,'本周期仍按 1800 算，不被追溯改写');
});

// 小字那行是用户每天真正会读到的句子，四个阶段四种说法：
// 没开始不报账、没过半平淡说、过半才鼓励、达标收工。
test('小字那行跟着进展换口径：没开始说历史，过半说「再来 X 就到了」',()=>{
  const {habits,goals,uid}=setup();
  const c=cat(habits,uid,'饮水');
  goals.setGoal(uid,'water',{target:2000,applyNow:true});

  // ① 一条都没记、昨天也没有 → 只陈述「今天还没记」，不写「还差 2000 ml」
  let w=find(goals.view(uid).day,'water');
  assert.equal(w.current,0);
  assert.equal(w.remainText,'今天还没记');
  assert.equal(w.noteTone,'muted');
  assert.equal(w.closed,false);

  const p=habits.createProject(uid,{categoryId:c.id,name:'饮水',kind:'hydration',hydration:{weightKg:60,coefficient:35},goal:{period:'daily',target:8}});

  // ② 昨天记过 → 同一个位置改成「昨天 1500 ml」，把欠账换成底气
  habits.water(uid,p.id,{date:'2026-10-27',amountMl:1500,requestId:'y1',confirmed:true});
  w=find(goals.view(uid).day,'water');
  assert.equal(w.current,0,'昨天的量不算进今天');
  assert.equal(w.remainText,'昨天 1500 ml');
  assert.equal(w.prev,1500,'上一周期的量会一起带出来，模板想用也能用');

  // ③ 有进展但没过半 → 平淡地说还差多少（这时候它是导航，不是催）
  habits.water(uid,p.id,{date:'2026-10-28',amountMl:500,requestId:'t1',confirmed:true});
  w=find(goals.view(uid).day,'water');
  assert.equal(w.remainText,'还差 1500 ml');
  assert.equal(w.noteTone,'muted');

  // ④ 过半 → 换成「再来 X 就到了」，墨色加重一格；ml 后面留空格
  habits.water(uid,p.id,{date:'2026-10-28',amountMl:700,requestId:'t2',confirmed:true});
  w=find(goals.view(uid).day,'water');
  assert.equal(w.current,1200);
  assert.equal(w.remainText,'再来 800 ml 就到了');
  assert.equal(w.noteTone,'strong');

  // ⑤ 达标 → 收工
  habits.water(uid,p.id,{date:'2026-10-28',amountMl:900,requestId:'t3',confirmed:true});
  w=find(goals.view(uid).day,'water');
  assert.equal(w.closed,true);
  assert.equal(w.remainText,'已达标 ✓');
  assert.equal(w.noteTone,'ok');
});

// 周目标比日目标多一层：「还剩几天」是它独有的信息，日目标不写
test('周目标过半时带上「还剩 N 天」，日目标不写这一句',()=>{
  const {s,habits,goals,uid}=setup();
  goals.setGoal(uid,'cardio',{target:100,applyNow:true});
  act(s,habits,uid,{type:'running',date:'2026-10-27',minutes:60});
  const cardio=find(goals.view(uid).week,'cardio');
  assert.equal(cardio.remainText,'再来 40 等效分钟就到了 · 还剩 4 天','周三到周日还有 4 天');
  assert.equal(cardio.noteTone,'strong');
});

// ── 强度与运动环 ──
// 口径：中等 1 倍、高强 2 倍、散步（低强）0 倍。所以「每周 150 分钟中等」和
// 「每周 75 分钟高强」是同一个数，混着凑也成立。
function put(s,uid,o){
  return s.put(uid,{timeZone:'Asia/Shanghai',visibility:'private',confirmed:true,...o});
}
test('强度折算：中等 1 倍、高强 2 倍，60 分钟中等 + 45 分钟高强正好 150',()=>{
  const {s,habits,goals,uid}=setup();
  goals.setGoal(uid,'cardio',{target:150,applyNow:true});
  put(s,uid,{type:'running',occurredAt:'2026-10-27T01:00:00Z',distanceM:1000,durationSec:60*60,intensity:'moderate'});
  put(s,uid,{type:'running',occurredAt:'2026-10-28T01:00:00Z',distanceM:15000,durationSec:45*60,intensity:'vigorous'});
  const c=find(goals.view(uid).week,'cardio');
  assert.equal(c.current,150,'60 + 45×2 = 150');
  assert.equal(c.closed,true);
  assert.equal(c.remainText,'已达标 ✓');
});
test('散步（低强度）不进训练量，但今天算动过',()=>{
  const {s,habits,goals,uid}=setup();
  goals.setGoal(uid,'cardio',{target:150,applyNow:true});
  put(s,uid,{type:'walking',occurredAt:'2026-10-28T01:00:00Z',distanceM:0,durationSec:0,intensity:'low'});
  const v=goals.view(uid);
  assert.equal(find(v.week,'cardio').current,0,'散步不计入本周分钟');
  const move=find(v.day,'move');
  assert.equal(move.done,true);
  assert.equal(move.valueText,'运动 1 项');
  assert.match(move.remainText,/低强度/);
  assert.equal(s.summary(uid).recent,1,'成就里仍然记了一天：今天动过');
});
test('运动环：抗阻打卡也算动过，并且记住练的是哪一块',()=>{
  const {s,habits,goals,uid}=setup();
  const c=cat(habits,uid,'抗阻训练');
  const p=habits.createProject(uid,{categoryId:c.id,name:'力量训练',kind:'resistance',goal:{period:'weekly',target:3}});
  assert.equal(find(goals.view(uid).day,'move').done,false,'还没动');
  habits.checkin(uid,p.id,{date:'2026-10-28',part:'lower',confirmed:true,requestId:'r1'});
  assert.equal(find(goals.view(uid).day,'move').done,true);
  assert.equal(s.db.checkins.find(x=>x.requestId==='r1').part,'lower');
  assert.equal(find(goals.view(uid).week,'strength').current,1);
});
test('有氧打卡必填项只有时长；距离可选（含中强度只填时长也能存）',()=>{
  const {s,uid}=setup();
  const low=put(s,uid,{type:'walking',occurredAt:'2026-10-28T01:00:00Z',distanceM:0,durationSec:0,intensity:'low'});
  assert.equal(low.intensity,'low');
  assert.equal(low.durationSec,0);
  // 中强度只填时长、不填距离 → 现在允许（距离改回选填）
  const onlyTime=put(s,uid,{type:'running',occurredAt:'2026-10-27T01:00:00Z',distanceM:0,durationSec:600,intensity:'moderate'});
  assert.equal(onlyTime.durationSec,600);
  assert.equal(onlyTime.distanceM,0);
  // 时长缺失仍不许存
  assert.throws(()=>put(s,uid,{type:'walking',occurredAt:'2026-10-27T01:00:00Z',distanceM:0,durationSec:0,intensity:'moderate'}),/距离无效|时长须为/);
  assert.throws(()=>put(s,uid,{type:'walking',occurredAt:'2026-10-27T01:00:00Z',distanceM:1000,durationSec:0,intensity:'moderate'}),/时长须为/);
  assert.throws(()=>put(s,uid,{type:'walking',occurredAt:'2026-10-27T01:00:00Z',distanceM:1000,durationSec:600,intensity:'sprint'}),/强度无效/);
});
test('默认强度是中等：老记录没有这个字段，口径不变',()=>{
  const {s,habits,goals,uid}=setup();
  goals.setGoal(uid,'cardio',{target:150,applyNow:true});
  const a=act(s,habits,uid,{type:'running',date:'2026-10-27',minutes:30,distanceM:5000});
  assert.equal(a.intensity,'moderate');
  assert.equal(find(goals.view(uid).week,'cardio').current,30);
});

// ── 档案馆（记录页）与周卡口径 ──
test('档案馆：按天分组，散步也留痕',()=>{
  const {s,habits,goals,uid}=setup();
  act(s,habits,uid,{type:'running',date:'2026-10-26',minutes:30,distanceM:5000});
  s.put(uid,{type:'walking',occurredAt:'2026-10-28T01:00:00Z',timeZone:'Asia/Shanghai',distanceM:0,durationSec:0,intensity:'low',visibility:'private',confirmed:true});
  const log=goals.logbook(uid);
  assert.equal(log.today,'2026-10-28');
  assert.equal(log.todayCount,1);
  assert.equal(log.groups[0].label,'今天');
  assert.equal(log.groups[0].items[0].title,'散步');
  assert.equal(log.groups[0].items[0].meta,'不计训练量','散步不进训练量，但要写明白');
  assert.equal(log.groups[0].items[0].soft,true,'浅色点，跟正常记录区分');
  assert.equal(log.groups[1].label,'10/26 周一');
  assert.equal(log.groups[1].items[0].title,'跑步');
  assert.equal(log.groups[1].items[0].meta,'5 km · 30 分');
  // 横滑「再来一次」要原样重放这一笔，所以原始字段必须跟着流水一起下发，
  // 客户端不该去反解析 meta 这种给人看的字符串
  assert.equal(log.groups[1].items[0].type,'running');
  assert.equal(log.groups[1].items[0].durationSec,1800);
  assert.equal(log.groups[1].items[0].distanceM,5000);
  assert.equal(log.groups[0].items[0].intensity,'low');
});

// 历史上可以按窗口看：最近 3 天含今天（起点是前天），不是「往前推 3 天」
test('档案馆时间窗：3 天 / 7 天各看各的，窗口外的笔数单独算',()=>{
  const {s,habits,goals,uid}=setup();
  act(s,habits,uid,{type:'running',date:'2026-10-28',minutes:30,distanceM:5000}); // 今天
  act(s,habits,uid,{type:'running',date:'2026-10-26',minutes:20,distanceM:3000}); // 前天
  act(s,habits,uid,{type:'running',date:'2026-10-24',minutes:40,distanceM:7000}); // 5 天前

  const d3=goals.logbook(uid,60,3);
  assert.deepEqual(d3.groups.map(g=>g.date),['2026-10-28','2026-10-26']);
  assert.equal(d3.from,'2026-10-26');
  assert.equal(d3.total,2,'窗口里有几笔');
  assert.equal(d3.anyTotal,3,'全部有几笔——用来区分「这几天没记」和「一条都还没有」');
  assert.equal(d3.todayCount,1,'「今天已记几笔」不受窗口影响');

  const d7=goals.logbook(uid,60,7);
  assert.deepEqual(d7.groups.map(g=>g.date),['2026-10-28','2026-10-26','2026-10-24']);
  assert.equal(d7.total,3);

  const all=goals.logbook(uid);
  assert.equal(all.days,0,'不传窗口就是全部，老口径不变');
  assert.equal(all.total,3);
});

test('抗阻那一笔带部位下发：横滑重放时不用反解析 meta',()=>{
  const {s,habits,goals,uid}=setup();
  const c=cat(habits,uid,'抗阻训练');
  const p=habits.createProject(uid,{categoryId:c.id,name:'力量训练',kind:'resistance',goal:{period:'weekly',target:3}});
  habits.checkin(uid,p.id,{date:'2026-10-28',part:'upper',confirmed:true,requestId:'k1'});
  const log=goals.logbook(uid);
  assert.equal(log.todayCount,1);
  assert.equal(log.groups[0].items[0].title,'力量训练');
  assert.equal(log.groups[0].items[0].meta,'上肢');
  assert.equal(log.groups[0].items[0].part,'upper','部位要一起下发，横滑重放才不用猜');
  assert.equal(goals.strengthDays(uid,'2026-10-26','2026-11-01'),1);
});

test('周卡「比上周」：本周 45 分钟、上周 30 分钟 → 多 15 分钟',()=>{
  const {s,habits,goals,uid}=setup();
  act(s,habits,uid,{type:'running',date:'2026-10-21',minutes:30,distanceM:5000}); // 上周三
  act(s,habits,uid,{type:'running',date:'2026-10-27',minutes:45,distanceM:8000}); // 本周二
  const w=goals.weekCompare(uid);
  assert.equal(w.start,'2026-10-26');
  assert.equal(w.minutes,45);
  assert.equal(w.prevMinutes,30);
  assert.equal(w.delta,15);
  assert.equal(w.hasPrev,true);
  const none=goals.weekCompare('demo-b');
  assert.equal(none.hasPrev,false,'没有上周数据时不要把 0 说成「比上周少」');
});

test('成就页三格：累计天数不受月份影响，年卡三个数也有',()=>{
  const {s,habits,uid}=setup();
  act(s,habits,uid,{type:'running',date:'2026-09-30',minutes:30,distanceM:5000});
  act(s,habits,uid,{type:'running',date:'2026-10-27',minutes:20,distanceM:3000});
  const st=s.summary(uid);
  assert.equal(st.totalDays,2,'跨月也要算进累计');
  assert.equal(st.monthly,1);
  assert.equal(st.yearDays,2);
  assert.equal(st.yearKm,8);
  assert.equal(st.yearMinutes,50);
});

// 「每天学几个」以前是两套：环上写 5 个、实际只发 3 个，环永远差两个
test('英语目标就是每天发几个新词的配额',()=>{
  const {goals,learning,uid}=setup();
  goals.setGoal(uid,'english',{target:5,applyNow:true});
  assert.equal(learning.setting(uid).dailyNew,5);
  assert.equal(learning.today(uid).fresh.length,5);
});

// 饮水改成「体重 × 每公斤多少毫升」之后：
// 体重变了目标要跟着变，但用户手填过的目标不能被体重悄悄改掉
test('饮水按体重换算：改体重跟着走，手填的目标不被覆盖',()=>{
  const {habits,goals,uid}=setup();
  goals.setGoal(uid,'water',{followWeight:true,weightKg:65,coefficient:35});
  assert.equal(goals.view(uid).day.find(i=>i.key==='water').target,2275,'65 × 35');
  habits.syncWeight(uid,70);
  assert.equal(goals.view(uid).day.find(i=>i.key==='water').target,2450,'70 × 35');
  goals.setGoal(uid,'water',{target:1500});
  habits.syncWeight(uid,80);
  assert.equal(goals.view(uid).day.find(i=>i.key==='water').target,1500,'手填的 1500 不动');
  assert.throws(()=>goals.setGoal(uid,'water',{followWeight:true,weightKg:10,coefficient:35}),/20–300kg/);
  assert.throws(()=>goals.setGoal(uid,'water',{followWeight:true,weightKg:65,coefficient:36}),/35 \/ 37\.5 \/ 40/);
});

// 「每天学几个词」只能有一个数：英语目标存下去时，服务端把出词配额对齐过去。
// 以前目标设置页还有一张「学习 · 每天新词」卡，只改配额不改目标，两边能自相矛盾。
test('英语目标就是学习页每天发的新词数',()=>{
  const {goals,learning,uid}=setup();
  goals.setGoal(uid,'english',{target:5,applyNow:true});
  assert.equal(learning.today(uid).plan.dailyNew,5,'存 5 个词，配额跟着变 5');
  goals.setGoal(uid,'english',{target:1,applyNow:true});
  assert.equal(learning.today(uid).plan.dailyNew,1,'再改一次也跟着走');
  const before=learning.today(uid).plan.dailyNew;
  goals.setGoal(uid,'english',{recordOnly:true});
  assert.equal(learning.today(uid).plan.dailyNew,before,'选「仅记录」只停掉达标判定，不动出词节奏');
});

test('单项饮水连续天数不被其他每日目标中断',()=>{
 const {s,habits,goals,uid}=setup();const c=cat(habits,uid,'饮水');
 const p=habits.createProject(uid,{categoryId:c.id,name:'饮水',kind:'hydration',hydration:{weightKg:60,coefficient:35},goal:{period:'weekly',target:7}});
 s.db.goals=[{userId:uid,key:'water',period:'daily',metric:'ml',target:1000,effectiveFrom:'2026-10-26'}, {userId:uid,key:'english',period:'daily',metric:'words',target:3,effectiveFrom:'2026-10-26'}];
 for(const date of ['2026-10-26','2026-10-27','2026-10-28'])habits.water(uid,p.id,{date,amountMl:1200,requestId:date,confirmed:true});
  assert.equal(goals.achievements(uid).dailyStreaks.find(s=>s.key==='water').streak,3);
});

// 圆环颜色：用户级覆盖存在 profile.ringColors，套进 view 的每一项 color。
// 没改过的项回退默认品牌色；改过的用覆盖色（周心肺也走覆盖，不强制正红）。
test('圆环颜色覆盖：ringColors 套进 view 的 color，没改的回退默认',()=>{
  const {s,habits,goals,uid}=setup();
  goals.setGoal(uid,'cardio',{target:90,applyNow:true});
  goals.setGoal(uid,'strength',{target:2,applyNow:true});
  goals.setGoal(uid,'water',{target:1500,applyNow:true});
  const defCardio=goals.view(uid).week.find(i=>i.key==='cardio').color;
  assert.equal(defCardio,'#D93B36','默认心肺色是品牌正红');
  s.user(uid).ringColors={cardio:'#123456',water:'#ABCDEF'};
  const v=goals.view(uid);
  assert.equal(v.week.find(i=>i.key==='cardio').color,'#123456','心肺用覆盖色');
  assert.equal(v.day.find(i=>i.key==='water').color,'#ABCDEF','饮水用覆盖色');
  assert.equal(v.week.find(i=>i.key==='strength').color,'#7391D9','抗阻没改 → 回退默认（周环浅蓝）');
});

// 圆环颜色格式校验：只收合法十六进制，空 / 默认即清空，脏值直接拒绝。
test('validateRingColors 只收合法十六进制，空 / 默认即清空',()=>{
  const {s,uid}=setup();
  assert.deepEqual(s.validateRingColors({cardio:'#06B6D4',water:'#fff'}),{cardio:'#06B6D4',water:'#FFFFFF'});
  assert.deepEqual(s.validateRingColors({water:'default'}),{});
  assert.deepEqual(s.validateRingColors(null),{});
  assert.throws(()=>s.validateRingColors({water:'notacolor'}),/颜色格式无效/);
  assert.throws(()=>s.validateRingColors('nope'),/圆环颜色配置无效/);
});


// 抗阻周目标下限 2 天（ACE/ACSM 最低建议）：服务端是唯一口径，前端绕过也拦得住
test('抗阻周目标至少 2 天：1 天被拒，2 天放行，仅记录不受限',()=>{
  const {s,habits,goals,uid}=setup();
  act(s,habits,uid,{type:'running',date:'2026-10-27',minutes:20});
  assert.throws(()=>goals.setGoal(uid,'strength',{target:1,applyNow:true}),/每周至少 2 天/);
  goals.setGoal(uid,'strength',{target:2,applyNow:true});
  assert.equal(find(goals.view(uid).week,'strength').target,2);
  assert.throws(()=>goals.setGoal(uid,'strength',{target:1,applyNow:true}),/每周至少 2 天/,'改目标也不能降到 1');
  // 不想定线就仅记录，不强按 2 天（applyNow 让它当周就生效，方便断言）
  goals.setGoal(uid,'strength',{recordOnly:true,applyNow:true});
  assert.equal(find(goals.view(uid).week,'strength').recordOnly,true);
});

// 日环默认就是三圈：运动 + 饮水 + 英语（用户 10-29 截图定稿）。
// 显隐是用户自己按出来的，任何默认路径都不许预设成隐藏。
test('日环默认：运动 + 饮水 + 英语 三圈都在，没有一项预设为隐藏',()=>{
  const {s,habits,goals,uid}=setup();
  goals.setGoal(uid,'water',{target:2000,applyNow:true});
  goals.setGoal(uid,'english',{target:5,applyNow:true});
  const v=goals.view(uid);
  assert.deepEqual(v.day.map(i=>i.key),['move','water','english'],'顺序：运动最外，饮水居中，英语最里');
  for(const it of v.day)assert.equal(it.hidden,false,it.key+' 默认可见');
  assert.ok(v.day.find(i=>i.key==='move').recordOnly,'运动是仅记录圈');
  // 首页那组环（utils/rings）按同一份数据铺三圈
  const {pack}=require('../miniprogram/utils/rings');
  const p=pack(v.day,'daily','今日');
  assert.equal(p.items.length,3);
  assert.equal(p.values.length,3);
  assert.equal(p.values.filter(x=>x.soft).length,1,'只有运动圈走 soft（仅记录）');
});
