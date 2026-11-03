const {api,error,change}=require('../../utils/api');
const tip=require('../../utils/tip');
const {estimate}=require('../../utils/hydration');
const {COLORS,SHAPES,pickIcon,CATEGORY_COLORS,inkFor}=require('../../utils/palette');
const {weeklyCardio,weeklyResistance,gap,WATER_MIN_COEF,WATER_MAX_COEF,ACE_CARDIO,ACE_RESIST}=require('../../utils/guidelines');
// 每公斤饮水量三档建议值：35 / 37.5 / 40（只是起步建议，真正的每日目标在「目标设置」里独立定）
const COEFS=[35,37.5,40];
const COEF_LABELS=COEFS.map(c=>c+' ml/kg');

const GUIDES={
  cardio:{title:'心肺 · 每周基准',quote:ACE_CARDIO,bullets:['每周 150 分钟中等强度有氧（快走 / 慢跑 / 骑行）','心肺与抗阻训练每周各 2–3 次','强度参考：能说话但不能唱歌，即为中等强度']},
  resistance:{title:'抗阻 · 每周基准',quote:ACE_RESIST,bullets:['每周至少 3 次，隔天安排更易坚持','每次覆盖胸 / 背 / 腿 / 核心等大肌群','可先力量后有氧，同一天完成也行']},
  water:{title:'饮水 · 每天基准',quote:'每日饮水量 ≈ 体重(kg) × 35–40 ml',bullets:['每天喝够，而不是一次猛喝','运动、高温、哺乳期需在此基础上增加','观察尿液颜色：浅黄即达标']}
};

// 周期六种（用户 10-30 定稿）：每日/每周/每月/每年/连续/限期。
// 单位两种：次（打卡即计 1）和 分钟（打卡时填时长，按时长累加）——连续/限期只按次/天数，不按分钟。
const PERIODS=[{key:'daily',label:'每日'},{key:'weekly',label:'每周'},{key:'monthly',label:'每月'},{key:'yearly',label:'每年'},{key:'streak',label:'连续'},{key:'window',label:'限期'}];
const MAXC={daily:20,weekly:7,monthly:31,yearly:366,streak:365,window:732};
const MAXD={daily:1440,weekly:10080,monthly:44640,yearly:527040};
const DEFAULT={daily:1,weekly:3,monthly:12,yearly:52,streak:7,window:50};
const DEFAULT_MIN={daily:30,weekly:150,monthly:600,yearly:1200};
const PERIOD_HINT={
  daily:'每天完成 N 次就算今天达标',
  weekly:'每完成一次计 1 次，周从周一开始',
  monthly:'按自然月累计，每月 1 日重新开始',
  yearly:'按自然年累计，每年重新开始',
  streak:'连续 N 天算达标，中断后重新计数',
  window:null // 限期那句带月数，在 refresh 里拼
};
const PERIOD_HINT_MIN={
  daily:'每天累计 N 分钟（打卡时填时长）',
  weekly:'每周累计 N 分钟（按每次时长累加）',
  monthly:'每月累计 N 分钟，每月 1 日重新开始',
  yearly:'今年累计 N 分钟'
};
const PRESET_CATEGORY={hydration:'饮水',resistance:'抗阻训练',cardio:'心肺训练'};
// 各类项目的默认形状（形状不是语义，是给项目一个可辨认的记号；颜色才是分类的主表达）
const DEFAULT_SHAPE={hydration:'ring',resistance:'bars',sport:'tri',generic:'bar',learning:'diamond'};

// 标题跟着打开方式变（编辑 / 新建分组 / 新建项目）；用系统导航栏，别自己画一条
function navTitle(only,editing){ return editing?'项目设置':only?'新建分组':'新建项目'; }
function setTitle(only,editing){
  try{ if(wx.setNavigationBarTitle)wx.setNavigationBarTitle({title:navTitle(only,editing)}); }catch(e){}
}

