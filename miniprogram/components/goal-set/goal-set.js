const {api,error,change}=require('../../utils/api');
const {TOKENS}=require('../../utils/tokens');
const {estimate}=require('../../utils/hydration');

// 「想记哪些」的卡片：新手引导最后一步和目标设置页共用这一份，
// 所以两处的配色、文案、档位永远一样（之前各写一套，改了一边忘一边）。
// 颜色取 utils/tokens.js，跟打卡页的圆环是同一套。

const COEFS=[35,37.5,40];

const META=[
  {key:'cardio',label:'心肺',accent:TOKENS.cardio,periodLabel:'每周',unit:'等效分钟',presets:[60,90,150],
   hint:'跑步、骑行、游泳都往这里累计；散步这类低强度不计训练量',
   whyLines:[
     {t:'lead',s:'参考世界卫生组织建议：'},
     {t:'bul',s:'每周 150–300 分钟中等强度有氧'},
     {t:'bul',s:'或 75–150 分钟高强度'},
     {t:'line',s:'60 / 90 分钟只是起步数，先把习惯立起来，之后往上加。'}
   ]},
  {key:'strength',label:'抗阻',accent:TOKENS.strength,periodLabel:'每周',unit:'天',presets:[2,3,4],
   hint:'同一天练几次都算 1 天，隔天练更好',
   whyLines:[
     {t:'lead',s:'抗阻练的是肌肉和关节，跟心肺是两回事。'},
     {t:'line',s:'每周 2 天是 ACE/ACSM 的最低建议，所以 2 天起步、3 天算练得勤。'},
     {t:'line',s:'想练更多往上加就行，不封顶。'}
   ]},
  {key:'water',label:'饮水',accent:TOKENS.water,periodLabel:'今日',unit:'ml',byWeight:true,
   hint:'按体重算：一公斤体重 35–40 ml',
   whyLines:[
     {t:'lead',s:'35 / 37.5 / 40 ml/kg 是常见建议区间。'},
     {t:'line',s:'天热、运动多往上取；天冷往下取，都行。'}
   ]},
  {key:'english',label:'英语',accent:TOKENS.english,periodLabel:'今日',unit:'词',presets:[1,3,5],
   hint:'学完自动记录；这个数也是学习页每天发的新词数',
   whyLines:[
     {t:'lead',s:'1 个就算今天学过，5 个是舒服的节奏。'},
     {t:'line',s:'没有封顶：学完当天的数，还能接着再学几个。'}
   ]}
];

const WEEKLY={cardio:true,strength:true};
// 各项下限：抗阻每周至少 2 天（ACE/ACSM 最低建议），档位和自定义输入都绕不过去
const MIN_TARGET={strength:2};
// 强制设目标（建账号那一步）的默认值：先给一个合理的周目标，环才闭得上。
// 不填也不会被「先不记」带走；用户可以直接改，或保留默认。
const DEFAULTS={cardio:90,strength:2,english:1};

function monthParam(){
  const d=new Date();
  return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0');
}

