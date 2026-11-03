// 分享图的导出一关：真机上踩过「画完立刻导出 → 拿到空文件 → 面板转圈、分享菜单里一张破图」。
// 这里用一个假 wx 把「导出 → 验字节 → 验 PNG 头 → 验解码 → 重试」整条路走一遍。
'use strict';
const test=require('node:test');
const assert=require('node:assert');
const {exportCanvas,stageForShare,verify,isPng,waitFrames,hasInk,MIN_BYTES}=require('../miniprogram/utils/canvas-export');

const PNG_HEAD=Uint8Array.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a,0,0,0,0x0d,0x49,0x48,0x44,0x52]);
const NOT_PNG=Uint8Array.from([0x47,0x49,0x46,0x38,0x39,0x61,0,0,0,0,0,0,0,0,0,0,0,0]);

// 假 wx：files 是「路径 → {size, head}」，fs 读不到就 fail（跟开发者工具的 http://tmp 一样）
function fakeWx(o){
  const opt=o||{};
  const files=opt.files||{};
  const calls={export:0,unlink:[],imageInfo:0};
  const api={
    canvasToTempFilePath(p){
      calls.export+=1;
      const r=typeof opt.export==='function'?opt.export(calls.export):opt.export;
      if(r==='fail'||r==null)return p.fail({errMsg:'canvasToTempFilePath:fail'});
      p.success({tempFilePath:r});
    },
    getImageInfo(p){
      calls.imageInfo+=1;
      if(opt.imageOk===false)return p.fail({errMsg:'getImageInfo:fail'});
      p.success({width:840,height:672});
    },
    getFileSystemManager(){
      return {
        stat(p){
          const f=files[p.path];
          if(!f)return p.fail({errMsg:'stat:fail no such file'});
          p.success({stats:{size:f.size}});
        },
        readFile(p){
          const f=files[p.filePath];
          if(!f||!f.head)return p.fail({errMsg:'readFile:fail'});
          const buf=f.head.buffer.slice(f.head.byteOffset,f.head.byteOffset+f.head.length);
          p.success({data:buf});
        },
        unlink(p){calls.unlink.push(p.filePath);try{p.success({});}catch(e){}}
      };
    }
  };
  return {api,calls};
}

const canvasNode=()=>({requestAnimationFrame(fn){setTimeout(fn,0);}});

test('PNG 头认得住，别的格式认不住',()=>{
  assert.equal(isPng(PNG_HEAD),true);
  assert.equal(isPng(NOT_PNG),false);
  assert.equal(isPng(null),false);
  assert.equal(isPng(new Uint8Array([0x89,0x50])),false);
});

test('好文件通过：字节够、头对，就不再去问图片管线',async()=>{
  const {api,calls}=fakeWx({files:{'wxfile://a.png':{size:73500,head:PNG_HEAD}}});
  assert.equal(await verify(api,'wxfile://a.png'),'');
  assert.equal(calls.imageInfo,0);
});

test('0 字节 / 太小的文件不算数（这正是分享菜单里那张破图）',async()=>{
  const {api}=fakeWx({files:{'wxfile://empty.png':{size:0,head:PNG_HEAD}}});
  const why=await verify(api,'wxfile://empty.png');
  assert.match(why,/字节/);
});

test('头不是 PNG 的不算数',async()=>{
  const {api}=fakeWx({files:{'wxfile://x.png':{size:40000,head:NOT_PNG}}});
  assert.equal(await verify(api,'wxfile://x.png'),'不是 PNG');
});

test('文件系统读不到时（开发者工具 http://tmp）交给图片管线判',async()=>{
  const ok=fakeWx({imageOk:true});
  assert.equal(await verify(ok.api,'http://tmp/a.png'),'');
  const bad=fakeWx({imageOk:false});
  assert.equal(await verify(bad.api,'http://tmp/b.png'),'图片解不开');
});

test('没有路径就不算导出成功',async()=>{
  const {api}=fakeWx({});
  assert.equal(await verify(api,''),'没有导出路径');
});

test('第一次给坏文件、第二次给好文件 → 重试一次就成，坏的那个被删掉',async()=>{
  const {api,calls}=fakeWx({
    files:{
      'wxfile://bad.png':{size:120,head:PNG_HEAD},   // 真的导出了，但内容几乎是空的
      'wxfile://ok.png':{size:73500,head:PNG_HEAD}
    },
    export:n=>n===1?'wxfile://bad.png':'wxfile://ok.png'
  });
  const out=await exportCanvas({wx:api,canvas:canvasNode(),width:840,height:672,tries:2});
  assert.equal(out.path,'wxfile://ok.png');
  assert.equal(out.tries,2);
  assert.deepEqual(calls.unlink,['wxfile://bad.png']);
});

test('三次都不行就老实失败，路径给空 —— 调用方留在画布上，不塞坏图',async()=>{
  const {api}=fakeWx({
    files:{'wxfile://bad.png':{size:120,head:PNG_HEAD}},
    export:'wxfile://bad.png'
  });
  const out=await exportCanvas({wx:api,canvas:canvasNode(),width:840,height:672});
  assert.equal(out.path,'');
  assert.match(out.error,/字节/);
  assert.equal(out.tries,3);
});

test('canvasToTempFilePath 直接 fail 也不会白抛，只重试到上限',async()=>{
  const {api,calls}=fakeWx({export:'fail'});
  const out=await exportCanvas({wx:api,canvas:canvasNode(),width:840,height:672,tries:2});
  assert.equal(out.path,'');
  assert.match(out.error,/canvasToTempFilePath/);
  assert.equal(calls.export,2);
});

