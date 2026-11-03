'use strict';
// 词库自检：分片文件逐个 require，检查必填字段、例句长度、id 唯一、词根能不能解释。
//   node scripts/check-words.js            只看汇总
//   node scripts/check-words.js --verbose  把每条问题都打出来
//
// 口径分两层：
//   1) 分片层：每个文件多少条、跨文件重复了哪些词（重复只是白写，运行时会按 id 去重，不算错）
//   2) 用户看到的词库层：手机上真正会出现的词是去重后的 WORDS，字段与词根都按它校验
const fs=require('node:fs'),path=require('node:path');
const root=path.join(__dirname,'..'),dir=path.join(root,'miniprogram/data/words');
const {lookup,explainParts}=require('../miniprogram/data/roots');
const {WORDS,CATS}=require('../miniprogram/data/words');
const verbose=process.argv.includes('--verbose');

const files=fs.readdirSync(dir).filter(f=>f.endsWith('.js')).sort();
const seen=new Map();const perFile=[];const dupes=[];

for(const f of files){
  const mod=require(path.join(dir,f));
  const list=Array.isArray(mod)?mod:(mod.CORE||[]);
  perFile.push(`${f.padEnd(12)}${String(list.length).padStart(5)} 条`);
  for(const w of list){
    const id=String(w.w||'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');
    if(seen.has(id)&&seen.get(id)!==f)dupes.push(`${id}（${seen.get(id)} 与 ${f} 重复）`);
    seen.set(id,f);
  }
}

const problems=[];let plain=0;
const words=s=>String(s||'').trim().split(/\s+/).filter(Boolean).length;
for(const w of WORDS){
  for(const k of ['w','ipa','pos','zh','say','sayZh','ex','exZh'])if(!w[k])problems.push([w.cat,w.w,'缺 '+k]);
  if(w.say&&words(w.say)>22)problems.push([w.cat,w.w,`口语例句 ${words(w.say)} 个词，超过 22`]);
  if(!CATS[w.cat])problems.push([w.cat,w.w,'分类没有中文名']);
  if(Array.isArray(w.parts)){
    const flat=String(w.w||'').toLowerCase().replace(/[^a-z0-9]/g,'');
    if(w.parts.length<2)problems.push([w.cat,w.w,'parts 只有一段，等于没拆']);
    if(w.parts.join('').toLowerCase().replace(/[^a-z0-9]/g,'')!==flat)
      problems.push([w.cat,w.w,'parts 拼不回单词：'+w.parts.join('|')]);
    for(const seg of explainParts(w.parts)||[]){
      if(!seg.zh)problems.push([w.cat,w.w,'词根弹窗是空的：'+seg.t]);
      else if(seg.type==='独立单词')plain++;
    }
  }
}

const byCat={};for(const w of WORDS)byCat[w.cat]=(byCat[w.cat]||0)+1;
console.log(perFile.join('\n'));
console.log(`\n用户看到 ${WORDS.length} 条；带词根拆分 ${WORDS.filter(w=>Array.isArray(w.parts)&&w.parts.length>1).length} 条`);
console.log('分类：'+Object.entries(byCat).map(([k,v])=>`${CATS[k]||k} ${v}`).join(' · '));
if(dupes.length){
  console.log(`\n跨文件重复 ${dupes.length} 条（运行时按 id 只留第一次，白写但不影响用户）：`);
  for(const d of dupes.slice(0,verbose?999:10))console.log('  '+d);
}
if(problems.length){
  console.log(`\n字段问题 ${problems.length} 条：`);
  for(const p of (verbose?problems:problems.slice(0,30)))console.log(`  ${p[0]} · ${p[1]} · ${p[2]}`);
  if(!verbose&&problems.length>30)console.log(`  ……还有 ${problems.length-30} 条，加 --verbose 看全部`);
}
if(plain)console.log(`其中 ${plain} 段是自由词（词根库里没有它的词源义，弹窗会说明它是独立单词）`);
const bad=problems.length;
console.log(bad?`\n还有 ${bad} 条问题要收。`:'\n字段、词根、例句全部通过。');
process.exit(bad?1:0);
