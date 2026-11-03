const {api,login,error,change}=require('../../utils/api');
const {RING_PALETTE,weekColor}=require('../../utils/tokens');
const {pack,RING_MAX}=require('../../utils/rings');

// 圆环编辑器：首页内浮层（不是独立页面）。
//   遮罩是半透明的，底下就是真实首页，看起来才是「浮在首页上的窗」；
//   进出用淡入 + 缩放，不走 navigateTo 的侧滑转场。
//   顶部实时预览 = 当前这一组圆环的真实样子（隐藏的项占位但不画）；
//   DAILY / WEEKLY 两个编辑区；每行有「编辑」入口（用户 10-29）：
//     每日项 → 周规则面板：放进周圈、一周至少 N 天。规则定死后不能改，删除后才能重设；
//     周项   → 跳目标设置页改数值。
//   颜色是用户级覆盖，存在 profile 的 ringColors 里；没改过的项回退默认品牌色。
Component({
  options:{styleIsolation:'apply-shared'},
  properties:{
    // 打开时就进对应视图：首页点的是日环就直接 DAILY，点的是周环就直接 WEEKLY，
    // 不再放一组切换按钮（用户 10-29：浮窗里别再让选一遍日/周）
    view:{type:String,value:'day',observer(v){
      if(v&&v!==this.data.view){this.setData({view:v});if(this._v)this.setData(this.buildPreview(v,this._v));}
    }},
    // 编辑器常驻首页（不是 wx:if 销毁重建）：关掉再开还停在原来的视图，
    // 不会每次都弹回日视图（用户 10-29）。每次打开都重新拉数据，预览跟上最新状态。
    // view 写在前面：同一次 setData 里先切视图再开浮层，刷新用的就是新视图
    show:{type:Boolean,observer(v){
      if(v){this.refresh();}
      else{this.setData({editKey:'',picker:null});}
    }}
  },
  data:{loaded:false,view:'day',dayItems:[],weekItems:[],ringColors:{},preview:[],previewCenter:'',picker:null,editKey:'',palette:RING_PALETTE},
  methods:{
    // 打开浮层 / 从目标设置页回来时刷新数据。视图（day/week）保留不动。
    refresh(){
      // 30 秒内的数据直接用：显隐/颜色改动本地已乐观更新，不需要每次打开都
      // 等一趟 /goals（真机上那一趟 1.5s+，就是「点圆环跳出慢」的主体）
      if(this._v&&Date.now()-(this._vt||0)<30000)return;
      // 冷启动第一次打开：先用首页已经拉到的那组环占位，浮层一出现环就在，
      // 不用先空一下再等 /goals 回来（真机上这一下看得很明显）
      if(!this._v){
        const h=getApp().globalData&&getApp().globalData.home;
        if(h&&h.goals)this.setData(this.buildPreview(this.data.view,h.goals));
      }
      this.load();
    },
    async load(){
      // 连点两下「隐藏/显示」时会有两次 load 在飞：先发的那份可能后回来，
      // 把刚改好的状态盖回旧的（看起来就是「又跳回去了」）。只认最后一次。
      const seq=(this._seq=(this._seq||0)+1);
      try{
        if(!getApp().globalData.token)await login();
        const g=await api('/goals');
        if(seq!==this._seq)return;
        this._vt=Date.now();
        const v=g; // /goals 的 view 字段就是首页那两组圆环（已含周规则项、隐藏项占位）
        const all=(g.all||[]).map(it=>({
          key:it.key,label:it.label,period:it.period,periodLabel:it.periodLabel,
          hidden:!!it.hidden,recordOnly:!!it.recordOnly,weekRule:it.weekRule||null,
          isMove:it.key==='move',
          defaultColor:it.color,
          color:(g.ringColors&&g.ringColors[it.key])||it.color,
          note:it.valueText||it.remainText||''
        }));
        const move=(v.day||[]).find(i=>i.key==='move');
        const moveItem=move?{key:'move',label:'运动',period:'daily',periodLabel:'今日',hidden:false,recordOnly:true,isMove:true,weekRule:null,
          defaultColor:move.color,color:(g.ringColors&&g.ringColors.move)||move.color,note:move.valueText||''}:null;
        const dayItems=[].concat(moveItem?[moveItem]:[],all.filter(o=>o.period==='daily'));
        // WEEKLY 区 = 周项目本身 + 每日项目的「周化身」（显隐和日视图解绑，用户 10-29：
        // 这里只管周化身自己的 weekHidden，不读每日那条的 hidden）
        const weekItems=[].concat(
          all.filter(o=>o.period==='weekly'),
          dayItems.filter(o=>!o.isMove).map(o=>({
            key:o.key,label:o.label,period:'daily',periodLabel:'每周',weekAvatar:true,hidden:!!o.weekHidden,
            recordOnly:o.recordOnly,weekRule:o.weekRule,
            defaultColor:o.defaultColor,color:weekColor(o.color),
            note:o.weekRule?('一周 '+o.weekRule+' 天'):'未设周规则'
          }))
        );
        this._v=v;
        // 列表最多三行（用户 10-29：取舍）：主列表 = 会占环的前三个可见项；
        // 超出的可见项（overflow）和隐藏的一起收到底部灰区，超出的标「不占环」
        this.markOverflow(dayItems);this.markOverflow(weekItems);
        // 预览跟着当前视图走：在周视图里编辑，刷新后预览还是周环（原来写死 'day'，
        // 周视图里显示/隐藏一项，预览却跳回日环——用户 10-29 指出）
        this.setData(Object.assign({loaded:true,dayItems,weekItems,ringColors:g.ringColors||{}},this.buildPreview(this.data.view,v)));
      }catch(e){error(e);}
    },
    // 预览 = 当前这一组的可见环。口径唯一：直接用 utils/rings 的 pack（和首页同一份），
    // 仅记录项记过就点亮（soft）、中心永久留白——预览就是用户回家看到的那个环。
    buildPreview(view,v){
      const items=(v&&v[view])||[];
      const p=pack(items,view==='day'?'daily':'weekly','');
      return {preview:p.values,previewCenter:''};
    },

    // 本地重排「占环/不占环」：显隐一变，主列表三行和底部灰区立刻按新状态分组，
    // 不等网络回来（load() 之后会再对一遍账，结果一致）
    markOverflow(list){
      let n=0;
      list.forEach(o=>{
        if(o.hidden){o.overflow=false;return;}
        o.overflow=n>=RING_MAX;n++;
      });
      return list;
    },

    // 乐观更新预览：_v 是 /goals 的原始视图（和首页同一份），直接改本地那份的 hidden/color
    // 再用 pack 重算——不等 PATCH 落地再整份 GET 回来，真机上那一来一回就是「延迟」。
    // 服务器回来后 load() 会全量覆盖，这里只求指头按下去的那一瞬环就动。
    patchLocal(key,props){
      if(!this._v)return;
      const list=this._v[this.data.view];
      const it=list&&list.find(o=>o.key===key);
      if(!it)return;
      Object.assign(it,props);
      this.setData(this.buildPreview(this.data.view,this._v));
    },

    // 视图由首页传进来（view 属性），浮窗内部不再放日/周切换按钮

    openPicker(e){
      const key=e.currentTarget.dataset.key;
      this.setData({picker:this.data.picker===key?null:key});
    },

    // 挑颜色 / 恢复默认：整份 ringColors 替换（不传某个 key 即删掉它 = 恢复默认）
    async pickColor(e){
      const key=e.currentTarget.dataset.key;
      const hex=e.currentTarget.dataset.hex||null;
      const ringColors=Object.assign({},this.data.ringColors);
      if(hex)ringColors[key]=hex.toUpperCase(); else delete ringColors[key];
      // 预览先跟上：恢复默认时回退到这一项的品牌色（行上的 defaultColor 就是它）
      const row=[].concat(this.data.dayItems,this.data.weekItems).find(o=>o.key===key);
      this.patchLocal(key,{color:hex||(row&&row.defaultColor)||undefined});
      this.setData({picker:null,ringColors});
      try{
        await api('/profile','PATCH',{ringColors});
        change();
        await this.load();
      }catch(err){error(err);await this.load();}
    },

    // 显示 / 隐藏：隐藏只影响展示，记录一条不删。
    // 日 / 周两组显隐完全解绑（用户 10-29）：在哪个视图里点的就只改那个列表，
    // 周化身走 scope:'week' 存到服务端的周显隐里，跟日视图那一行互不影响
    async toggleHidden(e){
      const key=e.currentTarget.dataset.key;
      if(!key)return;
      const inDay=this.data.view==='day';
      const list=inDay?this.data.dayItems:this.data.weekItems;
      const it=list.find(o=>o.key===key);
      if(!it)return;
      const hidden=!it.hidden;
      const patch=o=>o.key===key?Object.assign({},o,{hidden}):o;
      // 环预览本地先变（pack 会把隐藏的剔出去），行分组（占环/不占环）也先重排；
      // 网络落地后 load() 再全量对账。真机上不等这两趟请求，环才跟手。
      this.patchLocal(key,{hidden});
      const next=inDay?{dayItems:this.markOverflow(list.map(patch))}:{weekItems:this.markOverflow(list.map(patch))};
      this.setData(next);
      try{
        await api('/goals/hidden','PATCH',it.weekAvatar?{key,hidden,scope:'week'}:{key,hidden});
        change();
        await this.load();
      }catch(err){error(err);await this.load();}
    },

    // 「编辑」入口（用户 10-29）：展开这一行的规则面板
    editRow(e){
      const key=e.currentTarget.dataset.key;
      this.setData({editKey:this.data.editKey===key?'':key,picker:null});
    },

    // 设周规则：一周至少 N 天。定死后数字不能改——确认框里说清楚，别让用户手滑。
    setRule(e){
      const key=e.currentTarget.dataset.key;
      const n=Number(e.currentTarget.dataset.n);
      if(!key||!Number.isInteger(n)||n<1||n>7)return;
      wx.showModal({
        title:'一周至少 '+n+' 天？',
        content:'规则定死后不能改数字，想换就删除这条规则重新设。',
        success:async r=>{
          if(!r.confirm)return;
          try{
            await api('/goals/weekrule','PATCH',{key,n});
            change();await this.load();
          }catch(err){error(err);await this.load();}
        }
      });
    },

    // 删除周规则（数字定死，唯一的后路就是整条删掉重设）
    async clearRule(e){
      const key=e.currentTarget.dataset.key;
      if(!key)return;
      try{
        await api('/goals/weekrule','PATCH',{key,n:null});
        change();await this.load();
      }catch(err){error(err);await this.load();}
    },

    // 周项目（心肺/抗阻）的数值改动在目标设置页：浮层不关（关了回来就弹回日视图，
    // 用户 10-29），直接跳过去；首页 onShow 会在回来时刷新这份编辑器的数据
    goGoals(){ wx.navigateTo({url:'/pages/goals/goals'}); },

    // 去设置目标的入口已删（用户 10-29：说明文字太多）：显隐和颜色这里就够用
    // 关掉时把这轮改过的视图交回首页：首页那组环立刻按新状态重画，
    // 不用等它再拉一次 /home（真机上关掉浮层还看到旧环，同样像「没反应」）
    close(){ this.triggerEvent('close',{goals:this._v}); },
    noop(){}
  }
});