Component({
  options:{styleIsolation:'apply-shared'},

  properties:{
    // 引导流程：还没保存过任何目标，所以给一个「先不记」
    skippable:{type:Boolean,value:false},
    // 目标设置页：每张卡有自己的「保存这项」
    showSave:{type:Boolean,value:false},
    // 目标设置页：显示「当前：x / y」
    showNow:{type:Boolean,value:false},
    // 建账号那一步：强制设目标。隐藏「先不记」，并把每周两项预填一个默认值，环一定闭得上
    required:{type:Boolean,value:false}
  },

  data:{
    items:[],tip:'',coefs:COEFS,busyKey:'',loaded:false,
    water:{weightKg:'',coef:37.5,echo:'',ready:false}
  },

  lifetimes:{attached(){const app=getApp();if(app&&app.globalData&&app.globalData.token)this.load();}},

  methods:{
    async load(){
      try{
        const g=await api('/goals');
        this.rows=(g.all||[]).slice();
        // 饮水要知道「上次记的体重」，从首页那份数据里读，拿不到就让用户自己填
        let weight='';
        try{
          const home=getApp().globalData.home||await api('/home?month='+monthParam());
          getApp().globalData.home=home;
          const w=home.bodyLatest&&home.bodyLatest.weightKg;
          if(w!=null)weight=String(w);
        }catch(e){}
        const items=META.map(m=>{
          const row=(g.all||[]).find(x=>x.key===m.key)||{};
          const target=Number(row.target)||0;
          const weekly=!!WEEKLY[m.key];
          let picked=-2;
          if(m.byWeight)picked=-2;
          else if(target>0&&m.presets.indexOf(target)>=0)picked=target;
          else if(target>0)picked='custom';
          else if(row.recordOnly)picked='record';
          // 强制设目标：没存过就给一个合理的默认，避免「先不记」把环关上
          else if(this.data.required)picked=(DEFAULTS[m.key]!=null?DEFAULTS[m.key]:-2);
          else picked=this.data.skippable?'skip':-2;
          return Object.assign({},m,{
            weekly,allowRecordOnly:true,allowSkip:!!this.data.skippable&&!this.data.required,
            picked,draft:target>0?String(target):'',
            current:row.current!=null?row.current:'',target,recordOnly:!!row.recordOnly,
            echo:'' ,message:''
          });
        });
        this.setData({items,loaded:true});
        this.setData({water:this.waterFrom(weight,this.data.water.coef,items)});
        this.refreshEchoes();
      }catch(e){error(e);}
    },

    waterFrom(weight,coef,items){
      const list=items||this.data.items;
      const waterItem=list.find(i=>i.key==='water');
      const row=waterItem||{};
      const n=Number(weight);
      if(!weight||!Number.isFinite(n)||n<20||n>300){
        return {weightKg:weight||'',coef,ready:false,echo:'填上体重，才知道每天该喝多少',target:row.target||0};
      }
      const est=estimate(n,coef);
      return {weightKg:String(weight),coef,ready:true,target:est.targetMl,
        echo:n+' kg × '+coef+' ml/kg ≈ '+est.targetMl+' ml 一天'};
    },

    // 选中的数值下面立刻用一句话说清「这意味着什么」，光看 60 不知道是什么的 60
    echoOf(item,water){
      if(item.byWeight)return (water||this.data.water).echo;
      const p=item.picked;
      if(p==='skip')return '先不记这项，以后在「我的 → 目标设置」里补';
      if(p==='record')return '只记录，不算达标';
      if(p==='custom')return '自定义：'+((item.draft||'?')+' '+item.unit);
      if(typeof p!=='number')return '';
      if(item.key==='cardio')return '每周完成 '+p+' 分钟的中等强度心肺训练';
      if(item.key==='strength')return '每周练 '+p+' 天抗阻（同一天练几次算 1 天）';
      if(item.key==='english')return '每天学 '+p+' 个词，学完自动记上';
      return p+' '+item.unit;
    },

    refreshEchoes(){
      const water=this.data.water;
      const items=this.data.items.map(it=>Object.assign({},it,{echo:this.echoOf(it,water)}));
      this.setData({items});
    },

    openTip(e){
      const key=e.currentTarget.dataset.key;
      this.setData({tip:this.data.tip===key?'':key});
    },

    pick(e){
      const key=e.currentTarget.dataset.key;
      const raw=e.currentTarget.dataset.value;
      const picked=(raw==='skip'||raw==='record'||raw==='custom')?raw:Number(raw);
      const items=this.data.items.map(it=>it.key===key?Object.assign({},it,{picked,message:''}):it);
      this.setData({items});
      this.refreshEchoes();
    },

    inputDraft(e){
      const key=e.currentTarget.dataset.key;
      const items=this.data.items.map(it=>it.key===key?Object.assign({},it,{draft:e.detail.value,picked:'custom'}):it);
      this.setData({items});
      this.refreshEchoes();
    },

    inputWeight(e){
      this.waterTouched=true;
      this.setData({water:this.waterFrom(e.detail.value,this.data.water.coef)});
      this.refreshEchoes();
    },

    pickCoef(e){
      this.waterTouched=true;
      const coef=Number(e.currentTarget.dataset.coef);
      this.setData({water:this.waterFrom(this.data.water.weightKg,coef)});
      this.refreshEchoes();
    },

    // 饮水：体重 × 每公斤毫升数。服务端按同一套系数算目标，
    // 以后在体测里更新体重，这个目标会跟着变（followWeight）。
    async saveWater(){
      const w=this.data.water;
      const n=Number(w.weightKg);
      if(!Number.isFinite(n)||n<20||n>300)throw new Error('请先填 20–300kg 的体重');
      await api('/goals','PATCH',{key:'water',followWeight:true,weightKg:n,coefficient:w.coef});
    },

    async saveOne(key){
      const item=this.data.items.find(it=>it.key===key);
      if(!item)return null;
      if(item.picked==='record')return api('/goals','PATCH',{key,recordOnly:true});
      if(item.byWeight){
        await this.saveWater();
        return {key,text:'每日饮水目标跟体重走'};
      }
      if(item.picked==='skip')throw new Error('这项先不记，不用保存');
      if(item.picked==='record')return api('/goals','PATCH',{key,recordOnly:true});
      if(item.picked==='custom'){
        const n=Number(item.draft);
        if(!Number.isInteger(n)||n<=0)throw new Error('请填一个正整数');
        const min=MIN_TARGET[key]||1;
        if(n<min)throw new Error(item.label+'每周至少 '+min+' '+item.unit+'，想轻松可以先选「仅记录」');
        return api('/goals','PATCH',{key,target:n});
      }
      if(typeof item.picked!=='number'||item.picked<=0)throw new Error('先选一个数值');
      return api('/goals','PATCH',{key,target:item.picked});
    },

    // 目标设置页：一张卡一个「保存这项」
    async save(e){
      const key=e.currentTarget.dataset.key;
      if(this.data.busyKey)return;
      try{
        this.setData({busyKey:key});
        const res=await this.saveOne(key);
        change();
        const text=(res&&res.appliesText)||'已保存';
        await this.load();
        this.setData({items:this.data.items.map(it=>it.key===key?Object.assign({},it,{message:text}):it)});
      }catch(err){error(err);}
      finally{this.setData({busyKey:''});}
    },

    // 引导流程：把选了的都写进去，没选的不写（不替用户编目标）
    async submitAll(){
      const items=this.data.items;
      let saved=0;const failed=[];
      const completed=this._submittedGoals||(this._submittedGoals={});
      for(const it of items){
        const signature=JSON.stringify({picked:it.picked,draft:it.draft,water:it.byWeight?this.data.water:null});
        if(completed[it.key]===signature)continue;
        if(it.byWeight&&it.picked!=='record'){
          // 引导里没动饮水就别替他改：没碰过体重/系数、或没填体重，都保持原样
          if(!this.waterTouched)continue;
          try{ await this.saveWater(); completed[it.key]=signature; saved++; }catch(err){ failed.push(it.label+'：'+err.message); }
          continue;
        }
        if(it.picked==='skip')continue;
        if(it.picked!=='record'&&it.picked!=='custom'&&(typeof it.picked!=='number'||it.picked<=0))continue;
        try{ await this.saveOne(it.key); completed[it.key]=signature; saved++; }catch(err){ failed.push(it.label+'：'+err.message); }
      }
      if(saved)change();
      if(failed.length)throw new Error('以下目标未保存，请重试或点击跳过：\n'+failed.join('\n'));
      return {saved};
    }
  }
});
