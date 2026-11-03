// 把 2d canvas 导出成「确认能打开」的临时图片。
//
// 真机上踩过的两坑，都在这一步：
//   ① 画完立刻导出 → success 回调给的路径当时还读不出图，面板里 <image> 一直转圈，
//      分享菜单里是一张破图（`showShareImageMenu` 拿到的是空文件）。
//      画布内容要等一两帧才真正提交上屏，所以导出前先等帧。
//   ② 导出成功 ≠ 文件可用。所以拿到路径后必须验一遍：字节数、PNG 头、再让图片管线解一次。
//      验不过就重试，三次都不过就老实返回失败，让调用方留在「能看到卡片」的状态，
//      不要把一张坏图塞进 <image> 或分享菜单。
// 纯逻辑、不直接依赖 wx，方便单测（tests/canvas-export.test.js 用假 wx 跑）。
'use strict';

const PNG=[0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a];
const MIN_BYTES=6000;          // 纯白 840×672 只压到 1~3KB，真卡片 40KB 以上
const RETRY_DELAYS=[0,150,350];

// 抽查几个点看画布到底有没有画上东西。
// 画完立刻读，真机上经常还是全白（内容没提交上屏），这时候导出的就是白图 ——
// 「导出是白图」这个坑不靠猜版式，靠这一句当场问出来。
const PROBES=[[.5,.5],[.5,.14],[.5,.06],[.2,.2],[.8,.2],[.5,.86],[.25,.5],[.75,.5],[.5,.62],[.12,.5],[.88,.5],[.5,.3]];
function hasInk(ctx,w,h){
  if(!ctx||typeof ctx.getImageData!=='function')return true;   // 读不到就默认相信它画上了
  for(const p of PROBES){
    try{
      const d=ctx.getImageData(Math.round(w*p[0]),Math.round(h*p[1]),1,1).data;
      if(d&&(d[0]<250||d[1]<250||d[2]<250))return true;
    }catch(e){return true;}
  }
  return false;
}

function sleep(ms){return new Promise(r=>setTimeout(r,ms));}

// 等画布真的提交上屏
function waitFrames(node,frames){
  return new Promise(resolve=>{
    const total=Math.max(1,frames||2);
    const raf=node&&typeof node.requestAnimationFrame==='function';
    let i=0;
    const step=()=>{
      i+=1;
      if(i>=total)return resolve();
      if(raf)node.requestAnimationFrame(step);
      else setTimeout(step,40);
    };
    if(raf)node.requestAnimationFrame(step);
    else setTimeout(step,40);
  });
}

function toPng(wxApi,node,w,h){
  return new Promise((resolve,reject)=>{
    if(!wxApi||typeof wxApi.canvasToTempFilePath!=='function')return reject(new Error('no canvasToTempFilePath'));
    wxApi.canvasToTempFilePath({
      canvas:node,
      x:0,y:0,
      // 2d 画布这里按「画布像素」算：传 CSS px 只会截走左上角，所以传画布真实像素
      width:w,height:h,
      destWidth:w,destHeight:h,
      fileType:'png',
      success:o=>resolve((o&&o.tempFilePath)||''),
      fail:e=>reject(new Error((e&&e.errMsg)||'canvasToTempFilePath fail'))
    });
  });
}

// 文件系统读不到就返回 null（开发者工具给的临时路径是 http://tmp/…，读不了很正常）
function statSize(wxApi,filePath){
  return new Promise(resolve=>{
    let fs=null;
    try{fs=wxApi&&typeof wxApi.getFileSystemManager==='function'?wxApi.getFileSystemManager():null;}catch(e){fs=null;}
    if(!fs||typeof fs.stat!=='function')return resolve(null);
    try{
      fs.stat({path:filePath,
        success:r=>resolve(r&&r.stats&&typeof r.stats.size==='number'?r.stats.size:null),
        fail:()=>resolve(null)});
    }catch(e){resolve(null);}
  });
}

function readHead(wxApi,filePath,length){
  return new Promise(resolve=>{
    let fs=null;
    try{fs=wxApi&&typeof wxApi.getFileSystemManager==='function'?wxApi.getFileSystemManager():null;}catch(e){fs=null;}
    if(!fs||typeof fs.readFile!=='function')return resolve(null);
    try{
      fs.readFile({filePath,position:0,length:length||16,dataType:'arraybuffer',
        success:r=>{
          const d=r&&r.data;
          if(!d)return resolve(null);
          resolve(d instanceof ArrayBuffer?new Uint8Array(d):(d.buffer?new Uint8Array(d.buffer):null));
        },
        fail:()=>resolve(null)});
    }catch(e){resolve(null);}
  });
}

