const {test}=require('node:test');
const assert=require('node:assert');
const {both,pack,COLORS,RING_MAX}=require('../miniprogram/utils/rings');

// 前端圆环只负责展示：数字、周期和「达标没达标」全部由服务端 goals 算好传进来。
// 今日组 = 每日目标（饮水/英语/自建每日），本周组 = 每周目标（心肺/抗阻/自建每周）。
const item=over=>Object.assign({
  key:'water',label:'饮水',period:'daily',periodLabel:'今日',metric:'ml',unit:'ml',
  color:'#06B6D4',current:900,target:1800,recordOnly:false,closed:false,
  percent:50,hidden:false,valueText:'900/1800 ml',remainText:'还差 900 ml'
},over);

test('今日组与本周组各放各周期的项目，互不合并成一个完成率',()=>{
  const home={goals:{
    today:'2026-10-28',weekStart:'2026-10-26',weekEnd:'2026-11-01',
    day:[item({key:'water'}),item({key:'english',label:'英语',color:'#8B5CF6',current:2,target:3,unit:'词',valueText:'2/3 词',percent:67,remainText:'还差 1 词'})],
    week:[item({key:'cardio',label:'心肺',period:'weekly',periodLabel:'本周',metric:'minutes',unit:'分钟',color:'#EF4444',current:45,target:90,valueText:'45/90 分钟',percent:50,remainText:'还差 45 分钟'}),
          item({key:'strength',label:'抗阻',period:'weekly',periodLabel:'本周',metric:'days',unit:'天',color:'#6366F1',current:1,target:2,valueText:'1/2 天',percent:50,remainText:'还差 1 天'})],
    recordedToday:1
  }};
  const r=both(home);
  assert.deepEqual(r.day.items.map(i=>i.key),['water','english']);
  assert.deepEqual(r.week.items.map(i=>i.key),['cardio','strength']);
  assert.equal(r.day.period,'daily');
  assert.equal(r.week.period,'weekly');
  assert.equal(r.recordedToday,1);
  // 中心永久留白（用户 10-29 定稿）：像 Apple Watch 的环，中间不放数字
  assert.equal(r.day.center,'');
  assert.equal(r.week.center,'');
  assert.equal(r.day.closedText,undefined,'「N 环已达标」也已下线：环闭没闭一眼就看得出');
});

test('达到 100% 后保持闭合，累计数字继续显示，不倒挂',()=>{
  const g=pack([item({current:2000,target:1800,closed:true,percent:100,valueText:'2000/1800 ml',remainText:'已达标'})],'daily','今日');
  assert.equal(g.closed,1);
  assert.equal(g.center,'','中心永久留白');
  const it=g.items[0];
  assert.equal(it.closed,true);
  assert.equal(it.valueText,'2000/1800 ml','继续显示实际累计，不写「已闭合」盖掉数字');
  assert.equal(it.remainText,'已达标');
  assert.equal(g.values[0].percent,100);
});

// 仅记录也要有环（用户 10-29：今日三条记录就该有三个环）：记过整圈点亮（浅一号），没记过只露轨道
test('仅记录模式：记过就把那一圈划满（浅一号），不算达标也不算失败',()=>{
  const g=pack([item({recordOnly:true,target:0,percent:100,done:true,current:300,valueText:'300 ml',remainText:'已记录 ✓'})],'daily','今日');
  const it=g.items[0];
  assert.equal(it.recordOnly,true);
  assert.equal(it.closed,false,'划满只是记过，不是达标');
  assert.equal(g.targeted,0,'不进达标分母');
  assert.equal(g.center,'','仅记录不产生达标环，中心照样留白');
  assert.equal(g.hasTarget,false);
  assert.equal(g.needsTarget,true,'有项目在记却没定线 → 首页直说这周闭不上环');
  assert.equal(g.values.length,1,'仅记录也是一圈，不消失');
  assert.equal(g.values[0].percent,100,'记过 → 整圈点亮');
  assert.equal(g.values[0].soft,true,'点亮但压一档明度');
  const empty=pack([item({recordOnly:true,target:0,percent:0,done:false,current:0,valueText:'未记录',remainText:'记一次就算'})],'daily','今日');
  assert.equal(empty.values[0].percent,0,'没记过只露轨道，不假装');
});

test('没有任何目标时给空态提示，不假装闭合',()=>{
  const g=pack([],'daily','今日');
  assert.equal(g.total,0);
  assert.equal(g.center,'');
  assert.equal(g.allClosed,false);
  assert.equal(g.needsTarget,false,'一个周项目都没有就不啰嗦「去定线」');
});

test('一组里部分达标：中心与底部都不写字（仅记录的不进分母）',()=>{
  const g=pack([
    item({closed:true,percent:100}),
    item({key:'english',label:'英语',current:0,target:3,percent:0,valueText:'0/3 词',remainText:'还差 3 词'}),
    item({key:'med',label:'冥想',recordOnly:true,target:0,current:10,done:true,valueText:'10 分钟',percent:100,remainText:'已记录 ✓'})
  ],'daily','今日');
  assert.equal(g.targeted,2,'仅记录的不进达标分母');
  assert.equal(g.closed,1);
  assert.equal(g.hasTarget,true);
  assert.equal(g.center,'','中心永久留白');
  assert.equal(g.closedText,undefined,'底部反馈行已删');
  assert.equal(g.allClosed,false);
  assert.equal(g.values.length,3,'三圈都在：两条目标线 + 冥想那圈浅色划满');
});

