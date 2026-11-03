const {test}=require('node:test');const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const {TOKENS}=require('../miniprogram/utils/tokens');

// 卡片组件：新手引导最后一步与「我的 → 目标设置」共用，所以行为要在这里守住
function mount(props={}){
  let def;const calls=[];
  const api=async(p,m,data)=>{
    calls.push([p,m,data]);
    if(p==='/goals')return {all:[
      {key:'cardio',period:'weekly',periodLabel:'本周',current:30,target:90,recordOnly:false},
      {key:'strength',period:'weekly',periodLabel:'本周',current:1,target:2,recordOnly:false},
      {key:'water',period:'daily',periodLabel:'今日',current:900,target:2100,recordOnly:false},
      {key:'english',period:'daily',periodLabel:'今日',current:1,target:3,recordOnly:false}
    ]};
    if(String(p).startsWith('/home'))return {bodyLatest:{weightKg:65},habits:{categories:[]}};
    return {};
  };
  const ctx={
    Component:d=>{def=d;},
    getApp:()=>({globalData:{token:'t'}}),
    require:id=>id.includes('tokens')?require('../miniprogram/utils/tokens')
      :id.includes('hydration')?require('../miniprogram/utils/hydration')
      :{api,error:e=>{throw e;},change:()=>{}},
    wx:{showModal(){},showToast(){}},
    Date,Math,Number,String,Promise,Error,console,JSON
  };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../miniprogram/components/goal-set/goal-set.js'),'utf8'),ctx);
  const inst={data:Object.assign({},JSON.parse(JSON.stringify(def.data)),props),
    setData(x){for(const [k,v] of Object.entries(x))this.data[k]=v;}};
  for(const key of Object.keys(def.methods))inst[key]=def.methods[key].bind(inst);
  return {inst,calls};
}

test('四张卡片的颜色就是打卡页那四个色，抗阻 2/3/4（2 是下限）、英语 1/3/5',async()=>{
  const {inst}=mount({skippable:true});
  await inst.load();
  const items=inst.data.items;
  const same=(a,b,msg)=>assert.equal(JSON.stringify(a),JSON.stringify(b),msg);
  same(items.map(i=>i.key),['cardio','strength','water','english']);
  same(items.map(i=>i.accent),[TOKENS.cardio,TOKENS.strength,TOKENS.water,TOKENS.english],'颜色取打卡页那套');
  same(items.find(i=>i.key==='strength').presets,[2,3,4],'抗阻 2/3/4 档：每周 2 天是 ACE/ACSM 最低建议');
  same(items.find(i=>i.key==='english').presets,[1,3,5],'英语 1/3/5 档');
  same(items.find(i=>i.key==='cardio').presets,[60,90,150]);
});

// 抗阻下限 2 天：自定义输入也绕不过去，想更轻松走「仅记录」
test('抗阻自定义 1 天会被拦下，2 天放行',async()=>{
  const {inst,calls}=mount();
  await inst.load();
  const strength=inst.data.items.find(i=>i.key==='strength');
  inst.data.items=inst.data.items.map(it=>it.key==='strength'?Object.assign({},it,{picked:'custom',draft:'1'}):it);
  await assert.rejects(inst.saveOne('strength'),/至少 2 天/);
  inst.data.items=inst.data.items.map(it=>it.key==='strength'?Object.assign({},it,{draft:'2'}):it);
  await inst.saveOne('strength');
  const patch=calls.filter(c=>c[0]==='/goals'&&c[1]==='PATCH').at(-1);
  assert.equal(patch[2].key,'strength');
  assert.equal(patch[2].target,2);
});

test('每项都有「为什么这么定」的说明，心肺那条引用世卫建议',async()=>{
  const {inst}=mount();
  await inst.load();
  for(const it of inst.data.items){
    assert.ok(it.whyLines&&it.whyLines.length>0,it.label+' 缺说明');
    assert.ok(it.whyLines.some(l=>l.s&&l.s.length>4),it.label+' 说明不能为空');
  }
  const cardio=inst.data.items.find(i=>i.key==='cardio');
  assert.ok(cardio.whyLines.some(l=>l.s.includes('世界卫生组织')),'心肺说明要引用世卫建议');
  inst.openTip({currentTarget:{dataset:{key:'cardio'}}});
  assert.equal(inst.data.tip,'cardio','点感叹号展开');
  inst.openTip({currentTarget:{dataset:{key:'cardio'}}});
  assert.equal(inst.data.tip,'','再点收起');
});