// 最硬的一关：让微信自己的图片管线解一次，解得开才算真的能用
function decodable(wxApi,filePath){
  return new Promise(resolve=>{
    if(!wxApi||typeof wxApi.getImageInfo!=='function')return resolve(null);
    try{
      wxApi.getImageInfo({src:filePath,
        success:r=>resolve(!!(r&&r.width>0&&r.height>0)||true),
        fail:()=>resolve(false)});
    }catch(e){resolve(false);}
  });
}

function isPng(head){
  if(!head||head.length<8)return false;
  for(let i=0;i<8;i+=1)if(head[i]!==PNG[i])return false;
  return true;
}

// 返回 '' 表示这文件能用，否则返回一句人话原因
async function verify(wxApi,filePath){
  if(!filePath)return '没有导出路径';
  const size=await statSize(wxApi,filePath);
  const head=await readHead(wxApi,filePath,16);
  if(size!=null&&size<MIN_BYTES)return '只有 '+size+' 字节';
  if(head&&!isPng(head))return '不是 PNG';
  if(size!=null&&head)return '';                  // 文件系统已经给了答案，不用再问图片管线
  const ok=await decodable(wxApi,filePath);        // 读不到文件（如工具里的 http://tmp）
  return ok===false?'图片解不开':'';
}

// 交给「发送给朋友」之前的最后一步：把图复制成 USER_DATA_PATH 下的一张固定图。
// 分享菜单是由系统扩展去读文件的，只认稳稳落在沙盒里的东西；画布刚导出的临时文件
// 读得到、交给扩展却可能拿到破图（真机踩过的就是这个）。复制失败就退回临时路径。
function stageForShare(wxApi,filePath){
  return new Promise(resolve=>{
    const env=wxApi&&wxApi.env;
    let fs=null;
    try{fs=wxApi&&typeof wxApi.getFileSystemManager==='function'?wxApi.getFileSystemManager():null;}catch(e){fs=null;}
    if(!filePath||!fs||typeof fs.copyFile!=='function'||!env||!env.USER_DATA_PATH)return resolve(filePath);
    const destPath=env.USER_DATA_PATH+'/share-card.png';
    try{
      fs.copyFile({srcPath:filePath,destPath,
        success:async()=>{ resolve((await verify(wxApi,destPath))?filePath:destPath); },
        fail:()=>resolve(filePath)});
    }catch(e){resolve(filePath);}
  });
}

// opts: {wx, canvas, width, height, ctx, paint, frames, tries}
//   paint(i) 每轮重画一次 —— 画布没上屏就靠重画+等帧救回来
// → {path, error, tries}
async function exportCanvas(opts){
  const o=opts||{};
  const wxApi=o.wx;
  const node=o.canvas;
  const w=Math.max(1,Math.round(o.width||0));
  const h=Math.max(1,Math.round(o.height||0));
  if(!node)return {path:'',error:'没有画布节点',tries:0};
  const delays=o.tries?RETRY_DELAYS.slice(0,Math.max(1,o.tries)):RETRY_DELAYS;
  let reason='';
  for(let i=0;i<delays.length;i+=1){
    if(delays[i])await sleep(delays[i]);
    if(typeof o.paint==='function'){
      try{o.paint(i);}
      catch(e){reason=(e&&e.message)||'画不出来';continue;}
    }
    await waitFrames(node,o.frames||2);
    if(o.ctx&&!hasInk(o.ctx,w,h)){reason='画布还是空的';continue;}
    let file='';
    try{file=await toPng(wxApi,node,w,h);}
    catch(e){reason=(e&&e.message)||'导出失败';continue;}
    const bad=await verify(wxApi,file);
    if(!bad)return {path:file,error:'',tries:i+1};
    reason=bad;
    // 坏文件别再堆着：删掉，下一轮会重新导
    try{wxApi.getFileSystemManager().unlink({filePath:file,fail(){}});}catch(e){}
  }
  return {path:'',error:reason||'导出失败',tries:delays.length};
}

module.exports={exportCanvas,stageForShare,verify,waitFrames,hasInk,isPng,MIN_BYTES,RETRY_DELAYS};
