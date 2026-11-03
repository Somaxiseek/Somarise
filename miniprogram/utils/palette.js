'use strict';
const {TOKENS,normalize}=require('./tokens');

// 可选色板：前四项就是打卡页的四个主色，其余给自建项目留一点余地
const COLORS=[
  TOKENS.cardio,TOKENS.strength,TOKENS.water,TOKENS.english,
  TOKENS.body,TOKENS.slate,'#171717'
];

// 项目标记：不用 emoji，只用几何形状。
// 形状由 components/proj-glyph 纯 CSS 画出来，颜色跟着项目色走 ——
// 这样「色块 + 形状 + 文字」是三件同一套语言里的东西，不混进彩色小图标。
const SHAPES=['dot','ring','bar','bars','cols','tri','diamond','arc'];

// 老项目存的是 emoji：读出来时换成一张最接近的形状，
// 不清库也不会让页面上再冒出彩色小图标。
const LEGACY_ICON={
  '💧':'ring','💪':'bars','🏃':'tri','📖':'bar','🧘':'arc',
  '🍎':'dot','✍️':'diamond','🌙':'diamond','🏅':'dot','◍':'dot',
  '🏊':'bar','🚴':'cols','🥗':'dot','🎯':'ring','⏱':'bar'
};

// 饮食那个土黄取消后再没定下颜色，先不给：「饮食」项目落到默认墨色，等想好了再补一个冷色
const CATEGORY_COLORS={
  '心肺训练':TOKENS.cardio,'抗阻训练':TOKENS.strength,'饮水':TOKENS.water,
  '英文学习':TOKENS.english
};
// 老项目存的是旧色值：读的时候换成新的，写的时候也按新值存
function pickColor(value){const c=normalize(value);return c&&COLORS.includes(c)?c:null;}
// 认形状；认不出来（含老数据里的 emoji）就退回圆点，永远返回一个可渲染的值
function pickIcon(value){
  const s=String(value||'');
  if(SHAPES.indexOf(s)>=0)return s;
  return LEGACY_ICON[s]||'dot';
}
function accentOf(project,categoryName){return normalize(project&&project.color)||CATEGORY_COLORS[categoryName]||'#171717';}
// 主色块上的文字色：亮底（黄、浅绿）用深字，深底用白字
function inkFor(color){
  const hex=String(color||'').replace('#','');
  if(!/^[0-9a-fA-F]{6}$/.test(hex))return '#ffffff';
  const r=parseInt(hex.slice(0,2),16),g=parseInt(hex.slice(2,4),16),b=parseInt(hex.slice(4,6),16);
  return (0.299*r+0.587*g+0.114*b)/255>0.66?'#171717':'#ffffff';
}
module.exports={COLORS,SHAPES,LEGACY_ICON,CATEGORY_COLORS,pickColor,pickIcon,accentOf,inkFor};
