'use strict';
// 单词读音全部外挂在微信云存储（2026-10-30 包内那 100 词的副本已删）：
//   outputs/audio-words（3008 词）+ outputs/audio-sent（例句），整批托管在 AUDIO_BASE 下。
// 包里只留 data/audio-manifest.js 这张清单（约 80KB），喇叭亮不亮由清单说了算——
// 没录音的词压根不画喇叭，不会出现「点了没反应的喇叭」。
//
// https 前缀要在小程序后台配 downloadFile 合法域名（tcb.qcloud.la 已配）；
// 换 CDN 只改 AUDIO_BASE 这一个常量，末尾必须带斜杠。
const AUDIO_BASE='https://736f-sore-tiger-d7g3oysvp8b78b2f2-1519436197.tcb.qcloud.la/audio/';

// 托管是否已就位（没配地址就别让喇叭亮起来）
function remoteReady(){ return !!AUDIO_BASE; }

function audioSrc(id){
  return AUDIO_BASE?AUDIO_BASE+id+'.m4a':'';
}

// 例句读音：同一台托管的 sent/ 前缀下，文件名 <词id>-s<行号>.m4a
// （行号跟服务端 lines 顺序一致：s0=say, s1=ex, s2=ex2, s3=ex3）
function sentSrc(id,i){
  return AUDIO_BASE?AUDIO_BASE+'sent/'+id+'-s'+i+'.m4a':'';
}

module.exports={AUDIO_BASE,audioSrc,sentSrc,remoteReady};
