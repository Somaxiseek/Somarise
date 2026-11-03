const {test}=require('node:test');
const assert=require('node:assert');
const {buildSeries,defaultRange,RANGES}=require('../miniprogram/utils/bodyseries');

const today='2026-10-27';
const years=[
  {year:'2026',weightKg:70,waistCm:80,count:3,months:[
    {month:'2026-10',label:'10月',weightKg:70,waistCm:80,count:2,weeks:[
      {start:'2026-10-19',end:'2026-10-25',label:'10/19 起',weightKg:70,waistCm:80,count:2},
      {start:'2026-10-26',end:'2026-11-01',label:'10/26 起',weightKg:null,waistCm:null,count:0}
    ]},
    {month:'2026-09',label:'9月',weightKg:71,waistCm:81,count:1,weeks:[
      {start:'2026-09-21',end:'2026-09-27',label:'09/21 起',weightKg:71,waistCm:81,count:1}
    ]}
  ]},
  {year:'2024',weightKg:75,waistCm:86,count:1,months:[
    {month:'2024-02',label:'2月',weightKg:75,waistCm:86,count:1,weeks:[]}
  ]}
];

test('近 1 月覆盖最近 30 天（含 30 天前那一周），没测的周留空而不是连成直线',()=>{
  const s=buildSeries(years,today,'1m');
  assert.equal(s.points.length,6);
  assert.deepEqual(s.points.map(p=>p.key),['2026-09-21','2026-09-28','2026-10-05','2026-10-12','2026-10-19','2026-10-26']);
  assert.equal(s.points[0].weightKg,71);
  assert.equal(s.points[1].weightKg,null);
  assert.equal(s.points[4].weightKg,70);
  assert.equal(s.points[4].waistCm,80);
  assert.equal(s.points[5].weightKg,null);
  assert.match(s.scope,/近 1 月/);
  assert.equal(s.empty,false);
});

test('近 1 年按月连续排列 12 个点，跨年标签不丢年份',()=>{
  const s=buildSeries(years,today,'1y');
  assert.equal(s.points.length,12);
  assert.equal(s.points[0].key,'2025-11');
  assert.equal(s.points.at(-1).key,'2026-10');
  assert.equal(s.points[0].label,'11月');
  assert.equal(s.points[2].label,'26/01');
  assert.deepEqual(s.points.map(p=>p.key).filter(k=>k===today.slice(0,7)).length,1);
});

test('近 3 年给 36 个月，近 5 年压缩成 20 个季度',()=>{
  const three=buildSeries(years,today,'3y');
  assert.equal(three.points.length,36);
  assert.equal(three.points.at(-1).key,'2026-10');
  const five=buildSeries(years,today,'5y');
  assert.equal(five.points.length,20);
  const q4=five.points.at(-1);
  assert.equal(q4.label,'26Q4');
  assert.equal(q4.weightKg,70);
});

test('区间里没有记录时标记为空，页面显示提示而不是画一条假曲线',()=>{
  const s=buildSeries(years,today,'1m');
  const none=buildSeries([],today,'1m');
  assert.equal(none.empty,true);
  assert.equal(none.measured,0);
  assert.equal(s.empty,false);
});

test('默认区间按已有数据跨度选择，只有一个月数据就落在近 1 月',()=>{
  assert.equal(defaultRange(years,today),'3y');
  assert.equal(defaultRange([{year:'2026',months:[{month:'2026-10',label:'10月',weeks:[]}]}],today),'1m');
  assert.equal(defaultRange([],today),'1y');
  const long=[{year:'2021',months:[{month:'2021-01',label:'1月',weeks:[]}]}];
  assert.equal(defaultRange(long,today),'5y');
  const mid=[{year:'2024',months:[{month:'2024-06',label:'6月',weeks:[]}]}];
  assert.equal(defaultRange(mid,today),'3y');
  assert.deepEqual(RANGES.map(r=>r.id),['1m','1y','3y','5y']);
});
