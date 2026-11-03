'use strict';
// 生成音频清单：把「磁盘上真实存在的录音」写成前端能查的一张表。
//   node scripts/sync-audio-manifest.js
//
// 2026-10-30 起包内不再带音频（miniprogram/audio 已删，主包给功能让路），
// 全部读音走 AUDIO_BASE 托管，所以 LOCAL 恒为空、local(id) 恒为 false；
// 保留这两者的存在是为了让 utils/speech.js 与老清单兼容（老包缓存里可能有 LOCAL）。
// ALL = outputs/audio-words 里录好的词，SENT = outputs/audio-sent 里的例句。
// 前端只在「这个词真有录音」时才画喇叭，所以清单必须跟磁盘一致：
// 录音是增量补的，词库却一直在长，两边对不上就会出现点了没反应的喇叭。
//
// 前端怎么用它：remoteReady() 且 recorded(id) → 用 AUDIO_BASE+id+'.m4a'。
const fs=require('fs');
const path=require('path');

const root=path.join(__dirname,'..');
const {WORDS}=require(path.join(root,'miniprogram','data','words'));

const argv=process.argv.slice(2);
const opt=(name,fallback)=>{const i=argv.indexOf('--'+name);return i>=0&&argv[i+1]?argv[i+1]:fallback;};

const localDir=path.resolve(opt('local',path.join(root,'miniprogram','audio')));
const remoteDir=path.resolve(opt('remote',path.join(root,'outputs','audio-words')));
const sentDir=path.resolve(opt('sent',path.join(root,'outputs','audio-sent')));
const manifestPath=path.join(root,'miniprogram','data','audio-manifest.js');

const KNOWN=new Set(WORDS.map(w=>w.id));
const ORDER=new Map(WORDS.map((w,i)=>[w.id,i]));

function scan(dir){
  if(!fs.existsSync(dir))return [];
  return fs.readdirSync(dir)
    .filter(f=>f.endsWith('.m4a'))
    .map(f=>f.slice(0,-4))
    // 词库里没有的 id 不写进清单：文件名对不上词，前端永远也查不到它
    .filter(id=>KNOWN.has(id))
    .sort((a,b)=>ORDER.get(a)-ORDER.get(b));
}

function sizeOf(dir,ids){
  let bytes=0;
  for(const id of ids){
    try{ bytes+=fs.statSync(path.join(dir,id+'.m4a')).size; }catch(e){}
  }
  return bytes;
}

const local=scan(localDir);
const all=scan(remoteDir).concat(local.filter(id=>!fs.existsSync(path.join(remoteDir,id+'.m4a'))))
  .sort((a,b)=>ORDER.get(a)-ORDER.get(b));
const localSet=new Set(local);
const allSet=new Set(all);

// 包内那批必须也是录过音的：清单里两组是包含关系，前端才不会找不到文件
const orphan=local.filter(id=>!allSet.has(id));
const remoteOnly=all.filter(id=>!localSet.has(id));

const sentCounts=scanSent(sentDir);
const sentObj={};
for(const [id,n] of sentCounts)if(n>0)sentObj[id]=n;

// 例句朗读：文件名 <词id>-s<行号>.m4a（行号跟服务端 lines 顺序一致）。
// 记成「每词从头数连续有几句」：中间缺一句，后面有也不算，前端按行号查不会落空。
function scanSent(dir){
  const byWord=new Map();
  if(!fs.existsSync(dir))return byWord;
  for(const f of fs.readdirSync(dir)){
    const m=/^(.+)-s(\d+)\.m4a$/.exec(f);
    if(!m)continue;
    const id=m[1];
    if(!KNOWN.has(id))continue;   // 词库里没有的词不进清单
    if(!byWord.has(id))byWord.set(id,new Set());
    byWord.get(id).add(Number(m[2]));
  }
  const counts=new Map();
  for(const [id,set] of byWord){
    let n=0;while(set.has(n))n++;
    counts.set(id,n);
  }
  return counts;
}

const mb=n=>(n/1024/1024).toFixed(2);
const out=[
  "'use strict';",
  '// 由 scripts/sync-audio-manifest.js 生成，不要手改。',
  '// 两组是包含关系：LOCAL ⊆ ALL。',
  `// LOCAL ${local.length} 个（包内，${mb(sizeOf(localDir,local))} MB，离线可用）；`,
  `// ALL ${all.length} 个（${mb(sizeOf(remoteDir,all.filter(id=>!localSet.has(id)))+sizeOf(localDir,local))} MB，包外那 ${remoteOnly.length} 个要走 AUDIO_BASE 网络地址）。`,
  '// 前端只在「真有录音」时画喇叭：清单跟磁盘不一致，就会出现点了没反应的喇叭。',
  `const LOCAL=${JSON.stringify(local)};`,
  `const ALL=${JSON.stringify(all)};`,
  `// 例句朗读：词id -> 从第 0 句起连续有录音的句数（0 = 还没录，不画句子喇叭）`,
  `const SENT=${JSON.stringify(sentObj)};`,
  'const LOCAL_SET=new Set(LOCAL);',
  'const ALL_SET=new Set(ALL);',
  'module.exports={',
  '  LOCAL,ALL,SENT,',
  '  local:id=>!!id&&LOCAL_SET.has(id),',
  '  recorded:id=>!!id&&ALL_SET.has(id),',
  '  sent:id=>SENT[id]||0,',
  '  count:ALL.length,',
  '  offline:LOCAL.length',
  '};',
  ''
].join('\n');
fs.writeFileSync(manifestPath,out);

const kb=(fs.statSync(manifestPath).size/1024).toFixed(0);
const sentLines=[...sentCounts.values()].reduce((a,b)=>a+b,0);
console.log(`包内 ${local.length} 词 · 全部 ${all.length} 词 · 例句读音 ${sentLines} 句（${Object.keys(sentObj).length} 词）· 清单 ${kb} KB → ${path.relative(root,manifestPath)}`);
if(orphan.length)console.log(`注意：包内有 ${orphan.length} 个目录里找不到的：${orphan.slice(0,5).join(', ')}`);
if(all.length<WORDS.length){
  console.log(`还差 ${WORDS.length-all.length} 个词没录音（点喇叭会提示没读音）：`);
  console.log('  node scripts/build-audio.js --out outputs/audio-words');
}