Page({
  data:Object.assign({
    tip:'',
    only:false,busy:false,more:false,recordOnly:false,
    categories:[],catNames:[],catIndex:-1,catName:'',creatingCat:false,catInput:'',catSport:false,
    name:'',note:'',shapes:SHAPES,colors:COLORS,icon:SHAPES[0],color:COLORS[3],accentInk:'#ffffff',
    periods:PERIODS,period:'weekly',periodLabel:'每周',metric:'count',unitLabel:'次',target:3,months:2,goalHint:'每完成一次计 1 次，周从周一算起',
    hydration:false,weightKg:'',coefficients:COEF_LABELS,coefficientIndex:0,targetMl:0,hydrationHint:'填写体重后自动估算每日目标',
    preset:'',canSave:false,editing:false,saveStyle:''
  },tip.data),
  toggleTip(e){tip.toggle.call(this,e);},
  // 「算作运动」：勾上的分组会进运动热力图与教练看板的训练结构（2026-10-30 新通路）
  toggleCatSport(e){this.setData({catSport:e.detail.value===true});},

  // 仅记录：建项目时不设目标，只留下「今天记了没」。贴合「记录≠达标」的产品哲学。
  toggleRecordOnly(e){this.setData({recordOnly:e.detail.value===true});this.refresh();},

  // 底部保存键的描边/投影跟着项目色走；名字还是空的时候退成灰，别让人以为按了会有反应。
  // 字色不能用 inkFor：那是「彩底上的字」（多半是白），放到白底按钮上就看不见了
  saveStyleFor(on,color){
    const c=color||COLORS[3];
    const ink=inkFor(c);
    const text=ink==='#ffffff'?'#3f4d55':ink;
    return on
      ? `color:${text};border-color:${c}59;box-shadow:0 6rpx 20rpx ${c}1a;`
      : 'color:#b0b0b0;border-color:#e8e8e8;background:#ffffff;box-shadow:none;';
  },

  async onLoad(query){
    const q=query||{};
    this.setData({only:q.only==='1',preset:q.preset||''});
    setTitle(q.only==='1',!!q.edit);
    if(q.edit){
      this.editId=q.edit;
      try{
        const project=await api('/projects/'+q.edit);
        this.applyProject(project);
      }catch(e){error(e);}
      return;
    }
    await this.prepare(query);
  },

  applyProject(project){
    this.home=getApp().globalData.home||this.home;
    const kind=project.kind||'generic';
    const preset=kind==='hydration'?'hydration':kind==='resistance'?'resistance':'';
    const categories=(getApp().globalData.home?.habits?.categories)||[];
    const index=categories.findIndex(c=>c.id===project.categoryId);
    const cat=categories[index]||null;
    const coefficientIndex=COEFS.indexOf(project.hydration?.coefficient);
    this.kind=kind;
    this.setData({
      editing:true,
      categories,
      catNames:categories.map(c=>c.name),
      catIndex:index,
      catName:cat?cat.name:'',
      name:project.name,
      note:project.note||'',
      icon:pickIcon(project.icon||DEFAULT_SHAPE[kind]||SHAPES[0]),
      color:project.color||CATEGORY_COLORS[cat?.name]||COLORS[3],
      // 只记录的项目没有目标：开着编辑页时也该能正常打开，别读 null
      period:project.goal?project.goal.period:'weekly',
      metric:project.metric||'count',
      target:project.goal?project.goal.target:'',
      months:(project.goal&&project.goal.months)||2,
      hydration:kind==='hydration',
      weightKg:project.hydration?String(project.hydration.weightKg):'',
      coefficientIndex:coefficientIndex>=0?coefficientIndex:this.defaultCoefIndex(),
      canSave:true,
      saveStyle:this.saveStyleFor(true,project.color||CATEGORY_COLORS[cat?.name]||COLORS[3])
    });
    if(kind==='hydration')this.calculateHydration();
    else this.refresh();
  },

  async prepare(query){
    const q=query||{};
    this.setData({only:q.only==='1',preset:q.preset||''});
    setTitle(q.only==='1',!!q.edit);
    let categories=(getApp().globalData.home?.habits?.categories)||[];
    if(!categories.length){
      try{const home=await api('/home');this.home=home;categories=(home.habits||{}).categories||[];}catch(e){}
    }else{this.home=getApp().globalData.home;}
    const list=Array.isArray(categories)?categories:[];
    const presetName=q.preset?PRESET_CATEGORY[q.preset]:'';
    const wanted=q.categoryId||(presetName?list.find(c=>c.name===presetName)?.id:'');
    const index=list.findIndex(c=>c.id===wanted);
    const cat=list[index]||null;
    const patch={
      categories:list,
      catNames:list.map(c=>c.name),
      catIndex:index,
      catName:cat?cat.name:(presetName||''),
      creatingCat:!list.length&&!presetName,
      color:CATEGORY_COLORS[presetName||cat?.name]||COLORS[3]
    };
    if(q.preset==='hydration'){
      patch.hydration=true;
      patch.name='饮水';
      patch.icon=DEFAULT_SHAPE.hydration;
      patch.coefficientIndex=this.defaultCoefIndex();
    }else if(q.preset==='resistance'){
      patch.name='抗阻训练';
      patch.icon=DEFAULT_SHAPE.resistance;
    }
    this.setData(patch);
    this.refresh();
    this.buildGuide();
  },

  // 饮水默认从 35ml/kg 的建议量起步
  defaultCoefIndex(){ return 0; },

  refresh(){
    const d=this.data;
    const byMin=d.metric==='duration';
    const max=(byMin?MAXD:MAXC)[d.period]||7;
    const target=Math.min(Math.max(Number(d.target)||1,1),max);
    const hints=byMin?PERIOD_HINT_MIN:PERIOD_HINT;
    this.setData({
      target,
      periodLabel:(PERIODS.find(p=>p.key===d.period)||PERIODS[0]).label,
      unitLabel:byMin?'分钟':(d.period==='streak'?'天':'次'),
      goalHint:(d.period==='window'?`在 ${d.months} 个月内累计完成 ${target} 次`:(hints[d.period]||hints.weekly)),
      canSave:!!String(d.name||'').trim(),
      saveStyle:this.saveStyleFor(!!String(d.name||'').trim(),d.color),
      accentInk:inkFor(d.color)
    });
    this.buildGuide();
  },

  buildGuide(){
    const d=this.data;
    const cat=d.catName||'';
    let kind=null;
    if(d.hydration||cat==='饮水')kind='water';
    else if(cat==='抗阻训练'||d.preset==='resistance')kind='resistance';
    else if(cat==='心肺训练'||d.preset==='cardio')kind='cardio';
    if(!kind){this.setData({guide:null});return;}
    const g=GUIDES[kind];
    const guide={kind,title:g.title,quote:g.quote,bullets:g.bullets};
    if(kind==='cardio'&&this.home){const c=weeklyCardio(this.home);guide.progress={current:c.current,target:c.target,remain:gap(c),percent:Math.min(100,Math.round(c.current/c.target*100))};}
    if(kind==='resistance'&&this.home){const r=weeklyResistance(this.home);guide.progress={current:r.current,target:r.target,remain:gap(r),percent:Math.min(100,Math.round(r.current/r.target*100))};}
    if(kind==='water'){const w=Number(d.weightKg);guide.example=w>0?`按 ${w}kg 估算：约 ${Math.round(w*WATER_MIN_COEF)}–${Math.round(w*WATER_MAX_COEF)} ml/天`:'填写体重后自动估算每日目标';}
    this.setData({guide});
  },

  input(e){
    const key=e.currentTarget.dataset.key;
    if(!key)return;
    this.setData({[key]:e.detail.value});
    if(key==='weightKg')this.calculateHydration();
    else this.refresh();
  },

  cancel(){ wx.navigateBack(); },

  pickIcon(e){ const icon=e.currentTarget.dataset.icon; if(icon)this.setData({icon}); },

  pickColor(e){ const color=e.currentTarget.dataset.color; this.setData({color,accentInk:inkFor(color),saveStyle:this.saveStyleFor(!!String(this.data.name||'').trim(),color)}); },

  pickCategory(e){
    const index=+e.detail.value;
    const cat=this.data.categories[index];
    const color=cat?CATEGORY_COLORS[cat.name]||this.data.color:this.data.color;
    this.setData({
      catIndex:index,
      catName:cat?cat.name:'',
      color,
      accentInk:inkFor(color),
      saveStyle:this.saveStyleFor(!!String(this.data.name||'').trim(),color)
    });
    this.buildGuide();
  },

  newCat(){ this.setData({creatingCat:true,catInput:'',catName:''}); },

  cancelCat(){ this.setData({creatingCat:false,catInput:''}); },

  toggleMore(){ this.setData({more:!this.data.more}); },

  pickPeriod(e){
    const key=e.currentTarget.dataset.key;
    const byMin=this.data.metric==='duration';
    const fallback=byMin?(DEFAULT_MIN[key]||30):(DEFAULT[key]||3);
    this.setData({period:key,target:fallback});
    this.refresh();
  },

  // 单位切换（次 / 分钟）：换默认值，连续/限期不支持分钟，点了就退回「次」
  pickUnit(e){
    const m=e.currentTarget.dataset.unit==='duration'?'duration':'count';
    const d=this.data;
    const metric=(m==='duration'&&(d.period==='streak'||d.period==='window'))?'count':m;
    const byMin=metric==='duration';
    const target=byMin?(DEFAULT_MIN[d.period]||30):(DEFAULT[d.period]||3);
    this.setData({metric,target});
    this.refresh();
  },

  stepTarget(e){
    const step=Number(e.currentTarget.dataset.step)||0;
    const max=((this.data.metric==='duration'?MAXD:MAXC)[this.data.period])||7;
    this.setData({target:Math.min(max,Math.max(1,(Number(this.data.target)||1)+step))});
    this.refresh();
  },

  stepMonths(e){
    const step=Number(e.currentTarget.dataset.step)||0;
    this.setData({months:Math.min(24,Math.max(1,(Number(this.data.months)||1)+step))});
    this.refresh();
  },

  pickCoefficient(e){
    this.setData({coefficientIndex:+e.detail.value});
    this.calculateHydration();
  },

  calculateHydration(){
    const weight=Number(this.data.weightKg);
    const value=weight>0?estimate(weight,COEFS[this.data.coefficientIndex]):{minMl:0,maxMl:0,targetMl:0};
    this.setData({
      targetMl:value.targetMl,
      hydrationHint:value.targetMl?`每日目标约 ${value.targetMl} ml，喝够即计 1 次`:'填写体重后自动估算每日目标'
    });
    this.buildGuide();
  },

  async save(){
    if(this.data.busy)return;
    const d=this.data;
    const title=String(d.name||'').trim();
    if(!title)return wx.showToast({title:d.only?'请输入分组名称':'请输入项目名称',icon:'none'});
    if(d.hydration){
      const weight=Number(d.weightKg);
      if(!(weight>=20&&weight<=300))return wx.showToast({title:'请填写有效体重（20–300kg）',icon:'none'});
    }
    if(!d.only&&d.period==='window'&&!(d.months>=1&&d.months<=24))return wx.showToast({title:'期限须为 1–24 个月',icon:'none'});

    this.setData({busy:true});
    try{
      if(this.editId){
        const body={name:title,note:String(d.note||'').trim()||null,color:d.color,icon:d.icon,
          goal:d.hydration?null:{period:d.period,target:Number(d.target),months:d.period==='window'?Number(d.months):undefined},
          metric:d.hydration?null:d.metric};
        if(d.hydration)body.hydration={weightKg:Number(d.weightKg),coefficient:COEFS[d.coefficientIndex]};
        await api('/projects/'+this.editId,'PUT',body);
      }else if(d.only){
        await api('/categories','POST',{name:title,sport:d.catSport});
      }else{
        let categoryId=d.categories[d.catIndex]?.id;
        if(d.creatingCat||!categoryId){
          const catTitle=String(d.catInput||d.catName||'').trim();
          if(!catTitle)throw new Error('请选择或新建分组');
          const created=await api('/categories','POST',{name:catTitle,sport:d.catSport});
          categoryId=created.id;
        }
        const body={
          categoryId,
          name:title,
          note:String(d.note||'').trim()||null,
          color:d.color,
          icon:d.icon,
          kind:d.hydration?'hydration':d.preset==='resistance'?'resistance':'generic',
          goal:(d.hydration||d.recordOnly)?null:{period:d.period,target:Number(d.target),months:d.period==='window'?Number(d.months):undefined},
          metric:d.hydration?null:d.metric
        };
        if(d.hydration)body.hydration={weightKg:Number(d.weightKg),coefficient:COEFS[d.coefficientIndex]};
        await api('/projects','POST',body);
      }
      change();
      const pages=typeof getCurrentPages==='function'?getCurrentPages():[];
      if(pages.length>1)wx.navigateBack();
      else wx.reLaunch({url:'/pages/home/home'});
    }catch(e){
      error(e);
    }finally{
      this.setData({busy:false});
    }
  }
});
