const {login,change,error,api}=require('../../utils/api');

// 第一次进来才看的引导：3 张卡讲清楚页面，最后一步把想记的项目和目标定下来。
// 可以整个跳过——跳过不会自动套用任何目标，以后在「我的 → 目标设置」里随时补。
// 最后一步用的是 components/goal-set，跟「我的 → 目标设置」是同一份，不会两处不一致。
const CARDS=[
  {title:'今天做了什么，一眼看到',
   body:'首页的圆环分「今日」和「本周」两组：你设成每天的目标进今日，每周的目标进本周。',
   more:'点圆环能看到每项的进度，也能决定哪些项目显示出来。'},
  {title:'记一次只要几十秒',
   body:'想记的都在首页各自的卡片里：心肺、抗阻、散步、喝水、体测，点哪张记哪张。',
   more:'记了就算数，没达到目标也会好好保存。哪天不想记，就空着，没人催你。'},
  {title:'学几个用得上的词',
   body:'学习页按记忆曲线给你排词，健身和营养相关的英语。想学几个学几个，没有上限。',
   more:'看板右上角的「成就」放你攒下的里程碑。想复习随时去「学习 → 我的词库」。'}
];

Page({
  data:{step:0,cards:CARDS,last:CARDS.length,onCard:true,stepLabel:'第 1 / 3 张',saving:false,nickname:''},

  // 最后一步的卡片要拉一次目标，冷启动时可能还没登录
  async onShow(){
    try{
      if(!getApp().globalData.token)await login();
    }catch(e){/* 登录失败交给下面的重试 */}
    // 冷启动时云函数要好几秒才回:目标数据拉不到就自动再试两次,
    // 别让新用户/审核员卡在这一步看到空表单(11-02 审核驳回对策)
    const gs=this.selectComponent&&this.selectComponent('#goalset');
    if(gs&&gs.load&&!gs.data.loaded){
      for(let i=0;i<3;i++){
        try{ await gs.load(); }catch(e){}
        if(gs.data.loaded)break;
        if(i<2)await new Promise(r=>setTimeout(r,1500));
      }
    }
  },

  // WXML 里不能写 a<b 这种比较（会被当成标签），所以状态在 JS 里算好
  goTo(n){
    const last=this.data.last,step=Math.max(0,Math.min(n,last));
    this.setData({step,onCard:step<last,stepLabel:step<last?('第 '+(step+1)+' / '+last+' 张'):'最后一步'});
  },
  next(){ this.goTo(this.data.step+1); },
  prev(){ this.goTo(this.data.step-1); },

  // 跳过只是跳过说明，仍要建账号 + 设目标：直接跳到最后一步
  skip(){
    this.goTo(this.data.last);
  },

  nameInput(e){ this.setData({nickname:e.detail.value}); },

  // 选了的项由组件自己写库（服务端把饮水按体重换算），这里只负责收尾
  async start(){
    if(this.data.saving)return;
    this.setData({saving:true});
    try{
      const gs=this.selectComponent&&this.selectComponent('#goalset');
      if(!gs||!gs.submitAll)throw new Error('目标设置尚未加载，请重试');
      await gs.submitAll();
      // 昵称 = 建账号：引导里填了就更新，没填也不阻塞（UI 会要求先填）
      if(this.data.nickname&&this.data.nickname.trim()){
        try{ await api('/profile','PATCH',{nickname:this.data.nickname.trim()}); }catch(e){ error(e); }
      }
      change();
    }catch(e){this.setData({saving:false});error(e);return;}
    this.finish();
  },

  finish(){
    try{ wx.setStorageSync&&wx.setStorageSync('somactive.onboarded','1'); }catch(e){}
    const pages=(typeof getCurrentPages==='function'&&getCurrentPages())||[];
    if(pages.length>1)wx.navigateBack();
    else wx.reLaunch({url:'/pages/home/home'});
  }
});
