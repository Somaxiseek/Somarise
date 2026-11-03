const test=require('node:test');
const assert=require('node:assert');
const fs=require('node:fs');
const path=require('node:path');
const g=require('../miniprogram/utils/guidelines');

const day=n=>new Date(Date.now()-n*86400000).toISOString();
const home={
  user:{timeZone:'Asia/Shanghai'},
  activities:[{type:'running',occurredAt:day(0),durationSec:1800},{type:'cycling',occurredAt:day(0),durationSec:2400}],
  habits:{categories:[
    {projects:[{kind:'resistance',goal:{period:'weekly'},progress:{days:[day(0).slice(0,10)]}}]},
    {projects:[{kind:'hydration',water:{totalMl:600,targetMl:2100},progress:{days:[]}}]}
  ]}
};

test('health standards carry an explicit period so the UI never shows a bare fraction',()=>{
  const s=g.summary(home);
  assert.equal(s.cardio.target,150);
  assert.equal(s.cardio.period,'每周');
  assert.equal(s.cardio.unit,'分钟');
  assert.equal(s.cardio.remain,80);
  assert.equal(s.cardio.percent,47);
  assert.equal(s.resistance.target,2); // ACE/ACSM 最低标准：每周 2 次抗阻
  assert.equal(s.resistance.period,'每周');
  assert.equal(s.resistance.unit,'次');
  assert.equal(s.water.period,'每天');
  assert.equal(s.water.unit,'ml');
  assert.equal(s.water.remain,1500);
  assert.equal(s.allMet,false);
});

test('markup states the period in words and offers 250/500/1000 water shortcuts',()=>{
  const root=path.join(__dirname,'../miniprogram/pages');
  const homeWxml=fs.readFileSync(path.join(root,'home/home.wxml'),'utf8');
  const recordWxml=fs.readFileSync(path.join(root,'record/record.wxml'),'utf8');
  const projectWxml=fs.readFileSync(path.join(root,'project/project.wxml'),'utf8');
  const createJs=fs.readFileSync(path.join(root,'create/create.js'),'utf8');
  for(const source of [recordWxml,createJs]){
    assert.match(source,/每周/,'周期要写明「每周」');
  }
  // 有氧目标现在是用户自己定的，不能再把 150 分钟说成通用健康标准
  assert.doesNotMatch(recordWxml,/每周\s*150\s*分钟是健康基准/);
  // 详情 sheet 已删（和首页圆环零信息增量），日/周的区分收进卡片标题的切换
  assert.match(homeWxml,/ringView==='day'\?'今日目标':'本周目标'/,'圆环卡标题必须标出今日/本周');
  assert.match(homeWxml,/今日目标/);
  assert.match(homeWxml,/本周目标/);
  // 首页只讲今天：连续天数 / 本月 / 达标率这类统计全部收进成就页，
  // 「连续」是个计时器，断一天就归零，摆在天数旁边会跟「今天也不必比昨天更用力」打架
  assert.doesNotMatch(homeWxml,/连续天/,'首页不再摆连续天数');
  assert.doesNotMatch(homeWxml,/今日已记录/,'首页不再挂「今日已记录 N 项」的计数条');
  for(const step of ['250','500','1000']){
    assert.match(projectWxml,new RegExp('data-step="'+step+'"'),'missing water shortcut '+step);
  }
  assert.doesNotMatch(projectWxml,/data-step="100"/,'100ml shortcut should be gone');
});

test('hydration detail puts today first: the water card comes before goal and actions',()=>{
  const source=fs.readFileSync(path.join(__dirname,'../miniprogram/pages/project/project.wxml'),'utf8');
  const water=source.indexOf('det-water');
  const goal=source.indexOf('{{goalText}}目标');
  const actions=source.indexOf('class="det-actions"');
  assert.ok(water>0&&goal>water,'water recording card must lead the stats');
  assert.ok(actions>goal,'edit/history/backfill actions must sink below the stats');
});
