// 按钮体系守卫：全站不得再出现「实心黑块按钮 / 胶囊」。
// 以后谁手滑把主按钮写回黑底，这里直接红。
const test=require('node:test');
const assert=require('node:assert');
const fs=require('fs');
const path=require('path');

const ROOT=path.join(__dirname,'..','miniprogram');

function walk(dir,out=[]){
  for(const e of fs.readdirSync(dir,{withFileTypes:true})){
    const p=path.join(dir,e.name);
    if(e.isDirectory())walk(p,out);
    else if(e.name.endsWith('.wxss'))out.push(p);
  }
  return out;
}
const FILES=walk(ROOT);
const ALL=FILES.map(f=>({file:path.relative(ROOT,f),text:fs.readFileSync(f,'utf8')}));

// 取出每条声明块，判断「是不是一个按钮/胶囊类」
const BLACK=/background(?:-color)?\s*:\s*(#111111|#171717|#111\b|#000|#000000)\b/i;

test('app.wxss 定义了浮光胶囊体系',()=>{
  const app=ALL.find(f=>f.file==='app.wxss').text;
  for(const cls of ['.btn-soft','.btn-ghost','.btn-soft--english','.btn-soft--water','.btn-soft--cardio','.btn-soft--strength','.btn-soft--body','.btn-soft--danger']){
    assert.ok(new RegExp('\\'+cls+'[ ,{:]').test(app),'缺少公共按钮类 '+cls);
  }
  // 浮光款的底必须是白的
  const soft=app.slice(app.indexOf('.btn-soft, .btn-ghost'), app.indexOf('.btn-soft, .btn-ghost')+600);
  assert.match(soft,/background:\s*#ffffff/i,'.btn-soft 底色必须是白');
  assert.match(soft,/box-shadow:[^;]*rgba\([^)]*0?\.\d+\)/i,'.btn-soft 要带柔和投影');
  // 原生 button 默认描边必须清掉，否则浮光款会出重影
  assert.match(app,/button\.btn-soft::after[^}]*border:\s*0/,'button.btn-soft::after 要 reset');
});

test('任何按钮 / 胶囊类都不再是黑底',()=>{
  const bad=[];
  for(const {file,text} of ALL){
    // 逐条规则拆开看：选择器里带 button / btn / chip / pill / cta / save / seg / level 的才算「按钮或胶囊」
    const re=/([^{}]+)\{([^{}]*)\}/g;
    let m;
    while((m=re.exec(text))){
      const sel=m[1].trim().replace(/\/\*[\s\S]*?\*\//g,'').trim();
      const body=m[2];
      if(!sel||sel.startsWith('@'))continue;
      if(!/button|btn|chip|pill|cta|-save|seg-|level-|dock-plus/i.test(sel))continue;
      const b=BLACK.exec(body);
      if(b)bad.push(file+'  '+sel.split('\n').pop().trim()+'  → '+b[0]);
    }
  }
  assert.deepEqual(bad,[],'仍有黑底按钮：\n'+bad.join('\n'));
});

test('主按钮不再用 --accent（它是浅灰 #e8e8e8）',()=>{
  const bad=[];
  for(const {file,text} of ALL){
    const re=/([^{}]+)\{([^{}]*)\}/g;let m;
    while((m=re.exec(text))){
      const sel=m[1].trim();
      if(!/button|btn|-save|cta/i.test(sel))continue;
      if(/var\(--accent/.test(m[2]))bad.push(file+'  '+sel.split('\n').pop().trim());
    }
  }
  assert.deepEqual(bad,[],'主按钮还在用 var(--accent)：\n'+bad.join('\n'));
});

// 字号从「每处写裸数字」改成取全站字阶变量：标题一律 --fs-title，卡片标题一律 --fs-body。
// 断言变量而不是 40rpx，等于同时守住「不许再出现第四种标题字号」。
test('页面大标题取 --fs-title，卡片标题取 --fs-body',()=>{
  const app=ALL.find(f=>f.file==='app.wxss').text;
  assert.match(app,/screen-heading[^}]*font-size:\s*var\(--fs-title\)/,'form-page 大标题应取 --fs-title');
  assert.match(app,/panel-heading[^}]*font-size:\s*var\(--fs-body\)/,'卡片标题应取 --fs-body');
  const learn=ALL.find(f=>f.file==='pages/learn/learn.wxss').text;
  assert.match(learn,/learn-title[^}]*font-size:\s*var\(--fs-title\)/,'学习页大标题应取 --fs-title');
  const rec=ALL.find(f=>f.file==='pages/record/record.wxss').text;
  assert.match(rec,/rec-head[^}]*font-size:\s*var\(--fs-title\)/,'记录页大标题应取 --fs-title');
});

