const {test}=require('node:test'),assert=require('node:assert/strict');
const {Service,seed}=require('../server/domain'),{Body}=require('../server/body');
test('首页体测分别平均实际测量：缺项不补零，比较上一自然周，账号隔离',()=>{
 const s=new Service(seed(),()=>{},()=> '2026-10-29T02:00:00Z'),b=new Body(s);
 for(const record of [{date:'2026-10-20',weightKg:62.9,waistCm:74.9},{date:'2026-10-26',weightKg:62.5,waistCm:74.5},{date:'2026-10-27',weightKg:62.7}])b.record('demo-a',record);
 b.record('demo-b',{date:'2026-10-26',weightKg:100,waistCm:100});
 const h=b.homeSummary('demo-a');assert.equal(h.week.weightKg,62.6);assert.equal(h.week.waistCm,74.5);assert.equal(h.previousWeek.weightKg,62.9);assert.equal(h.previousWeek.waistCm,74.9);
 const empty=b.homeSummary('demo-b');assert.equal(empty.previousWeek.weightKg,null);
});
