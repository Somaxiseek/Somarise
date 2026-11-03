'use strict';
// 自动补「词根拆分」（前端把各段用「·」连起来，点一段弹窗解释）。
//
// 为什么不是全自动切词：拆错了比不拆更糟——把 design 拆成 de·sign、把 offer 拆成 off·er，
// 用户会记住假的词源。所以这里的规则是**两头都卡白名单**：
//   1) 前后缀本身必须是词根库里有的、语义透明的那一批（de-/ex-/con-/dis- 这类歧义大的不做）
//   2) 去掉前后缀之后剩下的必须是一个真实单词（词库里的词或词根库里的自由词条）
//   3) -er / -or 只有当原词是名词、剩下的是动词时才算（不然 tender 会被拆成 tend·er）
// 宁可少写，也不要写错。

const SUFFIX=[
  'ation','ness','less','ment','able','ible','ship','hood','ism','ist','ous',
  'ance','ence','ful','ity','ing','age','ure','ary','ify','ize','ish','like',
  'some','ward','ology','itis','osis','ectomy','pathy','meter','graphy','scopy',
  'plasty','emia','algia','pnea','oma','ics','genic','oid','ose','ase','trophy',
  'tion','al','ic','ive','en','ly','ion'
];
const AGENT=['er','or'];
const PREFIX=[
  'under','hyper','hypo','super','inter','intra','micro','macro','multi','semi',
  'anti','auto','post','pre','non','over','mis','trans','para','meta','mono',
  'extra','uni','sub','tri','bio','re','un','pro'
];

const single=s=>/^[a-z]+$/.test(s);

// words: 去重后的词库；roots: 词根表
function fill(words,roots){
  const known=new Set(),verbs=new Set(),nouns=new Set();
  for(const w of words){
    const t=String(w.w||'').toLowerCase();
    if(!single(t))continue;
    known.add(t);
    if(/v\./.test(w.pos||''))verbs.add(t);
    if(/n\./.test(w.pos||''))nouns.add(t);
  }
  for(const k of Object.keys(roots))if(single(k))known.add(k);
  const hasRoot=s=>!!roots['-'+s]||!!roots[s];

  let filled=0;
  for(const w of words){
    if(Array.isArray(w.parts)&&w.parts.length>1)continue;
    const t=String(w.w||'').toLowerCase();
    if(!single(t)||t.length<6)continue;
    let hit=null;
    for(const s of SUFFIX.concat(AGENT)){
      if(!hasRoot(s)||!t.endsWith(s))continue;
      const base=t.slice(0,-s.length);
      if(base.length<4||!known.has(base))continue;
      // 名词化的 -er/-or：原词得是名词、词基得是动词，否则 tender→tend·er
      if(AGENT.includes(s)&&!(nouns.has(t)&&verbs.has(base)))continue;
      hit=[base,s];break;
    }
    if(!hit)for(const p of PREFIX){
      if(!hasRoot(p)||!t.startsWith(p))continue;
      const rest=t.slice(p.length);
      if(rest.length<4||!known.has(rest))continue;
      hit=[p,rest];break;
    }
    if(hit){w.parts=hit;filled++;}
  }
  return filled;
}

module.exports={fill,SUFFIX,AGENT,PREFIX};
