const {test}=require('node:test');
const assert=require('node:assert');
const {paintShareCard,W,H,RING_BOX,RADIUS,MAX_W_PAD,squeezeOf}=require('../miniprogram/utils/sharecard-paint');
const {strokeFor,gapFor,hexToRgba,blendOn}=require('../miniprogram/utils/arcs');

// 假 ctx：把画过的弧、字、圆角路径都记下来，用来验证「分享卡上的圈就是首页那套圈」
function recorder(){
  const arcs=[],texts=[],corners=[],order=[];
  const ctx={font:'',fillStyle:'',strokeStyle:'',lineWidth:0,lineCap:'',textAlign:'',
    scale(){},save(){},restore(){},translate(){},
    fillRect(){order.push('fillRect');},
    clip(){order.push('clip');},
    moveTo(){},lineTo(){},closePath(){},
    arcTo(x1,y1,x2,y2,r){corners.push({x1,y1,x2,y2,r});},
    // 量字要跟字号走，否则「缩字号救一下」这条逻辑在假 ctx 里永远不起作用
    measureText:t=>{
      const m=String(ctx.font).match(/([\d.]+)px/);const px=m?parseFloat(m[1]):10;
      let w=0;
      for(const ch of String(t))w+=(/[\u3000-\u9fff\uff00-\uffef]/.test(ch)?1:0.55)*px;
      return {width:w};
    },
    fillText:(t)=>{order.push('text');texts.push({t,size:parseFloat(String(ctx.font).replace(/[^0-9.]/g,'' )),color:ctx.fillStyle});},
    strokeText(){},beginPath(){},fill(){},
    arc(x,y,r,a0,a1){arcs.push({x,y,r,a0,a1,color:ctx.strokeStyle,lw:ctx.lineWidth,cap:ctx.lineCap});},
    stroke(){}};
  return {ctx,arcs,texts,corners,order};
}

const card={
  dateEn:'OCTOBER 29, 2026 · THURSDAY',
  quote:'找到适合自己的表达方式。',
  rings:[
    {percent:100,color:'#06B6D4',soft:false},
    {percent:50,color:'#A659C5',soft:false},
    {percent:0,color:'#DF7A77',soft:true}
  ],
  facts:[{text:'饮水 · 今日 600/2100 ml',color:'#06B6D4'},{text:'英语 · 今日 0/5 词',color:'#A659C5'},
         {text:'心肺 · 本周 30/225 分钟',color:'#D93B36'}]
};

// 同一个半径上先画轨道、再画进度，按半径分组就把「圈」还原出来了（小圆点 lw=0，跳过）
function ringsOf(arcs){
  const byR=new Map();
  for(const a of arcs){
    if(!a.lw)continue;
    if(!byR.has(a.r))byR.set(a.r,[]);
    byR.get(a.r).push(a);
  }
  return [...byR.entries()].sort((x,y)=>y[0]-x[0]).map(([r,list])=>({r,track:list[0],fill:list[1]||null}));
}

test('分享卡的三个圈和首页用的是同一套几何：环宽、半径、轨道色都跟上尺寸走',()=>{
  const {ctx,arcs}=recorder();
  assert.equal(paintShareCard(ctx,W,H,card),true);
  const rings=ringsOf(arcs);
  assert.equal(rings.length,3,'三个圈');
  const stroke=strokeFor(RING_BOX),gap=gapFor(RING_BOX);
  const wantR=[0,1,2].map(i=>Math.round((RING_BOX-2*i*(stroke+gap)-stroke)/2));
  assert.deepEqual(rings.map(r=>Math.round(r.r)),wantR,'半径按 strokeFor/gapFor 推出来，不写死');
  assert.deepEqual(rings.map(r=>r.track.lw),[stroke,stroke,stroke],'环宽 = strokeFor(外径)，和首页一个算法');
  assert.deepEqual(rings.map(r=>r.track.color),
    [hexToRgba('#06B6D4',.14),hexToRgba('#A659C5',.14),hexToRgba('#DF7A77',.14)],
    '轨道色 = 环色淡到 14%，没走完的那截也还是这一项的颜色');
  assert.equal(rings[0].track.cap,'round','端头是圆的，跟首页的圆头一致');
  assert.equal(rings[0].track.a0,0,'轨道是整圆');
});

