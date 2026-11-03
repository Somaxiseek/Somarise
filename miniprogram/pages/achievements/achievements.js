const {api,error}=require('../../utils/api');
const {hexToRgba,fillFor}=require('../../utils/arcs');
const {monthColor}=require('../../utils/tokens');
const tip=require('../../utils/tip');
// 成就页（扁平线条风）：
//  · 顶部三格统计（累计 / 最长连续 / 28 天内）
//  · 12 月徽章墙（点月格展开当月日历，替代原来常驻的「本月日历」卡）
//  · 里程碑按模块折叠（记录 / 心肺 / 抗阻 / 饮水 / 英语 / 体测）
// 所有口径都来自服务端（Goals.closedWeeks / achievements），前端只渲染不重算。
Page({
  data:Object.assign({loaded:false,summary:{},wall:[],litCount:0,openMonth:null,cal:null,milestones:[]},tip.data),
  toggleTip(e){tip.toggle.call(this,e);},
  // 冷启动秒开：上次的徽章墙先摆出来（stale-while-revalidate），onShow 照常联网刷新
  onLoad(){
    try{
      const cache=wx.getStorageSync&&wx.getStorageSync('Somarise.achCache');
      if(cache&&cache.home)this.paint(cache.home,cache.badges||{badges:[]});
    }catch(e){}
  },
  async onShow(){await this.load();},
  // /home 34KB：别的页已经拉过就复用 globalData（dirty 才重拉），
  // 再和 /badges 并行——成就页不再每次进都白拿一整份首页。
  async load(){
    try{
      const app=getApp();
      let home=app.globalData.home;
      if(!home||app.globalData.dirty){home=await api('/home');app.globalData.home=home;app.globalData.dirty=false;}
      const badges=await api('/badges').catch(()=>({badges:[],today:home.habits&&home.habits.today}));
      try{wx.setStorageSync&&wx.setStorageSync('Somarise.achCache',{home,badges});}catch(e){}
      this.paint(home,badges);
    }catch(e){error(e);}
  },
  paint(home,badges){
    try{
      const h=home.habits||{summary:{days:[]},projects:[],today:''};
      const ach=h.achievements||{badges:[]};
      const today=h.today||new Date().toISOString().slice(0,10);
      this._h=h;this._today=today;
      this._closedDays=new Set(ach.closedDays||[]);
      this._closedWeeks=new Set(ach.closedWeeks||[]);
      // ── 顶部三格：都用「天」一个量纲，连续取「最长」不取「当前」 ──
      const sm=h.summary||[],allDays=sm.days||[],cur=today||'';
      const from=cur?new Date(Date.parse(cur+'T00:00:00Z')-27*86400000).toISOString().slice(0,10):'';
      const recent=from?allDays.filter(d=>d>=from&&d<=cur).length:0;
      const summary={total:sm.total||allDays.length,longest:sm.longest||0,recent};
      // ── 12 月徽章墙 ──
      const wall=(badges.badges||[]).map(b=>{
        const m=+String(b.month||'').slice(5,7)||0;
        const color=monthColor(m-1);
        const weeks=Number(b.weeks)||0,closed=Number(b.closed)||0;
        const ratio=weeks>0?closed/weeks:0;
        let state,fill,track,numColor;
        if(b.done){state='lit';fill=color;track=hexToRgba(color,0.14);numColor=color;}
        else if(closed>0){state='progress';fill=fillFor(color,ratio*100);track=hexToRgba(color,0.14);numColor=color;}
        else{state='notyet';fill='#e3e3e3';track='#e3e3e3';numColor='#c4c4c4';}
        return {month:b.month,label:String(m),weeks,closed,done:b.done,state,ratio,
          color,fill,track,numColor,selected:false,lit:!!b.done,
          showNum:!b.done,caption:b.done?'已点亮':'',
          sub:b.done?'已达成':(closed+'/'+weeks+' 周')};
      });
      const litCount=wall.filter(w=>w.state==='lit').length;
      // 默认展开「当前月」作示例（其余收起）
      let openMonth=this.data.openMonth;
      if(!openMonth)openMonth=today.slice(0,7);
      const cal=this.buildCalendar(openMonth,h,today,this._closedDays,this._closedWeeks);
      wall.forEach(w=>{w.selected=w.month===openMonth;});
      // ── 里程碑按模块折叠 ──
      const milestones=this.groupMilestones(ach.badges||[]);
      this.setData({loaded:true,summary,wall,litCount,openMonth,cal,milestones});
    }catch(e){error(e);}
  },
  // 任意年月的日历：复用首页那套「记录日 / 达标日 / 周闭环」口径
  buildCalendar(ym,habits,today,closedDays,closedWeeks){
    if(!ym)return null;
    const year=+ym.slice(0,4),m=+ym.slice(5,7);
    const lead=(new Date(Date.UTC(year,m-1,1)).getUTCDay()); // 0=周日：成就页日历按周日开头，贴合设计稿
    const daysInMonth=new Date(Date.UTC(year,m,0)).getUTCDate();
    const recorded=new Set((habits.summary&&habits.summary.days)||[]);
    const met=new Set(closedDays||[]);
    const projDays=(habits.projects||[]).map(p=>(p.progress&&p.progress.days)||[]);
    const cells=[];
    for(let i=0;i<lead;i++)cells.push({key:'b'+i,blank:true});
    for(let d=1;d<=daysInMonth;d++){const date=ym+'-'+String(d).padStart(2,'0');
      cells.push({key:date,n:d,blank:false,active:recorded.has(date),met:met.has(date),
        today:date===today,count:projDays.filter(arr=>arr.includes(date)).length});}
    while(cells.length%7!==0)cells.push({key:'t'+cells.length,blank:true});
    const weeks=[];for(let i=0;i<cells.length;i+=7)weeks.push(cells.slice(i,i+7));
    // 闭环标志按服务端口径（周一起算的周）判定：在每行里找「周一」那格，用它去 closedWeeks 命中
    const weekClosed=weeks.map(wk=>{
      const monCell=wk.find(c=>!c.blank && new Date(Date.parse(c.key+'T00:00:00Z')).getUTCDay()===1);
      if(!monCell)return false;
      return (closedWeeks||new Set()).has(monCell.key);});
    const closedWeeksCount=weekClosed.filter(Boolean).length;
    const hasRecords=cells.some(c=>c.active);
    return {year,month:m,title:year+' 年 '+m+' 月',weeksCount:weeks.length,
      closedWeeksCount,hasRecords,weeks:weeks.map((wk,i)=>({cells:wk,closed:weekClosed[i]}))};
  },
  // 点月徽章：展开 / 收起当月日历；再点收起
  toggleMonth(e){
    const month=e.currentTarget.dataset.month;
    const openMonth=this.data.openMonth===month?null:month;
    const wall=this.data.wall.map(w=>({...w,selected:w.month===openMonth}));
    const cal=openMonth?this.buildCalendar(openMonth,this._h,this._today,this._closedDays,this._closedWeeks):null;
    this.setData({openMonth,wall,cal});
  },
  // 里程碑：从现有成就列表按模块归类（记录 / 心肺 / 抗阻 / 饮水 / 英语 / 体测）
  groupMilestones(badges){
    const MODULES=[
      {key:'record',name:'记录',color:'#5C738A',test:id=>/^(first|days-|periods-|weeks-)/.test(id)},
      {key:'cardio',name:'心肺',color:'#D93B36',test:id=>id.indexOf('streak-cardio-')===0},
      {key:'strength',name:'抗阻',color:'#3D6EDC',test:id=>id.indexOf('streak-strength-')===0},
      {key:'water',name:'饮水',color:'#06B6D4',test:id=>id.indexOf('streak-water-')===0},
      {key:'english',name:'英语',color:'#A659C5',test:id=>id.indexOf('streak-english-')===0},
      {key:'body',name:'体测',color:'#32A964',test:id=>id.indexOf('streak-body-')===0}
    ];
    return MODULES.map(mod=>{
      const items=(badges||[]).filter(b=>mod.test(b.id)).map(b=>({
        id:b.id,label:b.label,note:b.note||'',earned:!!b.earned,
        progress:Math.min(b.progress||0,b.target||0),target:b.target||0}));
      const earned=items.filter(i=>i.earned).length;
      return {key:mod.key,name:mod.name,color:mod.color,earned,total:items.length,open:false,items};
    }).filter(g=>g.total>0);
  },
  toggleGroup(e){
    const key=e.currentTarget.dataset.key;
    const milestones=this.data.milestones.map(g=>g.key===key?{...g,open:!g.open}:g);
    this.setData({milestones});
  }
});
