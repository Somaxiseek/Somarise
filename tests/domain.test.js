const {test}=require('node:test');const assert=require('node:assert/strict');
const {Service,seed,stats,metric,validate,day,shift}=require('../server/domain');const {MockOCR,recognize}=require('../server/ocr');const {normalizeImport}=require('../server/import-contract');
const now='2026-10-25T10:00:00Z';const activity=(patch={})=>({type:'running',distanceM:1000,durationSec:300,occurredAt:'2026-10-25T01:00:00Z',timeZone:'Asia/Shanghai',visibility:'private',confirmed:true,...patch});const setup=()=>new Service(seed(),()=>{},()=>now);
test('three sport thresholds and calculated metrics',()=>{const s=setup();for(const [type,distanceM,unit,value] of [['running',1000,'秒/km',300],['cycling',5000,'km/h',60],['swimming',200,'秒/100m',150]]){const a=s.put('demo-a',activity({type,distanceM}));assert.deepEqual(metric(a),{unit,value});}assert.equal(s.summary('demo-a').monthly,1);});
test('same day sports count once; duration-only runs qualify as a valid day',()=>{const s=setup();s.put('demo-a',activity({distanceM:0,durationSec:300}));s.put('demo-a',activity({distanceM:0,durationSec:600}));assert.equal(s.summary('demo-a').monthly,1,'同天再练只算 1 天');s.put('demo-a',activity({type:'swimming',distanceM:0,durationSec:1500,occurredAt:'2026-10-24T01:00:00Z'}));assert.equal(s.summary('demo-a').monthly,2,'换一天 +1 天');});
test('month year leap day, interruption, backfill, longest and rolling window',()=>{const records=['2025-12-31','2026-01-01','2026-01-03'].map(d=>activity({occurredAt:d+'T01:00:00Z'}));let s=stats(records,'UTC','2026-01-04T01:00:00Z');assert.equal(s.current,1);assert.equal(s.longest,2);assert.equal(s.monthly,2);records.push(activity({occurredAt:'2026-01-02T01:00:00Z'}));s=stats(records,'UTC','2026-01-04T01:00:00Z');assert.equal(s.current,4);assert.equal(s.longest,4);assert.equal(s.recent,4);assert.equal(stats(records,'UTC','2026-02-04T01:00:00Z').current,0);assert.doesNotThrow(()=>validate(activity({occurredAt:'2024-02-29T01:00:00Z'})));});
test('timezone day boundaries and DST use actual instant',()=>{assert.equal(day('2026-01-01T00:30:00Z','America/New_York'),'2025-12-31');assert.equal(day('2026-03-08T07:30:00Z','America/New_York'),'2026-03-08');const s=setup();s.put('demo-a',activity({occurredAt:'2026-09-30T20:00:00Z'}));assert.equal(s.summary('demo-a','2026-10','Asia/Shanghai').monthly,1);assert.equal(s.summary('demo-a','2026-09','UTC').monthly,1);});
test('edit deletion recalculate and preserve creation timestamp; optimistic revision',()=>{const s=setup(),a=s.put('demo-a',activity());assert.equal(s.summary('demo-a').monthly,1);const b=s.put('demo-a',activity({distanceM:900,revision:1}),a.id);assert.equal(b.createdAt,a.createdAt);assert.equal(s.summary('demo-a').monthly,1,'改成 900m 但有 300s 时长，仍记为有效日（同天不重复）');assert.throws(()=>s.put('demo-a',activity({revision:1}),a.id),/刷新/);s.remove('demo-a',a.id);assert.equal(s.records('demo-a').length,0);});
test('invalid values and forged fields rejected by server',()=>{for(const patch of [{distanceM:-1},{distanceM:500000},{durationSec:0},{durationSec:1.5},{heartRate:999},{timeZone:'garbage'},{timeZone:undefined},{occurredAt:'2026-02-30T01:00:00Z'},{occurredAt:'2026-10-25T24:00:00Z'},{occurredAt:'2099-01-01T00:00:00Z'},{confirmed:false},{visibility:'public'},{type:'dancing'},{type:'__proto__'}])assert.throws(()=>validate(activity(patch),Date.parse(now)));const s=setup();const a=s.put('demo-a',activity({userId:'demo-b',id:'forged'}));assert.equal(a.userId,'demo-a');assert.notEqual(a.id,'forged');});
test('有氧中高强度：填了时长即记为有效日，距离只用于配速',()=>{
 const s=setup();
 const w=s.put('demo-a',activity({type:'walking',distanceM:1000,durationSec:720}));
 assert.deepEqual(metric(w),{unit:'秒/km',value:720});
 assert.equal(s.summary('demo-a').monthly,1);
 // 步行距离不足 1km 但填了时长 → 仍记为有效日（换一天）
 s.put('demo-a',activity({type:'walking',distanceM:900,durationSec:600,occurredAt:'2026-10-24T01:00:00Z'}));
 assert.equal(s.summary('demo-a').monthly,2);
 // 球类 10 分钟、无距离 → 记为有效日
 s.put('demo-a',activity({type:'ball',distanceM:0,durationSec:600,occurredAt:'2026-10-23T01:00:00Z'}));
 assert.equal(s.summary('demo-a').monthly,3);
 assert.throws(()=>validate(activity({type:'ball',distanceM:0,durationSec:0}),Date.parse(now)),/时长须为/);
});
test('retry after lost response is idempotent; duplicates across sources and image hashes',()=>{const s=setup(),a=s.put('demo-a',activity({requestId:'stable'}));assert.equal(s.put('demo-a',activity({requestId:'stable'})).id,a.id);assert.throws(()=>s.put('demo-a',activity({durationSec:600,requestId:'stable'})),/内容不同/);assert.throws(()=>s.put('demo-a',activity({source:'ocr_mock'})),/重复/);s.put('demo-a',activity({durationSec:400,imageHash:'a'.repeat(64)}));assert.throws(()=>s.put('demo-a',activity({durationSec:500,imageHash:'a'.repeat(64)})),/重复/);});
test('private ownership, default group consent, revocation and tied ranks',()=>{const s=setup(),a=s.put('demo-a',activity()),b=s.put('demo-b',activity());assert.throws(()=>s.own('demo-b',a.id),/不存在/);assert.throws(()=>s.remove('demo-b',a.id));const g=s.createGroup('demo-a','虚构群');assert.throws(()=>s.group('demo-b',g.id),/成员/);s.join('demo-b',g.invite);assert.equal(s.group('demo-a',g.id).leaderboard.length,0);for(const u of ['demo-a','demo-b'])s.permission(u,g.id,true);let v=s.group('demo-a',g.id);assert.deepEqual(v.leaderboard.map(x=>x.rank),[1,1]);assert.equal(v.feed.length,0);s.put('demo-a',activity({revision:1,visibility:'groups'}),a.id);assert.equal(s.group('demo-b',g.id).feed.length,1);s.permission('demo-a',g.id,false);assert.equal(s.group('demo-b',g.id).feed.length,0);s.leave('demo-b',g.id);assert.throws(()=>s.group('demo-b',g.id));s.join('demo-b',g.invite);assert.equal(s.group('demo-b',g.id).sharing,false);});
test('Somaxis scope, explicit consent and unlink immediate denial',()=>{const s=setup();assert.throws(()=>s.coachStats('fictional-coach-001','fictional-member-001'));assert.throws(()=>s.link('demo-a','DEMO-MEMBER-001',false));s.link('demo-a','DEMO-MEMBER-001',true);assert.throws(()=>s.coachStats('another-coach','fictional-member-001'));assert.equal(s.coachStats('fictional-coach-001','fictional-member-001').recent,0);s.unlink('demo-a');assert.throws(()=>s.coachStats('fictional-coach-001','fictional-member-001'));});
test('leaderboard: weekly loops, month/year periods, streak, totals, badges and opt-in',()=>{
 const s=setup();
 for(const k of ['projects','water_entries','body_metrics'])s.db[k]||=[];
 for(const u of s.db.users){u.createdAt='2025-12-01T08:00:00Z';u.difficulty='easy';} // 去年 12 月注册，钟停在 2026-10-25（周日）；新手档 = 150 分钟 / 5 天 / 2 次
 const g=s.createGroup('demo-a','虚构小组');s.join('demo-b',g.invite); // 榜的圈子 = 自己 + 小组成员
 const hyd={id:'h1',userId:'demo-a',kind:'hydration',hydration:{weightKg:60,coefficient:35,targetMl:2100}};
 s.db.projects.push(hyd);
 s.db.projects.push({id:'r1',userId:'demo-a',kind:'resistance',goal:{period:'weekly',target:3},progress:{days:['2026-10-19','2026-10-21','2026-10-23']}});
 const waterOn=(uid,pid,d)=>s.db.water_entries.push({id:'w'+uid+d,projectId:pid,userId:uid,date:d,amountMl:2100});
 // 本周（10-19 周一开局）：饮水 6 天达标 + 有氧 6×25=150 分钟 + 力量 3 次 → 周闭环
 for(let d=19;d<=24;d++){const dd='2026-10-'+d;waterOn('demo-a','h1',dd);s.put('demo-a',activity({occurredAt:dd+'T01:00:00Z',durationSec:1500,distanceM:0,type:'ball'}));}
 s.put('demo-a',activity({occurredAt:'2026-10-25T01:00:00Z',durationSec:600,distanceM:0,type:'ball'})); // 今天补 10 分钟，凑不足 20 分钟的日环但不影响周闭环
 s.setLeaderboardOptIn('demo-a',true);
 // demo-b：有氧、饮水都够，但力量只有 1 次 → 周闭环不成立
 s.db.projects.push({...hyd,id:'h2',userId:'demo-b'});
 s.db.projects.push({id:'r2',userId:'demo-b',kind:'resistance',goal:{period:'weekly',target:3},progress:{days:['2026-10-20']}});
 for(let d=19;d<=25;d++)waterOn('demo-b','h2','2026-10-'+d);
 s.put('demo-b',activity({occurredAt:'2026-10-25T01:00:00Z',durationSec:9000,distanceM:0,type:'ball'})); // 单次 150 分钟
 s.setLeaderboardOptIn('demo-b',true);
 const month=s.leaderboard('demo-a','month');
 assert.equal(month.optIn,true);
 const a=month.rate.find(r=>r.me),b=month.rate.find(r=>!r.me);
 assert.equal(a.closed,1);assert.equal(a.days,3);assert.equal(a.rate,33); // 10 月已过完的周：10-05 / 10-12 / 10-19
 assert.equal(a.streak,1);assert.equal(a.totalClosed,1);
 assert.equal(b.closed,0);assert.equal(b.rate,0);assert.equal(b.streak,0);
 assert.deepEqual(month.rate.map(r=>r.userId),['demo-a','demo-b']);
 const bOf=s.badgesOf('demo-a');
 assert.deepEqual(bOf.badges.find(x=>x.month==='2026-10'),{month:'2026-10',label:'10月',weeks:4,closed:1,done:false});
 assert.equal(bOf.badges.length,12);
 const year=s.leaderboard('demo-a','year');
 assert.equal(year.rate.find(r=>r.me).days,42);  // 2026-01-05 到 10-19 的已过完周一
 assert.equal(year.rate.find(r=>r.me).rate,2);   // 1/42
 assert.deepEqual(month.totals.map(r=>r.userId),['demo-a','demo-b']);
 // 未参与的人不上榜，但自己那行始终返回
 s.setLeaderboardOptIn('demo-b',false);
 const onlyA=s.leaderboard('demo-a','month');
 assert.deepEqual(onlyA.rate.map(r=>r.userId),['demo-a']);
 assert.equal(onlyA.totals.length,1);
 const fromB=s.leaderboard('demo-b','month');
 assert.equal(fromB.optIn,false);
 assert.equal(fromB.self.me,true);
 assert.throws(()=>s.leaderboard('demo-a','week'),/周期无效/);
 assert.throws(()=>s.leaderboard('demo-a','decade'),/周期无效/);
 assert.throws(()=>s.setLeaderboardOptIn('demo-a','yes'),/开关无效/);
});
test('monthly badge lights up when every week of the month is closed',()=>{
 const db=seed();for(const k of ['projects','water_entries'])db[k]=db[k]||[];
 for(const u of db.users)u.difficulty='easy'; // 新手档：每周 150 分钟 / 饮水 5 天 / 力量 2 次
 const s=new Service(db,()=>{},()=>'2026-11-08T10:00:00Z'); // 周日，10 月已完整过完
 db.projects.push({id:'h1',userId:'demo-a',kind:'hydration',hydration:{weightKg:60,coefficient:35,targetMl:2100}});
 db.projects.push({id:'r1',userId:'demo-a',kind:'resistance',goal:{period:'weekly',target:3},progress:{days:[]}});
 const ball={type:'ball',distanceM:0,durationSec:9000,occurredAt:'',timeZone:'Asia/Shanghai',visibility:'private',confirmed:true};
 for(const m of ['2026-10-05','2026-10-12','2026-10-19','2026-10-26']){ // 10 月 4 个周一开局周，每周都闭环
  for(let i=0;i<3;i++)db.projects.find(p=>p.id==='r1').progress.days.push(shift(m,i));
  for(let i=0;i<5;i++)db.water_entries.push({id:'w'+m+i,projectId:'h1',userId:'demo-a',date:shift(m,i),amountMl:2100});
  s.put('demo-a',{...ball,occurredAt:m+'T01:00:00Z'});
 }
 s.setLeaderboardOptIn('demo-a',true);
 const month=s.leaderboard('demo-a','month');
 assert.equal(month.badges,undefined); // 奖章不在排行榜接口里，独立走 /badges
 const bOf=s.badgesOf('demo-a');
 const oct=bOf.badges.find(x=>x.month==='2026-10');
 assert.deepEqual(oct,{month:'2026-10',label:'10月',weeks:4,closed:4,done:true}); // 整月每周闭环 → 奖章点亮
 const nov=bOf.badges.find(x=>x.month==='2026-11');
 assert.equal(nov.done,false);assert.equal(nov.closed,0);
 const me=month.rate.find(r=>r.me);
 assert.equal(me.days,1);assert.equal(me.rate,0); // 11 月只过完一周（11-02–11-08），还没闭环
 assert.equal(me.streak,4);assert.equal(me.totalClosed,4); // 连续 4 周（10 月整月）
});
test('OCR confirm gate, success, failure, timeout and cleanup failure',async()=>{const bytes=Buffer.from('fictional');let r=await recognize(new MockOCR(),bytes);assert.equal(r.draft.confirmed,false);assert.ok(bytes.every(x=>x===0));await assert.rejects(recognize(new MockOCR(),Buffer.from('x'),{scenario:'failure'}),/失败/);await assert.rejects(recognize(new MockOCR(),Buffer.from('x'),{scenario:'timeout'},5),/超时/);let queued=false;await recognize({recognize:async()=>({}),cleanup:async()=>{throw Error();}},Buffer.from('x'),{onCleanupFailure:()=>queued=true});assert.equal(queued,true);});
test('import interface unit normalization and revoked consent',()=>{const x={...activity(),id:'external-1',distance:1,unit:'mi'};const consent={provider:'strava',scope:'activities:read'};assert.equal(normalizeImport('strava',x,consent).distanceM,1610);assert.throws(()=>normalizeImport('strava',x,{...consent,revoked:true}));});
test('duration-based cardio and incline save without distance and recalculate after edits',()=>{const s=setup();const a=s.put('demo-a',activity({type:'incline',distanceM:0,durationSec:1199}));assert.equal(s.summary('demo-a').monthly,1,'爬坡只填时长（1199s）即记为有效日');s.put('demo-a',activity({type:'incline',distanceM:0,durationSec:1200,revision:1}),a.id);assert.equal(s.summary('demo-a').monthly,1,'同天编辑不重复');s.put('demo-a',activity({type:'cardio',distanceM:0,durationSec:1800,occurredAt:'2026-10-24T01:00:00Z'}));assert.equal(s.summary('demo-a').monthly,2);assert.deepEqual(metric({type:'cardio',durationSec:1800,distanceM:0}),{value:30,unit:'分钟'});
  // 距离现在可选：只有时长的跑步也能存（旧规则要求跑步必须带距离，已放开）
  assert.equal(s.put('demo-a',activity({type:'running',distanceM:0})).distanceM,0);
  // 但时长缺失仍不许存
  assert.throws(()=>s.put('demo-a',activity({type:'running',distanceM:0,durationSec:0})),/时长须为/);});

