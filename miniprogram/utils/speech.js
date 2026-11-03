'use strict';
// 点一下听发音。
//   单词：全部走 AUDIO_BASE 的托管地址（2026-10-30 包内副本已删，主包给功能让路）。
//         托管没配的时候喇叭一律不亮 —— 清单说了算，不画点了没反应的喇叭。
//   例句：也是预生成的录音，托管在同一台 CDN 的 sent/ 前缀下（9184 句）。
//         行号跟服务端 lines 顺序一致，清单里按「每词从头数连续有几句」记。
// 曾经用「微信同声传译」插件兜底即时合成，但那是企业主体才能用的，个人主体加不上，
// 所以现在没有即时合成：没录音的词就是真没声音，页面也不会给它画喇叭。
const manifest=require('../data/audio-manifest');
const {audioSrc,sentSrc,remoteReady}=require('../config/audio');

let ctx=null;
let current='';      // 正在放的单词 id
let saying='';       // 正在念的文本
let si=null,siChecked=false;

function toast(title){ try{ wx.showToast({title,icon:'none'}); }catch(e){} }

// 微信同声传译：requirePlugin 在插件没添加时会抛，所以只试一次并记住结果
function tts(){
  if(siChecked)return si;
  siChecked=true;
  try{ si=requirePlugin('WechatSI'); }catch(e){ si=null; }
  return si;
}
function canSpeak(){ const p=tts(); return !!(p&&typeof p.textToSpeech==='function'); }

function clear(){ current=''; saying=''; }

function ensure(){
  if(ctx)return ctx;
  ctx=wx.createInnerAudioContext();
  // 手机静音键打开时也要能出声：练发音的场景不该被静音键吃掉
  ctx.obeyMuteSwitch=false;
  ctx.onError(()=>{ clear(); toast('读音没放出来，稍后再试'); });
  ctx.onEnded(()=>{ clear(); });
  return ctx;
}

// 这个词的声音从哪来：托管地址配好且清单里有 → 网络地址；否则就是还没录
function sourceOf(id){
  if(!id||!remoteReady())return '';
  if(manifest.recorded(id))return audioSrc(id);
  return '';
}

function has(id){ return !!sourceOf(id); }

// 例句朗读：第 i 句有没有录音（清单按词记「从头数连续有几句」，行号跟服务端 lines 一致）
// 清单是生成物，老包里可能没有 sent 方法 —— 缺了就当「还没录」，绝不能让页面挂掉
function hasLine(wordId,i){
  if(!wordId||!remoteReady())return false;
  if(typeof manifest.sent!=='function')return false;
  return i>=0&&i<manifest.sent(wordId);
}

// 点例句旁的小喇叭：整句读音在托管上，不经过接口
function playLine(wordId,i){
  if(!hasLine(wordId,i)){
    toast('这一句还没有录音');
    return false;
  }
  try{
    playFile(sentSrc(wordId,i));
    current=wordId+'-s'+i;
    return true;
  }catch(e){
    current='';
    toast('读音没放出来，稍后再试');
    return false;
  }
}

function playFile(src){
  const audio=ensure();
  audio.stop();
  audio.src=src;
  audio.play();
}

// 即时合成一段英文并朗读。opts.onStart / opts.onEnd 给页面用来显示「正在念」
function speakText(text,opts){
  const opts2=opts||{};
  const content=String(text||'').trim();
  if(!content)return false;
  const p=tts();
  if(!p||typeof p.textToSpeech!=='function'){
    toast('这一句还没有录音');
    return false;
  }
  try{
    const audio=ensure();
    audio.stop();
    saying=content;
    if(opts2.onStart)opts2.onStart();
    p.textToSpeech({
      lang:'en_US',
      tts:true,
      content,
      success(res){
        try{
          audio.src=(res&&res.filename)||'';
          if(audio.src)audio.play();
          else if(opts2.onEnd)opts2.onEnd();
        }catch(e){ clear(); if(opts2.onEnd)opts2.onEnd(); }
      },
      fail(){
        clear();
        if(opts2.onEnd)opts2.onEnd();
        toast('朗读没成功，稍后再试');
      }
    });
    return true;
  }catch(e){
    clear();
    if(opts2.onEnd)opts2.onEnd();
    toast('朗读没成功，稍后再试');
    return false;
  }
}

// 返回 true 表示已经在放了（同一个词连点两次不叠加）
// 有录音就放录音；没有就如实说一句 —— 不假装，也不给点不动的喇叭
function play(id){
  const src=sourceOf(id);
  if(src){
    try{
      playFile(src);
      current=id;
      return true;
    }catch(e){
      current='';
      toast('读音没放出来，稍后再试');
      return false;
    }
  }
  toast('这个词还没有读音');
  return false;
}

function stop(){
  if(ctx&&(current||saying)){ try{ ctx.stop(); }catch(e){} }
  clear();
}

module.exports={
  play,stop,has,hasLine,playLine,speakText,canSpeak,
  total:manifest.count,
  currentId:()=>current,
  sayingText:()=>saying
};
