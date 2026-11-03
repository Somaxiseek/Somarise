const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
test('引导保存失败不会完成引导，用户可重试或明确跳过',async()=>{
 let definition,stored=0,navigated=0,message='';let reject=true;
 vm.runInNewContext(fs.readFileSync(require.resolve('../miniprogram/pages/onboard/onboard.js'),'utf8'),{Page:d=>definition=d,require:()=>({login:async()=>{},change:()=>{},error:e=>message=e.message}),wx:{setStorageSync:()=>stored++,reLaunch:()=>navigated++}});
 const p={...definition,data:{...definition.data},setData(v){Object.assign(this.data,v);},selectComponent:()=>({submitAll:async()=>{if(reject)throw Error('抗阻未保存');}})};
 await p.start();assert.equal(stored,0);assert.equal(navigated,0);assert.equal(p.data.saving,false);assert.match(message,/抗阻/);
 reject=false;await p.start();assert.equal(stored,1);assert.equal(navigated,1);
});