test('每日圆环可自己配：想放几项放几项，去重 + 只能选自己的类别',()=>{
  const s=setup();
  s.db.categories=[{id:'c1',userId:'demo-a',name:'冥想'},{id:'c2',userId:'demo-b',name:'别人的习惯'}];
  assert.deepEqual(s.validateRingConfig('demo-a',['water','cardio','cat:c1']),['water','cardio','cat:c1']);
  assert.deepEqual(s.validateRingConfig('demo-a',['water']),['water'],'只留一项也行');
  assert.deepEqual(s.validateRingConfig('demo-a',['cardio','body']),['cardio','body'],'饮水可以去掉');
  assert.deepEqual(s.validateRingConfig('demo-a',[]),[],'全隐藏也可以');
  assert.throws(()=>s.validateRingConfig('demo-a',['water','cardio','dancing']),/不存在/);
  assert.throws(()=>s.validateRingConfig('demo-a',['water','cardio','cat:nope']),/不存在/);
  assert.throws(()=>s.validateRingConfig('demo-a',['water','cardio','cardio']),/两个圈/);
  assert.throws(()=>s.validateRingConfig('demo-a',['water','cardio','cat:c2']),/不存在/,'别人的类别不能选');
  assert.throws(()=>s.validateRingConfig('demo-a','water'),/无效/);
  assert.throws(()=>s.validateRingConfig('nobody',['water']),/未登录/);
});

