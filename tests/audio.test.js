const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const {WORDS}=require('../miniprogram/data/words');
const manifest=require('../miniprogram/data/audio-manifest');
const {AUDIO_BASE,audioSrc,remoteReady}=require('../miniprogram/config/audio');

const REMOTE_DIR=path.join(__dirname,'../outputs','audio-words');

test('读音文件：全部外挂在托管目录，清单跟磁盘一致，不出孤儿',()=>{
  // 2026-10-30 起包内不带音频（原 100 词副本已删，主包让路），全部走 AUDIO_BASE。
  // 清单必须跟磁盘一致：清单说有、托管上没有 = 点了没反应的哑喇叭。
  const byId=new Set(WORDS.map(w=>w.id));
  const orphan=manifest.ALL.filter(id=>!byId.has(id));
  assert.deepEqual(orphan,[],'清单里有词库里没有的词：'+orphan.join(', '));
  assert.equal(new Set(manifest.ALL).size,manifest.ALL.length,'清单不能有重复 id');
  // 词库会长出新词（science 批就是这样），录音是增量补的：没录的词不画喇叭，是正常过渡态；
  // 但已录的清单必须跟得上词库的主体，断崖式倒退（少几百个）说明托管目录对不上了。
  assert.ok(manifest.ALL.length>=3000,'清单倒退：只认得 '+manifest.ALL.length+' 个词（词库共 '+WORDS.length+'）');

  // 包内批次已成历史：LOCAL 恒为空，local() 恒为 false
  assert.deepEqual(manifest.LOCAL,[],'包内不再保留音频副本');
  assert.equal(manifest.local('squat'),false);
  assert.equal(manifest.offline,0);

  // 外挂目录：清单说有就会去网络取，取不到就是哑的——目录里必须真的都在
  if(fs.existsSync(REMOTE_DIR)){
    const missing=manifest.ALL.filter(id=>!fs.existsSync(path.join(REMOTE_DIR,id+'.m4a')));
    assert.deepEqual(missing.slice(0,5),[],'外挂清单里有目录里没有的：'+missing.slice(0,5).join(', '));
  }
});

