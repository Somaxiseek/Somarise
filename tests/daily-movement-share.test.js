const {test}=require('node:test'),assert=require('node:assert/strict');
const {Service,seed}=require('../server/domain'),{Habits}=require('../server/habits'),{Goals}=require('../server/goals');
const {todayReport,shareCard}=require('../miniprogram/utils/report');
test('散步保留真实时长，不计低强度周量，中高强度分别表达，分享固定两组三环',()=>{
 const s=new Service(seed(),()=>{},()=> '2026-10-30T04:00:00Z'),h=new Habits(s),g=new Goals(s,h);h.goals=g;
 for(const [i,intensity] of ['low','moderate','vigorous'].entries())s.put('demo-a',{type:'walking',occurredAt:'2026-10-30T0'+(i+1)+':00:00+08:00',timeZone:'Asia/Shanghai',distanceM:0,durationSec:900,intensity,visibility:'private',confirmed:true});
 const movement=g.moveItem('demo-a','2026-10-30');assert.equal(movement.details.length,3);assert.match(movement.details[0],/15分钟.*低强度/);assert.match(movement.details[1],/中等强度/);assert.match(movement.details[2],/高强度/);
 assert.equal(g.cardioMinutes('demo-a','2026-10-26','2026-11-01'),45);
 const card=shareCard(todayReport({goals:g.view('demo-a')}),'测试语录');assert.equal(card.groups.length,2);assert.equal(card.groups[0].items.length,3);assert.equal(card.groups[1].items.length,3);assert.deepEqual(card.groups[1].items.map(i=>i.key),['cardio','strength','water']);assert.match(card.summary,/低强度/);assert.doesNotMatch(JSON.stringify(card),/weightKg|waistCm/);
});
test('绘制两组圈和具体摘要，不画换句图标及编辑按钮',()=>{
 const texts=[],c=new Proxy({measureText:s=>({width:String(s).length*5}),fillText:s=>texts.push(s)}, {get:(o,k)=>k in o?o[k]:()=>{}});
 require('../miniprogram/utils/sharecard-paint').paintShareCard(c,320,360,{date:'2026-10-30',summary:'快走15分钟 · 中等强度',quote:'随时开始。',groups:[{title:'今日记录',items:[{key:'move',label:'运动',percent:100}]},{title:'本周进度',items:[]}]});
 assert.ok(texts.includes('TODAY'));assert.ok(texts.includes('THIS WEEK'));assert.ok(texts.some(t=>t.includes('快走')));assert.ok(!texts.includes('↻'));
});