test('没有画布节点就别装作导出成功',async()=>{
  const {api}=fakeWx({});
  const out=await exportCanvas({wx:api,canvas:null,width:840,height:672});
  assert.equal(out.path,'');
  assert.match(out.error,/画布/);
});

test('等帧：requestAnimationFrame 至少走两轮才导出',async()=>{
  let frames=0;
  const node={requestAnimationFrame(fn){frames+=1;setTimeout(fn,0);}};
  await waitFrames(node,2);
  assert.ok(frames>=2,'等了 '+frames+' 帧');
});

test('没有 requestAnimationFrame 时用定时器兜底，不卡死',async()=>{
  await waitFrames({},1);
  assert.ok(true);
});

test('MIN_BYTES 卡在「空白图」和「真卡片」之间',()=>{
  assert.ok(MIN_BYTES>=3000&&MIN_BYTES<=20000,String(MIN_BYTES));
});

// ---- 画布到底画上了没有 ----
const whiteCtx=()=>({getImageData:()=>({data:new Uint8ClampedArray([255,255,255,255])})});
const inkCtx=()=>({getImageData:()=>({data:new Uint8ClampedArray([23,23,23,255])})});

test('全白画布 = 没画上，直接判空',()=>{
  assert.equal(hasInk(whiteCtx(),840,672),false);
  assert.equal(hasInk(inkCtx(),840,672),true);
});

test('readback 被平台禁掉时不敢误判，默认相信它画上了',()=>{
  assert.equal(hasInk({},840,672),true);
  assert.equal(hasInk(null,840,672),true);
  assert.equal(hasInk({getImageData(){throw new Error('denied');}},840,672),true);
});

test('第一轮画布还全白 → 先重画再导，不白导一次',async()=>{
  const {api,calls}=fakeWx({files:{'wxfile://ok.png':{size:73500,head:PNG_HEAD}},export:'wxfile://ok.png'});
  let painted=0;
  const ctx={getImageData:()=>({data:new Uint8ClampedArray(painted>1?[20,20,20,255]:[255,255,255,255])})};
  const out=await exportCanvas({wx:api,canvas:canvasNode(),width:840,height:672,ctx,paint:()=>{painted+=1;}});
  assert.equal(out.path,'wxfile://ok.png');
  assert.ok(painted>=2,'重画了 '+painted+' 次');
  assert.equal(calls.export,1,'空画布那一轮不该白导一次');
});

test('画布一直空就老实失败（白图的另一种版本）',async()=>{
  const {api,calls}=fakeWx({files:{'wxfile://ok.png':{size:73500,head:PNG_HEAD}},export:'wxfile://ok.png'});
  const out=await exportCanvas({wx:api,canvas:canvasNode(),width:840,height:672,ctx:whiteCtx()});
  assert.equal(out.path,'');
  assert.match(out.error,/空的/);
  assert.equal(calls.export,0);
});

// ---- 交给系统分享菜单之前的落地 ----
function stageWx(o){
  const opt=o||{};
  const copied=[];
  return {copied,api:{
    // 只有 goodDest 这张图能被图片管线解开
    getImageInfo:p=>(opt.goodDest&&p.src===opt.goodDest)?p.success({width:840,height:672}):p.fail({errMsg:'getImageInfo:fail'}),
    env:{USER_DATA_PATH:'wxfile://usr'},
    getFileSystemManager(){
      return {
        copyFile(p){
          copied.push([p.srcPath,p.destPath]);
          if(opt.copyFail)return p.fail({errMsg:'copyFile:fail'});
          p.success({});
        },
        stat(p){
          const size=p.path===opt.goodDest?'wxfile://usr/share-card.png'?73500:0:0;
          if(opt.goodDest&&p.path===opt.goodDest)return p.success({stats:{size:73500}});
          return p.fail({errMsg:'stat:fail'});
        },
        readFile(p){
          if(opt.goodDest&&p.filePath===opt.goodDest)return p.success({data:PNG_HEAD.buffer.slice(0)});
          return p.fail({errMsg:'readFile:fail'});
        }
      };
    }
  }};
}

test('分享前先复制到沙盒：目标图能验过就用它',async()=>{
  const {api,copied}=stageWx({goodDest:'wxfile://usr/share-card.png'});
  const out=await stageForShare(api,'wxfile://tmp/x.png');
  assert.equal(out,'wxfile://usr/share-card.png');
  assert.deepEqual(copied,[['wxfile://tmp/x.png','wxfile://usr/share-card.png']]);
});

test('复制出来的是坏的就退回临时路径，别拿坏图去发',async()=>{
  const {api}=stageWx({});
  assert.equal(await stageForShare(api,'wxfile://tmp/x.png'),'wxfile://tmp/x.png');
});

test('复制失败 / 没有 env 都退回临时路径，不发图也不能不发',async()=>{
  const fail=stageWx({copyFail:true,goodDest:'wxfile://usr/share-card.png'});
  assert.equal(await stageForShare(fail.api,'wxfile://tmp/x.png'),'wxfile://tmp/x.png');
  assert.equal(await stageForShare({getFileSystemManager:()=>({})},'wxfile://tmp/x.png'),'wxfile://tmp/x.png');
  assert.equal(await stageForShare(null,'wxfile://tmp/x.png'),'wxfile://tmp/x.png');
});
