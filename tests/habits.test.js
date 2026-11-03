const {test}=require('node:test');const assert=require('node:assert/strict');const {Service,seed}=require('../server/domain');const {Habits,progress}=require('../server/habits');const {Learning}=require('../server/learning');const {Goals}=require('../server/goals');
function setup(){const s=new Service(seed(),()=>{},()=> '2026-10-25T10:00:00Z');const h=new Habits(s);const l=new Learning(h);h.goals=new Goals(s,h,l);return {s,h};}
function project(h,goal={period:'weekly',target:3}){const c=h.createCategory('demo-a',{name:'生活'});return h.createProject('demo-a',{categoryId:c.id,name:'阅读',goal});}
test('new users see no uncreated categories or sports',()=>{const {h}=setup();assert.equal(h.overview('demo-a').categories.length,0);const p=project(h);assert.equal(h.overview('demo-a').projects.length,1);assert.equal(h.overview('demo-b').projects.length,0);assert.throws(()=>h.project('demo-b',p.id));assert.throws(()=>h.createProject('demo-b',{categoryId:p.categoryId,name:'伪造',goal:{period:'weekly',target:3}}));});
test('generic daily confirmation is idempotent, private, deletable and future-safe',()=>{const {h}=setup(),p=project(h);const input={date:'2026-10-25',confirmed:true,requestId:'same-day'};const a=h.checkin('demo-a',p.id,input);assert.equal(h.checkin('demo-a',p.id,input).id,a.id,'同一个 requestId 重试不重复写入');const twice=h.checkin('demo-a',p.id,{date:'2026-10-25',confirmed:true,requestId:'second'});assert.notEqual(twice.id,a.id,'同一天可以记多条');h.removeCheckin('demo-a',twice.id);assert.equal(h.detail('demo-a',p.id).progress.total,1);assert.throws(()=>h.checkin('demo-b',p.id,input));assert.throws(()=>h.removeCheckin('demo-b',a.id));assert.throws(()=>h.checkin('demo-a',p.id,{...input,date:'2099-01-01'}));assert.throws(()=>h.checkin('demo-a',p.id,{...input,date:'2026-02-30'}));assert.throws(()=>h.checkin('demo-a',p.id,{...input,confirmed:false}));h.removeCheckin('demo-a',a.id);assert.equal(h.detail('demo-a',p.id).progress.total,0);});
test('weekly goal awards one cycle for three days and recomputes after deletion',()=>{const {h}=setup(),p=project(h);const records=['2026-10-19','2026-10-20','2026-10-21','2026-10-22'].map(date=>h.checkin('demo-a',p.id,{date,confirmed:true}));let v=h.overview('demo-a');assert.equal(v.achievements.recordDays,4);assert.equal(v.achievements.completedPeriods,1);assert.equal(v.projects[0].progress.count,4);h.removeCheckin('demo-a',records[0].id);h.removeCheckin('demo-a',records[1].id);assert.equal(h.overview('demo-a').achievements.completedPeriods,0);});
test('weeks are Monday-based, annual goals reset and streak cycles are non-overlapping',()=>{let p={goal:{period:'weekly',target:2}};let v=progress(p,['2025-12-29','2026-01-01','2026-01-05'],'2026-01-06');assert.equal(v.completedGoals,1);assert.equal(v.count,1);p={goal:{period:'yearly',target:2}};v=progress(p,['2025-12-30','2025-12-31','2026-01-01'],'2026-01-06');assert.equal(v.completedGoals,1);assert.equal(v.count,1);p={goal:{period:'streak',target:3}};v=progress(p,['2026-01-01','2026-01-02','2026-01-03','2026-01-04','2026-01-05','2026-01-06'],'2026-01-06');assert.equal(v.completedGoals,2);assert.equal(v.current,6);assert.equal(progress(p,v.days,'2026-01-09').current,0);});
test('legacy sport data creates only used projects and every recorded session counts as a record',()=>{const s=new Service(seed(),()=>{},()=> '2026-10-25T10:00:00Z');const body={type:'running',distanceM:500,durationSec:300,occurredAt:'2026-10-25T01:00:00Z',timeZone:'Asia/Shanghai',visibility:'private',confirmed:true};s.put('demo-a',body);const h=new Habits(s);let v=h.overview('demo-a');assert.equal(v.categories.length,1);assert.equal(v.projects.length,1);assert.equal(v.projects[0].sportType,'running');assert.equal(v.achievements.recordDays,1,'记了就算记录，不再按距离门槛过滤');const p=v.projects[0];assert.throws(()=>h.checkin('demo-a',p.id,{date:'2026-10-25',confirmed:true}));s.put('demo-a',{...body,distanceM:1000,projectId:p.id});v=h.overview('demo-a');assert.equal(v.achievements.recordDays,1);const other=h.createCategory('demo-b',{name:'训练'});const wrong=h.createProject('demo-b',{categoryId:other.id,name:'跑步',sportType:'running',goal:{period:'weekly',target:2}});assert.throws(()=>s.put('demo-a',{...body,projectId:wrong.id}));});
test('daily streak badges only apply to goals the user set as daily',()=>{const {h}=setup();const c=h.createCategory('demo-a',{name:'生活'});const p=h.createProject('demo-a',{categoryId:c.id,name:'阅读',goal:{period:'daily',target:1}});const first='2025-10-26';h.goals.db.goals.push({id:'g-streak',userId:'demo-a',key:'cat:'+c.id,period:'daily',metric:'count',target:1,recordOnly:false,hidden:false,effectiveFrom:first,createdAt:first+'T00:00:00Z'});const base=Date.parse(first+'T12:00:00Z');const ids=[];for(let i=0;i<365;i++)ids.push(h.checkin('demo-a',p.id,{date:new Date(base+i*86400000).toISOString().slice(0,10),confirmed:true,requestId:'s'+i}).id);const key='cat:'+c.id;let v=h.overview('demo-a');for(const n of [30,90,180,365])assert.equal(v.achievements.badges.find(x=>x.id==='streak-'+key+'-'+n).earned,true,'连续 '+n+' 天');h.removeCheckin('demo-a',ids[180]);v=h.overview('demo-a');assert.equal(v.achievements.badges.find(x=>x.id==='streak-'+key+'-'+365).earned,false,'中断后重算');assert.equal(v.achievements.badges.find(x=>x.id==='streak-'+key+'-'+90).earned,true);});
test('fixed two-month goal uses 50 as denominator and counts only the configured window',()=>{const {s,h}=setup();const c=h.createCategory('demo-a',{name:'抗阻训练'}),p=h.createProject('demo-a',{categoryId:c.id,name:'两月目标',kind:'resistance',goal:{period:'window',months:2,target:50}});assert.equal(p.goal.startDate,'2026-10-25');assert.equal(p.goal.endDate,'2026-12-24');h.checkin('demo-a',p.id,{date:'2026-10-25',confirmed:true});let result=h.detail('demo-a',p.id).progress;assert.equal(result.count,1);assert.equal(result.target,50);assert.equal(result.percent,2);result=progress(p,['2026-10-24','2026-10-25','2026-12-25'],'2026-12-26');assert.equal(result.count,1);assert.equal(result.completedGoals,0);assert.throws(()=>h.createProject('demo-a',{categoryId:c.id,name:'过量目标',goal:{period:'window',months:1,target:50}}));});
test('updateProject edits appearance and goal with ownership and validation',()=>{const {h}=setup();const c=h.createCategory('demo-a',{name:'生活'});const p=h.createProject('demo-a',{categoryId:c.id,name:'阅读',note:'旧的',goal:{period:'weekly',target:3}});
const updated=h.updateProject('demo-a',p.id,{name:'读书',note:'每天进步一点点',color:'#A659C5',icon:'📖',goal:{period:'weekly',target:4}});
assert.equal(updated.name,'读书');assert.equal(updated.note,'每天进步一点点');assert.equal(updated.color,'#A659C5');
// 老数据里存的旧紫色写进来要挪到新色值，不然只有老账号还是旧配色
assert.equal(h.updateProject('demo-a',p.id,{color:'#8B5CF6'}).color,'#A659C5');
// 图标从 emoji 改成几何形状：老数据写进来的 emoji 会被换成形状，不留在库里
assert.equal(updated.icon,'bar','📖 迁移成 bar 形状');
assert.equal(h.updateProject('demo-a',p.id,{icon:'diamond'}).icon,'diamond','形状 key 原样保存');
assert.equal(h.updateProject('demo-a',p.id,{icon:'🌙'}).icon,'diamond','🌙 迁移成 diamond');
assert.equal(h.updateProject('demo-a',p.id,{icon:'💧'}).icon,'ring','💧 迁移成 ring');
assert.equal(updated.goal.target,4);
assert.throws(()=>h.updateProject('demo-b',p.id,{name:'伪造'}),/不存在/);
assert.equal(h.updateProject('demo-a',p.id,{color:'#FF00FF'}).color,null);
const detail=h.detail('demo-a',p.id);assert.equal(detail.progress.target,4);});

