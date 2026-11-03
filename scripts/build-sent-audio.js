'use strict';
// 生成例句朗读：每个词的每一句例句一个 m4a，文件名 <词id>-s<行号>.m4a。
//   node scripts/build-sent-audio.js            # 只补缺的
//   node scripts/build-sent-audio.js --force    # 全部重做
//   node scripts/build-sent-audio.js --jobs 8   # 并行数（默认 8）
//   node scripts/build-sent-audio.js --timeout 25  # 单句合成超时秒数（默认 25）
//
// 行号与服务端 wordView 的 lines 顺序一一对应：s0=say, s1=ex, s2=ex2, s3=ex3。
// 核心 100 词（包内有读音的那批）排最前面：中断了也先保证核心词整批可用。
// 用 macOS say 合成，不依赖在线服务；语速与单词一致（Samantha / 165）。
//
// 注意：必须用 spawn 异步调用，不能用 execFileSync——同步调用会阻塞事件循环，
// 并行度形同虚设；而且一句 say 卡住就会冻住整个进程（2026-10-29 踩过：3.5 小时零产出）。
// 现在每句都有超时，超时杀掉重试一次，仍失败就跳过（下次运行会补，因为文件不存在）。
const {spawn}=require('child_process');
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
const jobs=Math.max(1,parseInt(opt('jobs','8'),10));
const timeoutMs=Math.max(2000,parseFloat(opt('timeout','25'))*1000);
const outDir=path.resolve(opt('out',path.join(__dirname,'..','outputs','audio-sent')));

if(process.platform!=='darwin'){
  console.error('这个脚本用 macOS 的 say 合成语音；其它系统请换 edge-tts 或云端 TTS。');
  process.exit(1);
}

// 跑一个外部命令：超时直接 SIGKILL，resolve 成 false，绝不无限等待
function run(cmd,args,tmo=timeoutMs){
  return new Promise(resolve=>{
    let child;
    try{child=spawn(cmd,args,{stdio:['ignore','ignore','pipe']});}catch(e){return resolve(false);}
    let settled=false;
    const fin=ok=>{if(settled)return;settled=true;clearTimeout(timer);resolve(ok);};
    const timer=setTimeout(()=>{try{child.kill('SIGKILL');}catch(e){}fin(false);},tmo);
    child.on('error',()=>fin(false));
    child.on('close',code=>fin(code===0));
  });
}

// 每词的例句行：say → ex → ex2 → ex3，跟服务端 lines 顺序一致
const tasks=[];
const coreFirst=new Set(require('../miniprogram/data/audio-manifest').LOCAL);
const ordered=[...WORDS].sort((a,b)=>(coreFirst.has(b.id)?0:1)-(coreFirst.has(a.id)?0:1));
for(const w of ordered){
  const lines=[w.say,w.ex,w.ex2,w.ex3];
  lines.forEach((en,i)=>{
    if(en&&String(en).trim())tasks.push({id:w.id+'-s'+i,wordId:w.id,i,text:String(en).trim()});
  });
}

fs.mkdirSync(outDir,{recursive:true});
// 0 字节的残file也算没做：上次被强杀可能留下空文件
const usable=f=>{try{return fs.statSync(f).size>500;}catch(e){return false;}};
const todo=force?tasks:tasks.filter(t=>!usable(path.join(outDir,t.id+'.m4a')));
console.log(`例句 ${tasks.length} 句，已生成 ${tasks.length-todo.length}，待生成 ${todo.length}，并行 ${jobs}，单句超时 ${timeoutMs/1000}s`);

const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'Somarise-sent-'));
let done=0,fail=0,idx=0;
const t0=Date.now();

async function one(t){
  const file=path.join(outDir,t.id+'.m4a');
  const aiff=path.join(tmp,t.id+'.aiff');
  let ok=false;
  for(let attempt=1;attempt<=2&&!ok;attempt++){
    try{fs.unlinkSync(aiff);}catch(e){}
    const spoken=await run('say',['-v',voice,'-r',rate,'-o',aiff,t.text]);
    if(spoken&&usable(aiff)){
      ok=await run('afconvert',['-f','m4af','-d','aac','-b','24000',aiff,file]);
      if(ok&&!usable(file))ok=false;
    }
  }
  if(ok)done++;
  else{fail++;if(fail<=8)console.error('FAIL',t.id);}
  try{fs.unlinkSync(aiff);}catch(e){}
  const n=done+fail;
  if(n%250===0){
    const sec=(Date.now()-t0)/1000;
    console.log(`进度 ${n}/${todo.length}（${sec.toFixed(0)}s，剩约 ${((todo.length-n)*sec/n/60).toFixed(1)} 分钟）`);
  }
}

(async()=>{
  const worker=async()=>{while(idx<todo.length){const t=todo[idx++];await one(t);}};
  await Promise.all(Array.from({length:jobs},worker));
  let bytes=0,have=0;
  for(const t of tasks){try{bytes+=fs.statSync(path.join(outDir,t.id+'.m4a')).size;have++;}catch(e){}}
  console.log(`DONE ok=${done} fail=${fail} 磁盘共 ${have}/${tasks.length} 句 / ${(bytes/1024/1024).toFixed(1)} MB → ${outDir}`);
  try{fs.rmSync(tmp,{recursive:true,force:true});}catch(e){}
  if(fail)process.exitCode=1;
})();
