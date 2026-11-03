'use strict';
const {fail}=require('./domain');
class MockOCR{
 async recognize(bytes,{scenario='success',signal}={}){if(signal?.aborted)fail('已取消');if(scenario==='failure')fail('模拟识别失败，请手动填写',422);if(scenario==='timeout')return new Promise((resolve,reject)=>{signal.addEventListener('abort',()=>reject(Object.assign(new Error('识别超时'),{status:504})),{once:true});});return {type:'running',distanceM:3000,durationSec:1200,heartRate:140,occurredAt:new Date(Date.now()-3600000).toISOString(),timeZone:'Asia/Shanghai',visibility:'private',source:'ocr_mock',confirmed:false,warnings:['模拟固定样例，不是图片识别结果。请逐项修改核实。']};}
 async cleanup(){}
}
async function recognize(adapter,bytes,options={},timeoutMs=5000){const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),timeoutMs);let cleanupPending=false;try{const result=await Promise.race([adapter.recognize(bytes,{...options,signal:controller.signal}),new Promise((_,reject)=>controller.signal.addEventListener('abort',()=>reject(Object.assign(new Error('识别超时'),{status:504})),{once:true}))]);return {draft:result,cleanupPending:false};}finally{clearTimeout(timer);bytes.fill(0);try{await adapter.cleanup();}catch{cleanupPending=true;}if(cleanupPending)options.onCleanupFailure?.();}}
// Future adapters must consume in-memory bytes and honor AbortSignal; never log image bytes.
module.exports={MockOCR,recognize};
