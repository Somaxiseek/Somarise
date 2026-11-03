'use strict';
// 记忆曲线（间隔重复）：一个词学会后，在第 1、2、4、7、15、30、60、120 天各回来一次。
// 走完八次就算「已掌握」，但不是永别：每 180 天再拉出来遛一遛（用户 10-30 定稿），
// 遛的时候答「记得」就再睡半年；答「还不认识」退回第一天重新走整条曲线。
// 纯函数，前端预览和后端排期用同一套，避免两边算出来的复习日不一样。
const INTERVALS=[1,2,4,7,15,30,60,120];
const GRADES=['again','hard','good'];
const MAX_STAGE=INTERVALS.length;
const MASTERED_GAP=180;

function shift(dateKey,days){
  const t=Date.parse(dateKey+'T12:00:00Z')+days*86400000;
  return new Date(t).toISOString().slice(0,10);
}

// 新词：今天第一次见到，答完就进入第 1 天
function blankCard(wordId,today){
  return {wordId,stage:0,due:today,reps:0,lapses:0,status:'learning',learnedAt:today,lastAt:null};
}

// again 今天再看一遍；hard 明天再来一次（级数不涨）；good 进入下一档间隔
function apply(card,grade,today){
  if(!GRADES.includes(grade))throw new Error('评价无效');
  const next={...card,reps:(card.reps||0)+1,lastAt:today};
  // 已掌握的词：只有「遛一遛」这一种交互。答「记得」→ 再睡半年；
  // 「有点模糊」→ 明天再看一眼（还留在掌握库里）；「还不认识」→ 掌握失效，从头再来。
  if(card.status==='known'&&grade!=='again'){
    next.due=grade==='good'?shift(today,MASTERED_GAP):shift(today,1);
    next.status='known';
    return next;
  }
  if(grade==='again'){
    next.stage=0;next.due=today;next.lapses=(card.lapses||0)+1;next.status='learning';
  }else if(grade==='hard'){
    next.stage=card.stage||0;next.due=shift(today,1);next.status='learning';
  }else{
    const stage=Math.min((card.stage||0)+1,MAX_STAGE);
    next.stage=stage;next.due=shift(today,INTERVALS[stage-1]);
    next.status=stage>=MAX_STAGE?'known':'learning';
  }
  return next;
}

// 已掌握的词也在队列里：到点（半年）就回来遛一遛，只是不占「待回忆」的名头
function isDue(card,today){return card.due<=today;}

// 下面还有几个词要复习，用来给「明天见」这类文案
function upcoming(cards,today,days=1){
  const end=shift(today,days);
  return cards.filter(c=>c.due>today&&c.due<=end).length;
}

function summarize(cards,today){
  return {
    learned:cards.length,
    known:cards.filter(c=>c.status==='known').length,
    learning:cards.filter(c=>c.status!=='known').length,
    due:cards.filter(c=>isDue(c,today)).length
  };
}

module.exports={INTERVALS,GRADES,MAX_STAGE,MASTERED_GAP,shift,blankCard,apply,isDue,upcoming,summarize};
