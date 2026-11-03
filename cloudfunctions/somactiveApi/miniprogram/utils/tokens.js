'use strict';

// 全站唯一一套强调色。前端圆环、项目卡、打卡页，服务端下发的 color 字段，全都从这里取。
//
// 2026-10-28 v4：颜色不变，只「变浅」。
//   1. 饮水青、英语紫是用户点名的「就用这个颜色」，色相和鲜艳度都不许动 ——
//      降饱和会立刻显灰、显脏，那不是「浅」，是「褪色」；
//   2. 抗阻从偏紫的蓝（239°）改成更正的冷蓝（222°），去掉那股发红发紫的味道；
//   3. 饮食那个土黄先不做了，自建项目改用石板灰蓝；
//   4. 日环用 TOKENS 原色；周环用 WEEK = 同色相、只把明度提 10（饱和度只降 12，仍是有颜色的）。
// 改这里就够了：rings.js、palette.js、server/goals.js 都 require 本文件。
const TOKENS={
  cardio:'#D93B36',   // 心肺：正红（唯一保留的暖色，红才代表心肺）
  strength:'#3D6EDC', // 抗阻：冷蓝（不偏紫）
  water:'#06B6D4',    // 饮水：明亮青（用户 10-28 要求回到更清爽的青；刻意保留高饱和，水就该亮）
  body:'#32A964',     // 体测：草绿
  english:'#A659C5',  // 英语：紫（用户指定，保持）
  move:'#DF7A77',     // 运动（仅记录）：浅红，跟心肺正红区别开
  slate:'#5C738A'     // 自建项目可选的冷灰蓝（顶掉了原来那个土黄）
};

// 强度梯度：只给「本月强度构成」那张饼用。冷 → 暖（青蓝 / 橙 / 正红），
// 顺序本身就是「轻 → 重」的意思，比三个随机的品牌色更能一眼读出「我练得偏轻还是偏重」。
// 不进 TOKENS：它不是项目色，别让圆环取色器里多出三个「项目」。
const INTENSITY={
  low:'#5FB6C6',      // 低强度：还能唱完一首歌
  moderate:'#EF9F3C', // 中等：会喘但能讲完整句话
  vigorous:'#D93B36'  // 高强度：只能冒出一两个字
};

// 周环专用：同色相、同色感，只是更浅一档。
// 三圈并排面积大，日环那种浓度压上去会发闷；但也不能降到发灰，所以饱和只让 12 个点。
const WEEK={
  cardio:'#D56F6C', strength:'#7391D9', water:'#38B6C7',
  body:'#55B97F', english:'#B689C8', move:'#E2A9A7', slate:'#7C8C9C'
};

// 旧配色，只用来迁移老数据时对照，不要再往新代码里写
const LEGACY={
  // v1
  '#EF4444':'#D93B36','#6366F1':'#3D6EDC','#22C55E':'#32A964',
  '#8B5CF6':'#A659C5','#F87171':'#DF7A77','#FF6B35':'#D93B36','#4C6FFF':'#3D6EDC',
  '#16B8C8':'#06B6D4','#EA5A8B':'#5C738A','#34C759':'#32A964',
  // v2：只有抗阻换成了冷蓝，其余就是现在的颜色
  '#475CD1':'#3D6EDC',
  // v3（只存在了半天，可能已经有数据存进去了）
  '#B33932':'#D93B36','#396FC0':'#3D6EDC','#288F8C':'#06B6D4','#3B9160':'#32A964',
  '#7D52BC':'#A659C5','#CE7873':'#DF7A77',
  // v4 的闷青 #219BAB 被用户否决，回到更清爽的 #06B6D4
  '#219BAB':'#06B6D4',
  // 两个不好看的颜色：土黄和粉红，统一改到石板灰蓝
  '#F2B705':'#5C738A','#CA9721':'#5C738A','#D4547E':'#5C738A'
};