// ── 「运动」通路 + 抗阻强度（2026-10-30 用户定稿）────────────────────
test('category sport flag: builtin categories are always sport, custom opt-in via flag',()=>{
  const {h}=setup();
  const yoga=h.createCategory('demo-a',{name:'瑜伽',sport:true});
  const reading=h.createCategory('demo-a',{name:'阅读'});
  const res=h.createCategory('demo-a',{name:'抗阻训练'});
  const {sportOf}=require('../server/habits');
  assert.equal(sportOf(yoga),true,'勾了「算作运动」就是运动类别');
  assert.equal(sportOf(reading),false,'生活类别不进运动统计');
  assert.equal(sportOf(res),true,'抗阻训练按名字恒为运动，不用存标记');
  assert.equal(sportOf({name:'心肺训练'}),true,'心肺训练同理');
});

// overview 带本周抗阻明细（含 id）：首页抗阻卡展开逐条列出、逐条可删（2026-10-30）
test('overview carries this week\'s resistance records with ids for undo',()=>{
  const {h}=setup();
  const c=h.createCategory('demo-a',{name:'抗阻训练'});
  const p=h.createProject('demo-a',{categoryId:c.id,name:'力量训练',kind:'resistance',goal:{period:'weekly',target:3}});
  const a=h.checkin('demo-a',p.id,{date:'2026-10-25',confirmed:true,part:'lower',intensity:'vigorous'});
  h.checkin('demo-a',p.id,{date:'2026-10-19',confirmed:true,part:'upper',intensity:'low'});
  h.checkin('demo-a',p.id,{date:'2026-10-18',confirmed:true}); // 上上周，不进本周
  const proj=h.overview('demo-a').projects.find(x=>x.id===p.id);
  assert.equal(proj.weekRecords.length,2,'只带本周（周一 2026-10-19 起）的记录');
  assert.equal(proj.weekRecords[0].id,a.id,'最新在前且带 id');
  assert.equal(proj.weekRecords[0].part,'lower');
  h.removeCheckin('demo-a',a.id);
  assert.equal(h.overview('demo-a').projects.find(x=>x.id===p.id).weekRecords.length,1,'删掉后明细同步减少');
});

