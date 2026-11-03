'use strict';
// 生成单词读音：每个词一个 m4a，用 macOS 自带 say + afconvert，不依赖任何在线服务。
//
//   node scripts/build-audio.js              # 只补缺的，输出到 miniprogram/audio/
//   node scripts/build-audio.js --force      # 全部重做
//   node scripts/build-audio.js --out dist   # 生成到别处（预留给云存储上传）
//   node scripts/build-audio.js --voice Daniel --rate 170
//
// 体积：24kbps 单声道 aac，一个单词约 6KB；100 词约 0.6MB，8000 词约 50MB。
// 小程序主包上限 2MB，所以测试期先跟着包走，词库涨到几千个之后要用 --out
// 生成到云存储，再把 miniprogram/config/audio.js 的 AUDIO_BASE 改成 https 前缀。
const {execFileSync}=require('child_process');
const fs=require('fs');
const path=require('path');
const os=require('os');

const {WORDS}=require('../miniprogram/data/words');

const argv=process.argv.slice(2);
const flag=name=>argv.includes('--'+name);
const opt=(name,fallback)=>{const i=argv.indexOf('--'+name);return i>=0&&argv[i+1]?argv[i+1]:fallback;};

const force=flag('force');
const voice=opt('voice','Samantha');
const rate=String(opt('rate','165'));
const outDir=path.resolve(opt('out',path.join(__dirname,'..','miniprogram','audio')));

function sh(cmd,args){execFileSync(cmd,args,{stdio:['ignore','ignore','pipe']});}

if(process.platform!=='darwin'){
  console.error('这个脚本用 macOS 的 say 合成语音；其它系统请换 edge-tts 或云端 TTS，再按同样文件名放进目录。');
  process.exit(1);
}

fs.mkdirSync(outDir,{recursive:true});
const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'Somarise-audio-'));
const ids=[];
let made=0,reused=0,bytes=0;

for(const w of WORDS){
  const file=path.join(outDir,w.id+'.m4a');
  ids.push(w.id);
  if(!force&&fs.existsSync(file)){reused++;bytes+=fs.statSync(file).size;continue;}
  const aiff=path.join(tmp,w.id+'.aiff');
  try{
    // 词条文字原样念，连字符和多词短语交给系统读
    sh('say',['-v',voice,'-r',rate,'-o',aiff,w.w]);
    sh('afconvert',['-f','m4af','-d','aac','-b','24000',aiff,file]);
    bytes+=fs.statSync(file).size;
    made++;
  }catch(e){
    console.error(`跳过 ${w.w}：${(e.stderr||'').toString().trim()||e.message}`);
  }
}
fs.rmSync(tmp,{recursive:true,force:true});

// 清单不在这里写：前端那张表要同时看包内、包外两个目录，由
// scripts/sync-audio-manifest.js 统一生成（npm run audio:manifest）。
const list=ids.filter(id=>fs.existsSync(path.join(outDir,id+'.m4a')));
const perWord=list.length?bytes/list.length:0;
console.log(`新生成 ${made} 个，复用 ${reused} 个；目录 ${path.relative(process.cwd(),outDir)||'.'}`);
console.log(`当前 ${list.length} 词 → ${(bytes/1024).toFixed(0)} KB（每个约 ${(perWord/1024).toFixed(1)} KB）`);
console.log(`按这个体积外推：2000 词约 ${(perWord*2000/1024/1024).toFixed(1)} MB，8000 词约 ${(perWord*8000/1024/1024).toFixed(1)} MB`);
console.log('录音变了就重建清单：npm run audio:manifest');
