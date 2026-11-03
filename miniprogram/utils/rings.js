// 圆环只负责展示。数字、周期和「达标没达标」全部由服务端算好（server/goals.js），
// 前端不再自己造一套口径，也不再把不同周期合成一个完成率。
//   今日圆环 = 用户启用的每日目标（饮水 / 英语 / 自己建的每日习惯）
//   本周圆环 = 每周目标（心肺分钟 / 抗阻训练天数 / 自己建的每周习惯）
// 每一组想放几个就几个：一个也行，没有也不强迫。仅记录的项目显示累计量，不画完成率。
'use strict';

// 色值统一放 utils/tokens.js（服务端也 require 同一个文件，改一处两边都对）。
// 运动圈用浅红：它是「仅记录」圈，渲染时再按 62% 走一遍，实际是中浅红，
// 跟周环那个正红不会撞色，也不至于像墨黑那样跟文字抢分量
const {TOKENS}=require('./tokens');
const COLORS={move:TOKENS.move,water:TOKENS.water,cardio:TOKENS.cardio,strength:TOKENS.strength,body:TOKENS.body,learn:TOKENS.english,english:TOKENS.english};
// 环固定三圈（用户 10-29：不做四圈，不做动态收环宽）：
// 第 4 项起不画环、也不进图例/列表（最多三行，要取舍）；服务端的周闭环照常算它。
const RING_MAX=3;

function pack(items,period,caption){
  const list=Array.isArray(items)?items:[];
  // 吸附向外（用户 10-29）：隐藏的不占槽位，可见项从最外圈依次排，空位留在最里面；
  // 环固定三圈（RING_MAX）：第 4 项起不画环也不进图例——列表最多三行，要取舍。
  // （第 4 项如果设了周规则，服务端的周闭环照常算它，只是不展示。）
  const ringed=list.filter(i=>!i.hidden).slice(0,RING_MAX);
  const targeted=ringed.filter(i=>!i.recordOnly);
  const closed=targeted.filter(i=>i.closed).length;
  return {
    // 图例 = 占环的那几个，最多三行
    items:ringed,period,caption,
    closed,total:targeted.length,targeted:targeted.length,
    hasTarget:targeted.length>0,
    // 有项目在记、但一条线都没定 → 这周闭不上环，页面上直说（没有任何周项目就不啰嗦）
    needsTarget:ringed.length>0&&targeted.length===0,
    allClosed:targeted.length>0&&closed===targeted.length,
    // 中心永久留白（用户 10-29 定稿）：像 Apple Watch 的环，中间不放数字。
    // 卡片底部也不再有「N 环已达标」（用户 10-29 追加：环闭没闭一眼就看得出，不用字说）。
    center:'',
    // 每一项都画进环里，仅记录的也不例外（用户 10-29：今日三条记录就该有三个环）：
    //   普通项按完成率铺；仅记录项记过就整圈划满（soft 压一档明度），没记过只露轨道；
    //   带自己 percent 的回顾圈（如饮水周圈「达标 N 天」）按它自己的 percent 铺。
    values:ringed.map(i=>({
      percent:i.recordOnly?(Number(i.percent)>0?Number(i.percent):(i.done?100:0)):i.percent,
      color:i.color||COLORS.body,soft:!!i.recordOnly
    }))
  };
}

// home.goals 是服务端算好的两组；拿不到就给两个空组，页面提示去设置目标
function both(home){
  const g=(home&&home.goals)||null;
  return {
    day:pack((g&&g.day)||[],'daily','今日'),
    week:pack((g&&g.week)||[],'weekly','本周'),
    weekEnd:false,
    today:(g&&g.today)||'',
    weekStart:(g&&g.weekStart)||'',
    weekEndDate:(g&&g.weekEnd)||'',
    recordedToday:(g&&g.recordedToday)||0
  };
}

module.exports={COLORS,RING_MAX,pack,both};