test('resistance checkin stores intensity (defaults to moderate for legacy clients)',()=>{  const {h}=setup();
  const c=h.createCategory('demo-a',{name:'抗阻训练'});
  const p=h.createProject('demo-a',{categoryId:c.id,name:'力量训练',kind:'resistance',goal:{period:'weekly',target:3}});
  const hi=h.checkin('demo-a',p.id,{date:'2026-10-25',confirmed:true,intensity:'vigorous'});
  assert.equal(hi.intensity,'vigorous');
  const lo=h.checkin('demo-a',p.id,{date:'2026-10-24',confirmed:true,intensity:'low'});
  assert.equal(lo.intensity,'low');
  const legacy=h.checkin('demo-a',p.id,{date:'2026-10-23',confirmed:true});
  assert.equal(legacy.intensity,'moderate','老客户端没带强度按中等算');
  assert.throws(()=>h.checkin('demo-a',p.id,{date:'2026-10-22',confirmed:true,intensity:'hard'}),'非法强度要拒绝');
});

test('overview carries this month\'s strength sessions with intensity for the pie',()=>{
  const {h}=setup();
  const c=h.createCategory('demo-a',{name:'抗阻训练'});
  const p=h.createProject('demo-a',{categoryId:c.id,name:'力量训练',kind:'resistance',goal:{period:'weekly',target:3}});
  h.checkin('demo-a',p.id,{date:'2026-10-25',confirmed:true,intensity:'low'});
  h.checkin('demo-a',p.id,{date:'2026-10-20',confirmed:true,intensity:'vigorous'});
  h.checkin('demo-a',p.id,{date:'2026-09-15',confirmed:true,intensity:'vigorous'});
  const v=h.overview('demo-a');
  assert.equal(v.strengthSessions.length,2,'只给本月的，九月那次不进来');
  assert.deepEqual(v.strengthSessions.map(s=>s.intensity).sort(),['low','vigorous']);
});

