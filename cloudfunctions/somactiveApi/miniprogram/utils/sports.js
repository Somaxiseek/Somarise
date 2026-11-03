// Shared product rules. Duration thresholds are provisional and configurable.
const SPORTS=[
 {type:'running',label:'跑步',en:'RUNNING',symbol:'↗',min:1000,max:150000},
 {type:'cycling',label:'骑行',en:'CYCLING',symbol:'◎',min:5000,max:600000},
 {type:'swimming',label:'游泳',en:'SWIMMING',symbol:'≈',min:200,max:30000},
 {type:'walking',label:'散步',en:'WALKING',symbol:'→',min:1000,max:150000},
 {type:'incline',label:'爬坡',en:'INCLINE',symbol:'∧',minDuration:1200,max:100000},
 {type:'cardio',label:'其他心肺训练',en:'CARDIO',symbol:'♡',minDuration:1200,max:100000},
 {type:'ball',label:'球类',en:'BALL',symbol:'◉',minDuration:1200,max:100000},
 // 爬楼：没有「公里」这种量，只记时长 + 强度即可（距离字段在记录页隐藏，也不算配速）。
 // 放在最后，保持跑步/骑行/游泳/步行/爬坡/其他心肺 的索引不变（测试按索引断言）。
 {type:'stairs',label:'爬楼',en:'STAIRS',symbol:'⌂',minDuration:1200,max:100000}
];
const RULES={};SPORTS.forEach(s=>{RULES[s.type]=s;});
// 低强度（散步）不设距离/时长门槛：它是「今天动过」，不是训练量，不该被门槛挡住。
// 中高强度：填了时长就记为一次有效运动（距离只是用来算配速的加分项，可选）。
// 没填时长、只填了距离的旧记录，仍按距离门槛认，向后兼容。
function qualifies(a){const r=RULES[a.type];if(!r)return false;if(a.intensity==='low')return true;if(a.durationSec>0)return true;return !r.minDuration&&a.distanceM>=r.min;}
module.exports={SPORTS,RULES,qualifies};
