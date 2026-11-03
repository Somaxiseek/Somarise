const {api,error}=require('../../utils/api');
const speech=require('../../utils/speech');
const swipe=require('../../utils/swipe');

// 例句也是切好的片段（服务端切），没切到的（老数据）整句当一个片段，照样能显示
function segsOf(l){
  return Array.isArray(l.segs)&&l.segs.length?l.segs:[{t:l.en||'',id:''}];
}

// 洗牌只是为了「翻牌顺序」，跟记忆曲线的排期无关，所以用 Math.random 就够。
// 每次进卡片模式顺序都不一样，才叫随机；同一个词今天排第几不该被记下来。
function shuffle(arr){
  const a=arr.slice();
  for(let i=a.length-1;i>0;i--){
    const j=Math.floor(Math.random()*(i+1));
    const t=a[i];a[i]=a[j];a[j]=t;
  }
  return a;
}

const THROW=280;  // 松手后飞出去的位移（px，纯视觉）
const FIRE=88;    // 拖过这个距离松手才算「换一个」，不到就弹回去
const DRAG=220;   // 跟手位移的上限，越过头就加阻尼

// 我的词库三分类（用户 10-30）：未学 / 待回忆 / 已掌握。
// 未学是整本词库里还没碰过的词，走单独的分页接口；看不算复习，不动记忆曲线的排期。
Page({
  data:{
    loaded:false, filter:'review', openId:'',
    cards:[], list:[], filters:[],
    stats:{learned:0,known:0,learning:0,due:0,total:100}, dueCount:0,
    // 未学 tab：轻量条目分页加载（待学的排前面）
    newList:[], newTotal:0, newParked:0, newMore:false,
    // 卡片复习模式：一次只放一张，左右滑换下一个
    view:'list', idx:0, deckLen:0, card:null, flipped:false, dx:0, rot:0, anim:false
  },

  async onShow(){ await this.load(); },
  onUnload(){ clearTimeout(this._timer); },

  async load(){
    try{
      const v=await api('/learning/vocab');
      const cards=(v.cards||[]).map(c=>({
        ...c,
        lines:(c.lines||[]).map((l,i)=>({...l,wid:c.id,segs:segsOf(l),audio:speech.hasLine(c.id,i)})),
        state:c.status==='known'?'mastered':'review',
        dueLabel:c.status==='known'?'已掌握':(c.due<=v.date?'今天':c.due.slice(5).replace('-','/')),
        audio:speech.has(c.id)          // 没录音的词不画喇叭
      }));
      const total=v.stats.total||0,learned=v.stats.learned||0;
      this.setData({
        loaded:true, cards,
        stats:v.stats, dueCount:v.dueCount,
        filters:[
          {key:'review',label:'待回忆',n:v.stats.learning},
          {key:'mastered',label:'已掌握',n:v.stats.known},
          {key:'new',label:'未学',n:total-learned}
        ]
      });
      // 学习页那边可能刚放了一词进待学：未学 tab 每次进来都重新拉，别摆旧账
      if(this.data.filter==='new'){ this.setData({newList:[]}); this.loadNew(); }
      else this.applyFilter();
      // 卡片模式下数据刷新了（从例句点去单词页再返回也会走这里）：
      // 只换手里这张的内容，不重新洗牌 —— 不然一回来牌面全变了，刚才翻到第几张也白费
      if(this.data.view==='card'&&this._deck&&this._deck.length){
        this._byId=new Map(this.data.list.map(c=>[c.id,c]));
        const keep=this._deck[Math.min(this.data.idx,this._deck.length-1)];
        if(this._byId.has(keep))this.setData({card:this.cardView(this._byId.get(keep))});
        else this.openCards({quiet:true});
      }
    }catch(e){ error(e); }
  },

  applyFilter(){
    const {filter,cards}=this.data;
    if(filter==='new'){ this.setData({list:this.data.newList}); if(!this.data.newList.length)this.loadNew(); return; }
    this.setData({list:cards.filter(c=>c.state===filter)});
  },

  pickFilter(e){
    const key=e.currentTarget.dataset.key;
    if(key===this.data.filter)return;
    this.setData({filter:key,openId:''});
    this.applyFilter();
  },

  // 未学词库：轻量条目（不带例句），分页拿；点一行去单词页看全貌
  async loadNew(){
    if(this._loadingNew)return;
    this._loadingNew=true;
    try{
      const offset=this.data.newList.length;
      const v=await api('/learning/new?offset='+offset+'&limit=100');
      const add=(v.words||[]).map(w=>({
        id:w.id,word:w.word,meaning:w.meaning,pos:w.pos,catLabel:w.catLabel,
        parked:!!w.parked,state:'new',dueLabel:w.parked?'待学':'未学',
        audio:speech.has(w.id),lines:[]
      }));
      this.setData({
        newList:this.data.newList.concat(add),
        newTotal:v.total,newParked:v.parkedCount,newMore:!!v.more
      });
      if(this.data.filter==='new')this.setData({list:this.data.newList});
    }catch(e){ error(e); }
    finally{ this._loadingNew=false; }
  },

  loadMoreNew(){ if(this.data.newMore)this.loadNew(); },

  // 点一行展开例句，再点收起
  toggle(e){
    const id=e.currentTarget.dataset.id;
    this.setData({openId:this.data.openId===id?'':id});
  },

  // 点喇叭只听读音，不展开这一行
  speak(e){ speech.play(e.currentTarget.dataset.id); },

  // 点例句旁的小喇叭：读整句（要先展开才看得见，不打断列表）
  speakLine(e){
    const id=e.currentTarget.dataset.word;
    if(!id)return;
    speech.playLine(id,Number(e.currentTarget.dataset.index));
  },

  // 例句里的词：点进去看它，顺手也进了词库
  openWord(e){
    const id=e.currentTarget.dataset.id;
    if(!id)return;
    wx.navigateTo({url:'/pages/word/word?id='+id});
  },

  // ── 卡片复习模式 ──
  // 只在 data 里放当前这一张：整本词库塞进 data 会让 setData 背着几百 KB 走路。
  cardView(c){
    if(!c)return null;
    return {
      id:c.id,word:c.word,ipa:c.ipa,pos:c.pos,meaning:c.meaning,
      catLabel:c.catLabel,audio:c.audio,
      lines:(c.lines||[]).slice(0,2)   // 卡片上一屏放得下两句；要全的看列表
    };
  },

  openCards(opt={}){
    const list=this.data.list;
    if(!list.length)return;
    this._byId=new Map(list.map(c=>[c.id,c]));
    this._deck=shuffle(list.map(c=>c.id));
    this.showCard(0);
    this.setData({view:'card'});
    if(!opt.quiet&&wx.pageScrollTo)wx.pageScrollTo({scrollTop:0,duration:0});
  },

  showCard(idx){
    const id=this._deck[idx];
    this.setData({
      idx,deckLen:this._deck.length,card:this.cardView(this._byId.get(id)),
      flipped:false,dx:0,rot:0,anim:false
    });
  },

  closeCards(){ this.setData({view:'list',flipped:false,dx:0,rot:0}); },

  reshuffle(){
    if(!this._deck||this._deck.length<2)return;
    this._deck=shuffle(this._deck);
    this.showCard(0);
    wx.showToast({title:'重新洗过了',icon:'none'});
  },

  // 滑完松手时系统有时还会补一个 tap，别让「滑一下」变成「顺手翻面」
  flip(){
    if(this._moved){this._moved=false;return;}
    this.setData({flipped:!this.data.flipped});
  },

  // 两个方向都算「翻下一个」：用户要的是「右滑换词」，左滑还是换词最不容易误会，
  // 真要看上一个用下面那两个箭头。到头绕回第一个，不让人卡在最后一张。
  step(dir){
    if(!this._deck||this._deck.length<2)return;
    let idx=this.data.idx+1,wrapped=false;
    if(idx>=this._deck.length){idx=0;wrapped=true;}
    const sign=dir>=0?1:-1;
    this.setData({anim:true,dx:sign*THROW,rot:sign*5});
    clearTimeout(this._timer);
    this._timer=setTimeout(()=>{
      this.showCard(idx);
      if(wrapped)wx.showToast({title:'这一遍翻完了，从头再来',icon:'none'});
    },130);
  },

  next(){ this.step(1); },

  prev(){
    if(!this._deck||this._deck.length<2)return;
    let idx=this.data.idx-1;
    if(idx<0)idx=this._deck.length-1;
    this.showCard(idx);
  },

  onCardStart(e){
    if(this.data.anim)return;
    const t=e.touches&&e.touches[0];
    if(!t)return;
    this._start={x:t.clientX,y:t.clientY};
    this._dx=0;
  },

  onCardMove(e){
    if(!this._start||this.data.anim)return;
    const t=e.touches&&e.touches[0];
    if(!t)return;
    const dx=t.clientX-this._start.x, dy=t.clientY-this._start.y;
    // 竖向先不动：卡片上也可能想上下瞄一眼，别一碰就横着甩
    if(!swipe.lockDir(dx,dy))return;
    this._moved=true;
    const v=swipe.resist(dx,DRAG);
    this._dx=v;
    this.setData({dx:v,rot:+(v/DRAG*4).toFixed(2)});
  },

  onCardEnd(){
    if(!this._start)return;
    const dx=this._dx||0;
    const moved=this._moved;
    this._start=null;this._dx=0;
    if(swipe.fires(dx,FIRE))this.step(dx);
    else this.setData({dx:0,rot:0});
    // 滑过的那一下，松手后系统可能补一个 tap；只有「真移动过」才拦，
    // 而且拦 250ms 就放行，不能把下一次正常点击也吃掉
    if(moved)setTimeout(()=>{this._moved=false;},250);
    else this._moved=false;
  },

  onCardCancel(){
    this._start=null;this._dx=0;
    this.setData({dx:0,rot:0});
  },

  speakCard(){ if(this.data.card)speech.play(this.data.card.id); },

  onHide(){ speech.stop(); },

  goLearn(){
    wx.reLaunch({url:'/pages/learn/learn'});
  },

  // 重新开始：清掉全部学习进度（记忆曲线 / 待学 / 英语打卡），从今天当新词发。
  // 不可逆，所以先弹一次确认；「每天新学几个」的偏好不动。
  resetLearn(){
    if(this._resetting)return;
    wx.showModal({
      title:'重新开始？',
      content:'会清掉所有词的学习进度和英语打卡，从头再学。这一步不能撤销。',
      confirmText:'重新开始',
      cancelText:'先不了',
      success:res=>{
        if(!res.confirm)return;
        this._resetting=true;
        api('/learning/reset','POST',{}).then(()=>{
          this._resetting=false;
          wx.showToast({title:'已经从头开始',icon:'none'});
          this.load();
        }).catch(e=>{
          this._resetting=false;
          error(e);
        });
      }
    });
  }
});
