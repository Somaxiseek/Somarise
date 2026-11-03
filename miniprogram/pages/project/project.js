const {api,error,change}=require('../../utils/api');
const {inkFor,pickIcon}=require('../../utils/palette');
const {TOKENS}=require('../../utils/tokens');
const KIND_COLOR={hydration:TOKENS.water,resistance:TOKENS.strength,sport:TOKENS.cardio,generic:TOKENS.english,learning:TOKENS.english};
Page({popupNoop(){},dismissCelebrate(){this.setData({celebrate:false});},
  data:{loaded:false,busy:false,celebrate:false,date:'',amountMl:'',entryMode:'add',water:null,historyOpen:false,visibleRecords:[]},
  onLoad(q){this.id=q.id;},
  async onShow(){try{await this.load();}catch(e){error(e);}},
  async load(){
    const project=await api('/projects/'+this.id);
    project.records=(project.records||[]).map(r=>{if(r.durationSec==null)return r;const dur=r.durationSec,dist=r.distanceM||0;let paceText='';if(dist>0&&dur>0){if(r.type==='cycling')paceText=(dist/dur*3.6).toFixed(1)+' km/h';else{const pace=Math.round(dur/dist*(r.type==='swimming'?100:1000));paceText='配速 '+Math.floor(pace/60)+':'+String(pace%60).padStart(2,'0')+(r.type==='swimming'?' /100m':' /km');}}return {...r,durationText:Math.round(dur/6)/10,paceText};});
    const home=getApp().globalData.home;
    if(home&&project.sportType){home.activities=home.activities.filter(a=>a.projectId!==this.id).concat(project.records);}
    const selected=this.data.date||project.today;
    const days=project.progress.days||[];
    const totalDays=days.length;
    const avgGap=totalDays>1?Math.round((Date.parse(days[days.length-1]+'T12:00:00Z')-Date.parse(days[0]+'T12:00:00Z'))/86400000/(totalDays-1)):null;
    const week=(project.progress.trail||[]).slice(-7);
    const weekCount=week.filter(d=>d.active).length;
    // 老项目存的是 emoji，统一换成形状；新项目存的就是形状 key
    const DEFAULT_SHAPE={hydration:'ring',resistance:'bars',sport:'tri',generic:'bar',learning:'diamond'};
    project.icon=pickIcon(project.icon||DEFAULT_SHAPE[project.kind]||'dot');
    // 页面主色跟随项目色，主按钮用它而不是纯黑
    const accent=project.color||KIND_COLOR[project.kind]||TOKENS.cardio;
    project.accent=accent;project.accentInk=inkFor(accent);
    project.totalDays=totalDays;project.avgGap=avgGap;project.week=week;project.weekCount=weekCount;project.created=(project.createdAt||'').slice(0,10);
    const gp=project.goal||null;
    this.setData({project,loaded:true,date:selected,historyOpen:false,visibleRecords:project.records.slice(0,3),
      goalText:gp?(gp.period==='weekly'?'本周':gp.period==='yearly'?'今年':gp.period==='window'?gp.months+'个月目标':'当前连续'):'仅记录'});
    this.waterSummary();
  },
  edit(){wx.navigateTo({url:'/pages/create/create?edit='+this.id});},
  toggleHistory(){const open=!this.data.historyOpen;this.setData({historyOpen:open,visibleRecords:open?this.data.project.records:this.data.project.records.slice(0,3)});},
  async backfill(e){
    if(this.data.busy)return;
    const date=e.detail.value;
    if(!date)return;
    const p=this.data.project;
    // 运动项目需录入距离/时长，直接跳到记录页补录
    if(p.sportType){wx.navigateTo({url:'/pages/record/record?projectId='+this.id+'&type='+p.sportType+'&date='+date});return;}
    // 饮水项目在首页记录，详情页不补录
    if(p.kind==='hydration'){wx.showToast({title:'饮水请在首页记录',icon:'none'});return;}
    // 通用 / 抗阻：日期补录
    wx.showModal({title:'补录 '+date+' 的打卡？',content:'同一项目当天最多计一次。',success:async r=>{
      if(!r.confirm)return;
      try{this.setData({busy:true});await api('/projects/'+this.id+'/checkins','POST',{date,confirmed:true});change();await this.load();this.celebrate();}
      catch(err){error(err);}finally{this.setData({busy:false});}
    }});
  },
  date(e){this.setData({date:e.detail.value});this.waterSummary();},
  waterSummary(){
    const p=this.data.project;if(p.kind!=='hydration')return;
    const totalMl=p.records.filter(e=>e.date===this.data.date).reduce((n,e)=>n+e.amountMl,0),targetMl=p.hydration.targetMl;
    this.setData({amountMl:this.data.entryMode==='total'?String(totalMl):'',water:{totalMl,targetMl,remainingMl:Math.max(0,targetMl-totalMl),percent:Math.min(100,Math.floor(totalMl/targetMl*100)),achieved:totalMl>=targetMl}});
  },
  waterMode(){const mode=this.data.entryMode==='add'?'total':'add';this.waterRequest=null;this.setData({entryMode:mode,amountMl:mode==='total'?String(this.data.water.totalMl):''});},
  amount(e){this.setData({amountMl:e.detail.value});this.waterRequest=null;},
  async waterSave(){
    if(this.data.busy)return;
    const entered=Number(this.data.amountMl);
    if(String(this.data.amountMl).trim()===''||!Number.isInteger(entered)||entered<(this.data.entryMode==='add'?1:0)||entered>20000){error(new Error('请填写有效饮水量（ml）'));return;}
    const amountMl=this.data.entryMode==='add'?(this.data.water?.totalMl||0)+entered:entered;
    if(amountMl>20000){error(new Error('当日总量超出输入范围，请核实'));return;}
    if(!this.waterRequest||this.waterRequest.amountMl!==amountMl||this.waterRequest.date!==this.data.date)this.waterRequest={requestId:Date.now()+'-'+Math.random().toString(36).slice(2),amountMl,date:this.data.date,confirmed:true,revision:this.data.project.waterVersions?.[this.data.date]||0};
    try{this.setData({busy:true});await api('/projects/'+this.id+'/water','PUT',this.waterRequest);this.waterRequest=null;change();await this.load();wx.showToast({title:'已保存'});}
    catch(e){error(e);}finally{this.setData({busy:false});}
  },
  record(){wx.navigateTo({url:'/pages/record/record?type='+this.data.project.sportType+'&projectId='+this.id});},
  async checkin(){
    if(this.data.project.kind==='resistance'){wx.navigateTo({url:'/pages/record/record?mode=strength&projectId='+this.id});return;}
    if(this.data.busy)return;
    wx.showModal({title:'确认完成「'+this.data.project.name+'」？',content:'日期：'+this.data.date+'。同一项目当天最多计一次。',success:async r=>{
      if(!r.confirm)return;
      try{this.setData({busy:true});await api('/projects/'+this.id+'/checkins','POST',{date:this.data.date,confirmed:true});change();await this.load();this.celebrate();}
      catch(e){error(e);}finally{this.setData({busy:false});}
    }});
  },
  celebrate(){try{wx.vibrateShort&&wx.vibrateShort({type:'medium'});}catch(err){}clearTimeout(this._celebrateTimer);this.setData({celebrate:true});this._celebrateTimer=setTimeout(()=>this.setData({celebrate:false}),1800);},
  waterQuick(e){if(this.data.busy)return;const step=String(e.currentTarget.dataset.step);this.setData({entryMode:'add',amountMl:step});this.waterSave();},
  detail(e){wx.navigateTo({url:'/pages/record/record?id='+e.currentTarget.dataset.id});},
  remove(e){
    const id=e.currentTarget.dataset.id;
    wx.showModal({title:'删除这次打卡？',content:'目标进度和成就将重新计算。',success:async r=>{
      if(!r.confirm)return;
      try{await api((this.data.project.kind==='hydration'?'/water/':'/checkins/')+id,'DELETE');change();await this.load();}
      catch(e){error(e);}
    }});
  }
});
