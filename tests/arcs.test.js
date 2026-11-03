const {test}=require('node:test');
const assert=require('node:assert');
const fs=require('node:fs');
const path=require('node:path');
const {strokeFor,gapFor,hexToRgba,fillFor,capAt,capShadowAt,arcList}=require('../miniprogram/utils/arcs');

const root=path.join(__dirname,'..','miniprogram');

test('圆环用 WXSS 画，页面里不再有 canvas（canvas 是原生层，滚动会浮起来）',()=>{
  const files=[
    'components/rings/rings.wxml',
    'components/rings/rings.js',
    'components/progress-ring/progress-ring.wxml',
    'components/progress-ring/progress-ring.js'
  ];
  for(const f of files){
    const src=fs.readFileSync(path.join(root,f),'utf8');
    assert.doesNotMatch(src,/<canvas|createCanvasContext|createSelectorQuery/i,f+' 还在用 canvas 画环');
  }
});

test('进度换算成 conic-gradient：0% 不画、100% 铺满、一半就是 180 度',()=>{
  assert.equal(fillFor('#FF6B35',0),'none');
  assert.equal(fillFor('#FF6B35',100),'#FF6B35');
  assert.equal(fillFor('#FF6B35',120),'#FF6B35');
  const half=fillFor('#FF6B35',50);
  assert.match(half,/^conic-gradient\(#FF6B35 0deg,#FF6B35 180deg,/);
  assert.match(half,/360deg\)$/);
  assert.match(fillFor('#16B8C8',29),/#16B8C8 104\.4deg/);
  // 回归：以前写了 from -90deg，弧从 9 点起跑、圆头还在 12 点算，端点就飘了
  assert.doesNotMatch(half,/from\s*-?90deg/,'conic-gradient 的 0deg 就是 12 点，不要再加 from 偏移');
});

test('环宽跟着尺寸走，默认够粗（11.5%）',()=>{
  assert.equal(strokeFor(120),15);
  assert.equal(strokeFor(112),14);
  assert.equal(strokeFor(96),12);
  assert.equal(gapFor(120),2);
  assert.equal(gapFor(96),2);
});

test('轨道色是环色淡到 14%，不是灰色',()=>{
  assert.equal(hexToRgba('#FF6B35',0.14),'rgba(255,107,53,0.14)');
  assert.equal(hexToRgba('#4C6FFF',0.14),'rgba(76,111,255,0.14)');
  assert.equal(hexToRgba('nope',0.14),'rgba(0,0,0,0.14)');
});

test('圆头严格落在环身中心线上：0 度在 12 点，角度和 conic-gradient 同一套算法',()=>{
  const box=120,stroke=12,dot=12,r=(box-stroke)/2;
  // 12 点：正中偏上，圆心距 = 中心线半径
  assert.deepEqual(capAt(box,stroke,dot,0),{left:box/2-dot/2,top:stroke/2-dot/2});
  // 90 度（3 点）/180 度（6 点）/270 度（9 点）
  const right=capAt(box,stroke,dot,90),bottom=capAt(box,stroke,dot,180),left=capAt(box,stroke,dot,270);
  assert.deepEqual(right,{left:box/2+r-dot/2,top:box/2-dot/2});
  assert.deepEqual(bottom,{left:box/2-dot/2,top:box/2+r-dot/2});
  assert.deepEqual(left,{left:box/2-r-dot/2,top:box/2-dot/2});
  for(const deg of [0,17,45,90,180,223,300]){
    const c=capAt(box,stroke,dot,deg);
    const cx=c.left+dot/2-box/2,cy=c.top+dot/2-box/2;
    const rad=Math.hypot(cx,cy);
    assert.ok(Math.abs(rad-r)<0.02,'圆头半径必须等于中心线半径');
    const ang=(Math.atan2(cy,cx)*180/Math.PI+90+360)%360;
    assert.ok(Math.abs(ang-deg)<0.02,'圆头角度必须等于弧的起止角度');
  }
});

test('三环的尺寸从外到内依次收窄，洞不会盖住里面那一环',()=>{
  const arcs=arcList([{percent:50,color:'#16B8C8'},{percent:100,color:'#FF6B35'},{percent:0,color:'#4C6FFF'}],120);
  assert.equal(arcs.length,3);
  assert.deepEqual(arcs.map(a=>a.offset),[0,17,34]);
  assert.deepEqual(arcs.map(a=>a.box),[120,86,52]);
  assert.deepEqual(arcs.map(a=>a.hole),[90,56,22]);
  // 外层洞半径 45，中层外沿半径 43 —— 留出 2px 细缝，不会互相盖
  assert.ok(arcs[0].hole/2>arcs[1].box/2);
  assert.equal(arcs[0].showCap,true);
  assert.equal(arcs[1].showCap,true,'100% 闭环也要在起点画一个带阴影的头（覆盖+轻微阴影）');
  assert.equal(arcs[1].caps.length,1,'闭环只有一个头，压在起点 12 点');
  assert.deepEqual(arcs[1].caps[0],{key:'close',head:true,shadow:'2px 0px 3px rgba(0,0,0,0.20)',left:35.5,top:0},'闭环头在 12 点，阴影落在头的右侧');
  assert.equal(arcs[2].fill,'none','0% 只显示轨道');
  assert.equal(arcs[2].caps.length,0,'0% 没有弧，也不该留圆头');
  // 圆头直径=环宽，端头正好补成半圆，不鼓包
  assert.equal(arcs[0].dotSize,15);
  assert.deepEqual(arcs[0].caps.map(c=>c.key),['start','end']);
  assert.deepEqual(arcs[0].caps[0],{key:'start',head:false,shadow:'none',left:52.5,top:0});
  assert.deepEqual(arcs[0].caps[1],{key:'end',head:true,shadow:'-2px 0px 3px rgba(0,0,0,0.20)',left:52.5,top:105});
  assert.equal(arcs[0].track,'rgba(22,184,200,0.14)');
});

// 阴影必须跟着「头前进的方向」落，不是永远朝下：
// 环从 12 点顺时针走，12 点→右、3 点→下、6 点→左、9 点→上。
// 闭合时头回到 12 点压在起点上，所以阴影只在头的右侧、左侧干净（用户 10-30 点名）。
test('端点阴影跟随前进方向（顺时针切线），且在 12 点闭合时只落在右侧',()=>{
  const dirAt=deg=>{
    const m=capShadowAt(deg,15).match(/^(-?\d+)px (-?\d+)px /);
    return [Number(m[1]),Number(m[2])];
  };
  assert.deepEqual(dirAt(0),[2,0],'12 点：向右');
  assert.deepEqual(dirAt(90),[0,2],'3 点：向下');
  assert.deepEqual(dirAt(180),[-2,0],'6 点：向左');
  assert.deepEqual(dirAt(270),[0,-2],'9 点：向上');
  // 起点永远干净；闭合时那个头（终点）在 12 点，阴影只往右
  const closed=arcList([{percent:100,color:'#A77BE8'}],120)[0];
  assert.deepEqual(closed.caps.map(c=>c.key),['close']);
  assert.equal(closed.caps[0].shadow,'2px 0px 3px rgba(0,0,0,0.20)');
  const half=arcList([{percent:50,color:'#A77BE8'}],120)[0];
  assert.equal(half.caps[0].shadow,'none','起点无影');
  assert.equal(half.caps[1].shadow,'-2px 0px 3px rgba(0,0,0,0.20)','6 点的头向左落影');
});

// 端头必须「覆盖」环身，而不是叠一层半透明：
// 「仅记录」的环如果仍用 rgba(color,0.62)，端头压上去会二次混色、比周围深一块
// —— 用户 10-30 截图里看到的就是这个「两个头重叠出的影子」。
test('仅记录的环预算成不透明色：端头盖上去是覆盖，不会有二次混色的深块',()=>{
  const a=arcList([{percent:100,color:'#F27A75',soft:true}],150)[0];
  assert.ok(!/rgba/.test(a.color),'环身与端头必须是实色，不能带 alpha：' + a.color);
  assert.match(a.color,/^#[0-9a-f]{6}$/);
  assert.equal(a.fill,a.color,'100% 的填充就是同一个实色');
  assert.equal(a.caps[0].shadow.indexOf('rgba(0,0,0,0.20)')>0,true);
  // 底色不同，压出来的实色也不同（卡片不是纯白时也不会脏）
  const onGrey=arcList([{percent:100,color:'#F27A75',soft:true}],150,0,0,'#f5f5f5')[0];
  assert.notEqual(onGrey.color,a.color);
  assert.ok(!/rgba/.test(onGrey.color));
});

test('环数太多时自动丢掉塞不进去的内环，不会画出负数尺寸（环固定三圈由 pack 负责）',()=>{
  const arcs=arcList(new Array(6).fill({percent:10,color:'#111'}),120);
  assert.ok(arcs.length<6);
  assert.equal(arcs.every(a=>a.hole>2&&a.box>0),true);
});
