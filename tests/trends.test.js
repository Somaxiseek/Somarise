// 周期看板「本月强度构成」（intensityMix）的纯函数单测：全部从 /home 现成字段派生，不碰后端。
// 重点验证：只算有氧（抗阻没有强度这一栏）、百分比合计 100、空数据兜底、未来日期忽略。
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {intensityMix}=require('../miniprogram/utils/cycles');

// 与 guidelines.dateKey 同口径：en-CA + 用户时区，出来是 YYYY-MM-DD
const ZONE='Asia/Shanghai';
function todayKey(){ return new Intl.DateTimeFormat('en-CA',{timeZone:ZONE}).format(new Date()); }
function shiftDay(d,n){ return new Date(Date.parse(d+'T12:00:00Z')+n*86400000).toISOString().slice(0,10); }
function pctOf(t,key){ return t.intensity.find(x=>x.key===key).pct; }
function valOf(t,key){ return t.intensity.find(x=>x.key===key).value; }

test('intensityMix: 空 home 也能出三档空数据，不报错',()=>{
  const t=intensityMix({});
  assert.equal(t.intensity.length,3,'强度三档：低 / 中 / 高');
  assert.equal(t.intensityTotal,0);
  assert.deepEqual(t.intensity.map(m=>m.value),[0,0,0]);
  assert.deepEqual(t.intensity.map(m=>m.pct),[0,0,0],'没数据时百分比是 0，不是 NaN');
});

test('intensityMix: 本月按强度分低 / 中 / 高；没给 strengthSessions 时抗阻不进这张饼',()=>{
  const today=todayKey();
  const home={
    user:{timeZone:ZONE},
    activities:[
      {type:'running',occurredAt:today+'T20:00:00+08:00',durationSec:1800,intensity:'vigorous'},
      {type:'walking',occurredAt:today+'T08:00:00+08:00',intensity:'low'},
      {type:'walking',occurredAt:today+'T12:00:00+08:00',intensity:'low'}
    ],
    habits:{categories:[{projects:[
      {kind:'resistance',progress:{days:[today]}}
    ]}]}
  };
  const t=intensityMix(home);

  // 强度饼按「一次有氧」算，抗阻没有强度这一栏，不进这张饼
  assert.equal(t.intensityTotal,3,'3 次有氧（抗阻不算）');
  assert.equal(valOf(t,'low'),2);
  assert.equal(valOf(t,'moderate'),0);
  assert.equal(valOf(t,'vigorous'),1);
  assert.equal(pctOf(t,'low'),67);
  assert.equal(pctOf(t,'vigorous'),33);
  assert.deepEqual(t.intensity.map(x=>x.color),['#5FB6C6','#EF9F3C','#D93B36'],'低→高是一条冷到暖的梯度');
});

test('intensityMix: 三档百分比加起来一定是 100（1/1/1 不能是 33/33/33=99）',()=>{
  const today=todayKey();
  const home={user:{timeZone:ZONE},activities:[
    {type:'running',occurredAt:today+'T06:00:00+08:00',durationSec:600,intensity:'low'},
    {type:'running',occurredAt:today+'T07:00:00+08:00',durationSec:600,intensity:'moderate'},
    {type:'running',occurredAt:today+'T08:00:00+08:00',durationSec:600,intensity:'vigorous'}
  ],habits:{categories:[]}};
  const t=intensityMix(home);
  assert.equal(t.intensityTotal,3);
  assert.equal(t.intensity.reduce((n,x)=>n+x.pct,0),100);
  assert.deepEqual(t.intensity.map(x=>x.pct),[34,33,33],'余数给小数部分最大的那档');
});

test('intensityMix: 没写强度按中等算（老记录 / 表单没选的情况）',()=>{
  const today=todayKey();
  const home={user:{timeZone:ZONE},activities:[
    {type:'running',occurredAt:today+'T20:00:00+08:00',durationSec:1800}
  ],habits:{categories:[]}};
  const t=intensityMix(home);
  assert.equal(valOf(t,'moderate'),1);
  assert.equal(t.intensityTotal,1);
});

