const {test}=require('node:test'),assert=require('node:assert/strict');
const {createGateway,EXPECTED_APPID}=require('../server/mobile-gateway');
test('真实新账号无分类时可幂等准备抗阻项目，三部位打卡保留且账号隔离',async()=>{
 const data=new Map();const gateway=createGateway({transaction:async fn=>fn({get:async k=>data.get(k)||null,set:async(k,v)=>data.set(k,structuredClone(v))})});
 const call=(who,path,method='POST',body={})=>gateway({path,method,body},{APPID:EXPECTED_APPID,OPENID:who});
 const first=await call('a','/strength-project');assert.equal(first.status,200);assert.equal(first.data.kind,'resistance');
 const second=await call('a','/strength-project');assert.equal(second.data.id,first.data.id);
 const other=await call('b','/strength-project');assert.notEqual(other.data.id,first.data.id);
 for(const [i,part] of ['upper','lower','full'].entries()){
  const date='2026-10-'+(26+i);const saved=await call('a','/projects/'+first.data.id+'/checkins','POST',{date,part,confirmed:true,requestId:part});assert.equal(saved.status,200);assert.equal(saved.data.part,part);
 }
 assert.equal((await call('b','/projects/'+first.data.id,'GET')).status,404);
 const detail=await call('a','/projects/'+first.data.id,'GET');assert.equal(detail.data.records.length,3);
});
