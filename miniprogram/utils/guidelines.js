// 健康基准（供新建项目页与首页打卡提示共用）
// 数值依据 ACE / ACSM 公共健康建议；心肺 150 分钟/周、抗阻 ≥2 次/周、饮水≈体重×35–40ml。
'use strict';

const CARDIO_TARGET_MIN=150;          // 每周中等强度有氧（分钟）
// ACE / ACSM 公开建议：健康成年人每周至少 2 天抗阻训练（推荐区间 2–3 天），2 次即达最低标准。
const RESISTANCE_TARGET=2;            // 每周抗阻训练（次）
const WATER_MIN_COEF=35, WATER_MAX_COEF=40; // ml / kg
// 周期必须明确写出来：心肺/抗阻是「每周」，饮水是「每天」
const CARDIO_PERIOD='每周', RESISTANCE_PERIOD='每周', WATER_PERIOD='每天';
const CARDIO_UNIT='分钟', RESISTANCE_UNIT='次', WATER_UNIT='ml';
const ACE_CARDIO='每周至少 150 分钟中等强度有氧运动，并安排 2–3 次心肺与抗阻训练，是维持健康的基础。 — 美国运动委员会（ACE）';
const ACE_RESIST='每周至少 2 次抗阻训练，覆盖主要肌群，是健康基础。 — 美国运动委员会（ACE）';
const CARDIO_TYPES=['running','cycling','swimming','walking','incline','cardio','ball'];

function dateKey(instant,zone){return new Intl.DateTimeFormat('en-CA',{timeZone:zone||'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(instant));}
function monday(todayStr){const off=(new Date(todayStr+'T12:00:00Z').getUTCDay()+6)%7;return new Date(Date.parse(todayStr+'T12:00:00Z')-off*86400000).toISOString().slice(0,10);}

// 本周中等强度心肺时长（分钟，按已记录运动时长估算）
function weeklyCardio(home){
  const zone=home&&home.user?home.user.timeZone:'Asia/Shanghai';
  const today=dateKey(Date.now(),zone);
  const start=monday(today);
  let min=0;
  for(const a of (home&&home.activities)||[]){
    if(CARDIO_TYPES.indexOf(a.type)<0)continue;
    const d=dateKey(a.occurredAt,zone);
    if(d<start||d>today)continue;
    min+=Math.round((a.durationSec||0)/60);
  }
  return {current:min,target:CARDIO_TARGET_MIN};
}

// 本周抗阻训练打卡次数（仅统计目标周期为 weekly 的抗阻项目）
function weeklyResistance(home){
  const zone=home&&home.user?home.user.timeZone:'Asia/Shanghai';
  const start=monday(dateKey(Date.now(),zone));
  let count=0;
  for(const c of (home&&home.habits&&home.habits.categories)||[]){
    for(const p of c.projects||[]){
      if(p.kind!=='resistance')continue;
      if(p.goal&&p.goal.period!=='weekly')continue;
      count+=(p.progress&&p.progress.days||[]).filter(d=>d>=start).length;
    }
  }
  return {current:count,target:RESISTANCE_TARGET};
}

// 今日饮水（ml）
function todayWater(home){
  for(const c of (home&&home.habits&&home.habits.categories)||[]){
    for(const p of c.projects||[]){
      if(p.kind==='hydration'&&p.water){return {current:p.water.totalMl||0,target:p.water.targetMl||0};}
    }
  }
  return {current:0,target:0};
}

function gap(v){return Math.max(0,v.target-v.current);}

// 统一给每条基准补上「周期 / 单位 / 百分比 / 剩余量」，文案层不再自己算
function pack(v,label,period,unit,remainWord){
  return Object.assign({},v,{
    label,period,unit,remainWord,
    remain:gap(v),
    percent:v.target?Math.min(100,Math.round(v.current/v.target*100)):0
  });
}

function summary(home){
  const cardio=pack(weeklyCardio(home),'心肺 · 中等强度',CARDIO_PERIOD,CARDIO_UNIT,'本周');
  const resistance=pack(weeklyResistance(home),'抗阻 · 力量训练',RESISTANCE_PERIOD,RESISTANCE_UNIT,'本周');
  const water=pack(todayWater(home),'饮水',WATER_PERIOD,WATER_UNIT,'今天');
  return {cardio,resistance,water,
    allMet:gap(cardio)===0&&gap(resistance)===0&&(water.target?gap(water)===0:false)};
}

module.exports={CARDIO_TARGET_MIN,RESISTANCE_TARGET,WATER_MIN_COEF,WATER_MAX_COEF,
  CARDIO_PERIOD,RESISTANCE_PERIOD,WATER_PERIOD,CARDIO_UNIT,RESISTANCE_UNIT,WATER_UNIT,
  ACE_CARDIO,ACE_RESIST,CARDIO_TYPES,dateKey,monday,weeklyCardio,weeklyResistance,todayWater,summary,gap};
