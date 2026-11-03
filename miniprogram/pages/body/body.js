const {api,error,change}=require('../../utils/api');
const {RANGES,buildSeries,defaultRange}=require('../../utils/bodyseries');
const tip=require('../../utils/tip');
const {TOKENS}=require('../../utils/tokens');

const WEIGHT_COLOR=TOKENS.body;
const WAIST_COLOR=TOKENS.strength;

Page({
  data:Object.assign({
    tip:'',
    loaded:false,busy:false,
    today:'',date:'',weightKg:'',waistCm:'',
    latest:null,week:null,entries:[],trail:[],
    years:[],                 // 年 → 月 → 周 三级折叠列表
    openYear:'',openMonth:'', // 列表当前展开的层级（只影响列表，不影响曲线）
    ranges:RANGES,range:'1y', // 曲线时间窗口
    points:[],scope:'',empty:true
  },tip.data),
  toggleTip(e){tip.toggle.call(this,e);},

  onShow(){this.load().catch(e=>error(e));},

  async load(){
    const data=await api('/body-metrics/calendar');
    const years=data.years||[];
    const today=data.today||'';
    const curYear=today.slice(0,4),curMonth=today.slice(0,7);
    let {openYear,openMonth}=this.data;

    // 首次进入定位到本周：展开当前年 + 当前月
    if(!this._inited){
      openYear=years.some(y=>y.year===curYear)?curYear:(years[0]?years[0].year:'');
      openMonth=this.findMonth(years,curMonth)?curMonth:'';
      this._inited=true;
    }
    if(openYear&&!years.some(y=>y.year===openYear)){openYear=years[0]?years[0].year:'';openMonth='';}
    if(openMonth&&!this.findMonth(years,openMonth))openMonth='';
    // 首次进入按已有数据的跨度挑一个默认窗口（只有一个月数据就落在近 1 月）
    let range=this.data.range;
    if(!this._rangeInited){range=defaultRange(years,today);this._rangeInited=true;}

    this.setData({
      loaded:true,today,range,
      date:this.data.date||today,
      latest:data.latest,week:data.week,entries:data.entries,trail:data.trail,
      years,openYear,openMonth
    },()=>this.buildChart());
  },

  findMonth(years,month){
    if(!month)return null;
    for(const y of years){const m=(y.months||[]).find(v=>v.month===month);if(m)return m;}
    return null;
  },

  // 曲线只看选定的时间窗口：近 1 月按周、1/3 年按月、5 年按季度
  buildChart(){
    const {years,today,range}=this.data;
    if(!today)return;
    const series=buildSeries(years,today,range);
    this.setData({points:series.points,scope:series.scope,empty:series.empty},()=>this.drawChart());
  },

  pickRange(e){
    const range=e.currentTarget.dataset.range;
    if(range===this.data.range)return;
    this.setData({range},()=>this.buildChart());
  },

  toggleYear(e){
    const year=e.currentTarget.dataset.year;
    if(this.data.openYear===year){this.setData({openYear:'',openMonth:''});}
    else{this.setData({openYear:year,openMonth:''});}
  },

  toggleMonth(e){
    const month=e.currentTarget.dataset.month;
    if(this.data.openMonth===month){this.setData({openMonth:''});}
    else{this.setData({openMonth:month});}
  },

  input(e){this.setData({[e.currentTarget.dataset.key]:e.detail.value});},

  pickDate(e){this.setData({date:e.detail.value});},

  async save(){
    if(this.data.busy)return;
    const weight=String(this.data.weightKg).trim(),waist=String(this.data.waistCm).trim();
    if(!weight&&!waist)return wx.showToast({title:'体重和腰围至少填一项',icon:'none'});
    this.setData({busy:true});
    try{
      await api('/body-metrics','PUT',{date:this.data.date,weightKg:weight||undefined,waistCm:waist||undefined});
      change();
      wx.showToast({title:'已保存',icon:'success'});
      this.setData({weightKg:'',waistCm:''});
      await this.load();
    }catch(e){error(e);}finally{this.setData({busy:false});}
  },

  // 体重（绿，左轴）与腰围（蓝，右轴）两条线；没数据的点断开不连
  drawChart(){
    const query=wx.createSelectorQuery();
    query.select('#chart').fields({node:true,size:true}).exec(res=>{
      if(!res||!res[0]||!res[0].node)return;
      const {node,width,height}=res[0];
      const info=wx.getWindowInfo?wx.getWindowInfo():wx.getSystemInfoSync();
      const dpr=info.pixelRatio||2;
      node.width=width*dpr;node.height=height*dpr;
      const ctx=node.getContext('2d');
      ctx.scale(dpr,dpr);
      ctx.clearRect(0,0,width,height);

      const points=this.data.points||[];
      const weights=points.map(p=>p.weightKg);
      const waists=points.map(p=>p.waistCm);
      const hasW=weights.some(v=>v!=null),hasA=waists.some(v=>v!=null);
      if(!points.length||(!hasW&&!hasA)){
        ctx.fillStyle='#a3a3a3';ctx.font='12px sans-serif';ctx.textAlign='center';
        ctx.fillText(this.data.empty?'这个区间还没有测量记录':'换个区间或先记录一次',width/2,height/2);
        return;
      }

      const left=34,right=34,top=16,bottom=22;
      const plotW=width-left-right,plotH=height-top-bottom;
      const x=i=>points.length>1?left+i/(points.length-1)*plotW:left+plotW/2;
      const range=vals=>{
        let mn=Math.min(...vals),mx=Math.max(...vals);
        if(mx-mn<0.6){mn-=0.3;mx+=0.3;}
        const pad=(mx-mn)*0.22;
        return [mn-pad,mx+pad];
      };
      const [wMin,wMax]=hasW?range(weights.filter(v=>v!=null)):[0,1];
      const [aMin,aMax]=hasA?range(waists.filter(v=>v!=null)):[0,1];
      const yW=v=>top+(1-(v-wMin)/(wMax-wMin))*plotH;
      const yA=v=>top+(1-(v-aMin)/(aMax-aMin))*plotH;

      // 上下两条参考网格
      ctx.strokeStyle='#f0f0f1';ctx.lineWidth=1;
      [top,top+plotH].forEach(y=>{ctx.beginPath();ctx.moveTo(left,y);ctx.lineTo(width-right,y);ctx.stroke();});

      // 断点分段绘制：有数据的点连成线，遇到没数据的区间断开
      const strokeSeries=(vals,color,yFn)=>{
        let seg=[];
        const flush=()=>{
          if(seg.length>1){
            ctx.beginPath();ctx.strokeStyle=color;ctx.lineWidth=2;ctx.lineJoin='round';ctx.lineCap='round';
            seg.forEach((p,k)=>k?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y));
            ctx.stroke();
          }
          seg.forEach(p=>{
            ctx.beginPath();ctx.fillStyle='#fff';ctx.arc(p.x,p.y,3.2,0,Math.PI*2);ctx.fill();
            ctx.strokeStyle=color;ctx.lineWidth=1.8;ctx.stroke();
          });
          seg=[];
        };
        vals.forEach((v,i)=>{if(v==null)flush();else seg.push({x:x(i),y:yFn(v)});});
        flush();
      };
      if(hasW)strokeSeries(weights,WEIGHT_COLOR,yW);
      if(hasA)strokeSeries(waists,WAIST_COLOR,yA);

      // 左右刻度：左体重、右腰围
      ctx.font='9px sans-serif';
      if(hasW){
        ctx.fillStyle=TOKENS.body;ctx.textAlign='left';
        ctx.fillText(wMax.toFixed(1),2,top+4);
        ctx.fillText(wMin.toFixed(1),2,top+plotH+3);
      }
      if(hasA){
        ctx.fillStyle=TOKENS.strength;ctx.textAlign='right';
        ctx.fillText(aMax.toFixed(1),width-2,top+4);
        ctx.fillText(aMin.toFixed(1),width-2,top+plotH+3);
      }

      // 横轴标签：点少就全标，点多则抽样
      ctx.fillStyle='#b0b0b0';ctx.font='10px sans-serif';ctx.textAlign='center';
      const step=points.length<=5?1:Math.ceil(points.length/4);
      points.forEach((p,i)=>{
        if(i%step)return;
        const label=String(p.label);
        ctx.fillText(label,Math.min(Math.max(x(i),16),width-16),height-6);
      });
    });
  },

  async remove(e){
    const date=e.currentTarget.dataset.date;
    wx.showModal({title:'删除 '+date+' 的测量？',content:'删除后周均值和趋势会重新计算。',success:async r=>{
      if(!r.confirm)return;
      try{await api('/body-metrics/'+date,'DELETE',{});change();await this.load();}
      catch(err){error(err);}
    }});
  }
});