// 吸附向外（用户 10-29）：隐藏的不占槽位，可见项从最外圈依次排，空位留在最里面
test('隐藏后可见项向外吸附：两个可见就占最外面两圈，空位在最里',()=>{
  const g=pack([item({hidden:true}),item({key:'english',label:'英语',percent:50})],'daily','今日');
  assert.equal(g.items.length,1,'图例只剩可见项');
  assert.equal(g.items[0].key,'english');
  assert.equal(g.values.length,1,'隐藏项不占槽位');
  assert.equal(g.values[0].percent,50,'可见项吸附到最外圈');
  // 隐藏项不进达标分母：全藏光就不唠叨「本周仅记录」
  assert.equal(g.targeted,1);
});

test('每组最多想放几个就几个：一个环也能成立',()=>{
  const g=pack([item({closed:true,percent:100})],'weekly','本周');
  assert.equal(g.allClosed,true);
  assert.equal(g.center,'','中心永久留白');
});

// 中心永久留白是用户 10-29 的定稿：像 Apple Watch 的环，中间不放数字。
// 底部「N 环已达标」也删了（用户 10-29 追加）：环闭没闭一眼就看得出。
test('中心留白：任何时候都不出数字，也没有底部反馈行',()=>{
  const open=[
    item({percent:0,current:0,closed:false}),
    item({key:'english',label:'英语',current:0,target:3,percent:0,closed:false}),
    item({key:'body',label:'体测',current:0,target:1,percent:0,closed:false})
  ];
  const none=pack(open,'daily','今日');
  assert.equal(none.center,'','一环没闭 → 中心留空');
  assert.equal(none.closedText,undefined,'底部那行已删');

  const one=pack([
    item({closed:true,percent:100,current:2000}),
    open[1],open[2]
  ],'daily','今日');
  assert.equal(one.center,'','闭了环中心也不写数字');
  assert.equal(one.closedText,undefined,'底部反馈行已删');
});

// 环固定三圈（用户 10-29 定稿）：不做四圈、不做动态收环宽。
// 第 4 项起不画环也不进图例——列表最多三行，要取舍；服务端的周闭环照常算它。
test('环固定三圈：周视图四项时只画前三环，图例也只有三行',()=>{
  const four=[
    item({key:'cardio',label:'心肺',period:'weekly',percent:20}),
    item({key:'strength',label:'抗阻',period:'weekly',percent:0}),
    item({key:'water',label:'饮水',period:'weekly',percent:40,current:2,target:5}),
    item({key:'english',label:'英语',period:'weekly',percent:57,current:4,target:7})
  ];
  const g=pack(four,'weekly','本周');
  assert.equal(g.values.length,3,'环最多三圈');
  assert.equal(g.items.length,3,'图例最多三行，第 4 项不展示（取舍）');
  assert.deepEqual(g.items.map(i=>i.key),['cardio','strength','water']);
  assert.equal(RING_MAX,3);
});

// 藏掉一个，后面可见的往前补位（吸附）：藏饮水规则，英语规则补进第三圈
test('吸附取舍：藏掉第三项，第四项顶上来占环',()=>{
  const g=pack([
    item({key:'cardio',label:'心肺',period:'weekly',percent:20}),
    item({key:'strength',label:'抗阻',period:'weekly',percent:0}),
    item({key:'water',label:'饮水',period:'weekly',percent:40,hidden:true}),
    item({key:'english',label:'英语',period:'weekly',percent:57})
  ],'weekly','本周');
  assert.deepEqual(g.items.map(i=>i.key),['cardio','strength','english']);
  assert.equal(g.values.length,3,'仍是三圈，没有空洞');
});

// 圆环位置定死（用户 10-31）：环装进固定宽度的格位、整行左对齐，图例只往右长。
// 谁把 .ring-body 改回 justify-content:center，日/周切换时图例一宽一窄（「900/1800 ml」↔「达标 3 / 5 天」），
// 整组就会跟着左右挪，环看着像跳来跳去 —— 这个断言就是挡那一下的。
test('首页圆环定死在一处：环占固定格位，图例从固定左边缘往右长',()=>{
  const fs=require('node:fs'),path=require('node:path');
  const wxss=fs.readFileSync(path.join(__dirname,'../miniprogram/app.wxss'),'utf8');
  const wxml=fs.readFileSync(path.join(__dirname,'../miniprogram/pages/home/home.wxml'),'utf8');
  const body=wxss.match(/\.ring-body\s*\{([^}]*)\}/)[1];
  assert.doesNotMatch(body,/justify-content:\s*center/,'环那一行不许居中：一居中字长变了环就挪');
  assert.match(body,/justify-content:\s*flex-start/,'环那一行左对齐，环的左边缘才固定');
  const slot=wxss.match(/\.ring-slot\s*\{([^}]*)\}/)[1];
  assert.match(slot,/flex:\s*0\s+0\s+240rpx/,'环的格位宽度写死（= 环 120px）');
  assert.match(slot,/width:\s*240rpx/);
  const legend=wxss.match(/\.ring-legend\s*\{([^}]*)\}/)[1];
  assert.match(legend,/flex:\s*1\s+1\s+0/,'图例吃掉剩余宽度，字变长只是往右加');
  assert.match(legend,/min-height:\s*240rpx/,'图例预留环同高，项数变了环也不上下跳');
  assert.match(wxml,/class="ring-slot"><rings/,'rings 必须装进那个固定格位');
});
