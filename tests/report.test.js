const {test}=require('node:test');
const assert=require('node:assert');
const {todayReport,shareCard,MONTHS,WEEKDAYS,WEEKDAYS_EN}=require('../miniprogram/utils/report');

// 战报与分享卡全部使用服务端算好的 goals 进度（home.goals.day / week），
// 不再自己算「今日闭环」，也不再把日目标和周目标合成一个完成率。
const today='2026-10-28';
const mkItem=over=>Object.assign({
  key:'water',label:'饮水',period:'daily',periodLabel:'今日',metric:'ml',unit:'ml',
  color:'#06B6D4',current:600,target:2100,recordOnly:false,closed:false,
  percent:29,valueText:'600/2100 ml',remainText:'还差 1500 ml'
},over);

function home(){
  return {goals:{
    today,weekStart:'2026-10-26',weekEnd:'2026-11-01',
    day:[mkItem({})],
    week:[mkItem({key:'cardio',label:'心肺',period:'weekly',periodLabel:'本周',metric:'minutes',unit:'分钟',color:'#EF4444',current:30,target:225,valueText:'30/225 分钟',percent:13,remainText:'还差 195 分钟'}),
          mkItem({key:'strength',label:'抗阻',period:'weekly',periodLabel:'本周',metric:'days',unit:'天',color:'#6366F1',current:1,target:3,valueText:'1/3 天',percent:33,remainText:'还差 2 天'})],
    recordedToday:1
  }};
}

test('战报逐项带周期：今日 / 本周各说各的，不再合成一个完成率',()=>{
  const r=todayReport(home());
  assert.equal(r.recorded,1,'按类别去重：喝几次水今天都只算一项');
  assert.equal(r.lines.length,3);
  assert.deepEqual(r.lines.map(l=>l.text),['今日 600/2100 ml','本周 30/225 分钟','本周 1/3 天']);
  assert.equal(r.finished,0);
  assert.match(r.title,/今日已记录 1 项/);
  assert.match(r.title,/心肺 30\/225 分钟（本周）/);
  assert.equal(r.day,today.slice(5).replace('-','/'));
});

test('达标与记录分开：都达标时逐项标 met，全部达标也只在各自周期里说',()=>{
  const h=home();
  h.goals.day[0]=mkItem({current:2100,target:2100,closed:true,percent:100,valueText:'2100/2100 ml',remainText:'已达标'});
  h.goals.week[0]=mkItem({key:'cardio',current:225,target:225,closed:true,percent:100,valueText:'225/225 分钟',remainText:'已达标'});
  h.goals.week[1]=mkItem({key:'strength',current:2,target:2,closed:true,percent:100,valueText:'2/2 天',remainText:'已达标'});
  const r=todayReport(h);
  assert.equal(r.finished,3);
  assert.equal(r.lines.every(l=>l.met),true);
  assert.equal(r.allMet,false,'新口径没有「今日全部闭环」这个合并概念');
});

test('没有任何项目时标题不吹牛，直接说明今天还没开始',()=>{
  const r=todayReport({goals:{today,day:[],week:[],recordedToday:0}});
  assert.equal(r.recorded,0);
  assert.equal(r.lines.length,0);
  assert.equal(r.title,today.slice(5).replace('-','/')+' · 今天还没有记录');
});

test('分享卡：英文日期带星期（日号在日期行里）+ 今日三圈 + 各周期数据 + 首页那条语录',()=>{
  const r=todayReport(home());
  const c=shareCard(r,'找到适合自己的表达方式。');
  const d=new Date(r.today+'T12:00:00Z');
  assert.equal(c.date,'2026-10-28');
  assert.equal(c.dateEn,'OCTOBER 28, 2026 · WEDNESDAY','日期行用英文，带星期');
  assert.equal(c.weekdayEn,WEEKDAYS_EN[d.getUTCDay()]);
  assert.equal(c.weekday,WEEKDAYS[d.getUTCDay()],'中文星期仍然算着，留给别处用');
  assert.ok(!('bigDay' in c),'环心不再放大日号：29 这种数字已经进了日期行');
  assert.ok(!('sentence' in c),'「今天记了几项」那句删掉，底下数据已经说清楚');
  // 圆环只取今日组（饮水），周目标在底部用文字说；口径和首页 rings 组件是同一份
  assert.deepEqual(c.rings,[{percent:29,color:'#06B6D4',soft:false}]);
  assert.deepEqual(c.facts.map(f=>f.text),['饮水 · 今日 600/2100 ml','心肺 · 本周 30/225 分钟','抗阻 · 本周 1/3 天']);
  assert.deepEqual(c.facts.map(f=>f.color),['#06B6D4','#EF4444','#6366F1']);
  assert.ok(!('rows' in c),'不再按「两行、每行两三段」切：卡片上排的是两列网格，直接吃这一条平铺列表');
  assert.equal(c.factsText,'饮水 · 今日 600/2100 ml · 心肺 · 本周 30/225 分钟 · 抗阻 · 本周 1/3 天');
  assert.equal(c.basisLine,'');
  assert.equal(c.quote,'找到适合自己的表达方式。');
  assert.equal(shareCard(r).quote,'','没有传语录时留空，不硬编一句');
  // 体重腰围绝不能出现在分享卡上
  assert.doesNotMatch(JSON.stringify(c),/kg|cm|体重|腰围/);
});

test('分享卡的圈：仅记录的项目带 soft（画的时候压成 62% 浅色），没有今日项目就不画假环',()=>{
  const h=home();
  h.goals.day[0]=mkItem({recordOnly:true,target:0,current:300,valueText:'300 ml',percent:0,remainText:'仅记录 · 不设目标'});
  const c=shareCard(todayReport(h));
  assert.deepEqual(c.rings,[],'仅记录不画目标圆环');

  const empty=shareCard(todayReport({goals:{today,day:[],week:[],recordedToday:0}}));
  assert.deepEqual(empty.rings,[],'一个今日目标都没有时不硬塞一个假环');
  assert.deepEqual(empty.facts,[]);
  assert.equal(empty.factsText,'今天还没有记录');
});