test('intensityMix: 未来日期的活动不计入（防止把明天预排的也算进本月）',()=>{
  const today=todayKey();
  const tmr=shiftDay(today,1);
  const home={user:{timeZone:ZONE},activities:[
    {type:'running',occurredAt:tmr+'T20:00:00+08:00',durationSec:1800,intensity:'moderate'}
  ],habits:{categories:[]}};
  const t=intensityMix(home);
  assert.equal(t.intensityTotal,0,'未来活动不计');
});

test('intensityMix: 上个月的活动不计入本月',()=>{
  const today=todayKey();
  const lastMonth=shiftDay(today.slice(0,7)+'-01',-1);
  const home={user:{timeZone:ZONE},activities:[
    {type:'running',occurredAt:lastMonth+'T20:00:00+08:00',durationSec:1800,intensity:'vigorous'}
  ],habits:{categories:[]}};
  const t=intensityMix(home);
  assert.equal(t.intensityTotal,0,'口径是「本月」');
});

test('intensityMix: 非心肺类型（strength 直接记的活动）不进这张饼',()=>{
  const today=todayKey();
  const home={user:{timeZone:ZONE},activities:[
    {type:'strength',occurredAt:today+'T20:00:00+08:00',durationSec:1800,intensity:'moderate'}
  ],habits:{categories:[]}};
  const t=intensityMix(home);
  assert.equal(t.intensityTotal,0,'CARDIO_TYPES 之外的直接记的训练不算有氧');
});

test('intensityMix: 抗阻项目 progress.days 再多也不进强度饼',()=>{
  const today=todayKey();
  const yest=shiftDay(today,-1);
  const home={user:{timeZone:ZONE},activities:[],
    habits:{categories:[
      {projects:[{kind:'resistance',progress:{days:[today]}}]},
      {projects:[{kind:'resistance',progress:{days:[yest]}}]},
      {projects:[{kind:'cardio',progress:{days:[today]}}]} // 非抗阻，同样不进
    ]}};
  const t=intensityMix(home);
  assert.equal(t.intensityTotal,0,'抗阻没有强度这一栏，不进强度饼');
});

// ── 抗阻强度合进饼图（2026-10-30 用户定稿）────────────────────────────
// 抗阻打卡现在要登记强度（低/中/高，与有氧共用一套词），服务端在
// habits.strengthSessions 里给本月的抗阻明细。两股合成一张饼，
// 才说得出「这个月练得偏轻还是偏重」。
test('intensityMix: 抗阻强度（strengthSessions）合进饼图，跨月的不算',()=>{
  const today=todayKey();
  // 从「本月 1 号」往前退一个月：直接用今天退会在 31 号踩到 JS 的进位
  // （10/31 → setUTCMonth(-1) → 9 月没有 31 号 → 滚成 10/01，跨月样本又变回本月）
  const lastMonth=(()=>{const d=new Date(Date.parse(today.slice(0,7)+'-01T12:00:00Z'));d.setUTCMonth(d.getUTCMonth()-1);return d.toISOString().slice(0,7)+'-15';})();
  const home={
    user:{timeZone:ZONE},
    activities:[
      {type:'running',occurredAt:today+'T20:00:00+08:00',durationSec:1800,intensity:'vigorous'}
    ],
    habits:{
      strengthSessions:[
        {date:today,part:'lower',intensity:'low'},
        {date:today,part:'upper',intensity:'vigorous'},
        {date:lastMonth,part:'full',intensity:'moderate'}
      ],
      categories:[]
    }
  };
  const t=intensityMix(home);
  assert.equal(t.intensityTotal,3,'2 次有氧里的 1 次 + 抗阻 2 次（上月那次不算）');
  assert.equal(valOf(t,'low'),1);
  assert.equal(valOf(t,'moderate'),0);
  assert.equal(valOf(t,'vigorous'),2);
});