// ── 目标方式扩展（用户 10-30 定稿）：每月周期 + 分钟指标 ─────────────
test('monthly goal resets on the 1st and counts each month separately',()=>{
  const {h}=setup();
  const c=h.createCategory('demo-a',{name:'生活'});
  const p=h.createProject('demo-a',{categoryId:c.id,name:'拉伸',goal:{period:'monthly',target:3}});
  // 10 月记 2 次（不够），9 月记 3 次（达标 1 个周期）
  for(const d of ['2026-09-05','2026-09-14','2026-09-28','2026-10-20','2026-10-24'])h.checkin('demo-a',p.id,{date:d,confirmed:true});
  const v=progress(p,['2026-09-05','2026-09-14','2026-09-28','2026-10-20','2026-10-24'],'2026-10-25');
  assert.equal(v.count,2,'本月（10 月）只算 10 月的打卡');
  assert.equal(v.completedGoals,1,'9 月 3 次算达标 1 个周期');
  assert.equal(v.start,'2026-10-01');assert.equal(v.end,'2026-10-31');
  // 校验边界：每月最多 31 次
  assert.throws(()=>h.createProject('demo-a',{categoryId:c.id,name:'过量',goal:{period:'monthly',target:32}}));
});

test('duration goal sums minutes per checkin and percent reflects minutes',()=>{
  const {h}=setup();
  const c=h.createCategory('demo-a',{name:'生活'});
  const p=h.createProject('demo-a',{categoryId:c.id,name:'冥想',metric:'duration',goal:{period:'weekly',target:150}});
  h.checkin('demo-a',p.id,{date:'2026-10-19',confirmed:true,amount:60});
  h.checkin('demo-a',p.id,{date:'2026-10-20',confirmed:true,amount:45});
  h.checkin('demo-a',p.id,{date:'2026-10-21',confirmed:true,amount:45});
  const v=h.detail('demo-a',p.id).progress;
  assert.equal(v.count,150,'进度按分钟求和而不是天数');
  assert.equal(v.percent,100);assert.equal(v.achieved,true);
  // 一天多笔叠加
  h.checkin('demo-a',p.id,{date:'2026-10-22',confirmed:true,amount:30});
  h.checkin('demo-a',p.id,{date:'2026-10-22',confirmed:true,amount:15});
  assert.equal(h.detail('demo-a',p.id).progress.count,195);
  // amount 校验：0 和超大都要拒
  assert.throws(()=>h.checkin('demo-a',p.id,{date:'2026-10-23',confirmed:true,amount:-5}));
  assert.throws(()=>h.checkin('demo-a',p.id,{date:'2026-10-23',confirmed:true,amount:200000}));
});

test('syncFromProject wires monthly/yearly goals into the ring view',()=>{
  const {h}=setup();
  const c=h.createCategory('demo-a',{name:'冥想'});
  const p=h.createProject('demo-a',{categoryId:c.id,name:'每天打坐',goal:{period:'monthly',target:12}});
  const row=h.goals.db.goals.find(g=>g.key==='cat:'+c.id);
  assert.ok(row,'自建月度目标要进圆环');
  assert.equal(row.period,'monthly');assert.equal(row.target,12);
  const view=h.goals.view('demo-a');
  const item=(view.week||[]).concat(view.day||[]).find(x=>x.key==='cat:'+c.id);
  assert.ok(item,'月度目标在圆环里可见');
  assert.equal(item.target,12);
});
