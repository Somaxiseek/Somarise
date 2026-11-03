const {test}=require('node:test');const assert=require('node:assert/strict');const {Service,seed}=require('../server/domain');const {Habits}=require('../server/habits');
function setup(){const s=new Service(seed(),()=>{},()=> '2026-10-26T10:00:00Z'),h=new Habits(s);const c=h.createCategory('demo-a',{name:'饮水'});const p=h.createProject('demo-a',{categoryId:c.id,name:'每日饮水',kind:'hydration',hydration:{weightKg:60,coefficient:35,targetMl:1},goal:{period:'weekly',target:7}});return {s,h,p,c};}
test('weight based range and target are calculated on server, not trusted from client',()=>{const {h,p}=setup();assert.equal(p.hydration.minMl,2100);assert.equal(p.hydration.maxMl,2400);assert.equal(p.hydration.targetMl,2100);assert.equal(h.detail('demo-a',p.id).water.percent,0);assert.throws(()=>h.checkin('demo-a',p.id,{confirmed:true,date:'2026-10-26'}));});
test('drinks add within a day, repeated requests are idempotent, attainment grants one day',()=>{const {h,p}=setup();const add=(amountMl,id,date='2026-10-26')=>h.water('demo-a',p.id,{amountMl,requestId:id,date,confirmed:true});const a=add(1000,'a');assert.equal(add(1000,'a').id,a.id);assert.throws(()=>add(1200,'a'));assert.equal(h.detail('demo-a',p.id).water.totalMl,1000);assert.equal(h.overview('demo-a').achievements.recordDays,1,'没到目标也算已记录');add(1100,'b');let d=h.detail('demo-a',p.id);assert.equal(d.water.achieved,true);assert.equal(d.water.percent,100);assert.equal(d.progress.total,1);add(500,'c');assert.equal(h.detail('demo-a',p.id).water.totalMl,2600);assert.equal(h.detail('demo-a',p.id).progress.total,1);h.removeWater('demo-a',a.id);assert.equal(h.detail('demo-a',p.id).water.percent,76);assert.equal(h.detail('demo-a',p.id).progress.total,0);add(1000,'d','2026-10-25');assert.equal(h.detail('demo-a',p.id).water.totalMl,1600);});
test('hydration validates ownership, input ranges and dates; resistance confirms without distance',()=>{const {h,p,c}=setup();const body={amountMl:250,requestId:'a',date:'2026-10-26',confirmed:true};assert.throws(()=>h.water('demo-b',p.id,body));for(const patch of [{amountMl:0},{amountMl:-5},{amountMl:2001},{amountMl:1.5},{confirmed:false},{date:'2026-02-30'},{date:'2099-01-01'},{requestId:''}])assert.throws(()=>h.water('demo-a',p.id,{...body,...patch}));const e=h.water('demo-a',p.id,body);assert.throws(()=>h.removeWater('demo-b',e.id));assert.throws(()=>h.createProject('demo-a',{categoryId:c.id,name:'无效',kind:'hydration',hydration:{weightKg:0,coefficient:35},goal:{period:'weekly',target:7}}));assert.throws(()=>h.createProject('demo-a',{categoryId:c.id,name:'无效',kind:'hydration',hydration:{weightKg:60,coefficient:50},goal:{period:'weekly',target:7}}));const r=h.createProject('demo-a',{categoryId:c.id,name:'抗阻训练',kind:'resistance',goal:{period:'weekly',target:3}});h.checkin('demo-a',r.id,{date:'2026-10-26',confirmed:true});assert.equal(h.detail('demo-a',r.id).progress.total,1);assert.throws(()=>h.water('demo-a',r.id,body));});
test('progress-ring 用 conic-gradient：未达标画弧，达标收洞变实心圆，0% 只剩轨道',()=>{
  const vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
  const arcs=require('../miniprogram/utils/arcs');
  let component;
  vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../miniprogram/components/progress-ring/progress-ring.js'),'utf8'),{
    Component:x=>component=x, require:()=>arcs, Math
  });
  const instance={data:{size:72,percent:150,color:'#FF6B35'},setData(d){Object.assign(this.data,d);}};
  component.methods.build.call(instance);
  assert.equal(instance.data.fill,'#FF6B35');
  // 达标（>=100%）：收掉中间的洞 → 实心圆；不再画端头，文字转白压得住实色盘
  assert.equal(instance.data.hole,0,'达标收洞 → 实心圆');
  assert.equal(instance.data.caps.length,0,'实心圆不需要端头，避免盘面多一个阴影点');
  assert.equal(instance.data.labelColor,'#ffffff','实心圆上文字转白');
  // 半程：仍是环，洞还在、两个端头
  instance.data.percent=50;
  component.methods.build.call(instance);
  assert.equal(instance.data.hole,62);
  assert.equal(instance.data.caps.length,2);
  assert.equal(instance.data.labelColor,'#111111');
  // 0%：只剩轨道，什么都不画
  instance.data.percent=0;
  component.methods.build.call(instance);
  assert.equal(instance.data.fill,'none');
  assert.equal(instance.data.caps.length,0);
});
test('daily total replaces earlier drinks and later totals without double counting; stale writes conflict',()=>{const {h,p}=setup();h.water('demo-a',p.id,{amountMl:500,requestId:'old',date:'2026-10-26',confirmed:true});const body={date:'2026-10-26',amountMl:2200,requestId:'total-a',revision:1,confirmed:true};const a=h.setWaterTotal('demo-a',p.id,body);assert.equal(h.setWaterTotal('demo-a',p.id,body).id,a.id);assert.equal(h.detail('demo-a',p.id).water.totalMl,2200);assert.equal(h.detail('demo-a',p.id).records.length,1);assert.equal(h.detail('demo-a',p.id).progress.total,1);h.setWaterTotal('demo-a',p.id,{...body,amountMl:1000,requestId:'total-b',revision:2});assert.equal(h.detail('demo-a',p.id).water.totalMl,1000);assert.equal(h.detail('demo-a',p.id).progress.total,0);assert.throws(()=>h.setWaterTotal('demo-a',p.id,{...body,requestId:'stale',revision:1}),/刷新/);assert.throws(()=>h.setWaterTotal('demo-b',p.id,body));h.setWaterTotal('demo-a',p.id,{...body,amountMl:0,requestId:'zero',revision:3});assert.equal(h.detail('demo-a',p.id).water.totalMl,0);});
