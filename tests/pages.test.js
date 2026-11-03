const {test}=require('node:test');
const {TOKENS}=require('../miniprogram/utils/tokens');const assert=require('node:assert/strict');const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
function page(name,{api=async()=>{},globalData={},wx={}}={}){let definition;const app={globalData};const ctx={Page:p=>definition=p,getApp:()=>app,require:(id)=>id.includes('guidelines')?require('../miniprogram/utils/guidelines'):id.includes('hydration')?require('../miniprogram/utils/hydration'):id.includes('sports')?require('../miniprogram/utils/sports'):id.includes('report')?require('../miniprogram/utils/report'):id.includes('sharecard-paint')?require('../miniprogram/utils/sharecard-paint'):id.includes('canvas-export')?require('../miniprogram/utils/canvas-export'):id.includes('rings')?require('../miniprogram/utils/rings'):id.includes('badges')?require('../miniprogram/utils/badges'):id.includes('bodyseries')?require('../miniprogram/utils/bodyseries'):id.includes('speech')?{play:id=>{(app.spoken=app.spoken||[]).push(id);return true;},stop(){},has:id=>!!id,hasLine:(id,i)=>!!id&&i>=0&&i<3,playLine:(id,i)=>{(app.spoken=app.spoken||[]).push(id+'-s'+i);return true;}}:id.includes('tokens')?require('../miniprogram/utils/tokens'):id.includes('arcs')?require('../miniprogram/utils/arcs'):id.includes('swipe')?require('../miniprogram/utils/swipe'):id.includes('palette')?require('../miniprogram/utils/palette'):id.includes('reflections')?{pick:()=>({text:'测试语录',author:'测试作者',kind:'inspired'})}:id.includes('tip')?require('../miniprogram/utils/tip'):id.includes('cycles')?require('../miniprogram/utils/cycles'):id.includes('pixel-avatars')?require('../miniprogram/data/pixel-avatars'):({api,login:async()=>{},error:()=>{},change:()=>{app.globalData.dirty=true;}}),wx,getCurrentPages:wx.getCurrentPages||(()=>[{},{}]),Date,Math,Number,String,Promise,Error,setTimeout,clearTimeout,console};vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../miniprogram/pages',name,name+'.js'),'utf8'),ctx);const p={...definition,data:JSON.parse(JSON.stringify(definition.data)),setData(x){for(const [key,value] of Object.entries(x)){const keys=key.split('.');let obj=this.data;for(const k of keys.slice(0,-1))obj=obj[k];obj[keys.at(-1)]=value;}}};return {p,app};}
test('home onShow cache avoids repeated reads and invalidates after changes',async()=>{let calls=0;const home={user:{timeZone:'Asia/Shanghai'},stats:{month:'2026-10',days:['2026-10-01']},activities:[],groups:[]};const {p,app}=page('home',{api:async()=>{calls++;return home;},globalData:{token:'local',dirty:true}});p.data.month='2026-10';await p.onShow();await p.onShow();assert.equal(calls,1);assert.equal(p.data.cells.filter(c=>c.active).length,1);app.globalData.dirty=true;await p.onShow();assert.equal(calls,2);});
test('冷启动先用本地缓存秒出首页，再在背后联网刷新（不再卡「正在连接」）',async()=>{
  let calls=0;
  const home={user:{timeZone:'Asia/Shanghai'},stats:{month:'2026-10',days:['2026-10-01']},activities:[],habits:{categories:[],projects:[],achievements:{badges:[]}},goals:{day:[],week:[]},water:null,body:{}};
  let stored=home;
  const {p}=page('home',{wx:{getStorageSync:k=>k==='somactive.homeCache'?stored:'',setStorageSync:(k,v)=>{if(k==='somactive.homeCache')stored=v;}},
    api:async()=>{calls++;return home;},globalData:{token:'local'}});
  p.data.month='2026-10';
  await p.onLoad();
  assert.equal(p.data.loaded,true,'缓存先渲染，跳过「正在连接」');
  assert.equal(calls,0,'onLoad 阶段不发任何请求');
  assert.equal(p.data.cells.filter(c=>c.active).length,1,'缓存数据真的画出来了');
  await p.onShow();
  assert.equal(calls,1,'onShow 照常联网刷新一次');
  assert.ok(stored,'最新数据回写本地缓存，供下次冷启动用');
});
test('record preview uses minutes and meters consistently',()=>{const {p}=page('record');
  p.data.form={type:'running',distance:'3',durationMin:'20'};p.preview();assert.equal(p.data.metric,'配速 6:40 /km');
  p.data.form={type:'cycling',distance:'10',durationMin:'30'};p.preview();assert.equal(p.data.metric,'20.00 km/h');
  p.data.form={type:'swimming',distance:'200',durationMin:'5'};p.preview();assert.equal(p.data.metric,'配速 2:30 /100m');
  // 低强度散步只要填了距离和时长，也照样算配速
  p.data.form={type:'walking',intensity:'low',distance:'5',durationMin:'50'};p.preview();assert.equal(p.data.metric,'配速 10:00 /km');
  // 只填时长：给出分钟数，并提示填距离会算配速
  p.data.form={type:'running',intensity:'moderate',distance:'',durationMin:'30'};p.preview();assert.equal(p.data.metric,'30 分钟 · 填了距离会算配速');
  // 啥都没填：只催时长
  p.data.form={type:'running',distance:'',durationMin:''};p.preview();assert.equal(p.data.metric,'请填写运动时长');
});
test('achievements page builds the 12-month badge wall, calendar and milestone groups',async()=>{
 const {p}=page('achievements',{api:async(path)=>{
  if(path==='/badges')return {badges:[{month:'2026-10',label:'10月',weeks:4,closed:4,done:true},{month:'2026-11',label:'11月',weeks:4,closed:1,done:false}]};
  return {habits:{today:'2026-10-28',summary:{days:['2026-10-01','2026-10-02'],total:2,longest:2},projects:[],
    achievements:{badges:[
      {id:'first',label:'第一次记录',earned:true,progress:1,target:1,note:''},
      {id:'days-10',label:'累计记录 10 天',earned:false,progress:3,target:10,note:''},
      {id:'streak-cardio-30',label:'心肺连续 30 天',earned:true,progress:30,target:30,note:''},
      {id:'streak-water-7',label:'饮水连续 7 天',earned:false,progress:2,target:7,note:''}
    ],closedDays:['2026-10-01','2026-10-02'],closedWeeks:['2026-10-26']}}};
 }});
 await p.load();
 assert.equal(p.data.wall.length,2,'wall 来自 /badges');
 assert.equal(p.data.wall[0].state,'lit','整月闭环 → 点亮');
 assert.ok(/^#[0-9A-Fa-f]{6}$/.test(p.data.wall[0].color),'每月一个颜色');
 assert.equal(p.data.wall[1].state,'progress','部分周闭环 → 进度环');
 assert.equal(p.data.litCount,1);
 assert.equal(p.data.wall[0].lit,true,'整月闭环 → 点亮');
 assert.equal(p.data.wall[0].showNum,false,'点亮的那个月画勾，不再显示月份数字');
 assert.equal(p.data.wall[1].showNum,true,'没点亮还是显示月份数字');
 // 默认展开当前月，能拿到日历
 assert.equal(p.data.openMonth,'2026-10');
 assert.ok(p.data.cal&&p.data.cal.weeks.length>=4,'展开当月日历');
 // 里程碑按模块归类：记录(2) / 心肺(1) / 饮水(1)
 const byKey=Object.fromEntries(p.data.milestones.map(g=>[g.key,g]));
 assert.equal(byKey.record.total,2);
 assert.equal(byKey.record.earned,1);
 assert.equal(byKey.cardio.total,1);
 assert.equal(byKey.cardio.earned,1);
 assert.equal(byKey.water.total,1);
 assert.equal(byKey.water.earned,0);
 // 展开/收起独立
 p.toggleGroup({currentTarget:{dataset:{key:'record'}}});
 assert.equal(p.data.milestones.find(g=>g.key==='record').open,true);
 p.toggleGroup({currentTarget:{dataset:{key:'record'}}});
 assert.equal(p.data.milestones.find(g=>g.key==='record').open,false);
 // 点月徽章切换展开
 p.toggleMonth({currentTarget:{dataset:{month:'2026-11'}}});
 assert.equal(p.data.openMonth,'2026-11');
 assert.equal(p.data.wall[1].selected,true);
 p.toggleMonth({currentTarget:{dataset:{month:'2026-11'}}});
 assert.equal(p.data.openMonth,null);
 const wxml=require('fs').readFileSync('miniprogram/pages/achievements/achievements.wxml','utf8');
 assert.ok(wxml.includes('2026 年度徽章')&&wxml.includes('badge-grid'),'有 12 月徽章墙');
 // 版式：点亮的那个月换成当月色的勾（不再是数字）、日历周日起头、统计行跟词库页同一套（数字在上、标签在下）
 assert.ok(wxml.includes('badge-check')&&wxml.includes('badge-cap'),'点亮月 = 当月色的勾 + 「已点亮」小字');
 assert.ok(wxml.includes("'日','一','二','三','四','五','六'"),'日历周日起头');
 assert.ok(wxml.indexOf('stat-num')<wxml.indexOf('stat-label'),'统计卡：数字在上、标签在下');
 assert.ok(wxml.includes('里程碑'),'有里程碑折叠');
 assert.ok(!wxml.includes('🍂'),'没有 emoji');
 assert.ok(!wxml.includes('月度成就'),'旧的「月度成就」卡片已移除');
});
test('WeChat adapter hides session key and fails without configuration',async()=>{const {exchangeCode}=require('../server/wechat-identity');await assert.rejects(exchangeCode('test'),/未配置/);const r=await exchangeCode('test',{appId:'fictional-app',secret:'fake-secret',fetchImpl:async()=>({ok:true,json:async()=>({openid:'fake-openid',session_key:'not-for-client'})})});assert.equal(r.subject,'fake-openid');assert.equal(r.session_key,undefined);});

 test('editing omitted optional values preserves null and exact instant',async()=>{let saved;const {p}=page('record',{api:async(path,method,body)=>{saved=body;},wx:{navigateBack:()=>{}}});p.id='record-1';const original={type:'running',distanceM:3000,durationSec:1200,occurredAt:'2026-10-24T16:30:45Z',timeZone:'Asia/Shanghai',visibility:'private',source:'manual',revision:1,heartRate:null,cadence:null,stroke:null};p.fill(original);assert.equal(p.data.form.heartRate,'');await p.save();assert.ok(saved);assert.equal(saved.heartRate,null);assert.equal(saved.cadence,null);assert.equal(new Date(saved.occurredAt).toISOString(),new Date(original.occurredAt).toISOString());require('../server/domain').validate(saved);});
 test('new record initializes local date and UTC offset on each entry',()=>{const {p}=page('record');p.data.form.date='2000-01-01';p.onLoad({});const f=p.data.form;const instant=new Date(f.date+'T'+f.time+f.offset).getTime();assert.ok(Math.abs(instant-(Date.now()-60000))<61000,'时间只显示到分钟，允许 60 秒内的取整误差');assert.equal(f.distance,'');});
test('member account requires explicit consent before binding and submits typed code',async()=>{let calls=0,body;const {p}=page('account',{api:async(path,method,data)=>{calls++;body=data;return {};}});p.load=async()=>{};await p.bind();assert.equal(calls,0);p.data.consent=true;p.data.code=' DEMO-MEMBER-001 ';await p.bind();assert.equal(calls,1);assert.equal(body.code,'DEMO-MEMBER-001');assert.equal(body.consent,true);});
test('member home has no operator switch and account is separate',()=>{const {p}=page('home');assert.equal(p.switchUser,undefined);assert.equal(p.bind,undefined);assert.equal(typeof p.account,'function');});
test('sport cards count unique qualified days and use member timezone',()=>{const activities=[{id:'a',type:'running',distanceM:1000,durationSec:300,occurredAt:'2026-09-30T20:00:00Z'},{id:'b',type:'running',distanceM:2000,durationSec:600,occurredAt:'2026-10-01T01:00:00Z'},{id:'c',type:'running',distanceM:500,durationSec:300,occurredAt:'2026-10-02T01:00:00Z'}];const {p}=page('home');p.data.month='2026-10';p.home={user:{timeZone:'Asia/Shanghai'},stats:{days:['2026-10-01']},activities};p.render();assert.equal(p.data.sports[0].days,2,'500m 但有 300s 时长也算有效日（上海时区下 9-30 20Z=10-01，10-01、10-02 共 2 天）');assert.equal(p.data.monthlySessions,3);assert.equal(p.data.cells.find(c=>c.n===1).count,2);assert.equal(p.data.cells[0].key,'b0');});
test('sport shortcut opens typed form without submitting check-in',()=>{let url;const {p}=page('home',{wx:{navigateTo:x=>url=x.url}});p.add({currentTarget:{dataset:{type:'swimming'}}});assert.equal(url,'/pages/record/record?type=swimming');const {p:form}=page('record');form.onLoad({type:'swimming'});assert.equal(form.data.form.type,'swimming');assert.equal(form.data.typeIndex,2);assert.equal(form.data.form.distance,'');});

test('home loads reflection with inspired attribution',()=>{const {p}=page('home');p.onLoad();assert.equal(p.data.quote,'测试语录');assert.equal(p.data.quoteCredit,'练习灵感 · 测试作者');});

test('ball form is duration-only: no distance/heart-rate fields and preview counts minutes',()=>{
 const {p}=page('record');
 p.onLoad({type:'ball'});
 assert.equal(p.data.form.type,'ball');
 assert.equal(p.data.durOnly,true);
 p.setData({'form.durationMin':'40'});
 p.preview();
 assert.equal(p.data.metric,'40 分钟');
 const wxml=require('fs').readFileSync('miniprogram/pages/record/record.wxml','utf8');
 assert.ok(/wx:if="\{\{form\.type==='running'\|\|form\.type==='cycling'\|\|form\.type==='swimming'\}\}" class="rec-pair"/.test(wxml),'球类没有步频/泳姿那行');
 assert.ok(/wx:if="\{\{showDistance\}\}" class="rec-metric"/.test(wxml),'球类/爬楼没有距离格（showDistance 由 record.js 算）');
 const {p:w}=page('record');
 w.onLoad({type:'walking'});
 assert.equal(w.data.durOnly,false);
});
test('cardio parent deduplicates days across child sports',()=>{const {p}=page('home');p.data.month='2026-10';p.home={user:{timeZone:'Asia/Shanghai'},stats:{days:['2026-10-01']},activities:[{id:'a',type:'running',distanceM:1000,durationSec:300,occurredAt:'2026-10-01T01:00:00Z'},{id:'b',type:'incline',distanceM:0,durationSec:1200,occurredAt:'2026-10-01T02:00:00Z'}]};p.render();assert.equal(p.data.cardio.days,1);assert.equal(p.data.sports.find(s=>s.type==='running').days,1);assert.equal(p.data.sports.find(s=>s.type==='incline').days,1);assert.equal(p.data.expanded,false);p.toggle();assert.equal(p.data.expanded,true);});
test('home adds default resistance and hydration without adding unused sports',()=>{const {p}=page('home');p.home={user:{timeZone:'Asia/Shanghai'},stats:{days:[]},activities:[],habits:{categories:[{id:'c',name:'阅读',projects:[{id:'p',name:'读书'},{id:'p2',name:'听书'}]}],projects:[],achievements:{badges:[]}}};p.render();assert.equal(p.data.categories.length,4,'饮水从分类里摘出来，单独一张卡放在体测下面');assert.ok(p.data.categories.some(c=>c.name==='抗阻训练'));assert.equal(p.data.categories.some(c=>c.name==='饮水'),false,'分类列表里不再重复出现饮水');assert.equal(p.data.water,null,'没建饮水项目就不显示那张卡');assert.equal(p.data.categories.some(c=>c.name==='游泳'),false);assert.equal(p.data.categories.find(c=>c.id==='c').open,false);p.category({currentTarget:{dataset:{id:'c'}}});assert.equal(p.data.categories.find(c=>c.id==='c').open,true);assert.equal(p.data.categories.find(c=>c.id==='c').projects.length,2);});
test('plus offers entry choices and category creation without directly saving',()=>{let menu,url;const {p}=page('home',{wx:{showActionSheet:x=>menu=x,navigateTo:x=>url=x.url}});p.add({currentTarget:{dataset:{}}});assert.equal(menu.itemList.length,3,'截图录入已隐藏：个人主体做不了微信认证，OCR 云调用不可用');assert.equal(menu.itemList.includes('截图录入'),false);menu.success({tapIndex:2});assert.equal(url,'/pages/create/create?newCategory=1&only=1');});
test('project creation sends name, colour and chosen annual goal',async()=>{const calls=[];let back=false;const {p}=page('create',{globalData:{home:{habits:{categories:[{id:'c',name:'学习'}]}}},api:async(path,method,body)=>{calls.push({path,method,body});return {id:'p'};},wx:{navigateBack:()=>back=true,reLaunch:()=>back=true,showToast:()=>{}}});await p.onLoad({categoryId:'c'});p.input({currentTarget:{dataset:{key:'name'}},detail:{value:'阅读'}});assert.equal(p.data.canSave,true);p.pickPeriod({currentTarget:{dataset:{key:'yearly'}}});p.data.target=100;await p.save();assert.equal(calls.length,1);assert.equal(calls[0].path,'/projects');assert.equal(calls[0].body.categoryId,'c');assert.equal(calls[0].body.name,'阅读');assert.equal(calls[0].body.goal.period,'yearly');assert.equal(calls[0].body.goal.target,100);assert.ok(calls[0].body.color);assert.equal(back,true);});
test('project selector supports more than six projects without hidden options',()=>{const projects=Array.from({length:10},(_,i)=>({id:'p'+i,name:'项目'+i,sportType:i%2?'running':null}));const {p}=page('select',{globalData:{home:{habits:{projects}}}});p.onLoad({});assert.equal(p.data.projects.length,10);p.onLoad({ocr:'1'});assert.equal(p.data.projects.length,5);});
test('hydration creation computes weight target and submits specialized kind',async()=>{let body;const {p}=page('create',{globalData:{home:{habits:{categories:[{id:'c',name:'健康'}]}}},api:async(path,method,data)=>{body=data;return {id:'p'};},wx:{navigateBack:()=>{},showToast:()=>{}}});await p.onLoad({categoryId:'c',preset:'hydration'});assert.equal(p.data.hydration,true);p.input({currentTarget:{dataset:{key:'weightKg'}},detail:{value:'60'}});assert.equal(p.data.targetMl,2100,'默认 35ml/kg 起步');p.pickCoefficient({detail:{value:2}});assert.equal(p.data.targetMl,2400);await p.save();assert.equal(body.kind,'hydration');assert.equal(body.hydration.weightKg,60);assert.equal(body.hydration.coefficient,40);assert.equal(body.goal,null,'饮水的每日目标走 /goals，项目上不再带周 7 次目标');});
test('resistance preset creates a confirmation-based project without a sport type',async()=>{let body;const {p}=page('create',{globalData:{home:{habits:{categories:[{id:'c',name:'训练'}]}}},api:async(path,method,data)=>{body=data;return {id:'p'};},wx:{navigateBack:()=>{},showToast:()=>{}}});await p.onLoad({categoryId:'c',preset:'resistance'});await p.save();assert.equal(body.kind,'resistance');assert.equal(body.name,'抗阻训练');assert.equal(body.sportType,undefined);assert.equal(body.goal.period,'weekly');});

// 右上角是微信胶囊菜单的地盘，保存键必须放底部，否则永远点不到
test('新建项目页把保存键放在底部，名字没填时是灰的',async()=>{
  const wxml=fs.readFileSync(path.join(__dirname,'../miniprogram/pages/create/create.wxml'),'utf8');
  assert.ok(/class="create-save"/.test(wxml),'底部有明确的保存按钮');
  assert.equal(/nb-save/.test(wxml),false,'右上角的 ✓ 已撤掉，不跟胶囊菜单抢位置');
  assert.ok(/disabled="\{\{busy\|\|!canSave\}\}"/.test(wxml),'没名字时按不动');
  const {p}=page('create',{globalData:{home:{habits:{categories:[{id:'c',name:'心肺训练'}]}}},wx:{showToast(){}}});
  await p.onLoad({categoryId:'c',preset:'cardio'});
  assert.equal(p.data.canSave,false);
  assert.ok(/color:#b0b0b0/.test(p.data.saveStyle),'没名字时保存键是灰的');
  p.input({currentTarget:{dataset:{key:'name'}},detail:{value:'跑步'}});
  assert.equal(p.data.canSave,true);
  assert.ok(/border-color:#/.test(p.data.saveStyle)&&!/color:#b0b0b0/.test(p.data.saveStyle),'起了名字就按项目色点亮');
  // 名称输入框不能因为全局 input 的内边距把卡片顶出屏幕
  const wxss=fs.readFileSync(path.join(__dirname,'../miniprogram/pages/create/create.wxss'),'utf8');
  assert.ok(/\.create-page \.proj-name[^{]*\{[^}]*box-sizing: border-box/.test(wxss),'名称输入框按 border-box 收边');
});

test('饮水单独一张卡：今天在最上，往回数 7 天',()=>{
  const {p}=page('home',{wx:{navigateTo:x=>{}}});
  // 日期按「上海今天」现算，别写死某一天（写死会在第二天变红）
  const today=new Date(Date.now()+8*3600*1000).toISOString().slice(0,10);
  const dayBefore=(n)=>new Date(Date.parse(today+'T00:00:00Z')-n*86400000).toISOString().slice(0,10);
  p.home={user:{timeZone:'Asia/Shanghai'},stats:{days:[]},activities:[],
    water:{projectId:'w',totalMl:600,targetMl:2100,remainingMl:1500,percent:28,achieved:false,cupMl:250,
      days:Array.from({length:7},(_,i)=>({date:dayBefore(i),totalMl:i?200:600,percent:i?9:28,achieved:false,isToday:i===0}))},
    habits:{categories:[{id:'c',name:'心肺训练',projects:[]}],projects:[],achievements:{badges:[]}}};
  p.render();
  assert.equal(p.data.categories.find(c=>c.id==='c').en,'CARDIO');
  assert.ok(p.data.water,'有饮水项目才有这张卡');
  assert.equal(p.data.water.color,TOKENS.water);
  assert.equal(p.data.water.days.length,7);
  assert.equal(p.data.water.days[0].isToday,true);
  assert.equal(p.data.water.days[0].label,'今天','倒序，今天在最上面');
  assert.equal(p.data.water.days[1].label,'昨天');
  // 进度只看右侧圆环（横向累计条已删）；单次可选上限不超过服务端的 2000ml
  assert.equal(p.data.water.fillPct,undefined,'横向累计条已删，fillPct 不再下发');
  assert.equal(p.data.water.cupMax,2000);
  // 心肺卡：点卡片主体直接进打卡（新行为），展开历史走三角 toggleCardExpand
  p.toggleCardExpand({currentTarget:{dataset:{id:'c'}}});
  assert.equal(p.data.openCategories['c'],true);
});

// 首页饮水：下面一条线只选「这一杯」的量，松手不写库；点水滴才记一笔（POST 累加语义）
test('首页饮水先选量、点水滴才记一笔，来回拖动不改坏已记的量',async()=>{
  let post=null;
  const {p}=page('home',{globalData:{dirty:false},wx:{showToast(){},vibrateShort(){},showModal(){}},
    api:async(path,method,body)=>{post={path,method,body};return {};}});
  p.today='2026-10-28';
  p.data.water={projectId:'w1',totalMl:600,targetMl:2100,cupMax:2000,revision:3,percent:28,remainingMl:1500,days:[]};
  p.load=async()=>{};
  p._dragging=true;p._sliderRect={left:0,width:200};
  p.waterDragTo(50); // 拖到 1/4 → 500ml
  assert.equal(p.data.waterChooseMl,500,'拖动选的是「这一杯」的量');
  assert.equal(p.data.waterDragMl,500);
  assert.equal(p.data.waterDragging,true,'拖动中浮出气泡');
  assert.equal(p.data.water.knobPct,25,'圆点跟着手指走');
  p.waterDragTo(30); // 又改主意了
  assert.equal(p.data.waterChooseMl,300);
  p.waterDragEnd();
  assert.equal(post,null,'松手不写库，等点水滴确认');
  assert.equal(p.data.waterDragging,false);
  await p.waterConfirm();
  assert.equal(post.path,'/projects/w1/water');
  assert.equal(post.method,'POST','水滴是「记一杯」的累加语义');
  assert.equal(post.body.amountMl,300);
  assert.equal(post.body.date,'2026-10-28');
  assert.equal(post.body.confirmed,true);
  assert.ok(post.body.requestId,'带请求 ID，重试不会记两次');
  // 量为 0 时点水滴不发请求（防误触记 0）
  p._dragging=true;p._sliderRect={left:0,width:200};
  p.waterDragTo(0);
  p.waterDragEnd();
  post=null;
  p.waterConfirm();
  assert.equal(post,null,'没选量时不发请求');
  assert.equal(p.data.waterChooseMl,0);
  p.toggleWater();
  assert.equal(p.data.waterOpen,true);
});

test('首页饮水清空走确认弹层，不靠滑块往回拨',async()=>{
  let modal=null,put=null;
  const {p}=page('home',{wx:{showModal:x=>{modal=x;},showToast(){},vibrateShort(){}},
    api:async(path,method,body)=>{put={path,method,body};return {};}});
  p.today='2026-10-28';
  p.data.water={projectId:'w1',totalMl:600,targetMl:2100,cupMax:2000,revision:3,percent:28,remainingMl:1500,days:[]};
  p.load=async()=>{};
  p.waterClearAll();
  assert.ok(modal,'清空要二次确认');
  modal.success({confirm:true});
  await new Promise(r=>setTimeout(r,0));
  assert.equal(put.method,'PUT','清空是「当日总量=0」');
  assert.equal(put.body.amountMl,0);
  assert.equal(put.body.revision,3);
});
test('water form saves the entered daily total using replacement semantics',async()=>{let request;const {p}=page('project',{api:async(path,method,body)=>{request={path,method,body};return {};},wx:{showToast:()=>{}}});p.id='water-project';p.data.project={kind:'hydration',waterVersions:{'2026-10-26':2}};p.data.date='2026-10-26';p.data.amountMl='2500';p.data.entryMode='total';p.load=async()=>{};await p.waterSave();assert.equal(request.method,'PUT');assert.equal(request.body.amountMl,2500);assert.equal(request.body.revision,2);assert.equal(request.path,'/projects/water-project/water');});

test('cardio card body goes straight to check-in; triangle expands history; resistance opens detail',()=>{
  let url;const {p}=page('home',{wx:{navigateTo:x=>url=x.url}});
  p.home={user:{timeZone:'Asia/Shanghai'},stats:{days:[]},activities:[],habits:{categories:[{id:'cardio',name:'心肺训练',projects:[{id:'run',kind:'sport'}]},{id:'strength',name:'抗阻训练',projects:[{id:'lift',kind:'resistance'}]}],projects:[],achievements:{badges:[]}}};
  p.render();
  // 点心肺卡片主体 → 直接进打卡（预填上次的项目），不就地展开
  p.category({currentTarget:{dataset:{id:'cardio'}}});
  assert.equal(url,'/pages/record/record?mode=cardio');
  assert.equal(p.data.categories.find(c=>c.id==='cardio').open,false);
  // 点三角 → 展开历史
  p.toggleCardExpand({currentTarget:{dataset:{id:'cardio'}}});
  assert.equal(p.data.categories.find(c=>c.id==='cardio').open,true);
  // 抗阻仍是点卡片进详情
  p.category({currentTarget:{dataset:{id:'strength'}}});
  assert.equal(url,'/pages/record/record?mode=strength');
  assert.equal(p.data.categories.find(c=>c.id==='strength').open,false);
  // 展开状态不因重渲染丢失
  p.home.habits.categories[0].projects.push({id:'swim',kind:'sport'});
  p.render();
  assert.equal(p.data.categories.find(c=>c.id==='cardio').open,true);
});

test('心肺展开历史：本周每条记录列出（明细构成，不重复周环已有汇总）',()=>{
  const today=new Date(Date.now()+8*3600*1000).toISOString().slice(0,10);
  const at=(h)=>today+'T'+String(h).padStart(2,'0')+':00:00Z';
  const {p}=page('home',{wx:{}});
  p.home={user:{timeZone:'Asia/Shanghai'},stats:{days:[]},
    activities:[
      {id:'a1',type:'running',occurredAt:at(9),durationSec:1800,intensity:'moderate'},
      {id:'a2',type:'walking',occurredAt:at(9),durationSec:1200,intensity:'low'},
      {id:'a3',type:'incline',occurredAt:at(10),durationSec:2400,intensity:'vigorous'}
    ],
    habits:{categories:[{id:'cardio',name:'心肺训练',projects:[]}],projects:[],achievements:{badges:[]}}};
  p.render();
  assert.ok(!p.data.cardioHistory,'本月/本周汇总块已移除（用户 10-30：周环上能看到，下拉不再重复）');
  const log=p.data.cardioWeekLog;
  assert.ok(log,'有 cardioWeekLog');
  assert.equal(log.length,3,'本周三条都在列表里');
  const byId=Object.fromEntries(log.map(r=>[r.id,r]));
  assert.equal(byId.a1.mins,'30','跑步 30 分钟');
  assert.equal(byId.a1.intLabel,'中等强度');
  assert.equal(byId.a2.mins,'20','步行 20 分钟');
  assert.equal(byId.a2.intLabel,'低强度 · 不计入');
  assert.equal(byId.a3.mins,'40','爬坡 40 分钟');
  assert.equal(byId.a3.intLabel,'高强度 · 按 2 倍计');
  assert.ok(byId.a1.when&&byId.a1.clock,'每条都带日期周几 + 发生时刻');
});
test('water addition adds a cup to saved total and correction pre-fills that total',async()=>{let body;const {p}=page('project',{api:async(path,method,data)=>{body=data;return {};},wx:{showToast:()=>{}}});p.id='water';p.data.project={kind:'hydration',waterVersions:{}};p.data.date='2026-10-26';p.data.water={totalMl:300};p.data.amountMl='300';p.load=async()=>{};await p.waterSave();assert.equal(body.amountMl,600);p.waterMode();assert.equal(p.data.entryMode,'total');assert.equal(p.data.amountMl,'300');});
test('category counter switches one of fifty to two percent without navigation',()=>{let navigated=false;const {p}=page('home',{wx:{navigateTo:()=>navigated=true}});const project={id:'p',kind:'resistance',goal:{period:'window',months:2,target:50},progress:{count:1,target:50,days:['2026-10-25']}};p.home={user:{timeZone:'Asia/Shanghai'},stats:{days:[]},activities:[],habits:{categories:[{id:'c',name:'抗阻训练',projects:[project]}],projects:[project],achievements:{badges:[]}}};p.data.month='2026-10';p.render();let c=p.data.categories.find(c=>c.id==='c');assert.equal(c.counterCount,1);assert.equal(c.counterPercent,2);p.toggleCounter({currentTarget:{dataset:{id:'c'}}});c=p.data.categories.find(c=>c.id==='c');assert.equal(c.counterPercentMode,true);assert.equal(c.counterFraction,'1 / 50');assert.equal(navigated,false);p.toggleCounter({currentTarget:{dataset:{id:'c'}}});assert.equal(p.data.categories.find(c=>c.id==='c').counterPercentMode,false);});
test('every WXML tag is balanced so the simulator can compile',()=>{const root=path.join(__dirname,'../miniprogram');const app=JSON.parse(fs.readFileSync(path.join(root,'app.json')));const files=[...app.pages.map(r=>path.join(root,r+'.wxml')),...fs.readdirSync(path.join(root,'components')).map(d=>path.join(root,'components',d,d+'.wxml'))];const VOID=new Set(['input','image','icon','switch','textarea']);for(const file of files){const source=fs.readFileSync(file,'utf8');const stack=[];const open=/<(\/?)([a-zA-Z][a-zA-Z0-9-]*)((?:"[^"]*"|'[^']*'|[^>"'])*?)(\/?)>/g;let m;while((m=open.exec(source))){const [,close,name,,selfClose]=m;if(selfClose==='/'||VOID.has(name))continue;if(close==='/'){assert.equal(stack.pop(),name,path.basename(file)+' has an unexpected closing </'+name+'>');}else stack.push(name);}assert.deepEqual(stack,[],path.basename(file)+' leaves unclosed tags');}});

test('home 体测点一下就收起，分享前自动收起且标题只带战报数字',()=>{
  const stored={};
  const {p}=page('home',{wx:{setStorageSync:(k,v)=>{stored[k]=v;}}});
  p.home={user:{timeZone:'Asia/Shanghai'},stats:{days:[]},activities:[{type:'running',occurredAt:new Date().toISOString(),durationSec:1800}],habits:{categories:[{id:'c',name:'心肺训练',projects:[{id:'run',name:'跑步',kind:'sport',todayRecordId:'r1'}]}],projects:[],achievements:{badges:[]}},goals:{today:'2026-10-28',weekStart:'2026-10-26',weekEnd:'2026-11-01',day:[{key:'water',label:'饮水',period:'daily',periodLabel:'今日',metric:'ml',unit:'ml',color:'#06B6D4',current:900,target:1800,recordOnly:false,closed:false,percent:50,hidden:false,valueText:'900/1800 ml',remainText:'还差 900 ml'}],week:[{key:'cardio',label:'心肺',period:'weekly',periodLabel:'本周',metric:'minutes',unit:'分钟',color:'#EF4444',current:45,target:90,recordOnly:false,closed:false,percent:50,hidden:false,valueText:'45/90 分钟',remainText:'还差 45 分钟'}],recordedToday:0}};
  p.render();
  assert.equal(p.data.bodyOpen,true);
  assert.ok(p.data.report);
  assert.equal(p.data.report.recorded,0,'goals 里今天还没记过（饮水 900ml 是历史进度演示数据，recordedToday=0）');
  p.toggleBody();
  assert.equal(p.data.bodyOpen,false);
  assert.equal(stored['somactive.bodyOpen'],false);
  p.toggleBody();
  assert.equal(p.data.bodyOpen,true);
  const share=p.onShareAppMessage();
  assert.equal(p.data.bodyOpen,false);
  assert.equal(share.path,'/pages/home/home');
  assert.match(share.title,/今日已记录 0 项|今天还没有记录/);
  assert.doesNotMatch(share.title,/kg|cm/);
  assert.equal(stored['somactive.bodyOpen'],false);
});

test('打卡后弹圆环：今日组与本周组各放各的，切换互不串',()=>{
  const {p}=page('home');
  p.home={user:{timeZone:'Asia/Shanghai'},stats:{days:[]},activities:[],habits:{categories:[],projects:[],achievements:{badges:[]}},goals:{today:'2026-10-28',weekStart:'2026-10-26',weekEnd:'2026-11-01',day:[{key:'water',label:'饮水',period:'daily',periodLabel:'今日',metric:'ml',unit:'ml',color:'#06B6D4',current:900,target:1800,recordOnly:false,closed:false,percent:50,hidden:false,valueText:'900/1800 ml',remainText:'还差 900 ml'}],week:[{key:'cardio',label:'心肺',period:'weekly',periodLabel:'本周',metric:'minutes',unit:'分钟',color:'#EF4444',current:45,target:90,recordOnly:false,closed:false,percent:50,hidden:false,valueText:'45/90 分钟',remainText:'还差 45 分钟'}],recordedToday:0}};
  p.render();
  assert.equal(p.data.ringView,'day');
  assert.equal(p.data.report.day,'10/28','日目标标题下的日期');
  assert.equal(p.data.weekLabel,'10/26 – 11/01','周目标标题下也有一行日期，日/周切换时卡片高度不跳');
  assert.deepEqual(p.data.ring.items.map(i=>i.key),['water']);
  const dayWater=p.data.ring.items[0];
  assert.equal(dayWater.target,1800);
  assert.equal(dayWater.periodLabel,'今日');
  p.switchRing({currentTarget:{dataset:{view:'week'}}});
  assert.equal(p.data.ringView,'week');
  assert.deepEqual(p.data.ring.items.map(i=>i.key),['cardio']);
  assert.equal(p.data.ring.items[0].target,90,'周有氧目标来自 /goals，与难度无关');
  assert.equal(p.data.ring.items[0].periodLabel,'本周');
  // 详情 sheet 已删（点开和没点开一个样，零信息增量）：点圆环在首页上浮出编辑器，不开新页面
  p.ringManage();
  assert.equal(p.data.ringEditor,true,'编辑器是首页内浮层，遮罩底下还是首页');
  const homeWxml=require('fs').readFileSync('miniprogram/pages/home/home.wxml','utf8');
  assert.ok(!homeWxml.includes('health-mask'),'旧详情 sheet 不许复活');
  assert.ok(homeWxml.includes('ring-editor'),'浮层编辑器挂在首页上');
  assert.ok(!homeWxml.includes('/pages/rings/rings'),'编辑器不再走 navigateTo，别再有侧滑转场');
  // 每日有氧档位条已删掉，目标只服从设置
  assert.doesNotMatch(homeWxml,/pickGear|今日有氧目标|data-gear/);
});

// 圆环编辑器是常驻组件（show 属性控显隐）：关掉再开视图不弹回日视图，
// 周视图里编辑/显隐一项，预览也跟着换成周环（用户 10-29）
test('圆环编辑器：周视图里编辑完回来还在周视图，预览是周环',async()=>{
  const goals={all:[
      {key:'cardio',label:'心肺',period:'weekly',periodLabel:'本周',color:'#D93B36',valueText:'0/150 等效分钟'},
      {key:'strength',label:'抗阻',period:'weekly',periodLabel:'本周',color:'#3D6EDC',valueText:'0/3 天'},
      {key:'water',label:'饮水',period:'daily',periodLabel:'今日',color:'#06B6D4',weekRule:5},
      {key:'english',label:'英语',period:'daily',periodLabel:'今日',color:'#A659C5',weekRule:7}],
    ringColors:{},
    day:[{key:'move',label:'运动',period:'daily',periodLabel:'今日',color:'#DF7A77',recordOnly:true,percent:0},
      {key:'water',label:'饮水',period:'daily',periodLabel:'今日',color:'#06B6D4',current:900,target:1800,percent:50},
      {key:'english',label:'英语',period:'daily',periodLabel:'今日',color:'#A659C5',current:0,target:10,percent:0}],
    week:[{key:'cardio',label:'心肺',period:'weekly',periodLabel:'每周',color:'#D93B36',current:0,target:150,percent:0},
      {key:'strength',label:'抗阻',period:'weekly',periodLabel:'每周',color:'#3D6EDC',current:0,target:3,percent:0},
      {key:'water',label:'饮水',period:'weekly',periodLabel:'每周',color:'#38B6C7',current:2,target:5,weekRule:true},
      {key:'english',label:'英语',period:'weekly',periodLabel:'每周',color:'#B77FD4',current:3,target:7,weekRule:true}]};
  let def;const ctx={Component:d=>def=d,
    require:id=>id.includes('tokens')?require('../miniprogram/utils/tokens'):id.includes('rings')?require('../miniprogram/utils/rings'):({api:async()=>goals,login:async()=>{},error:()=>{},change:()=>{}}),
    wx:{},getApp:()=>({globalData:{token:'local'}}),getCurrentPages:()=>[{},{}],setTimeout,clearTimeout,console};
  vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../miniprogram/components/ring-editor/ring-editor.js'),'utf8'),ctx);
  const ed={...def.methods,data:JSON.parse(JSON.stringify(def.data)),
    setData(x){Object.assign(this.data,x);},triggerEvent(){}};
  def.properties.show.observer.call(ed,true);await ed.load();
  assert.equal(ed.data.view,'day');
  assert.equal(ed.data.preview.length,3,'打开时预览是日环三圈（运动/饮水/英语）');
  // 首页点的是周环 → view 属性传 'week'，浮窗直接进周视图（没有日/周切换按钮了）
  def.properties.view.observer.call(ed,'week');
  assert.equal(ed.data.view,'week');
  assert.equal(ed.data.preview.length,3,'环固定三圈：周视图 4 项只画 3 圈');
  assert.equal(ed.data.weekItems.find(o=>o.key==='english').overflow,true,'第 4 项收进底部灰区，标「不占环」');
  assert.equal(ed.data.weekItems.find(o=>o.key==='cardio').overflow,false);
  assert.ok(!fs.readFileSync(path.join(__dirname,'../miniprogram/components/ring-editor/ring-editor.wxml'),'utf8').includes('seg-item'),'浮窗里不再放 DAILY/WEEKLY 切换');
  // 模拟从目标设置页回来：home onShow 调 refresh()，数据刷新但视图不弹回
  ed.refresh();await ed.load();
  assert.equal(ed.data.view,'week','回来还在周视图');
  assert.equal(ed.data.preview.length,3,'周环预览仍是三圈');
  // 周化身行也要有显示/隐藏按钮和编辑面板（原来被 !item.weekAvatar 排除掉）
  const wxml=fs.readFileSync(path.join(__dirname,'../miniprogram/components/ring-editor/ring-editor.wxml'),'utf8');
  assert.ok(wxml.includes('wx:if="{{!item.isMove}}"'),'周化身行也有显隐按钮');
  assert.ok(wxml.includes("editKey===item.key && item.period==='daily'"),'周化身行点编辑展开周规则面板');
});

test('没有 goals 数据时，周目标标题下的日期自己按周一起算，不留空行',()=>{
  const {p}=page('home');
  p.home={user:{timeZone:'Asia/Shanghai'},stats:{days:[]},activities:[],habits:{categories:[],projects:[],achievements:{badges:[]}}};
  p.render();
  assert.match(p.data.weekLabel,/^\d\d\/\d\d – \d\d\/\d\d$/,'拿不到服务端周区间也要有日期');
  const [a,b]=p.data.weekLabel.split(' – ');
  const y=+p.today.slice(0,4),ref=new Date(p.today+'T00:00:00Z');
  const parse=s=>{const [mm,dd]=s.split('/').map(Number);const d=new Date(Date.UTC(y,mm-1,dd));return d.getUTCMonth()<ref.getUTCMonth()-6?new Date(Date.UTC(y+1,mm-1,dd)):d;};
  const start=parse(a),end=parse(b);
  assert.equal((start.getUTCDay()+6)%7,0,'区间从周一开始');
  assert.equal(Math.round((end-start)/86400000),6,'到周日结束');
});

test('新手引导：三张卡讲完再逐项定目标，可以跳过，选完写到 /goals',async()=>{
  const calls=[];let navigated='';
  const {p,app}=page('onboard',{api:async(path,m,data)=>{
    calls.push([path,m,data]);return {};
  },wx:{setStorageSync(k,v){(app.stored=app.stored||{})[k]=v;},navigateBack(){navigated='back';},reLaunch(x){navigated=x.url;}}});
  assert.equal(p.data.step,0);
  assert.equal(p.data.cards.length,3);
  p.next();p.next();p.next();
  assert.equal(p.data.step,p.data.last,'最后一步是「想记哪些」');
  // 卡片由 components/goal-set 渲染并自己写库，页面只负责收尾
  let submitted=0;
  p.selectComponent=()=>({submitAll:async()=>{submitted++;return {saved:2};}});
  await p.start();
  assert.equal(submitted,1,'离开引导前要把选好的目标写进去');
  assert.equal(calls.filter(c=>c[0]==='/goals').length,0,'页面自己不再逐项发请求');
  assert.equal((app.stored||{})['somactive.onboarded'],'1');
  assert.equal(navigated,'back');
});

test('新手引导跳过：只跳过说明，仍要建账号和设目标',async()=>{
  const calls=[];let navigated='';
  const {p,app}=page('onboard',{api:async(path,m,data)=>{calls.push([path,m,data]);return {};},wx:{setStorageSync(k,v){(app.stored=app.stored||{})[k]=v;},navigateBack(){navigated='back';},reLaunch(x){navigated=x.url;}}});
  assert.equal(p.data.step,0);
  assert.equal(p.data.cards.length,3);
  await p.skip();
  assert.equal(calls.filter(c=>c[0]==='/goals').length,0,'跳过不写目标');
  assert.equal((app.stored||{})['somactive.onboarded'],undefined,'跳过说明不标记完成：仍要建账号+设目标');
  assert.equal(navigated,'','跳过说明不离开引导');
  assert.equal(p.data.step,p.data.last,'跳到「建账号+设目标」这一步');
});



test('引导卡是方块并居中：不再是铺满整屏的大横条',()=>{
  const fs=require('fs');
  const wxml=fs.readFileSync('miniprogram/pages/onboard/onboard.wxml','utf8');
  const wxss=fs.readFileSync('miniprogram/pages/onboard/onboard.wxss','utf8');
  assert.match(wxml,/class="ob-stage"/,'卡片内容单独一层，好居中');
  assert.match(wxml,/class="ob-card"/);
  const art=/\.ob-art\s*\{([^}]*)\}/.exec(wxss);
  assert.ok(art,'有插图样式');
  const w=/width:\s*(\d+)rpx/.exec(art[1]),h=/height:\s*(\d+)rpx/.exec(art[1]);
  assert.ok(w&&h,'插图宽高都要写死');
  assert.equal(w[1],h[1],'宽高相等 = 正方形');
  assert.ok(Number(w[1])<=260,'比原来的大横条小');
  assert.match(wxss,/justify-content:\s*center/,'整块内容居中');
});





test('分享改成「先出预览卡，再发送」：画布在屏幕上，不再藏到屏幕外',()=>{
  const {p}=page('home',{wx:{}});
  p.home={user:{timeZone:'Asia/Shanghai'},stats:{days:[]},activities:[{type:'running',occurredAt:new Date().toISOString(),durationSec:1800}],habits:{categories:[{id:'c',name:'心肺训练',projects:[{id:'run',name:'跑步',kind:'sport',todayRecordId:'r1'}]}],projects:[],achievements:{badges:[]}},goals:{today:'2026-10-28',weekStart:'2026-10-26',weekEnd:'2026-11-01',day:[{key:'water',label:'饮水',period:'daily',periodLabel:'今日',metric:'ml',unit:'ml',color:'#06B6D4',current:900,target:1800,recordOnly:false,closed:false,percent:50,hidden:false,valueText:'900/1800 ml',remainText:'还差 900 ml'}],week:[],recordedToday:1}};
  p.render();
  assert.ok(p.data.report.card,'战报里带着分享卡文案');
  assert.equal(p.data.shareOpen,false);
  p.openShare();
  assert.equal(p.data.shareOpen,true);
  assert.equal(p.data.shareImage,'');
  p.closeShare();
  assert.equal(p.data.shareOpen,false);
  const wxml=fs.readFileSync(path.join(__dirname,'../miniprogram/pages/home/home.wxml'),'utf8');
  assert.match(wxml,/class="share-mask"/);
  assert.match(wxml,/分享这张记录/);
  assert.equal((wxml.match(/open-type="share"/g)||[]).length,1,'只有预览弹层里的按钮触发分享');
  assert.doesNotMatch(wxml,/left: -2000px/);
});

test('社交已整体下线：圈子/排行榜页面、导航入口、打卡分享开关全部移除（2026-10-30）',()=>{
  const fs=require('fs');
  const appJson=JSON.parse(fs.readFileSync('miniprogram/app.json','utf8'));
  assert.ok(!appJson.pages.includes('pages/groups/groups'),'app.json 不再注册圈子页');
  assert.ok(!appJson.pages.includes('pages/leaderboard/leaderboard'),'app.json 不再注册排行榜页');
  assert.ok(!fs.existsSync('miniprogram/pages/groups'),'圈子页面目录已删');
  assert.ok(!fs.existsSync('miniprogram/pages/leaderboard'),'排行榜页面目录已删');
  const dock=fs.readFileSync('miniprogram/components/dock/dock.wxml','utf8');
  assert.ok(!dock.includes('圈子'),'底部导航不再有圈子');
  assert.ok(!dock.includes('social'),'导航不再依赖社交开关');
  const dockJs=fs.readFileSync('miniprogram/components/dock/dock.js','utf8');
  assert.ok(!dockJs.includes('tapGroups')&&!dockJs.includes('groups'),'dock 不再跳圈子');
  const rec=fs.readFileSync('miniprogram/pages/record/record.wxml','utf8');
  assert.ok(!rec.includes('圈子')&&!rec.includes('rec-switch'),'打卡页不再有「分享到圈子」');
  const acc=fs.readFileSync('miniprogram/pages/account/account.wxml','utf8');
  assert.ok(!acc.includes('排行榜')&&!acc.includes('social'),'设置页不再有排行榜开关');
  for(const f of ['miniprogram/pages/record/record.js','miniprogram/pages/account/account.js','miniprogram/components/dock/dock.js']){
    assert.ok(!fs.readFileSync(f,'utf8').includes('config/features'),f+' 不再引用社交开关');
  }
});

test('分享卡能存成图片：群里要的是一张图，不是小程序卡片',()=>{
 const saved=[],toasts=[];
 const {p}=page('home',{wx:{saveImageToPhotosAlbum:o=>{saved.push(o.filePath);o.success&&o.success();},showToast:t=>toasts.push(t.title)}});
 p.saveShare();
 assert.equal(saved.length,0,'图还没画完就别调相册');
 assert.match(toasts.at(-1),/还在生成/);
 p._shareImage='/tmp/card.png';
 p.saveShare();
 assert.equal(saved[0],'/tmp/card.png');
 assert.equal(toasts.at(-1),'已存到相册');
 const wxml=fs.readFileSync('miniprogram/pages/home/home.wxml','utf8');
 // 主路径：点分享直接在微信里发原图（不经过相册）；相册只留一行兜底小字
 assert.ok(wxml.includes('bindtap="shareNow"'),'分享入口直接发图');
 assert.ok(wxml.includes('bindtap="saveShare"'),'相册兜底入口还在');
 assert.ok(!wxml.includes('>存成图片<'),'不再主推存相册');
});

// 学习页：复习 / 学新词两块分开（用户 10-30）。复习走记忆曲线三键；
// 新词有自己的按钮（还没记住 / 认识了），第 3 次没记住可以放一放或放进待回忆。
test('学习页：复习 / 学新词两块分开，复习走三键，新词有自己的按钮和「放一放」',async()=>{
 const posts=[];
 const word=(id)=>({id,word:id,ipa:'/x/',pos:'n.',meaning:'释义·'+id,say:'Let us start here.',sayZh:'我们从这开始。',example:'example',translation:'例句',cat:'training',catLabel:'训练',stage:0,due:'2026-10-26',status:'learning'});
 const payload=()=>({date:'2026-10-26',plan:{dailyNew:3,freshToday:0,freshLeft:2,unseen:97,cats:null,scope:['daily','training','nutrition','mind'],defaultCats:['daily','training','nutrition','mind']},due:[word('squat')],fresh:[word('hinge'),word('lunge')],doneToday:1,stats:{learned:1,known:0,learning:1,due:1,total:100},tomorrow:2});
 const {p}=page('learn',{api:async(path,m,data)=>{
  if(path==='/learning/review'){posts.push([path,data]);return {...payload(),doneToday:2};}
  if(path==='/learning/settings'){posts.push([path,data]);return {dailyNew:data.dailyNew};}
  return payload();
 }});
 await p.onShow();
 assert.equal(p.data.mode,'review','先停在复习这一块');
 assert.equal(p.data.catLabel,'默认 · 日常4类','未设范围显示默认范围');
 assert.equal(p.data.word.id,'squat','复习队先出');
 assert.equal(p.data.reviewLeft,1,'复习 1 个');
 assert.equal(p.data.freshLeft,2,'新词 2 个，但不在复习队里');
 assert.equal(p.data.kindLabel,'复习');
 p.reveal();
 assert.equal(p.data.revealed,true);
 assert.equal(p.data.word.say,'Let us start here.','例句要一起发到前端');
 p.unreveal();
 assert.equal(p.data.revealed,false,'注解可以收起');
 // 复习：答错排回队尾（这一队里就它，所以还是它）
 await p.grade({currentTarget:{dataset:{grade:'again'}}});
 assert.equal(posts.at(-1)[0],'/learning/review');
 assert.equal(posts.at(-1)[1].wordId,'squat');
 assert.equal(posts.at(-1)[1].grade,'again');
 assert.equal(p.data.word.id,'squat','答错的排到队尾');
 await p.grade({currentTarget:{dataset:{grade:'good'}}});
 assert.equal(p.data.word,null,'复习队空了，出示复习完成卡');
 // 切到学新词：按钮是「还没记住 / 认识了」，不是复习那三键
 p.switchMode({currentTarget:{dataset:{mode:'fresh'}}});
 assert.equal(p.data.mode,'fresh');
 assert.equal(p.data.word.id,'hinge');
 assert.equal(p.data.kindLabel,'新词');
 await p.grade({currentTarget:{dataset:{grade:'good'}}});
 assert.equal(posts.at(-1)[1].grade,'good');
 assert.equal(p.data.word.id,'lunge','认识了就看下一个');
 await p.grade({currentTarget:{dataset:{grade:'again'}}});
 await p.grade({currentTarget:{dataset:{grade:'again'}}});
 await p.grade({currentTarget:{dataset:{grade:'again'}}});
 assert.equal(p.data.word.strikes,3,'第 3 次还没记住，给出放一放的选择');
 const wxml=fs.readFileSync('miniprogram/pages/learn/learn.wxml','utf8');
 assert.match(wxml,/learn-seg/,'复习 / 学新词 分段切换');
 assert.match(wxml,/还没记住/,'新词按钮不复用复习三键的「有点模糊」');
 assert.match(wxml,/认识了/);
 assert.match(wxml,/bindtap="parkWord"/,'三振之后可以放一放（待学）');
 assert.match(wxml,/bindtap="startCurve"/,'也可以放进待回忆开始按曲线复习');
 assert.ok(!wxml.includes('待过'),'不写「待过」这种生造词');
 assert.ok(!wxml.includes('每天新学'),'「每天新学」已挪到「我的 → 目标设置」');
 assert.match(wxml,/bindtap="unreveal"/,'展开后的注解要有收起');
 assert.match(wxml,/wx:for="{{word\.lines}}"/,'例句按数组渲染，2–4 句都能显示出来');
 assert.match(wxml,/\{\{seg\.t\}\}/,'每句英文按片段显示');
 assert.match(wxml,/\{\{item\.zh\}\}/,'每句都带中文');
 assert.match(wxml,/catchtap="openWord"/,'句里的词点得开');
 assert.ok(wxml.includes('class="word-peek" bindtap="reveal"'),'「看释义」收进卡片底部');
 assert.match(wxml,/\{\{sub\}\}/,'顶部副标题用算好的中文');
 const learnJs=fs.readFileSync('miniprogram/pages/learn/learn.js','utf8');
 assert.match(learnJs,/pages\/vocab\/vocab/,'学习页要能进词库');
});

// 词库三分类（用户 10-30）：未学 / 待回忆 / 已掌握。未学走分页轻量接口，待学的排前面。
test('我的词库页：三分类（待回忆/已掌握/未学），学过的词都能翻到',async()=>{
 let jumps=[];
 const cards=[
  {id:'squat',word:'squat',pos:'n./v.',meaning:'深蹲',say:'Let us start with the squat.',sayZh:'我们先从深蹲开始。',example:'Keep your chest up.',translation:'保持胸口挺起。',status:'learning',due:'2026-10-26',stage:1,no:1},
  {id:'hinge',word:'hinge',pos:'n./v.',meaning:'髋铰链',say:'Think hinge at the hips.',sayZh:'想的是髋往后折。',example:'A hinge, not a squat.',translation:'是折叠，不是深蹲。',status:'learning',due:'2026-11-02',stage:2,no:2},
  {id:'protein',word:'protein',pos:'n.',meaning:'蛋白质',say:'How much protein do you eat?',sayZh:'你一天吃多少蛋白质？',example:'Add protein to every meal.',translation:'每餐加点蛋白质。',status:'known',due:'2026-12-01',stage:8,no:66}
 ];
 const {p}=page('vocab',{api:async(path)=>{
  if(path.startsWith('/learning/new'))return {date:'2026-10-26',total:97,parkedCount:1,more:false,offset:0,limit:100,
    words:[{id:'alpha',word:'alpha',meaning:'阿法',pos:'n.',catLabel:'训练',no:900,parked:true},
           {id:'beta',word:'beta',meaning:'贝塔',pos:'n.',catLabel:'训练',no:901,parked:false}]};
  return {date:'2026-10-26',stats:{learned:3,known:1,learning:2,due:1,total:100},dueCount:1,cards};
 },wx:{reLaunch:o=>jumps.push(o.url)}});
 await p.onShow();
 assert.equal(p.data.filter,'review','默认停在待回忆');
 assert.deepEqual(p.data.list.map(c=>c.id),['squat','hinge'],'待回忆：没掌握的都在，到期的排前面');
 assert.equal(p.data.list[0].dueLabel,'今天','角标只留最短一行');
 assert.equal(p.data.list[0].state,'review');
 p.pickFilter({currentTarget:{dataset:{key:'mastered'}}});
 assert.deepEqual(p.data.list.map(c=>c.id),['protein'],'已掌握单独一档');
 p.pickFilter({currentTarget:{dataset:{key:'new'}}});
 await new Promise(r=>setTimeout(r,10));
 assert.deepEqual(p.data.list.map(c=>c.id),['alpha','beta'],'未学：待学的排前面');
 assert.equal(p.data.list[0].dueLabel,'待学');
 p.pickFilter({currentTarget:{dataset:{key:'review'}}});
 p.toggle({currentTarget:{dataset:{id:'hinge'}}});
 assert.equal(p.data.openId,'hinge','点一行展开例句');
 p.toggle({currentTarget:{dataset:{id:'hinge'}}});
 assert.equal(p.data.openId,'','再点收起');
 p.goLearn();
 assert.equal(jumps.at(-1),'/pages/learn/learn','复习入口回学习页排队');
 const wxml=fs.readFileSync('miniprogram/pages/vocab/vocab.wxml','utf8');
 assert.match(wxml,/wx:for="{{filters}}"/);
 assert.match(wxml,/vocab-more/,'未学词库能往下翻');
 assert.match(wxml,/bindtap="resetLearn"/,'词库页有「重新开始」的入口（清进度要先确认）');
 assert.match(wxml,/复习今天到期的/,'按钮要告诉你有几个到期');
 assert.match(wxml,/bindtap="toggle"/);
});

test('词库卡片模式：随机洗牌、左右滑都换下一个、点卡翻面',async()=>{
 const toasts=[];
 const cards=[
  {id:'squat',word:'squat',pos:'n./v.',meaning:'深蹲',ipa:'/skwɒt/',catLabel:'动作',say:'Let us start with the squat.',sayZh:'我们先从深蹲开始。',status:'learning',due:'2026-10-26',stage:1,no:1},
  {id:'hinge',word:'hinge',pos:'n./v.',meaning:'髋铰链',ipa:'/hɪndʒ/',catLabel:'动作',say:'Think hinge at the hips.',sayZh:'想的是髋往后折。',status:'learning',due:'2026-11-02',stage:2,no:2},
  {id:'protein',word:'protein',pos:'n.',meaning:'蛋白质',ipa:'/ˈprəʊtiːn/',catLabel:'营养',say:'How much protein do you eat?',sayZh:'你一天吃多少蛋白质？',status:'learning',due:'2026-12-01',stage:8,no:66},
  {id:'recovery',word:'recovery',pos:'n.',meaning:'恢复',ipa:'/rɪˈkʌvəri/',catLabel:'身体',say:'Sleep is when recovery happens.',sayZh:'睡眠的时候才恢复。',status:'learning',due:'2026-10-30',stage:0,no:7}
 ];
 const {p}=page('vocab',{api:async()=>({date:'2026-10-26',stats:{learned:4,known:1,learning:3,due:1,total:100},dueCount:1,cards}),
  wx:{reLaunch(){},showToast:o=>toasts.push(o.title),pageScrollTo(){}}});
 await p.onShow();
 p.openCards();
 assert.equal(p.data.view,'card');
 assert.equal(p.data.deckLen,4);
 assert.equal(p.data.flipped,false,'进来先只给词，释义自己点');
 assert.ok(cards.some(c=>c.id===p.data.card.id));
 assert.deepEqual(p._deck.slice().sort(),cards.map(c=>c.id).sort(),'洗牌不能漏词、不能多词');
 assert.equal(p.data.card.word,p._byId.get(p._deck[0]).word,'第一张就是洗好的第一张');

 // 点卡片翻面：释义和例句都在同一张上
 const first=p._byId.get(p._deck[0]);
 p.flip();
 assert.equal(p.data.flipped,true);
 assert.equal(p.data.card.meaning,first.meaning,'翻的是同一张卡，不许换词');
 assert.ok(p.data.card.lines.length<=2,'卡片只放前两句，别把整页例句塞进去');

 // 手指往左拉：卡片跟手左移，松手换下一个
 const put=(x,y=400)=>({touches:[{clientX:x,clientY:y}]});
 p.onCardStart(put(200));
 p.onCardMove(put(110));
 assert.ok(p.data.dx<0,'卡片跟着手指走，不是等松手才动');
 p.onCardEnd();
 await new Promise(r=>setTimeout(r,200));
 assert.equal(p.data.idx,1);
 assert.equal(p.data.flipped,false,'换词后重新盖住，不许直接剧透下一张');

 // 手指往右也一样换下一个（用户点名要「右滑切换单词」）
 p.onCardStart(put(100));
 p.onCardMove(put(200));
 assert.ok(p.data.dx>0);
 p.onCardEnd();
 await new Promise(r=>setTimeout(r,200));
 assert.equal(p.data.idx,2);

 // 拖不到阈值就弹回去，不能抖一下就换词
 p.onCardStart(put(200));
 p.onCardMove(put(170));
 p.onCardEnd();
 await new Promise(r=>setTimeout(r,200));
 assert.equal(p.data.idx,2);
 assert.equal(p.data.dx,0);

 // 竖着滑不算横滑，别抢滚动
 p.onCardStart(put(200,400));
 p.onCardMove(put(202,300));
 assert.equal(p.data.dx,0);
 p.onCardEnd();

 // 最后一张再往前：绕回第一张，并说一声
 p.showCard(3);
 p.step(1);
 await new Promise(r=>setTimeout(r,200));
 assert.equal(p.data.idx,0);
 assert.ok(toasts.includes('这一遍翻完了，从头再来'));

 // 箭头回退：第一张往前是最后一张
 p.prev();
 assert.equal(p.data.idx,3);

 // 从例句点去单词页再返回会再走一次 onShow：不能重新洗牌，得停在原来那张
 const staying=p.data.card.id;
 await p.onShow();
 assert.equal(p.data.idx,3,'翻到第几张就得留在第几张');
 assert.equal(p.data.card.id,staying,'刷新数据不等于重发牌');

 // 换一批：顺序重洗，张数不变
 p.reshuffle();
 assert.equal(p.data.idx,0);
 assert.equal(p.data.deckLen,4);
 assert.ok(toasts.includes('重新洗过了'));

 p.closeCards();
 assert.equal(p.data.view,'list','能回到列表');

 const wxml=fs.readFileSync('miniprogram/pages/vocab/vocab.wxml','utf8');
 assert.match(wxml,/bindtap="openCards"/,'列表顶部要有进卡片的入口');
 assert.match(wxml,/bindtouchmove="onCardMove"/);
 assert.match(wxml,/bindtap="flip"/);
 assert.match(wxml,/class="vmain"/,'词和释义要排在同一行，才叫紧凑');
});

test('例句排版：去掉「跟会员说」标签，两句同字号、英文粗中文细、居左',()=>{
 const learn=fs.readFileSync('miniprogram/pages/learn/learn.wxml','utf8');
 const wxss=fs.readFileSync('miniprogram/pages/learn/learn.wxss','utf8');
 assert.ok(!learn.includes('跟会员说'),'例句前面不写字');
 assert.ok(!wxss.includes('say-label'),'标签样式一并删掉');
 // 字号统一走字阶变量，这里比的是「同一个字阶」，等价于「字号一致」
 const size=cls=>{const m=wxss.match(new RegExp('\\.'+cls+' \\{([^}]*)\\}'));(assert.ok(m,cls+' 缺样式'));const f=m[1].match(/font-size:\s*(var\(--fs-[a-z]+\)|[\d.]+rpx)/);assert.ok(f,cls+' 缺 font-size');return f[1];};
 assert.equal(size('line-en'),size('line-zh'),'两个例句字号必须一致');
 assert.match(wxss,/\.line-en \{[^}]*font-weight: 650/,'英文粗');
 assert.match(wxss,/\.line-zh \{[^}]*font-weight: 400/,'中文细');
 assert.match(wxss,/\.word-card \{[^}]*text-align: left/,'整张卡居左，读例句才顺');
 assert.match(wxss,/\.line-en \{[^}]*text-align: left/);
 assert.match(learn,/word\.lines[\s\S]*item\.segs[\s\S]*seg\.t[\s\S]*item\.zh/,'例句按「句 → 片段」渲染，2–4 句都能显示');
 // 句里能点的词：紫色加下划线，跟整句同字号，不抢主语
 assert.match(wxss,/\.line-en \.wl \{[^}]*color: #A659C5/,'能点的词用英语紫');
 assert.match(wxss,/\.line-en \.wl \{[^}]*border-bottom/,'能点的词带下划线，看得出可点');
});

test('「目标设置」里只在一处设「每天几个词」，不跟学习页各设一遍',async()=>{
 const wxml=fs.readFileSync('miniprogram/pages/goals/goals.wxml','utf8');
 // 2026-10-29：这一页原来除了「英语」那张目标卡，还有一张「学习 · 每天新词」，
 // 等于把同一个数设了两遍；那张卡只改出词配额、不改英语目标，两边不一致时英语环永远闭不上。
 assert.ok(!wxml.includes('learn-goal'),'不再有第二张「每天新词」卡');
 assert.ok(!wxml.includes('chip-row'),'那排档位胶囊跟着一起删了');
 assert.ok(wxml.includes('goal-set'),'目标卡由 goal-set 渲染，跟新手引导共用');
 const js=fs.readFileSync('miniprogram/pages/goals/goals.js','utf8');
 assert.ok(!js.includes('/learning/settings'),'页面不再单独改配额，交给存英语目标时服务端对齐');
 const acc=fs.readFileSync('miniprogram/pages/account/account.wxml','utf8');
 assert.ok(!acc.includes('统计时区'),'时区不再让用户选');
 assert.ok(!acc.includes('Asia/Shanghai'),'时区选择器整个去掉');
 assert.ok(!acc.includes('我的词库'),'词库入口搬到学习页');
 assert.ok(!acc.includes('每天新词'),'「每天新词」不再单列，就是英语目标那个数');
 const learn=fs.readFileSync('miniprogram/pages/learn/learn.wxml','utf8');
 assert.match(learn,/我的词库/,'学习页有词库入口');
 assert.match(learn,/bindtap="openVocab"/);
 assert.ok(!learn.includes('我的 → 学习'),'文案指向目标设置');
});

test('底部导航：打卡 / 学习 / 看板 / 我的，四格均分；成就收进看板角标',()=>{
 const dock=require('fs').readFileSync('miniprogram/components/dock/dock.wxml','utf8');
 const labels=[...dock.matchAll(/aria-label="([^"]+)"/g)].map(m=>m[1]);
 assert.deepEqual(labels,['打卡','学习','看板','我的'],'圈子已下线，常驻四格');
 assert.ok(!dock.includes('成就'),'dock 里不再有成就格');
 const dockJs=require('fs').readFileSync('miniprogram/components/dock/dock.js','utf8');
 assert.match(dockJs,/cycle: '\/pages\/cycle\/cycle'/,'看板 tab 要能跳转');
 assert.match(dockJs,/tapBoard/,'中间那格叫看板');
 assert.ok(!dockJs.includes('tapAchievements'),'成就跳转方法已删');
 const wxss=require('fs').readFileSync('miniprogram/components/dock/dock.wxss','utf8');
 assert.match(wxss,/\.dock-slot \{[^}]*flex: 1 1 0/,'格子均分，不能写死宽度');
 const acc=require('fs').readFileSync('miniprogram/pages/account/account.wxml','utf8');
 assert.ok(!acc.includes('我的成就'),'我的页不重复放成就入口');
 // 成就的新家：看板页右上角角标 → 成就页；成就页自己不再高亮任何 tab
 const cyc=require('fs').readFileSync('miniprogram/pages/cycle/cycle.wxml','utf8');
 assert.match(cyc,/openAchievements/,'看板页要有成就角标');
 const cycJs=require('fs').readFileSync('miniprogram/pages/cycle/cycle.js','utf8');
 assert.match(cycJs,/openCoach[^}]*pages\/coach\/coach/,'教练端从看板角标进');
 assert.match(cyc,/openCoach/,'教练端角标只在教练身上出现');
 const ach=require('fs').readFileSync('miniprogram/pages/achievements/achievements.wxml','utf8');
 assert.match(ach,/<dock current=""\/>/,'成就页是二级页，不高亮 tab');
 const learn=require('fs').readFileSync('miniprogram/pages/learn/learn.wxml','utf8');
 assert.ok(learn.includes('记忆曲线')||learn.includes('第 1、2、4、7、15、30、60 天'));
});
test('只记录的项目（goal 为 null）不会让首页渲染崩掉',()=>{
  // 刚重置 / 刚注册的账号：默认项目都没有数值目标，渲染不能读 null.period
  const project={id:'p1',userId:'demo-a',categoryId:'c1',name:'跑步',kind:'sport',sportType:'running',goal:null,
    progress:{count:0,target:0,period:null,days:[],trail:[]},todayRecordId:null,todayCheckinId:null};
  const {p}=page('home');
  p.data.month='2026-10';
  p.home={user:{timeZone:'Asia/Shanghai'},stats:{days:[]},activities:[],
    habits:{categories:[{id:'c1',name:'心肺训练',water:null,projects:[project]}],projects:[project],achievements:{badges:[]}}};
  p.render();
  const c=p.data.categories.find(x=>x.id==='c1');
  assert.equal(c.counterHasGoal,false,'没有目标就不给完成率');
  assert.equal(c.counterPercent,null);
  assert.equal(c.counterCaption,'本月打卡天数');
});
test('公开版本不展示还没接通的 Somaxis 绑定卡',()=>{
  // 云端 /somaxis/* 一律 503；这张卡放进正式版，审核员点「授权并连接」就失败，
  // 会被判「功能不完整」。所以它必须由 demo 模式包住，测试码跟着一起隐藏。
  const acc=fs.readFileSync('miniprogram/pages/account/account.wxml','utf8');
  const gate=acc.indexOf('wx:if="{{demo}}" class="form-card"');
  assert.ok(gate>=0,'Somaxis 卡必须带 demo 开关');
  assert.ok(gate<acc.indexOf('>Somaxis</view>'),'开关要写在卡的开头（标题之前）');
  assert.ok(gate<acc.indexOf('DEMO-MEMBER-001'),'演示码在卡内，跟着一起隐藏');
});

// 首页末尾常驻「新的打卡项目」：改版后建新习惯的地方一度只剩底部 ＋ 的四项菜单，没人会去猜
test('首页末尾有常驻的「新的打卡项目」入口，一点直接进新建',()=>{
  const nav=[];
  const {p}=page('home',{wx:{navigateTo:o=>nav.push(o.url)}});
  p.addHabit();
  assert.equal(nav.pop(),'/pages/create/create');
  const wxml=fs.readFileSync('miniprogram/pages/home/home.wxml','utf8');
  assert.ok(wxml.includes('bindtap="addHabit"'),'入口要挂在页面上，不能只藏在底部 ＋ 的菜单里');
  assert.ok(wxml.includes('新的打卡项目'));
  assert.ok(!wxml.includes('点击 ＋，建立第一个打卡项目'),'空状态也别再让人去点 ＋');
});

// 2026-10-30 用户定：首页不再有「记一笔」这种统一入口——每一项都有自己那张卡，
// 单独点进去记就完了。这条守着「别哪天又长回来一个汇总入口」。
test('首页没有统一的记一笔入口：每一项从自己的卡片进',async()=>{
  const wxml=fs.readFileSync('miniprogram/pages/home/home.wxml','utf8');
  assert.ok(!wxml.includes('quickRecord'),'「记一笔」三宫格已删，别再挂回来');
  assert.ok(!wxml.includes('今天想记点什么'),'那块卡片的标题跟着一起删');
  assert.ok(!wxml.includes('只是走了走'),'散步的快捷入口跟着一起删');
  // 心肺/抗阻各自是一张分类卡，点卡片进自己那一页（category 只做跳转，不写库）
  assert.ok(wxml.includes('bindtap="category"'),'分类卡自己的入口要在');
  const js=fs.readFileSync('miniprogram/pages/home/home.js','utf8');
  assert.match(js,/category\s*\(/, 'category 处理函数要留着');
  const app=fs.readFileSync('miniprogram/app.wxss','utf8');
  assert.ok(!app.includes('.quick-card'),'.quick-card 样式随入口一起删掉');
});



// ---- 分享：点一下直接发图到群；不落相册、不落服务器，沙盒里只留一张 ----
function fakeCanvasWx(extra){
  const exported=[],menus=[];
  const ctx={font:'',fillStyle:'',strokeStyle:'',lineWidth:0,lineCap:'',textAlign:'',
    scale(){},save(){},restore(){},translate(){},fillRect(){},
    setTransform(){},clearRect(){},moveTo(){},lineTo(){},arcTo(){},closePath(){},clip(){},
    measureText:t=>({width:String(t).length*6}),
    fillText(){},strokeText(){},beginPath(){},arc(){},fill(){},stroke(){}};
  const node={width:0,height:0,getContext:()=>ctx};
  const wx=Object.assign({
    getWindowInfo:()=>({pixelRatio:3}),
    canvasToTempFilePath:o=>{exported.push(o);o.success({tempFilePath:'wxfile://tmp/share-'+exported.length+'.png'});},
    showShareImageMenu:o=>{menus.push(o.path);if(o.success)o.success();},
    // 预览面板里那张真 canvas：节点要等渲染完才拿得到，这里直接给
    createSelectorQuery:()=>({select:()=>({fields:()=>({exec:cb=>cb([{node,width:280,height:248}])})})})
  },extra||{});
  return {wx,exported,menus};
}
function sharePage(wx){
  const {p}=page('home',{globalData:{token:'local'},wx});
  p.data.report={today:'2026-10-28',card:{date:'2026-10-28',dateEn:'OCTOBER 28, 2026 · WEDNESDAY',
    rings:[{percent:60,color:'#06B6D4',soft:false}],
    facts:[{text:'心肺 105 / 150 分钟',color:'#D93B36'}],quote:'测试语录',factsText:'x'}};
  return p;
}
test('分享：先开预览面板把图画出来，再直接调起微信转发，发完把手画面板收掉',async()=>{
  const {wx,exported,menus}=fakeCanvasWx();
  const p=sharePage(wx);
  await p.sendShareImage();
  assert.equal(exported.length,1,'在可见 canvas 上画并导出（离屏 canvas 导出是纯白图，那条路已删）');
  assert.equal(menus.length,1,'点一下直接「发送给朋友」');
  assert.equal(menus[0],'wxfile://tmp/share-1.png');
  assert.equal(p.data.shareOpen,false,'发完不把面板留在屏幕上');
});
test('分享：内容没变就吃缓存，改了草稿才重画（沙盒里只留最新一张）',async()=>{
  const unlinked=[];
  const {wx,exported}=fakeCanvasWx({getFileSystemManager:()=>({unlink:o=>{unlinked.push(o.filePath);}})});
  const p=sharePage(wx);
  await p.openShare();
  assert.equal(p.data.shareImage,'wxfile://tmp/share-1.png','面板里直接能看到图');
  await p.openShare();
  assert.equal(exported.length,1,'同样的内容不重复画，直接吃上一次的缓存');
  assert.deepEqual(unlinked,[],'缓存命中的时候没有旧图要删');
  // 改了语录草稿：旧图作废，重画一张，旧临时图删掉
  p.editShareSummary({detail:{value:'换了句话'}});
  await p.generateShareImage();
  assert.equal(exported.length,2,'改了内容才重画');
  assert.deepEqual(unlinked,['wxfile://tmp/share-1.png'],'只删上一张，当前这张保留');
  assert.equal(p._shareImage,'wxfile://tmp/share-2.png');
});
test('分享：环境不支持发图时停在面板上，图还是画好了，可以走卡片分享',async()=>{
  const {wx}=fakeCanvasWx({showShareImageMenu:undefined});
  const p=sharePage(wx);
  await p.sendShareImage();
  assert.equal(p.data.shareOpen,true,'没有 showShareImageMenu 就留下面板');
  assert.equal(p.data.shareImage,'wxfile://tmp/share-1.png','面板上得有图，不是一张空画布');
});
test('单词页：例句里点进来的词收进词库，评价完交代下次什么时候来',async()=>{
 const posts=[];const jumps=[];
 const word={id:'squat',word:'squat',ipa:'/skwɒt/',pos:'n./v.',meaning:'深蹲',catLabel:'训练动作',linked:true,
  lines:[{en:'A deadlift is a hip hinge, not a squat.',zh:'硬拉是髋主导的折叠，不是深蹲。',
   segs:[{t:'A ',id:''},{t:'deadlift',id:'deadlift'},{t:' is a ',id:''},{t:'hip hinge',id:'hip-hinge'},{t:', not a squat.',id:''}]}]};
 const {p}=page('word',{api:async(path,m,data)=>{
  posts.push([path,m,data]);
  if(path==='/learning/touch')return {date:'2026-10-26',added:true,card:{stage:0,status:'learning',due:'2026-10-27'},word};
  return {last:{wordId:'squat',grade:'good',stage:1,due:'2026-10-27',status:'learning'}};
 },wx:{redirectTo:o=>jumps.push(o.url)}});

 await p.onLoad({id:'squat'});
 assert.equal(posts.at(-1)[0],'/learning/touch','进来就登记，收进词库');
 assert.equal(posts.at(-1)[1],'POST');
 assert.deepEqual({...posts.at(-1)[2]},{wordId:'squat'});
 assert.equal(p.data.word.id,'squat');
 assert.equal(p.data.state,'收进词库了 · 明天再见一次','刚收进来的词，明天才开始排队');
 assert.equal(p.data.graded,false,'没评价之前评价按钮还在');

 // 例句里再点一个词：换掉当前页，返回还是回到进来时的地方
 p.openWord({currentTarget:{dataset:{id:'deadlift'}}});
 assert.deepEqual(jumps,['/pages/word/word?id=deadlift']);
 p.openWord({currentTarget:{dataset:{id:'squat'}}});
 assert.equal(jumps.length,1,'点到自己不跳转');

 await p.grade({currentTarget:{dataset:{grade:'good'}}});
 assert.equal(posts.at(-1)[0],'/learning/review','评价走的是复习接口，跟学习页同一套');
 assert.deepEqual({...posts.at(-1)[2]},{wordId:'squat',grade:'good'});
 assert.equal(p.data.graded,true);
 assert.equal(p.data.state,'记下了');
 assert.equal(p.data.next,'下次 10/27 再来一次');

 const wxml=fs.readFileSync('miniprogram/pages/word/word.wxml','utf8');
 assert.match(wxml,/\{\{seg\.t\}\}/,'例句按片段渲染');
 assert.match(wxml,/catchtap="openWord"/,'句里的词点得开');
 assert.ok(wxml.includes('回到刚才的地方'),'评价完给一条回去的路');
 assert.ok(!wxml.includes('dock'),'这一页是详情页，不再挂底部导航');

 // 没有这个 id：给一句话，不白屏
 const {p:blank}=page('word',{api:async()=>({})});
 await blank.onLoad({});
 assert.equal(blank.data.missing,true);
 assert.equal(blank.data.word,null);
});



// 再来一次靠表单预填：内容照抄这一笔，日期必须是「现在」
test('再来一次：表单按这一笔填好，日期是今天，保存出来是新的一条',async()=>{
  const calls=[];
  const act={id:'a1',type:'running',occurredAt:'2026-10-20T08:00:00+08:00',timeZone:'Asia/Shanghai',
    distanceM:5000,durationSec:1800,intensity:'moderate',visibility:'private',projectId:null};
  const {p}=page('record',{globalData:{home:{activities:[act]}},
    wx:{setNavigationBarTitle(){},setStorageSync(){},vibrateShort(){},navigateBack(){}},
    api:async(path,m,body)=>{calls.push([path,m,body]);return {};}});
  await p.onLoad({from:'a1'});

  assert.equal(p.data.copying,true);
  assert.equal(p.data.editing,false,'这是新的一条，不是改原来那条');
  assert.equal(p.data.form.type,'running');
  assert.equal(p.data.form.durationMin,'30','时长照抄');
  assert.equal(p.data.form.distance,5,'距离照抄');
  assert.equal(p.data.form.intensity,'moderate');

  const now=new Date(),mins=-now.getTimezoneOffset();
  const today=new Date(now.getTime()+mins*60000).toISOString().slice(0,10);
  assert.equal(p.data.form.date,today,'日期是现在，不是原记录那天');
  assert.notEqual(p.data.form.date,'2026-10-20');

  await p.save();
  const post=calls.find(c=>c[0]==='/activities'&&c[1]==='POST');
  assert.ok(post,'保存要新建一条');
  assert.equal(post[2].type,'running');
  assert.equal(post[2].durationSec,1800);
  assert.equal(post[2].distanceM,5000);
  assert.match(post[2].occurredAt,new RegExp('^'+today+'T'),'补录到原日期就错了');
});

// 从记录页冷启动直接进表单时，首页缓存还没人拉过 —— 不能因此给一张空表单
test('再来一次：没拉过首页缓存也能预填（现拉一次 /home）',async()=>{
  const calls=[];
  const act={id:'a9',type:'cycling',occurredAt:'2026-10-21T07:00:00+08:00',timeZone:'Asia/Shanghai',
    distanceM:12000,durationSec:2400,intensity:'vigorous',visibility:'private',projectId:null};
  const {p}=page('record',{globalData:{},wx:{setNavigationBarTitle(){},showToast(){}},
    api:async(path,m,body)=>{calls.push([path,m,body]);return String(path).startsWith('/home')?{activities:[act]}:{};}});
  await p.onLoad({from:'a9'});
  await new Promise(r=>setTimeout(r,20));
  assert.ok(calls.some(c=>String(c[0]).startsWith('/home')),'找不到就现拉首页');
  assert.equal(p.data.form.type,'cycling');
  assert.equal(p.data.form.distance,12,'12 公里照抄');
  assert.equal(p.data.form.intensity,'vigorous');
  assert.equal(p.data.editing,false,'仍然是新的一条');
});

// 一个词都没有时不该有「卡片」入口，点了也不能进一个空转的卡片页
test('空词库：卡片模式进不去，也就不会有 0/0 的进度',async()=>{
 const {p}=page('vocab',{api:async()=>({date:'2026-10-26',stats:{learned:0,known:0,learning:0,due:0,total:100},dueCount:0,cards:[]}),
  wx:{reLaunch(){},showToast(){}}});
 await p.onShow();
 p.openCards();
 assert.equal(p.data.view,'list');
 assert.equal(p.data.deckLen,0);
});

// 记哪一类由入口决定：记笔页已经用心肺/抗阻两张卡分开，记录页不该再让人选第二遍
test('记录页不再有类型切换：进来的是哪一类就记哪一类',()=>{
 const {p}=page('record',{});
 p.onLoad({mode:'strength'});
 assert.equal(p.data.mode,'strength');
 const wxml=fs.readFileSync('miniprogram/pages/record/record.wxml','utf8');
 assert.ok(!wxml.includes('rec-mode'),'两个类型标签删掉了，同一个选择不该出现两次');
 assert.ok(!wxml.includes('pickMode'));
 assert.ok(wxml.includes("mode==='strength'?'记录一次抗阻训练'"),'标题自己说清是哪一类');
 const js=fs.readFileSync('miniprogram/pages/record/record.js','utf8');
 assert.ok(!js.includes('pickMode'),'切换方法一起删干净，不留死代码');
});

// 显隐要跟手：指头按下去那一瞬环和列表就变，不能等 PATCH + /goals 两趟请求回来
// （真机上那两趟串起来就是用户说的「有延迟」）
test('圆环编辑器：点隐藏，预览环当场少一圈，列表当场收进灰区',async()=>{
  const goals={all:[
      {key:'water',label:'饮水',period:'daily',periodLabel:'今日',color:'#06B6D4'},
      {key:'english',label:'英语',period:'daily',periodLabel:'今日',color:'#A659C5'}],
    ringColors:{},
    day:[{key:'move',label:'运动',period:'daily',periodLabel:'今日',color:'#DF7A77',recordOnly:true,percent:0},
      {key:'water',label:'饮水',period:'daily',periodLabel:'今日',color:'#06B6D4',current:900,target:1800,percent:50},
      {key:'english',label:'英语',period:'daily',periodLabel:'今日',color:'#A659C5',current:0,target:10,percent:0}],
    week:[]};
  let openGate;const gate=new Promise(r=>{openGate=r;});
  let patch=null;
  const api=async(path,m,body)=>{
    if(path==='/goals')return goals;
    patch=[path,m,body];await gate;return {};
  };
  let def;const ctx={Component:d=>def=d,
    require:id=>id.includes('tokens')?require('../miniprogram/utils/tokens'):id.includes('rings')?require('../miniprogram/utils/rings'):({api,login:async()=>{},error:()=>{},change:()=>{}}),
    wx:{},getApp:()=>({globalData:{token:'local'}}),getCurrentPages:()=>[{}],setTimeout,clearTimeout,console};
  vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../miniprogram/components/ring-editor/ring-editor.js'),'utf8'),ctx);
  const ed={...def.methods,data:JSON.parse(JSON.stringify(def.data)),
    setData(x){Object.assign(this.data,x);},triggerEvent(){}};
  await ed.load();
  assert.equal(ed.data.preview.length,3);

  const pending=ed.toggleHidden({currentTarget:{dataset:{key:'water'}}});
  // 到这里 PATCH 还挂在网络上，但界面必须已经是新的
  assert.equal(ed.data.preview.length,2,'按下去预览就从 3 圈变 2 圈，不等网络');
  assert.equal(ed.data.dayItems.find(o=>o.key==='water').hidden,true,'行立刻标成已隐藏');
  openGate();await pending;
  assert.equal(patch[0],'/goals/hidden');
  assert.equal(patch[2].hidden,true);
});

// 连点两下时，先发后到的那份 /goals 不许把刚改的状态盖回去
test('圆环编辑器：旧的 /goals 回来晚了会被丢掉，不闪回',async()=>{
  const mk=(hidden)=>({all:[{key:'water',label:'饮水',period:'daily',periodLabel:'今日',color:'#06B6D4',hidden}],
    ringColors:{},day:[{key:'move',label:'运动',period:'daily',periodLabel:'今日',color:'#DF7A77',recordOnly:true,percent:0},
      {key:'water',label:'饮水',period:'daily',periodLabel:'今日',color:'#06B6D4',current:900,target:1800,percent:50,hidden}],week:[]});
  const gates=[];let n=0;
  const api=async(path)=>{
    if(path!=='/goals')return {};
    const i=n++;let open;const g=new Promise(r=>{open=r;});
    gates.push({open,payload:mk(i>0)});
    await g;return gates[i].payload;
  };
  let def;const ctx={Component:d=>def=d,
    require:id=>id.includes('tokens')?require('../miniprogram/utils/tokens'):id.includes('rings')?require('../miniprogram/utils/rings'):({api,login:async()=>{},error:()=>{},change:()=>{}}),
    wx:{},getApp:()=>({globalData:{token:'local'}}),getCurrentPages:()=>[{}],setTimeout,clearTimeout,console};
  vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../miniprogram/components/ring-editor/ring-editor.js'),'utf8'),ctx);
  const ed={...def.methods,data:JSON.parse(JSON.stringify(def.data)),
    setData(x){Object.assign(this.data,x);},triggerEvent(){}};
  const first=ed.load();            // 第 1 次请求（旧数据：没隐藏）
  const second=ed.load();           // 第 2 次请求（新数据：已隐藏）
  gates[1].open();await second;     // 新的先回来
  assert.equal(ed.data.dayItems.find(o=>o.key==='water').hidden,true);
  gates[0].open();await first;      // 旧的晚到
  assert.equal(ed.data.dayItems.find(o=>o.key==='water').hidden,true,'过期响应丢掉，状态不闪回');
});

// 关掉浮层回首页：首页那组环立刻按编辑器带回来的视图重画，不等 /home
test('关掉圆环浮层：首页环当场按新显隐重画',()=>{
  const {p}=page('home',{globalData:{token:'t'},wx:{}});
  const goals={day:[{key:'move',label:'运动',period:'daily',label2:'今日',color:'#DF7A77',recordOnly:true,percent:0}],
    week:[],today:'2026-10-29',weekStart:'2026-10-26',weekEnd:'2026-11-01'};
  p.home={user:{timeZone:'Asia/Shanghai'},stats:{days:[],month:'2026-10'},activities:[],
    habits:{categories:[],projects:[],achievements:{badges:[]}},goals:null};
  let fetched=0;
  p.load=async()=>{fetched++;};
  p.ringEditorClose({detail:{goals}});
  assert.equal(p.data.ringEditor,false);
  assert.equal(p.home.goals.day.length,1,'带回来的视图直接写进首页数据');
  assert.equal(p.data.rings.day.items.length,1,'不等网络就已经重画');
});

test('首页体测固定双列周均值与增减，点整卡直接进入体测页',()=>{
 let url;const {p}=page('home',{wx:{navigateTo:o=>url=o.url}});
 p.home={user:{timeZone:'Asia/Shanghai'},stats:{days:[]},activities:[],habits:{categories:[],projects:[]},body:{week:{weightKg:62.6,waistCm:74.5},previousWeek:{weightKg:62.9,waistCm:74.9}}};
 p.render();assert.equal(p.data.bodyCard.weight,'62.6');assert.equal(p.data.bodyCard.waist,'74.5');assert.equal(p.data.bodyCard.weightDelta,'较上周 −0.3 kg');assert.equal(p.data.bodyCard.waistDelta,'较上周 −4 mm');
 p.openBody();assert.equal(url,'/pages/body/body');
 p.home.body={week:{},previousWeek:{}};p.render();assert.equal(p.data.bodyCard.weight,'—');assert.equal(p.data.bodyCard.weightDelta,'本周暂无测量');
 const wxml=fs.readFileSync(path.join(__dirname,'../miniprogram/pages/home/home.wxml'),'utf8');const card=wxml.slice(wxml.indexOf('body-summary-card'),wxml.indexOf('<!-- 饮水'));
 assert.match(card,/bindtap="openBody"/);assert.doesNotMatch(card,/bodyOpen|toggleBody|trail|最新体重/);
});

test('抗阻空分类直接打开三标签打卡，保存自动获取默认项目，不要求新建类别',async()=>{
 let url;const {p}=page('home',{wx:{navigateTo:o=>url=o.url}});p.data.categories=[{id:'default:resistance',name:'抗阻训练',preset:'resistance',projects:[]}];
 p.category({currentTarget:{dataset:{id:'default:resistance'}}});assert.equal(url,'/pages/record/record?mode=strength');
 const calls=[];const {p:record}=page('record',{globalData:{home:null},api:async(path,method,body)=>{calls.push({path,method,body});return path==='/strength-project'?{id:'strength'}:{};},wx:{navigateBack(){},vibrateShort(){}}});
 record.data.form.date='2026-10-29';record.data.part='lower';record.requestId='stable';
 // 新版默认中等强度已预选，这里显式清掉模拟「用户还没选」，仍要拦下
 record.setData({strengthIntensity:''});
 await record.saveStrength();assert.equal(calls.length,0,'强度没选就不发请求');
 record.pickStrengthIntensity({currentTarget:{dataset:{intensity:'vigorous'}}});
 await record.saveStrength();
 assert.equal(calls[0].path,'/strength-project');assert.equal(calls[1].path,'/projects/strength/checkins');assert.equal(calls[1].body.part,'lower');assert.equal(calls[1].body.requestId,'stable');
 assert.equal(calls[1].body.intensity,'vigorous','抗阻打卡要带强度，饼图和教练端都靠它');
});

test('周期看板：会员从 globalData.home 派生本周目标、各窗口闭环周数与三张回顾图',async()=>{
 const {shift}=require('../miniprogram/utils/cycles');
 const closedWeeks=[];for(let i=0;i<12;i++)closedWeeks.push(shift('2026-10-26',-7*(11-i)));
 closedWeeks.splice(8,1); // 去掉 2026-10-05（落在本月）
 let url;
 const home={today:'2026-10-29',goals:{today:'2026-10-29',weekStart:'2026-10-26',weekEnd:'2026-11-01',
   week:[
     {key:'cardio',label:'心肺',current:120,target:150,unit:'分钟',percent:80,closed:false,color:'#D93B36',hidden:false},
     {key:'strength',label:'抗阻',current:3,target:3,unit:'天',percent:100,closed:true,color:'#3D6EDC',hidden:false},
     {key:'water',label:'饮水',current:5,target:5,unit:'天',percent:100,closed:true,color:'#06B6D4',hidden:true}
   ]},habits:{achievements:{closedWeeks}}};
 const {p}=page('cycle',{globalData:{home},api:async()=>home,wx:{navigateTo:o=>url=o.url,getCurrentPages:()=>[{},{}]}});
 await p.onShow();
 assert.equal(p.data.loaded,true);
 assert.equal(p.data.weekGoals.length,2,'隐藏项不进看板');
 assert.equal(p.data.weekClosed,false,'有一项没闭环 → 本周未闭环');
 assert.equal(p.data.weekRange,'10/26–11/01');
 const q=p.data.windows.find(w=>w.key==='quarter');assert.equal(q.completed,11);assert.equal(q.total,12);
 const m=p.data.windows.find(w=>w.key==='month');assert.equal(m.total,4,'本月 4 个自然周');assert.equal(m.completed,3);
 const y=p.data.windows.find(w=>w.key==='year');assert.equal(y.total,52);assert.equal(y.completed,11);
 // 强度饼三档要算出来（空数据下字段齐全、总数为 0）
 assert.equal(p.data.intensity.length,3,'强度饼图三档：低 / 中 / 高');
 assert.equal(p.data.intensityTotal,0,'空数据下总次数为 0');
});

// 强度饼不用 canvas（canvas 是原生层，页面一变高就飘到别的卡片上），
// 改成 conic-gradient：色标在页面里按占比拼，最后一段必须收到 100%。
test('周期看板强度饼：按占比拼 conic-gradient，三段加起来正好 100%',async()=>{
 // 用上海今天作为所有活动的日期，保证落在「本月窗口 [1号, 今天]」内，
 // 不再依赖固定日号（在每月 1 号跑时，固定 02~05 号会被当成未来日期而漏掉）。
 const shanghaiToday=new Date(Date.now()+8*3600*1000).toISOString().slice(0,10);
 const at=t=>shanghaiToday+'T'+t+'+08:00';
 const home={user:{timeZone:'Asia/Shanghai',nickname:'小林'},
   goals:{today:shanghaiToday,weekStart:shanghaiToday,week:[]},
   habits:{achievements:{closedWeeks:[]},categories:[]},
   activities:[
     {type:'running',occurredAt:at('20:00:00'),durationSec:1800,intensity:'vigorous'},
     {type:'running',occurredAt:at('20:05:00'),durationSec:1800,intensity:'moderate'},
     {type:'walking',occurredAt:at('20:10:00'),intensity:'low'},
     {type:'walking',occurredAt:at('20:15:00'),intensity:'low'}
   ]};
 const {p}=page('cycle',{globalData:{home},api:async()=>home,wx:{navigateTo(){}}});
 await p.onShow();
 assert.equal(p.data.intensityTotal,4,'两次散步 + 一次中等 + 一次高');
 const m=/conic-gradient\((.*)\)/.exec(p.data.pieStyle||'');
 assert.ok(m,'要拼出 conic-gradient');
 const stops=m[1].split(',');
 assert.equal(stops.length,3,'三档都有值，0 次的档不该多出一条零宽色标');
 assert.match(stops[0],/#5FB6C6/);
 assert.match(stops[1],/#EF9F3C/);
 assert.match(stops[2],/#D93B36/);
 assert.match(stops.at(-1),/100\.00%\)?$/,'最后一段收到 100%，否则环上会留一道缝');
});

// 强度饼没有数据时不拼样式（空字符串），卡片走「这个月还没有有氧记录」那一段
test('周期看板强度饼：没数据时不生成 conic-gradient',async()=>{
 const home={user:{timeZone:'Asia/Shanghai'},goals:{today:'2026-10-29',weekStart:'2026-10-26',week:[]},
   habits:{achievements:{closedWeeks:[]}},activities:[]};
 const {p}=page('cycle',{globalData:{home},api:async()=>home,wx:{navigateTo(){}}});
 await p.onShow();
 assert.equal(p.data.intensityTotal,0);
 assert.equal(p.data.pieStyle,'');
});

// 教练总看板：一人一张视觉卡（进度条按会员自己的目标画），日/周/月/年 四档都走 /coach/board
test('教练总看板：一人一张卡，进度按会员自己的目标算',async()=>{
 const calls=[];let url='',modal='',clip='';
 const home={goals:{today:'2026-10-29',week:[],weekStart:'2026-10-26'},habits:{achievements:{closedWeeks:[]}},activities:[]};
 const member=(id,name,at,filled)=>filled
  ? {id,name,authorizedAt:at,recordedDays:2,days:4,
     targets:{cardio:100,strength:2,waterMl:2000},
     cardio:{sessions:3,minutes:96,rawMinutes:96,days:2},strength:{sessions:2,days:2},
     mix:[{key:'cardio',label:'心肺',color:'#D93B36',count:3},{key:'strength',label:'抗阻',color:'#3D6EDC',count:2}],
     water:{ml:4000,days:2,avgPercent:92,metDays:1},
     body:{weight:{delta:-0.7,mode:'avg',text:'较上周'},waist:{delta:-1,mode:'delta',text:'较上次'},latest:{date:'2026-10-29',weightKg:68.5,waistCm:78}}}
  : {id,name,authorizedAt:at,recordedDays:0,days:4,targets:{cardio:150,strength:3,waterMl:2000},
     cardio:{sessions:0,minutes:0,rawMinutes:0,days:0},strength:{sessions:0,days:0},
     water:{ml:0,days:0,avgPercent:null,metDays:0},
     body:{weight:{delta:null,mode:'none',text:'还没有记录'},waist:{delta:null,mode:'none',text:'还没有记录'},latest:null}};
 const {p}=page('coach',{globalData:{home},api:async(path,m,data)=>{
  calls.push([path,m,data]);
  if(path.indexOf('/coach/board')===0){
   const period=(path.split('period=')[1])||'week';
   return {period,range:{from:'2026-10-26',to:'2026-10-29',label:'10/26–10/29',grain:period==='year'?'month':'day'},
    members:[member('m1','小林','2026-10-28T09:00:00.000Z',true),member('m2','小陈','2026-10-27T09:00:00.000Z',false)]};
  }
  if(path==='/coach/invite')return {code:'K7M2QX'};
  if(m==='DELETE')return {ok:true};
  return {};
 },wx:{navigateTo:o=>url=o.url,setClipboardData:o=>clip=o.data,showModal:o=>{modal=o.title;o.success({confirm:true});}}});
 await p.load();
 // 教练自己的看板已经搬去 pages/cycle（底部「看板」），教练端这里只留会员看板：
 // 以前那个「我的周期看板」页签用的是旧 cycle-board 组件，2026-10-30 整块删掉。
 assert.ok(!p.data.mineHome&&p.data.mineLoaded===undefined,'教练端不再加载自己的首页数据');
 assert.ok(!p.data.invite,'教练码搬去「我的」页了，教练端不再摆这一块');
 assert.ok(!p.confirmAdd&&!p.openAdd,'手填名字建会员那条路已经删了');
 assert.ok(!p.rotateCode,'只有一个教练，不做「换一个码」这种想太多的东西');
 // 默认「按项目看」：一个项目一张卡，卡里横轴是人（一人一根柱子）
 assert.equal(p.data.mode,'metric','总看板默认按项目看，像排行榜那样横着排人');
 assert.equal(p.data.charts.map(c=>c.key).join('|'),'cardio|strength|water|weight|waist','五张卡：有氧/抗阻/饮水/体重/腰围');
 assert.equal(p.data.charts[0].bars.map(b=>b.name).join('|'),'小林|小陈','每张图的横轴都是人');
 assert.equal(p.data.charts[0].bars.map(b=>b.top).join('|'),'96%|—','有目标的人给完成百分比，没目标的人不冒充');
 assert.equal(p.data.charts[0].bars[0].h,64,'96% 在 0–150% 刻度上就是 64% 高');
 assert.equal(p.data.charts[1].bars.map(b=>b.top).join('|'),'100%|—');
 assert.equal(p.data.charts[2].bars.map(b=>b.top).join('|'),'92%|—','饮水给日均百分比');
 assert.equal(p.data.charts[2].bars[0].sub,'4000 ml','柱下只放得下一行，达标天数不塞进去');
 assert.ok(p.data.charts[3].bipolar&&p.data.charts[4].bipolar,'体测是双向柱：中线上方涨、下方降');
 assert.equal(p.data.charts[3].bars[0].dir,'down','-0.7 → 向下');
 assert.equal(p.data.charts[3].bars[1].dir,'none','没记录就没有柱子');
 assert.equal(p.data.charts[3].line,50,'体测卡的虚线是中线');
 // 训练结构乐高柱：一人一行细条，段宽 = 该类别次数 ÷ 总次数（2026-10-30）
 assert.equal(p.data.mixRows.length,2,'每个会员一行');
 const mixRow=p.data.mixRows[0];
 assert.equal(mixRow.total,5,'心肺 3 + 抗阻 2');
 assert.equal(mixRow.segs.map(s=>s.label).join('|'),'心肺|抗阻');
 assert.equal(mixRow.segs[0].pct,60,'3/5 = 60%');
 assert.equal(mixRow.segs[0].color,'#D93B36','心肺段用全站正红');
 const blankRow=p.data.mixRows[1];
 assert.equal(blankRow.total,0);assert.equal(blankRow.segs.length,0,'没记录的人是空条');
 assert.equal(p.data.charts[0].line,67,'前三张卡的虚线是 100%（150% 刻度里的 67%）');
 // 纵轴：每张卡都得把「轴是什么、基线在哪」写出来，不能只有一堆柱子
 assert.equal(p.data.charts[0].yTicks.map(t=>t.v).join('|'),'150%|100%|50%|0%','完成度轴的刻度');
 assert.equal(p.data.charts[0].yTicks[1].b,66.7,'100% 落在 0–150% 的 2/3 处');
 assert.equal(p.data.charts[0].lineRpx,198,'虚线画在柱子区里：64rpx 名字区 + 67% × 200rpx');
 assert.match(p.data.charts[0].axisCap,/0% 是底线/,'基线要说清楚是 0');
 assert.match(p.data.charts[2].axisCap,/虚线 100%/,'饮水的轴同样讲 100% 达标线');
 assert.equal(p.data.charts[3].yTicks.map(t=>t.v).join('|'),'+0.7|0|−0.7','变化量轴：0 在中间，上下对称');
 assert.equal(p.data.charts[3].lineRpx,164,'中线 = 64 + 50% × 200');
 assert.match(p.data.charts[3].axisCap,/中间那条实线是 0/,'体测轴要说明 0 = 没变');
 // 「按人看」是另一种看法：一人一张卡
 p.setMode({currentTarget:{dataset:{mode:'person'}}});
 assert.equal(p.data.mode,'person');
 // 一人一张卡：进度条 = 值 ÷ 会员自己的目标（96/100 → 96%、2/2 → 100%、92% 封顶在 100）
 assert.equal(p.data.cards.length,2);
 const r0=p.data.cards[0].rows;
 assert.equal(r0.map(r=>r.text).join('|'),'3 次 · 96 分|练 2 天 · 2 次|92% · 达标 1/2','卡上是「数字 + 进度」，不是一格一格的表');
 assert.equal(r0.map(r=>r.pct).join('|'),'96|100|92','进度按会员自己的目标折算，封顶 100%');
 assert.equal(p.data.cards[0].daysText,'记录 2/4 天');
 assert.equal(p.data.cards[0].weight.text,'-0.7 kg','体测给的是变化量，不是绝对值');
 assert.equal(p.data.cards[0].weight.sub,'较上周','差值要说清楚是跟谁比的');
 assert.equal(p.data.cards[1].rows[2].text,'还没记','什么都没记的人不能显示 0%');
 assert.equal(p.data.cards[1].rows[2].pct,null,'没记录就别画进度条');
 assert.equal(p.data.cards[1].weight.text,'—');
 assert.equal(p.data.cards[1].weight.sub,'还没有记录');
 // 四档周期：切一次换一次请求
 calls.length=0;
 await p.pickPeriod({currentTarget:{dataset:{v:'day'}}});
 assert.equal(p.data.period,'day');
 assert.ok(calls.some(c=>c[0]==='/coach/board?period=day'),'日视图就是「今天谁还没动」那张快照');
 await p.pickPeriod({currentTarget:{dataset:{v:'year'}}});
 assert.ok(calls.some(c=>c[0]==='/coach/board?period=year'));
 p.openMember({currentTarget:{dataset:{id:'m1',name:'小林'}}});
 assert.equal(url,'/pages/member/member?id=m1&name='+encodeURIComponent('小林'));
 await p.unlink({currentTarget:{dataset:{id:'m1',name:'小林'}}});
 await new Promise(r=>setTimeout(r,10));
 assert.ok(modal.indexOf('小林')>=0,'解除前要确认，标题带上名字');
 assert.ok(calls.some(c=>c[0]==='/coach/members/m1'&&c[1]==='DELETE'));
});

// 教练码搬进「我的」（2026-10-30）：它是账号自己的东西，不是会员看板的一部分。
// 只有教练账号才取、才渲染这张卡；会员那条路上连请求都不发，页面上也没有。
test('教练码只在「我的」给教练看，会员既看不到也不发请求',async()=>{
 const base={user:{id:'coach-1',nickname:'王教练',timeZone:'Asia/Shanghai'},goals:{today:'2026-10-29',week:[]},habits:{},activities:[]};
 let clip='';
 const coachCalls=[];
 const {p:coach}=page('account',{globalData:{},api:async(path)=>{coachCalls.push(path);
  if(path==='/home')return base;
  if(path==='/account-access')return {userId:'coach-1',isCoach:true};
  if(path==='/coach/invite')return {code:'K7M2QX'};
  if(path==='/coach/link')return {link:null};
  return {};
 },wx:{setClipboardData:o=>{clip=o.data;}}});
 await coach.onShow();
 assert.equal(coach.data.isCoach,true);
 assert.equal(coach.data.invite,'K7M2QX','教练得看得到自己的码，才能发给学员');
 coach.copyInvite();assert.equal(clip,'K7M2QX','点一下就能复制');
 const wxml=fs.readFileSync('miniprogram/pages/account/account.wxml','utf8');
 const card=wxml.slice(wxml.indexOf('coach-code-card')-200,wxml.indexOf('coach-code-card')+400);
 assert.match(card,/wx:if="\{\{isCoach\}\}"/,'这张卡要挂在 isCoach 上');

 const memberCalls=[];
 const {p:member}=page('account',{globalData:{},api:async(path)=>{memberCalls.push(path);
  if(path==='/home')return base;
  if(path==='/account-access')return {userId:'demo-a',isCoach:false};
  if(path==='/coach/link')return {link:null};
  return {};
 }});
 await member.onShow();
 assert.equal(member.data.isCoach,false);
 assert.equal(member.data.invite,'');
 assert.ok(memberCalls.indexOf('/coach/invite')<0,'会员不该去要教练码');
});

// 周期看板：四张「N/M 周闭环」灰条卡删掉了（热力图和柱图已经讲得更清楚），
// 闭环改在热力图上方那句话里报；闭环了就换成庆祝款「本周完成」
test('看板：闭环周数不再摆四张卡，热力图上方一句话跟着视图换',async()=>{
 const home={user:{timeZone:'Asia/Shanghai',nickname:'小林'},
  goals:{today:'2026-10-29',weekStart:'2026-10-26',weekEnd:'2026-11-01',
   week:[{key:'cardio',label:'心肺',current:150,target:150,unit:'分钟',percent:100,closed:true,color:'#D93B36',hidden:false},
         {key:'strength',label:'抗阻',current:3,target:3,unit:'天',percent:100,closed:true,color:'#3D6EDC',hidden:false}]},
  habits:{achievements:{closedWeeks:['2026-10-26']},categories:[]},activities:[]};
 const {p}=page('cycle',{globalData:{home},api:async()=>home,wx:{navigateTo(){}}});
 await p.onShow();
 assert.equal(p.data.weekClosed,true);
 assert.equal(p.data.cheer.title,'这一年还空着','默认停在年视图：一年没动过就照实说，不硬夸');
 // 切到「周」：闭环了就直接说「本周完成」
 p.setHeatView({currentTarget:{dataset:{v:'week'}}});
 assert.equal(p.data.cheer.on,true,'本周闭环 → 庆祝款');
 assert.equal(p.data.cheer.title,'本周完成');
 assert.match(p.data.cheer.sub,/2 项目标都到线/);
 // 切到「月」：那句话换成本月的说法（数据在手，不重新请求）；鼓励式口径先报成绩不摆 N/M
 p.setHeatView({currentTarget:{dataset:{v:'month'}}});
 assert.match(p.data.cheer.title,/这个月已经闭环/);
 assert.doesNotMatch(p.data.cheer.title,/\d+ \/ \d+/,'不再摆 N/M 分数');
 // 文案层级（用户 10-30）：不解释「什么是热力图」，标题下没有说明行，鼓励式先报成绩
 const wxml=fs.readFileSync('miniprogram/pages/cycle/cycle.wxml','utf8');
 assert.doesNotMatch(wxml,/颜色越深/,'热力图的解释行删掉了');
 assert.doesNotMatch(wxml,/看你这一年的节奏/,'「回顾」不再需要副标语');
 assert.doesNotMatch(wxml,/每根柱子/,'周柱图的说明行删掉了');
 assert.doesNotMatch(wxml,/按你的时区/,'页脚的口径说明删掉了');
 assert.match(wxml,/wx:if="\{\{heat\.monthCap\}\}"/,'月视图小字只留「最勤的月」数据');
 assert.match(wxml,/\{\{weekClosed\?'本周完成':'进行中'\}\}/,'本周卡上闭环了就直接写「本周完成」');
 assert.doesNotMatch(wxml,/wx:for="\{\{windows\}\}"/,'四张闭环周数卡已经删掉');
 assert.match(wxml,/class="cheer \{\{cheer.on\?'cheer-on':''\}\}"/,'换成了热力图上方那句话');
 assert.match(wxml,/marks="\{\{heat.closedMarks\}\}"/,'闭环的那几周在年网格下面打星');
 assert.match(wxml,/wk-lab-on/,'周视图要给当天加粗');
 assert.match(wxml,/mo-val-on/,'月视图要把最勤的月标出来');
});

// 会员授权页：得本人点同意才能提交，解除只是断开关联
test('会员授权页：同意才提交，解除走 DELETE',async()=>{
 const calls=[];let modal='',toast='';
 const home={user:{nickname:'新成员'},goals:{today:'2026-10-29',week:[]},habits:{},activities:[]};
 let link=null;
 const {p}=page('authorize',{api:async(path,m,data)=>{
  calls.push([path,m,data]);
  if(path==='/coach/link'&&m==='POST'){link={id:'c1',name:'小林',authorizedAt:'2026-10-29T10:00:00.000Z'};return link;}
  if(path==='/coach/link'&&m==='DELETE'){link=null;return {ok:true};}
  if(path==='/coach/link')return {link,coach:link?{name:'王教练',active:true}:null};
  return home;
 },wx:{showModal:o=>{modal=o.title;o.success({confirm:true});},showToast:o=>toast=o.title}});
 await p.load();
 assert.equal(p.data.link,null);
 assert.equal(p.data.name,'','「新成员」是占位，不该预填成称呼');
 p.setData({code:'K7M2QX',name:'小林'});
 await p.submit();
 assert.equal(calls.filter(c=>c[0]==='/coach/link'&&c[1]==='POST').length,0,'没点同意不能提交');
 p.setData({consent:true});
 await p.submit();
 const post=calls.find(c=>c[0]==='/coach/link'&&c[1]==='POST');
 assert.equal(post[2].code,'K7M2QX');
 assert.equal(post[2].consent,true);
 assert.equal(toast,'已授权');
 assert.ok(p.data.link,'授权后立刻切到已授权状态');
 assert.equal(p.data.authorizedAt,'2026-10-29');
 await p.revoke();await new Promise(r=>setTimeout(r,10));
 assert.ok(modal.indexOf('解除')>=0);
 assert.ok(calls.some(c=>c[0]==='/coach/link'&&c[1]==='DELETE'));
 assert.equal(p.data.link,null);
});

test('会员个人页：五张卡 + 可左右滑的每日图，最短到周',async()=>{
 const calls=[];
 const person={name:'小林',period:'week',label:'10/26–10/29',grain:'day',days:4,today:'2026-10-29',
  cards:[
   {key:'cardio',label:'本周有氧',value:3,unit:'次',sub:'96 等效分钟'},
   {key:'strength',label:'本周力量',value:2,unit:'次',sub:'练了 2 天'},
   {key:'water',label:'周均饮水',value:92,unit:'%',sub:'记了 2 天 · 1 天达标'},
   {key:'weight',label:'体重差值',value:'-0.7',unit:'kg',sub:'较上周'},
   {key:'waist',label:'腰围差值',value:'-1',unit:'cm',sub:'较上次'}],
  metrics:[
   {key:'cardio',label:'有氧',unit:'等效分钟',hint:'',points:[{id:'2026-10-28',label:'28日',value:30,has:true,text:'30 分 · 1 次'},{id:'2026-10-29',label:'29日',value:66,has:true,text:'66 分 · 2 次'}]},
   {key:'strength',label:'力量',unit:'次',hint:'',points:[{id:'2026-10-28',label:'28日',value:1,has:true,text:'1 次'},{id:'2026-10-29',label:'29日',value:1,has:true,text:'1 次'}]},
   {key:'water',label:'饮水',unit:'完成百分比',hint:'',points:[{id:'2026-10-28',label:'28日',value:75,has:true,text:'1500 ml · 75%'},{id:'2026-10-29',label:'29日',value:125,has:true,text:'2500 ml · 125%'}]},
   {key:'weight',label:'体重',unit:'kg',hint:'',points:[{id:'2026-10-28',label:'28日',value:69.2,has:true,text:'69.2 kg'},{id:'2026-10-29',label:'29日',value:68.5,has:true,text:'68.5 kg'}]},
   {key:'waist',label:'腰围',unit:'cm',hint:'',points:[{id:'2026-10-28',label:'28日',value:79,has:true,text:'79 cm'},{id:'2026-10-29',label:'29日',value:78,has:true,text:'78 cm'}]}]};
 const {p}=page('member',{api:async(path,m,data)=>{calls.push([path,m,data]);if(path.indexOf('/person')>0)return person;return {};},wx:{showToast:()=>{},navigateTo:()=>{},showModal:()=>{}}});
 p.setData({id:'m1'});await p.load(false);
 assert.ok(calls.some(c=>c[0].indexOf('/coach/members/m1/person')===0));
 // 教练只读：代记、改目标这些入口都不存在
 assert.ok(!p.save&&!p.saveGoals&&!p.pickSport,'会员页只读，教练改不了会员的任何数据');
 assert.equal(p.data.cards.length,5);
 assert.deepEqual(p.data.cards.map(c=>c.value),[3,2,92,'-0.7','-1'],'体重跟维度分开两张卡');
 const m=p.data.metrics;
 assert.deepEqual(m.map(x=>x.key),['cardio','strength','water','weight','waist']);
 // 饮水 125% 也照画：柱高封顶 150%，目标虚线在 100/150 处
 assert.equal(m[2].bars[1].h,83,'125% 的柱子 = 83% 高，不许抹平成 100%');
 assert.equal(p.data.goalLine,66.7);
 // 体重没有 0 起点，用棒棒糖图：重的在顶、轻的在底（上下各留 8% 余量，免得贴住横轴）
 assert.equal(m[3].dots[0].y,92);
 assert.equal(m[3].dots[1].y,8);
 assert.deepEqual(m[3].rows.map(r=>r.label),['29日','28日'],'明细最近的排最前');
 // 不做日视图：三项是周均口径，单日算不出平均
 assert.equal(p.data.periods.map(x=>x.v).join(','),'week,month,year');
 calls.length=0;
 await p.pickPeriod({currentTarget:{dataset:{v:'month'}}});
 assert.ok(calls.some(c=>c[0].indexOf('period=month')>0),'换周期就是换一次请求，数字不会各说各话');
 p.pickMetric({currentTarget:{dataset:{i:3}}});
 assert.equal(p.data.tab,3,'上面的小标签和下面的 banner 是同一件事的两个入口');
});


test('分享摘要与换句点击不会关闭面板，编辑结束保留文字并重画',async()=>{
 const {p}=page('home');p.data.shareOpen=true;let generated=0;p.generateShareImage=async()=>{generated++;};
 p.shareNoop();assert.equal(p.data.shareOpen,true);p.beginShareEdit();assert.equal(p.data.shareEditing,true);
 p.editShareSummary({detail:{value:'今天散步20分钟'}});await p.finishShareEdit({detail:{value:'今天散步25分钟'}});
 assert.equal(p.data.shareDraft,'今天散步25分钟');assert.equal(p.data.shareEditing,false);assert.equal(p.data.shareOpen,true);assert.equal(generated,1);
 await p.shuffleShareQuote();assert.equal(p.data.shareOpen,true);assert.equal(generated,2);
 const xml=fs.readFileSync(path.join(__dirname,'../miniprogram/pages/home/home.wxml'),'utf8');
 assert.match(xml,/class="share-mask" catchtap="closeShare"/);assert.match(xml,/catchtap="beginShareEdit"/);assert.match(xml,/catchtap="shuffleShareQuote"/);assert.match(xml,/class="share-panel" catchtap="shareNoop"/);
});

test('分享生成复用相同内容并合并并发，修改文字才重新导出',async()=>{
 const {p}=page('home');p.data.report={card:{date:'2026-10-30'}};p.data.shareDraft='散步20分钟';
 let count=0,release;p._generateShareImage=async()=>{count++;await new Promise(r=>release=r);p._shareImage='file-'+count;return p._shareImage;};
 const first=p.generateShareImage(),second=p.generateShareImage();assert.equal(count,1);release();assert.equal(await first,'file-1');assert.equal(await second,'file-1');
 assert.equal(await p.generateShareImage(),'file-1');assert.equal(count,1);
 p.data.shareDraft='散步25分钟';const next=p.generateShareImage();assert.equal(count,2);release();assert.equal(await next,'file-2');
});
test('自定义浮窗外部关闭内部拦截，无独立关闭按钮',()=>{
 const xml=file=>fs.readFileSync(path.join(__dirname,'../miniprogram',file),'utf8');
 const home=xml('pages/home/home.wxml');assert.match(home,/class="share-mask" catchtap="closeShare"/);assert.match(home,/class="share-panel" catchtap="shareNoop"/);assert.doesNotMatch(home,/class="share-cancel"/);
 const ring=xml('components/ring-editor/ring-editor.wxml');assert.match(ring,/class="editor-mask" catchtap="close"/);assert.match(ring,/class="editor-card" catchtap="noop"/);assert.doesNotMatch(ring,/class="editor-x"/);
 const learn=xml('pages/learn/learn.wxml');assert.match(learn,/class="part-mask" bindtap="closePart"/);assert.match(learn,/class="part-card" catchtap="popupNoop"/);assert.doesNotMatch(learn,/class="part-close"/);
});

// 挑头像（2026-10-30）：预设 20 款成品图，不做上传——保存只发一个 px:id，不传任何图片地址。
test('挑头像：进来先选中当前那款，保存只发 px:id，昵称不会被抹掉',async()=>{
 const calls=[];
 const home={user:{id:'3f9a2c11-aaaa',nickname:'小林',avatar:'px:orange',timeZone:'Asia/Shanghai'}};
 const {p}=page('avatar',{globalData:{home},
   api:async(path,m,data)=>{calls.push([path,m,data]);return path==='/profile'?Object.assign({},home.user,data):home;},
   wx:{showToast(){},navigateBack(){}}});
 await p.onLoad();
 assert.equal(p.data.groups.reduce((n,g)=>n+g.items.length,0),20,'20 款可选');
 assert.equal(p.data.current,'orange','进来先选中现在这款');

 p.pick({currentTarget:{dataset:{id:'corgi'}}});
 await p.save();
 const patch=calls.find(c=>c[1]==='PATCH');
 assert.ok(patch,'保存要发一次 PATCH');
 assert.equal(patch[0],'/profile');
 assert.equal(patch[2].avatar,'px:corgi');
 assert.equal(patch[2].nickname,'小林','PATCH 要求带昵称，改头像不能把它弄丢');
 assert.ok(!JSON.stringify(patch[2]).includes('http'),'不上传图片，只存预设 id');

  // 「先不选」= 清空，退化成昵称首字
  calls.length=0;
  p.clear();
  await p.save();
  assert.equal(calls.find(c=>c[1]==='PATCH')[2].avatar,'');
});

// 2026-10-30 真机踩过：云端跑的是旧版云函数，PATCH /profile 只认昵称、把 avatar 悄悄丢掉，
// 接口照样回 200。客户端原来不管返回什么都说「已换好」然后返回上一页 ——
// 用户换了三次，每个页面还都是昵称首字。所以「服务端没存上」必须当成失败。
test('保存头像：服务端把 avatar 吞掉时要报错，不能说「已换好」',async()=>{
  const toasts=[];let back=0;
  const home={user:{id:'u1',nickname:'小林',avatar:'',timeZone:'Asia/Shanghai'}};
  const {p}=page('avatar',{globalData:{home},
    // 旧版云函数就是这样：只回 nickname，avatar 一直空
    api:async(path,m,data)=>path==='/profile'?{id:'u1',nickname:data.nickname,avatar:''}:home,
    wx:{showToast:o=>toasts.push(o.title),navigateBack:()=>{back++;}}});
  await p.onLoad();
  p.pick({currentTarget:{dataset:{id:'corgi'}}});
  await p.save();
  assert.equal(toasts.includes('已换好'),false,'没存上就不能说已换好');
  assert.equal(back,0,'没存上就别返回上一页');
  assert.equal(p.data.saving,false,'按钮要恢复，不能卡在「正在保存…」');
});

test('保存头像成功后：缓存里的自己立刻换掉，看板不用等重新拉数据',async()=>{
  const home={user:{id:'u1',nickname:'小林',avatar:'px:orange',timeZone:'Asia/Shanghai'}};
  const {p,app}=page('avatar',{globalData:{home,dirty:false},
    api:async(path,m,data)=>path==='/profile'?Object.assign({},home.user,data):home,
    wx:{showToast(){},navigateBack(){}}});
  await p.onLoad();
  p.pick({currentTarget:{dataset:{id:'hamster'}}});
  await p.save();
  assert.equal(app.globalData.home.user.avatar,'px:hamster','globalData 里的 user 要一起更新');
  assert.equal(app.globalData.dirty,true,'同时置脏，让别的页知道该刷新了');
});

// 看板原来只判「缓存里有没有 home」，保存完回来还是旧头像。
test('看板：globalData.dirty 时要重拉 /home，换完头像立刻显示',async()=>{
  const stale={user:{id:'u1',nickname:'小林',avatar:'',timeZone:'Asia/Shanghai'},goals:{day:[],week:[]},activities:[],stats:{days:[],month:'2026-10'},habits:{categories:[],projects:[],achievements:{badges:[]}}};
  const fresh=JSON.parse(JSON.stringify(stale));fresh.user.avatar='px:hamster';
  let calls=0;
  const {p,app}=page('cycle',{globalData:{home:stale,dirty:true},
    api:async()=>{calls++;return fresh;}});
  await p.load();
  assert.equal(calls,1,'脏了必须重新拉');
  assert.equal(p.data.user.avatar,'px:hamster');
  assert.equal(app.globalData.dirty,false,'拉完清脏');
  await p.load();
  assert.equal(calls,1,'不脏时继续用缓存，别每次进页面都打接口');
});

// 周期看板顶部（2026-10-30）：进门第一眼是「我是谁、我攒了多少」。
test('周期看板顶部：头像卡摆出累计天/运动时长/单日最长/最长连续/当前连续',async()=>{
 const day=n=>new Date(Date.now()-n*86400000).toISOString().slice(0,10);
 const at=n=>day(n)+'T12:00:00Z';
 const home={
  user:{id:'3f9a2c11-aaaa',nickname:'小林',avatar:'px:fox',timeZone:'UTC',
    createdAt:new Date(Date.now()-30*86400000).toISOString()},
  goals:{today:day(0),weekStart:'2026-10-26',week:[]},
  habits:{achievements:{closedWeeks:[]},categories:[{projects:[{kind:'resistance',progress:{days:[day(3)]}}]}]},
  activities:[
   {type:'running',occurredAt:at(6),durationSec:1800},
   {type:'running',occurredAt:at(5),durationSec:3600},
   {type:'walking',occurredAt:at(4),durationSec:0}
  ]};
 let url='';
 const {p}=page('cycle',{globalData:{home},api:async()=>home,wx:{navigateTo:o=>url=o.url}});
 await p.onShow();

 assert.equal(p.data.user.avatar,'px:fox');
 assert.equal(p.data.user.nickname,'小林');
 assert.equal(p.data.meta,'加入第 31 天','昵称下面写「加入第 N 天」，不摆 wx_ 开头的编号');

 assert.equal(p.data.meStats.length,5);
 const m={};p.data.meStats.forEach(s=>{m[s.k]=s;});
 assert.equal(m.days.n,'4','心肺两天 + 散步一天 + 抗阻一天');
 assert.equal(m.time.n,'1.5','90 分钟 = 1.5 小时');
 assert.equal(m.time.u,'时');
 assert.equal(m.best.n,'60','单日最长 60 分');
 assert.equal(m.longest.n,'4','连着四天有记录');
 assert.equal(m.current.n,'0','昨天今天都没记，当前连续是 0（不报「你断了」，但数字照实）');

 p.openAvatar();
 assert.equal(url,'/pages/avatar/avatar','点头像去挑头像');
});

// ── 「算作运动」通路（2026-10-30）：新建分组时勾上，打卡就会进运动热力图 ──
test('create：新建分组可勾「算作运动」，POST /categories 带 sport 标记',async()=>{
 const calls=[];const {p}=page('create',{api:async(path,method,body)=>{calls.push({path,method,body});return {id:'cat1'};},
  wx:{navigateBack(){},setNavigationBarTitle(){}}});
 p.setData({only:true,name:'瑜伽'});
 p.toggleCatSport({detail:{value:true}});
 await p.save();
 const call=calls.find(c=>c.path==='/categories');
 assert.ok(call,'只建分组时只发 /categories');
 assert.equal(call.body.sport,true,'勾了开关要带上 sport 标记');
 assert.equal(call.body.name,'瑜伽');
 // 不勾就是普通生活分组
 calls.length=0;
 const {p:p2}=page('create',{api:async(path,method,body)=>{calls.push({path,method,body});return {id:'cat2'};},
  wx:{navigateBack(){},setNavigationBarTitle(){}}});
 p2.setData({only:true,name:'阅读'});
 await p2.save();
 assert.equal(calls[0].body.sport,false,'默认不是运动类别');
});

// 微信昵称一键带名 + 教练备注（用户 10-30）：
// 昵称输入框用官方 type="nickname"（键盘浮「使用微信昵称」）；教练端有备注入口，备注走 PATCH 接口
test('昵称输入支持微信一键带入；教练端有备注入口', () => {
  const account = require('fs').readFileSync('miniprogram/pages/account/account.wxml', 'utf8');
  assert.match(account, /name="nickname" type="nickname"/, '个人设置的昵称输入框要支持「使用微信昵称」');
  const authorize = require('fs').readFileSync('miniprogram/pages/authorize/authorize.wxml', 'utf8');
  assert.match(authorize, /type="nickname"/, '授权页「教练怎么称呼你」也要能一键带入微信名');
  const coach = require('fs').readFileSync('miniprogram/pages/coach/coach.js', 'utf8');
  assert.match(coach, /editRemark/, '教练端要有备注入口');
  assert.match(coach, /\/remark', 'PATCH'/, '备注走 PATCH /coach/members/:id/remark');
  const member = require('fs').readFileSync('miniprogram/pages/member/member.wxml', 'utf8');
  assert.match(member, /remark/, '会员个人页要显示教练的备注');
});

test('首页记录列表：日期带周几与时刻，左滑才露出删除，竖向滑动不抢滚动', async () => {
  const zone = 'Asia/Shanghai';
  const key = ms => new Intl.DateTimeFormat('en-CA', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(ms));
  const today = key(Date.now());
  const home = { user: { timeZone: zone }, stats: { month: today.slice(0, 7), days: [today] },
    activities: [{ id: 'a1', type: 'running', durationSec: 900, distanceM: 2000, intensity: 'vigorous', occurredAt: new Date().toISOString() }],
    habits: { categories: [], projects: [], achievements: { badges: [] } }, goals: { day: [], week: [] }, water: null, body: {} };
  const { p } = page('home', { api: async () => home, globalData: { token: 'local' } });
  p.data.month = today.slice(0, 7); p.data.swipeW = 84;
  await p.onShow();
  const row = p.data.cardioWeekLog[0];
  assert.ok(row, '本周有氧记录列出来了');
  assert.match(row.when, /^今天 周[一二三四五六日]$/, '今天那笔标「今天 + 周几」');
  assert.match(row.clock, /^\d{2}:\d{2}$/, '带发生时刻，同一天两笔才分得清');
  p.swipeStart({ currentTarget: { dataset: { id: 'a1' } }, touches: [{ clientX: 300, clientY: 500 }] });
  p.swipeMove({ currentTarget: { dataset: { id: 'a1' } }, touches: [{ clientX: 250, clientY: 506 }] });
  assert.equal(p.data.swipeId, 'a1', '横滑才认');
  assert.equal(p.data.swipeDx, 50, '跟手露出');
  p.swipeEnd({});
  assert.equal(p.data.swipeDx, 84, '过一半吸附全开');
  p.data.swipeId = ''; p.data.swipeDx = 0;
  p.swipeStart({ currentTarget: { dataset: { id: 'a1' } }, touches: [{ clientX: 300, clientY: 500 }] });
  p.swipeMove({ currentTarget: { dataset: { id: 'a1' } }, touches: [{ clientX: 302, clientY: 545 }] });
  assert.equal(p.data.swipeId, '', '竖向滑动不开删除，页面照旧滚');
  p.data.swipeId = 'a1'; p.data.swipeDx = 84;
  p.openLog({ currentTarget: { dataset: { id: 'a1' } } });
  assert.equal(p.data.swipeDx, 0, '滑开时点行先收起，不跳转');
  await new Promise(r => setTimeout(r, 260));
  assert.equal(p.data.swipeId, '', '收完摘掉删除块');
});