// 12 个月徽章墙：每月一个颜色，完成就点亮。设计取向——在品牌色系（红/蓝/青/绿/紫）之间
// 走一条柔和的色相轮（S≈58% L≈54%），既「各不相同、能区分月份」，又不会太灰发闷、也不会太荧光。
// 1 月冷蓝 → 年中暖红 → 年末回到青蓝，顺着季节走。具体图形 logo 以后单独设计，这里先用颜色占位。
const MONTH_COLORS=['#466ECE','#6146CE','#A546CE','#CE46B3','#CE466E','#CE6146','#CEA546','#B3CE46','#6ECE46','#46CE61','#46CEA5','#46B3CE'];
function monthColor(monthIndex){ // 0 = 一月
  const i=((Number(monthIndex)||0)%12+12)%12;
  return MONTH_COLORS[i];
}

// 圆环取色器的精选色板：在品牌主色基础上扩展一档，全部满足「白底上清晰 + 彼此区分度够」。
// 用户只能从这里挑，不能随便填任意色 —— 避免配出刺眼或难辨的组合，也守住品牌色差的观感。
// 前 6 个就是默认品牌色，后面是协调的扩展色。
const RING_PALETTE=[
  '#D93B36', // 心肺红
  '#3D6EDC', // 抗阻蓝
  '#06B6D4', // 饮水青
  '#32A964', // 体测绿
  '#A659C5', // 英语紫
  '#5C738A', // 石板灰蓝（自建）
  '#DF7A77', // 浅红（运动·仅记录）
  '#F59E0B', // 琥珀
  '#EC4899', // 玫粉
  '#8B5CF6', // 紫罗兰
  '#14B8A6', // 蓝绿
  '#F97316'  // 橙
];

// 老用户库里存的是旧色值，读出来时顺手换新，免得只有他们还是旧色
function normalize(color){
  const key=String(color||'').toUpperCase();
  return LEGACY[key]||color||'';
}

// 周环取浅版：认得出是哪个项目，又不至于一大片浓色压在卡片上。
// 自建项目在 WEEK 里没有对应项，就退回主色。
function weekColor(color){
  const c=normalize(color);
  for(const k in WEEK)if(TOKENS[k]===c)return WEEK[k];
  return c;
}

// 把主色往白（或往黑）里掺：横滑露出的「再来一次」要跟着这一笔的颜色走，
// 但不能把 #D93B36 铺成一整块红 —— 底色淡、文字深，才有「同色系」的克制。
// 只认 #rrggbb；认不出就退回中性灰，不让一个怪色值把按钮变成白字白底。
function mix(color,to,amount){
  const c=normalize(color);
  const a=Math.max(0,Math.min(1,Number(amount)||0));
  const p=/^#([0-9a-f]{6})$/i.exec(String(c||''));
  const q=/^#([0-9a-f]{6})$/i.exec(String(to||''));
  if(!p||!q)return '#F2F1EF';
  const A=parseInt(p[1],16),B=parseInt(q[1],16);
  const ch=(shift)=>{
    const from=A>>shift&255,to2=B>>shift&255;
    return Math.round(from+(to2-from)*a);
  };
  return '#'+[16,8,0].map(s=>ch(s).toString(16).padStart(2,'0')).join('');
}
// 浅底：主色掺白（默认只留一点点色 —— 一整块正红压在按钮上太重，
// 按 0.12 掺白会得到接近原色的深粉，那是"色块"不是"浅底"）
const tint=(color,amount)=>mix(color,'#ffffff',amount==null?0.86:amount);
// 深字：主色掺黑（保证浅底上的可读性）
const shade=(color,amount)=>mix(color,'#1b1b1b',amount==null?0.35:amount);

module.exports={TOKENS,INTENSITY,WEEK,LEGACY,normalize,weekColor,MONTH_COLORS,monthColor,RING_PALETTE,mix,tint,shade};