// 全站只允许出现字阶里定义过的字号；任何页面冒出一个裸 rpx，层级就会重新变乱
test('全站字号只走字阶变量，不再出现裸 rpx',()=>{
  const bad=[];
  for(const {file,text} of ALL){
    if(!file.endsWith('.wxss'))continue;
    const re=/font-size:\s*(\d+(?:\.\d+)?rpx)/g;let m;
    while((m=re.exec(text)))bad.push(file+'  '+m[1]);
  }
  assert.deepEqual(bad,[],'这些字号没走 var(--fs-*)：\n'+bad.join('\n'));
});

// 文字色同理：只允许 7 档墨色，不允许每个页面自己调一个灰
test('文字色只走墨阶变量',()=>{
  const allowed=new Set(['#ffffff','#fff']);
  const bad=[];
  for(const {file,text} of ALL){
    if(!file.endsWith('.wxss'))continue;
    const re=/(?<![-\w])color:\s*(#[0-9a-fA-F]{3,8})/g;let m;
    while((m=re.exec(text))){
      const v=m[1].toLowerCase();
      if(allowed.has(v))continue;
      // 彩色（分类色 / 状态绿 / 警示琥珀）是允许的，只盯灰阶
      bad.push(file+'  '+m[1]);
    }
  }
  // 只盯「真正的灰」：R/G/B 三通道差 ≤16 才算灰阶；浮光胶囊上那些青灰 / 紫灰字是分类色，不属于墨阶
  const gray=bad.filter(x=>{
    const hex=x.slice(-6);
    const r=parseInt(hex.slice(0,2),16),g=parseInt(hex.slice(2,4),16),b=parseInt(hex.slice(4,6),16);
    return Math.max(r,g,b)-Math.min(r,g,b)<=16;
  });
  assert.deepEqual(gray,[],'这些文字色没走 var(--ink-*)：\n'+gray.join('\n'));
});

// 圆角曾经散成 16/20/22/24/26/28/30/32/36/38/40 十一档，同类卡片在不同页面圆得不一样。
// 现在只留两档：页面级白卡 32rpx，卡内小块 20rpx。
test('页面级白卡圆角一律 32rpx',()=>{
  const CARDS=['form-card','menu-card','sport-card','daily-card','rec-card','rec-scan','rec-week',
    'gs-card','wall-card','cal-card','body-card','det-card','vocab-row','vocab-sum','lb-list',
    'lb-entry','lb-quick','ring-option','goal-card','ob-item','ms-group','part-card','sheet',
    'share-panel','project-row','add-sport-row','card'];
  const bad=[];
  for(const {file,text} of ALL){
    const re=/([^{}]+)\{([^{}]*)\}/g;let m;
    while((m=re.exec(text))){
      // 选择器前面常带一段注释，比较前先剥掉
      const sel=m[1].replace(/\/\*[\s\S]*?\*\//g,'').trim();
      if(CARDS.indexOf(sel)<0)continue;
      const r=(m[2].match(/border-radius:\s*([0-9.]+rpx)/)||[])[1];
      if(r&&r!=='32rpx')bad.push(file+'  '+sel+'  '+r);
    }
  }
  assert.deepEqual(bad,[],'这些卡片圆角不是 32rpx：\n'+bad.join('\n'));
});