// 云函数包漏拷共享模块会让线上 require 直接崩（本地跑测试发现不了），这里做静态体检
test('云函数包带上 server 代码依赖的全部共享模块',()=>{
  const fs=require('node:fs'),path=require('node:path');
  const root=path.join(__dirname,'..');
  const build=fs.readFileSync(path.join(root,'scripts/build-cloud.js'),'utf8');
  const need=new Set();
  for(const f of fs.readdirSync(path.join(root,'server'))){
    if(!f.endsWith('.js'))continue;
    const src=fs.readFileSync(path.join(root,'server',f),'utf8');
    for(const m of src.matchAll(/require\('(\.\.\/miniprogram\/[^']+)'\)/g))need.add(m[1]);
  }
  assert.ok(need.size>=3,'至少应依赖 sports / guidelines / rings');
  for(const rel of need){
    const file=rel.replace(/^\.\.\//,'')+'.js'; // ../miniprogram/utils/sports → miniprogram/utils/sports.js
    assert.ok(build.includes("'"+file+"'"),`build-cloud 漏拷 ${file}`);
  }
  const pkg=path.join(root,'cloudfunctions/somactiveApi');
  assert.equal(typeof require(pkg+'/server/domain').Service,'function','云函数包里的 domain.js 必须能加载');
});

test('圈子：建圈子不用起名，今日有氧榜按分钟/公里排序，动态可点赞',()=>{
  const s=setup();
  for(const k of ['projects','water_entries','body_metrics','likes'])s.db[k]||=[];
  const g=s.createGroup('demo-a');                 // 不传名字
  assert.equal(g.name,'我的圈子');
  s.join('demo-b',g.invite);
  s.setLeaderboardOptIn('demo-a',true);s.setLeaderboardOptIn('demo-b',true);
  const a=s.put('demo-a',activity({distanceM:5000,durationSec:1800}));                       // 30 分钟 5km
  const b=s.put('demo-b',activity({type:'ball',distanceM:0,durationSec:1200,visibility:'groups'})); // 20 分钟、无距离
  const byMin=s.board('demo-a','minutes');
  assert.equal(byMin.memberCount,2);
  assert.deepEqual(byMin.rows.map(r=>r.userId),['demo-a','demo-b']);
  assert.equal(byMin.rows[0].minutes,30);
  assert.equal(byMin.rows[1].km,0,'球类没有距离');
  const byKm=s.board('demo-a','km');
  assert.deepEqual(byKm.rows.map(r=>r.userId),['demo-a','demo-b']);
  assert.equal(byKm.rows[0].km,5);
  // 动态只收「小组可见」的打卡
  assert.deepEqual(byMin.feed.map(f=>f.id),[b.id]);
  assert.equal(byMin.feed[0].label,'球类');
  // 点赞：可以来回切，计数跟着变
  assert.deepEqual(s.toggleLike('demo-a',b.id),{activityId:b.id,likes:1,liked:true});
  assert.equal(s.board('demo-a','minutes').feed[0].liked,true);
  assert.deepEqual(s.toggleLike('demo-a',b.id),{activityId:b.id,likes:0,liked:false});
  assert.throws(()=>s.toggleLike('demo-a',a.id),/不能给自己点赞/); // a 是自己且是私密记录
  assert.throws(()=>s.toggleLike('demo-b',a.id),/无权查看/);        // 私密记录圈内也看不到
  assert.throws(()=>s.board('demo-a','decade'),/排序无效/);
  // 未参与的人不上榜，但自己那行始终返回
  s.setLeaderboardOptIn('demo-b',false);
  const onlyA=s.board('demo-a','minutes');
  assert.deepEqual(onlyA.rows.map(r=>r.userId),['demo-a']);
  assert.equal(onlyA.self.me,true);
});
