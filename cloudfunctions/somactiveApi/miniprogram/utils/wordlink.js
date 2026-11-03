'use strict';
// 例句里的词，能点的就点开：句子里出现了词库里的别的词，就把它标出来，点一下进那个词。
// 词库有两千多个词，例句上万句，所以只做一件事：把一句英文切成「片段」，
// 片段带着它对应的词 id（没有就是普通文字），页面按片段渲染，带 id 的能点。
//
// 只在服务端跑（云函数里已经有词库），小程序端不装这份索引，免得撑爆主包。
const {WORDS}=require('../data/words');

// 太短的单词不作数：set / row / fat / rep 这些在句子里多半是别的意思，
// 点开反而是打扰。带连字符的（pull-up、omega-3）不算短。
const MIN_SINGLE=4;

// 不作数的词：两类中止 ——
//   一是句子里的语法工具（usually / really / still），标出来只是把页面弄吵；
//   二是词库里的意思跟它在句子里的用法对不上（train 在词库里是「火车」，
//     例句里却是「训练」），点开反而学错。
// 默认都可点，只有明确添乱的才写进来。
const SKIP=new Set([
  // 副词、连接、泛指代词：到处都是，点了学不到东西
  'usually','really','still','mostly','instead','almost','alone','always','never','often',
  'sometimes','maybe','perhaps','actually','probably','basically','simply','especially',
  'finally','however','therefore','anyway','already','soon','later','once','twice','together',
  'quite','rather','everything','something','anything','nothing','everyone','someone','anyone',
  // 通用词：在例句里多半不是词库里那个意思，点了会学错
  'train','mean','change','matter','raise','break','watch','describe','notice','show-up','plan'
]);

// 一个词的常见变形：squat → squats / squatted / squatting。
// 词典级的还原做不到，规则能覆盖绝大多数例句里的词形，漏掉的无非是没标出来而已。
function forms(token){
  const out=new Set([token]);
  const add=x=>{ if(x&&x.length>2) out.add(x); };
  if(/(s|x|z|ch|sh)$/.test(token)) add(token+'es');
  else if(/[^aeiou]y$/.test(token)) add(token.slice(0,-1)+'ies');
  else add(token+'s');
  if(/e$/.test(token)){ add(token+'d'); add(token.slice(0,-1)+'ing'); }
  else { add(token+'ed'); add(token+'ing'); }
  if(/[^aeiou]y$/.test(token)) add(token.slice(0,-1)+'ied');
  // run → running、sit → sitting、squat → squatting 这类双写末尾辅音。
  // 规则放宽到「元音 + 一个辅音」结尾（squat 的 at 也算），多出来的形式（eatting）
  // 只是索引里多一个用不上的键，不会标错词。
  if(/[aeiou][bcdfghjklmnpqrstvwxz]$/.test(token)){
    add(token+token.slice(-1)+'ed');
    add(token+token.slice(-1)+'ing');
  }
  return [...out];
}

// 索引只建一次，之后全是查表
let SINGLE=null, MULTI=null, MAXTOK=1, LINKABLE=null;

function build(){
  SINGLE=new Map();
  MULTI=new Map();
  LINKABLE=new Set();
  MAXTOK=1;
  for(const w of WORDS){
    const tokens=String(w.w||'').toLowerCase().split(/\s+/).filter(Boolean);
    if(!tokens.length)continue;
    if(tokens.length>MAXTOK)MAXTOK=tokens.length;
    // 短语一律可点；单个词要够长（或带连字符）才算；写作数清单里的不点
    const linkable=tokens.length>1||tokens[0].length>=MIN_SINGLE||tokens[0].includes('-');
    if(linkable&&!SKIP.has(w.id))LINKABLE.add(w.id);
    if(tokens.length===1){
      // 词形变体（sets→set、training→train）会先被短词根占槽；
      // 若该槽当前指向「不可点」的词、而本词可点，就让可点的覆盖，免得长词形永远点不开
      for(const f of forms(tokens[0])){
        const ex=SINGLE.get(f);
        if(!ex||(!LINKABLE.has(ex)&&linkable))SINGLE.set(f,w.id);
      }
      continue;
    }
    if(tokens.length>3)continue; // 三个词以上的短语不猜了
    // 短语的每个词都可能有变形（pull-ups、bench presses），取笛卡尔积全列出来
    let combos=[[]];
    for(const t of tokens){
      const next=[];
      for(const c of combos) for(const f of forms(t)) next.push(c.concat(f));
      combos=next;
      if(combos.length>120)break;
    }
    for(const c of combos){
      const key=c.join(' ');
      const first=c[0];
      if(!MULTI.has(first))MULTI.set(first,new Map());
      const m=MULTI.get(first);
      if(!m.has(key))m.set(key,w.id);
    }
  }
  MAXTOK=Math.min(3,MAXTOK);
}
function ready(){ if(!SINGLE)build(); }

// 句子切成 token：英文单词（含连字符、撇号）/ 空白 / 其他符号
function tokenize(text){
  return String(text||'').match(/[A-Za-z][A-Za-z'-]*|\s+|[^A-Za-z\s]+/g)||[];
}

// 一句英文 → 片段数组：[{t:'Keep your ',id:''},{t:'chest',id:'chest'},...]
// selfId 是当前这个词自己：自己的例句里不标自己，免得点来点去还在原地。
function annotate(text,selfId){
  ready();
  const tokens=tokenize(text);
  const words=[];
  for(let i=0;i<tokens.length;i++) if(/^[A-Za-z]/.test(tokens[i])) words.push({i,low:tokens[i].toLowerCase()});

  const link=new Array(tokens.length).fill('');
  for(let p=0;p<words.length;p++){
    let hitId='',hitLen=0;
    for(let len=Math.min(MAXTOK,words.length-p);len>=1;len--){
      const key=words.slice(p,p+len).map(x=>x.low).join(' ');
      let id=null;
      if(len===1) id=SINGLE.get(key);
      else { const m=MULTI.get(words[p].low); id=m?m.get(key):null; }
      if(id&&id!==selfId&&LINKABLE.has(id)){ hitId=id; hitLen=len; break; }
    }
    if(hitId){
      // 整段都算这一个词（中间的空格也算），页面上连成一个可点的整体：bench press
      for(let i=words[p].i;i<=words[p+hitLen-1].i;i++) link[i]=hitId;
      p+=hitLen-1;
    }
  }

  const segs=[];
  for(let i=0;i<tokens.length;i++){
    const id=link[i];
    const last=segs[segs.length-1];
    if(last&&last.id===id) last.t+=tokens[i];
    else segs.push({t:tokens[i],id:id||''});
  }
  return segs;
}

// 这句里能点几个词：页面用它决定要不要显示「点带下划线的词」那行小字
function hits(text,selfId){
  const out=[];
  for(const s of annotate(text,selfId)) if(s.id&&!out.includes(s.id)) out.push(s.id);
  return out;
}

module.exports={annotate,hits,tokenize,forms,MIN_SINGLE,
  stats:()=>{ready();return {words:WORDS.length,single:SINGLE.size,multi:MULTI.size,maxToken:MAXTOK};}};