test('进度弧：从 12 点顺时针，满环绕整圈、50% 正好半圈，仅记录的圈用 62% 浅色',()=>{
  const {ctx,arcs}=recorder();
  paintShareCard(ctx,W,H,card);
  const rings=ringsOf(arcs);
  assert.equal(rings[2].fill,null,'0% 那圈只画轨道，不画进度');
  assert.deepEqual([rings[0].fill,rings[1].fill].map(f=>+((f.a1-f.a0)*180/Math.PI).toFixed(1)),[360,180]);
  assert.equal(rings[0].fill.a0,-Math.PI/2,'从 12 点起步');
  assert.equal(rings[0].fill.color,'#06B6D4');
  assert.equal(rings[1].fill.color,'#A659C5','达标圈用分类色原色');

  const soft=recorder();
  paintShareCard(soft.ctx,W,H,{...card,rings:[{percent:60,color:'#DF7A77',soft:true}]});
  const one=ringsOf(soft.arcs)[0];
  assert.equal(one.fill.color,blendOn('#DF7A77',.62,'#ffffff'),'仅记录：压到 62% 的浅色（预算成实色，端头盖上去不会叠深）');
  assert.equal(+((one.fill.a1-one.fill.a0)*180/Math.PI).toFixed(1),216);
});

test('定稿双环卡保留日期、两组标题、摘要、语录与圆角，不绘制编辑控件',()=>{
 const {ctx,texts,corners,order}=recorder();
 paintShareCard(ctx,W,H,{dateEn:card.dateEn,quote:'找到适合自己的表达方式。',summary:'快走15分钟 · 中等强度',groups:[{title:'今日记录',items:[{key:'move',label:'运动',percent:100},{key:'water',label:'饮水',valueText:'2544 / 2120 ml · 120%',color:'#06B6D4',percent:120}]},{title:'本周进度',items:[]}]});
 const text=texts.map(t=>t.t).join('');assert.ok(text.includes('TODAY'));assert.ok(text.includes('THIS WEEK'));assert.ok(text.includes('120%'));assert.ok(text.includes('快走'));assert.ok(text.includes('找到适合'));assert.ok(!text.includes('↻'));
 assert.equal(order[0],'clip');assert.equal(order[1],'fillRect');assert.ok(corners.length>=4);assert.ok(H/W<=1.2);assert.ok(MAX_W_PAD/2>=24);
});
test('长摘要和语录会换行且限制行数',()=>{const {ctx,texts}=recorder();paintShareCard(ctx,W,H,{date:'2026-10-30',summary:'运动记录'.repeat(80),quote:'日常记录'.repeat(80),groups:[]});assert.ok(texts.some(t=>t.t.includes('…')));assert.ok(texts.every(t=>t.size>=7));});

test('圆环顶部与栏目标题留出间距，末行数据在摘要之前',()=>{
 const {RING_CY,RING_BOX}=require('../miniprogram/utils/sharecard-paint');
 assert.ok(RING_CY-RING_BOX/2>=74,'圆环顶部至少74，标题基线64，留10像素');
 const {ctx,texts}=recorder();const placed=[];ctx.fillText=(t,x,y)=>placed.push({t,y});
 paintShareCard(ctx,W,H,{groups:[{title:'今日记录',items:[1,2,3].map(i=>({label:'项目'+i,valueText:'数值'+i,color:'#06B6D4',percent:50}))}],summary:'摘要',quote:'语录'});
 assert.ok(placed.find(i=>i.t==='数值3').y<280);assert.ok(!placed.some(i=>i.t==='摘要'));assert.ok(placed.find(i=>i.t==='语录').y>276);
});