test('读音地址：统一走 AUDIO_BASE 托管',()=>{
  assert.match(AUDIO_BASE,/^https?:\/\/.+\/$/,'外挂前缀要以斜杠结尾，拼 id 才不会粘在一起');
  assert.equal(remoteReady(),true,'托管已配好，没配地址喇叭全灭是老包的状态');
  assert.equal(audioSrc('squat'),AUDIO_BASE+'squat.m4a');
  assert.equal(audioSrc('1rm'),AUDIO_BASE+'1rm.m4a');
  // 托管地址只改这一个常量：https 前缀要配 downloadFile 域名，cloud:// 不用
  const src=fs.readFileSync('miniprogram/config/audio.js','utf8');
  assert.equal((src.match(/const AUDIO_BASE=/g)||[]).length,1,'地址只放在一个常量里');
  assert.match(src,/function remoteReady\(\)/,'有没有地址是显式判断的，不是靠空字符串兜底');
  assert.ok(!/['"]\/audio\//.test(src),'包内 /audio/ 路径已废除');
});

test('点喇叭：同一个词连点不叠加，没录音的词给提示',()=>{
  const toasts=[];
  const ctx={src:'',played:0,stopped:0,obeyMuteSwitch:true,
    stop(){this.stopped++;},play(){this.played++;},
    onError(fn){this.err=fn;},onEnded(fn){this.ended=fn;}};
  global.wx={createInnerAudioContext:()=>ctx,showToast:t=>toasts.push(t.title)};
  delete require.cache[require.resolve('../miniprogram/utils/speech')];
  const speech=require('../miniprogram/utils/speech');

  assert.equal(speech.total,manifest.count,'能播的就是录过音的那些词');
  assert.equal(speech.has('squat'),true);
  assert.equal(speech.has('1rm'),true,'全部词都在托管上');

  assert.equal(speech.play('squat'),true);
  assert.equal(ctx.src,AUDIO_BASE+'squat.m4a','播的是托管地址');
  assert.equal(ctx.played,1);
  assert.equal(speech.currentId(),'squat');
  assert.equal(ctx.obeyMuteSwitch,false,'手机静音时也要能出声');

  speech.play('squat');
  assert.equal(ctx.stopped,2,'再点一次先停掉上一条，不叠着播');
  assert.equal(ctx.played,2);

  assert.equal(speech.play('not-a-word'),false);
  assert.equal(toasts.at(-1),'这个词还没有读音');
  assert.equal(ctx.played,2,'没得播就别去播');

  ctx.err();                      // 真机解码失败
  assert.equal(speech.currentId(),'');
  assert.equal(toasts.at(-1),'读音没放出来，稍后再试');

  speech.play('hinge');
  speech.stop();
  assert.equal(speech.currentId(),'');
  delete global.wx;
});

test('例句朗读：开了头的批次必须录满，行号跟服务端 lines 顺序一致',()=>{
  // 服务端 lines 的组装顺序固定是 say → ex → ex2 → ex3，句子音频按 s0/s1/s2/s3 命名。
  // 清单按词记「从头数连续有几句」：少一句，后面就算录了也不画喇叭，所以开了头就必须句句都在。
  // 新词可能分两批录（先单词音、后例句音，2026-10-30 science 批就是这种在途状态）：
  // 例句还没开工的词放行；要盯的是「录了一半」的真事故。
  const sentDir=path.join(__dirname,'../outputs','audio-sent');
  let started=0;
  for(const w of WORDS){
    const have=manifest.sent(w.id);
    if(!have)continue;               // 例句音还没开工：在途，不算坏
    started++;
    const lineCount=[w.say,w.ex,w.ex2,w.ex3].filter(x=>x&&String(x).trim()).length;
    assert.ok(lineCount>=3,`${w.w} 至少三句例句（现在 ${lineCount}）`);
    assert.equal(have,lineCount,`${w.w} 开了头就要录满 ${lineCount} 句（现在 ${have}）`);
    for(let i=0;i<lineCount;i++){
      const file=path.join(sentDir,w.id+'-s'+i+'.m4a');
      assert.ok(fs.existsSync(file),`缺例句音频 ${w.id}-s${i}.m4a`);
    }
  }
  assert.ok(started>2900,'例句音频的主体应该在（9232 句那批）');
});

test('例句喇叭接线：三个页面的行旁小喇叭都由清单说了算',()=>{
  const speechSrc=fs.readFileSync('miniprogram/utils/speech.js','utf8');
  assert.match(speechSrc,/function hasLine\(wordId,i\)/);
  assert.match(speechSrc,/manifest\.sent\(wordId\)/,'有没有这句录音，清单说了算');
  assert.match(speechSrc,/sentSrc\(wordId,i\)/,'播放走 sent/ 前缀的托管地址');

  for(const [wxml,js] of [
    ['miniprogram/pages/learn/learn.wxml','miniprogram/pages/learn/learn.js'],
    ['miniprogram/pages/word/word.wxml','miniprogram/pages/word/word.js'],
    ['miniprogram/pages/vocab/vocab.wxml','miniprogram/pages/vocab/vocab.js'],
  ]){
    const markup=fs.readFileSync(wxml,'utf8');
    const code=fs.readFileSync(js,'utf8');
    assert.match(markup,/wx:if="\{\{item\.audio\}\}" class="line-speak"/,wxml+' 没录音的句子不画喇叭');
    assert.match(markup,/catchtap="speakLine"/,wxml+' 句子喇叭用 catchtap');
    assert.match(code,/speech\.playLine\(/,js+' 要接 playLine');
  }
  // 行号从哪来：data-index 必须绑在行循环的 index 上（属性和 catchtap 的先后顺序无所谓）
  const learn=fs.readFileSync('miniprogram/pages/learn/learn.wxml','utf8');
  assert.match(learn,/(data-index="\{\{index\}\}"[^>]*catchtap="speakLine")|(catchtap="speakLine"[^>]*data-index="\{\{index\}\}")/);
});

test('页面接线：学习页和词库都能点喇叭，没录音的词不画',()=>{
  const learn=fs.readFileSync('miniprogram/pages/learn/learn.wxml','utf8');
  const learnJs=fs.readFileSync('miniprogram/pages/learn/learn.js','utf8');
  assert.match(learn,/catchtap="speak"/,'学习页喇叭用 catchtap，别冒泡到卡片');
  assert.match(learn,/aria-label="朗读 \{\{word\.word\}\}"/);
  assert.match(learn,/wx:if="\{\{word\.audio\}\}" class="speak"/,'没录音的词不画喇叭：画一个点了说「没读音」的是打扰');
  assert.match(learnJs,/speech\.play\(/);
  assert.match(learnJs,/audio:speech\.has\(w\.id\)/,'能不能响由清单说了算');
  assert.match(learnJs,/onHide\(\)\{ speech\.stop\(\)/,'离开页面要停声');

  const word=fs.readFileSync('miniprogram/pages/word/word.wxml','utf8');
  assert.match(word,/wx:if="\{\{word\.audio\}\}" class="speak"/,'从例句点进来的词同样：没录音就不画');

  const vocab=fs.readFileSync('miniprogram/pages/vocab/vocab.wxml','utf8');
  const vocabJs=fs.readFileSync('miniprogram/pages/vocab/vocab.js','utf8');
  assert.match(vocab,/data-id="\{\{item\.id\}\}" catchtap="speak"/,'词库行内喇叭不能触发整行展开');
  assert.match(vocab,/wx:if="\{\{item\.audio\}\}"/,'词库里没录音的词也不画');
  assert.match(vocabJs,/speech\.play\(e\.currentTarget\.dataset\.id\)/);

  for(const f of ['miniprogram/pages/learn/learn.wxss','miniprogram/pages/vocab/vocab.wxss']){
    const wxss=fs.readFileSync(f,'utf8');
    assert.match(wxss,/\.speak-icon \{[^}]*data:image\/svg\+xml;base64/,'喇叭图标是内联 SVG，不额外引入图片');
  }
});

test('词库分类名要能看懂，不能只写「训练」',()=>{
  const {CATS}=require('../miniprogram/data/words');
  assert.equal(CATS.training,'训练动作');
  assert.equal(CATS.anatomy,'身体部位');
  assert.equal(CATS.nutrition,'营养饮食');
  const learned=new Set(WORDS.map(w=>w.catLabel));
  for(const label of ['训练动作','身体部位','营养饮食'])assert.ok(learned.has(label),label+' 没发到前端');
});