test('选了数值下面就有一句人话：每周 60 分钟的中等强度心肺训练',async()=>{
  const {inst}=mount({skippable:true});
  await inst.load();
  inst.pick({currentTarget:{dataset:{key:'cardio',value:'60'}}});
  assert.equal(inst.data.items.find(i=>i.key==='cardio').echo,'每周完成 60 分钟的中等强度心肺训练');
  inst.pick({currentTarget:{dataset:{key:'strength',value:'3'}}});
  assert.match(inst.data.items.find(i=>i.key==='strength').echo,/每周练 3 天抗阻/);
  inst.pick({currentTarget:{dataset:{key:'english',value:'skip'}}});
  assert.match(inst.data.items.find(i=>i.key==='english').echo,/先不记/);
});

test('饮水按体重算：填 70kg 选 35 就显示 2450ml，保存时把体重一起发上去',async()=>{
  const {inst,calls}=mount();
  await inst.load();
  assert.match(inst.data.water.echo,/65 kg × 37\.5 ml\/kg/,'默认用已有体重');
  inst.inputWeight({detail:{value:'70'}});
  inst.pickCoef({currentTarget:{dataset:{coef:'35'}}});
  assert.equal(inst.data.water.echo,'70 kg × 35 ml/kg ≈ 2450 ml 一天');
  assert.equal(inst.data.water.ready,true);
  await inst.saveOne('water');
  const patch=calls.find(c=>c[0]==='/goals'&&c[1]==='PATCH');
  assert.equal(patch[2].key,'water');
  assert.equal(patch[2].followWeight,true);
  assert.equal(patch[2].weightKg,70);
  assert.equal(patch[2].coefficient,35);
});

test('体重还没填就先提示，不会被算出一个假目标',async()=>{
  const {inst}=mount();
  inst.data.water={weightKg:'',coef:37.5,echo:'',ready:false};
  inst.inputWeight({detail:{value:''}});
  assert.equal(inst.data.water.ready,false);
  assert.match(inst.data.water.echo,/填上体重/);
});

test('引导提交：只写真的选过的那几项，先不记的不写',async()=>{
  const {inst,calls}=mount({skippable:true});
  await inst.load();
  // 新账号进来全是「先不记」，只有心肺被点成 90
  inst.setData({items:inst.data.items.map(it=>Object.assign({},it,{picked:'skip'}))});
  inst.pick({currentTarget:{dataset:{key:'cardio',value:'90'}}});
  const res=await inst.submitAll();
  const patches=calls.filter(c=>c[0]==='/goals'&&c[1]==='PATCH');
  assert.equal(patches.length,1,'只有心肺一项被选中');
  assert.equal(patches[0][2].key,'cardio');
  assert.equal(patches[0][2].target,90);
  assert.equal(res.saved,1);
});

// 引导里没动饮水，就不该顺手把别人的饮水目标按默认体重改掉
test('引导提交：没碰过饮水就不写饮水目标',async()=>{
  const {inst,calls}=mount({skippable:true});
  await inst.load();
  inst.setData({items:inst.data.items.map(it=>Object.assign({},it,{picked:'skip'}))});
  await inst.submitAll();
  assert.equal(calls.filter(c=>c[0]==='/goals'&&c[1]==='PATCH').length,0);
  inst.inputWeight({detail:{value:'70'}});
  await inst.submitAll();
  const patch=calls.filter(c=>c[0]==='/goals'&&c[1]==='PATCH')[0];
  assert.equal(patch[2].key,'water','碰过才写');
});

test('部分目标失败会返回具体失败项，已成功项目保留；支持重试',async()=>{
 const {inst}=mount({skippable:true});await inst.load();
 inst.data.items=[{key:'cardio',label:'心肺',picked:60},{key:'strength',label:'抗阻',picked:2}];
 let calls=0;inst.saveOne=async key=>{calls++;if(key==='strength')throw Error('网络失败');};
 await assert.rejects(inst.submitAll(),/抗阻：网络失败/);assert.equal(calls,2);
 const retried=[];inst.saveOne=async key=>retried.push(key);assert.equal((await inst.submitAll()).saved,1);assert.deepEqual(retried,['strength']);
});
test('引导会提交自定义目标和仅记录选项',async()=>{
 const {inst}=mount({skippable:true});inst.data.items=[{key:'cardio',label:'心肺',picked:'custom',draft:'70'},{key:'strength',label:'抗阻',picked:'record'}];
 const keys=[];inst.saveOne=async k=>keys.push(k);assert.equal((await inst.submitAll()).saved,2);assert.deepEqual(keys,['cardio','strength']);
});
