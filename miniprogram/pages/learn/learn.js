const {api,error,change}=require('../../utils/api');
const speech=require('../../utils/speech');
const tip=require('../../utils/tip');
const {CATS}=require('../../data/cats');

// 例句统一成数组再交给页面：新词条有 3–4 句，老词条只有 say / example 两句，都在这里补成 lines
// key 是给「哪一句正在念」用的：WXML 里不好拼字符串，先在 JS 里算好
function lineUp(w,kind){
  const lines=Array.isArray(w.lines)&&w.lines.length?w.lines:[
    ...(w.say?[{en:w.say,zh:w.sayZh||''}]:[]),
    ...(w.example?[{en:w.example,zh:w.translation||''}]:[])
  ];
  // segs 是服务端切好的片段：句子里出现别的词库词时，那一小段带着那个词的 id，能点进去
  // audio：这个词到底有没有录音。没有就不画喇叭 —— 画一个点了说「没读音」的按钮是打扰
  // 行里的 audio：这一句有没有整句读音，有才画句旁的小喇叭
  return {...w,lines:lines.map((l,i)=>({
    ...l,key:'line'+i,
    segs:Array.isArray(l.segs)&&l.segs.length?l.segs:[{t:l.en||'',id:''}],
    audio:speech.hasLine(w.id,i)
  })),kind,audio:speech.has(w.id)};
}

// 学习页拆成两块（用户 10-30）：复习（记忆曲线三键）和学习新词（自己的按钮，
// 连续几次没记住可以「先放一放」进待学，或「放进待回忆」开始按曲线复习）。
// 「每天学几个」属于长期设置，放在「我的 → 目标设置」里，这里只负责今天这两队词。
const STRIKE_AT=3; // 新词第 3 次还没记住，出现「放一放 / 进待回忆」的选择

Page({popupNoop(){},
  data:Object.assign({
    loaded:false, busy:false, revealed:false,
    doneToday:0, tomorrow:0, planUnseen:0, word:null, left:0, pct:0, kindLabel:'', sub:'', part:null,
    mode:'review', reviewLeft:0, freshLeft:0,
    catPanel:false, catRows:[], catLabel:'默认范围'
  },tip.data),
  toggleTip(e){tip.toggle.call(this,e);},

  onLoad(){
    this.reviewQ=[];
    this.freshQ=[];
    this._tries=this._tries||{}; // 新词连续没记住的次数（只记本次会话，够提示用）
    // 冷启动秒开：上一次的词队还在本地就先摆出来（stale-while-revalidate），
    // 联网刷新交给第一次 onShow —— 「加载中」只在第一次打开时才看得见。
    try{
      const cache=wx.getStorageSync&&wx.getStorageSync('Somarise.learnCache');
      if(cache&&Array.isArray(cache.due)){this._fromCache=true;this.setToday(cache);this.setData({loaded:true});}
    }catch(e){}
  },

  // 从例句点进另一个词再回来，这一队还在这儿就别重排 —— 手上正看着的那个词不能被冲掉。
  // 缓存画出来的第一帧除外：那次要照常联网刷新一遍，刷新完恢复守卫。
  async onShow(){
    if((this.reviewQ&&this.reviewQ.length||this.freshQ&&this.freshQ.length)&&!this._fromCache)return;
    this._fromCache=false;
    await this.load();
  },

  async load(){
    try{
      const today=await api('/learning/today');
      try{wx.setStorageSync&&wx.setStorageSync('Somarise.learnCache',today);}catch(e){}
      this.setToday(today);
      this.setData({loaded:true});
    }catch(e){ error(e); }
  },

  // 服务端给的是「到期的 + 今天该发的」，本地分成两队；复习队先走，新词队随叫随到。
  setToday(today){
    this.today=today;
    this.reviewQ=today.due.map(w=>lineUp(w,'review'));
    this.freshQ=today.fresh.map(w=>lineUp(w,'new'));
    // 复习队空了就自动切到新词队。必须走 setData：直接改 this.data 只改了逻辑层，
    // 视图层的高亮胶囊不会跟着动（会出现「复习亮着、卡片却是新词」的错位）。
    if(!this.data.mode||(!this.reviewQ.length&&this.data.mode==='review'))this.setData({mode:this.freshQ.length?'fresh':'review'});
    this.paint(today);
  },

  switchMode(e){
    const mode=e.currentTarget.dataset.mode;
    if(mode===this.data.mode)return;
    this.setData({mode,revealed:false});
    this.paint(this.today);
  },

  paint(today){
    const q=this.data.mode==='fresh'?this.freshQ:this.reviewQ;
    const word=q[0]||null;
    const done=(today&&today.doneToday)||0;
    const all=done+this.reviewQ.length+this.freshQ.length;
    const left=this.reviewQ.length+this.freshQ.length;
    // 已掌握的词回来遛一遛，标签上说清楚，别混在普通复习里
    const kindLabel=word?(word.status==='known'?'遛一遛':(word.kind==='new'?'新词':'复习')):'';
    const st=(today&&today.stats)||{};
    const vocabNote=`未学 ${(st.total||0)-(st.learned||0)} · 待回忆 ${st.learning||0} · 已掌握 ${st.known||0}`;
    // 视图层只读 doneToday / tomorrow / plan.unseen 三个数，不把整包「今天该复习+新词」
    // 的几十个词条再塞进 data（它们已经在 reviewQ/freshQ/word 里了）—— 否则每次评价
    // 都重发一遍 30+ 词条，低配机连续刷词会一顿一顿的。
    this.setData({
      doneToday:done, tomorrow:(today&&today.tomorrow)||0, planUnseen:(today&&today.plan)?(today.plan.unseen||0):0,
      word, revealed:false, left, part:null,
      pct:all?Math.round(done/all*100):100,
      kindLabel, vocabNote,
      reviewLeft:this.reviewQ.length, freshLeft:this.freshQ.length,
      catLabel:(today&&today.plan)?(
        today.plan.cats ? today.plan.cats.length+' 类'
        : '默认 · 日常'+(today.plan.defaultCats?today.plan.defaultCats.length:4)+'类'
      ):'默认范围',
      sub:this.subOf(today,left)
    });
  },

  // ---- 学习范围：勾选分类，新词只从勾选范围里出（学过的词照常复习）----
  toggleCatPanel(){
    if(this.data.catPanel){this.setData({catPanel:false});return;}
    // 用服务端给的 scope（当前生效范围）打勾：默认范围下只有日常4类被勾上，
    // 解剖/足踝等其余类显示未勾，点开就能按需加回来。
    const scope=(this.today&&this.today.plan&&this.today.plan.scope)||[];
    const on=new Set(scope);
    const rows=Object.keys(CATS).map(k=>({key:k,label:CATS[k],on:on.has(k)}));
    this.setData({catPanel:true,catRows:rows});
  },
  closeCatPanel(){ this.setData({catPanel:false}); },
  pickCat(e){
    const k=e.currentTarget.dataset.key;
    if(!k)return;
    this.setData({catRows:this.data.catRows.map(r=>r.key===k?Object.assign({},r,{on:!r.on}):r)});
  },
  async saveCats(){
    if(this.data.busy)return;
    const sel=this.data.catRows.filter(r=>r.on).map(r=>r.key);
    // 全不勾 = 恢复默认范围（日常4类），服务端存 null；勾了哪些就发哪些（含全9类=全部词库）
    try{
      this.setData({busy:true});
      await api('/learning/settings','PATCH',{cats:sel});
      this.setData({catPanel:false});
      wx.showToast({title:sel.length?'学习范围已更新':'已恢复默认范围',icon:'none'});
      await this.load();
    }catch(e){ error(e); }
    finally{ this.setData({busy:false}); }
  },

  // 不用「待过 / 回来」这类生造词，按平时说话的方式写。
  subOf(today,left){
    const tomorrow=(today&&today.tomorrow)||0;
    if(left>0)return tomorrow?`还剩 ${left} 个 · 明天复习 ${tomorrow} 个`:`还剩 ${left} 个`;
    return tomorrow?`今天的看完了 · 明天复习 ${tomorrow} 个`:'今天的看完了';
  },

  // 点词根：弹这一段自己的解释（前缀/后缀/词根），没有释义的段不响应
  explainPart(e){
    const i=Number(e.currentTarget.dataset.index);
    const w=this.data.word;
    const seg=w&&w.parts&&w.parts[i];
    if(!seg||!seg.zh)return;
    // 常见词优先用词根库给的数组做胶囊；数组拆不出两个以上就退回一行文字，不硬造
    const ex=(Array.isArray(seg.ex)&&seg.ex.length>1)?seg.ex.filter(Boolean).map(String):null;
    this.setData({part:Object.assign({},seg,{
      exText:(seg.ex||[]).join(' · '),
      caps:ex,
      ctx:this.ctxOf(w,i)
    })});
  },

  // 上下文行：「unable 里的 un + able」，当前那一段标出来；没拆分的词整行不显示
  ctxOf(w,i){
    if(!w||!Array.isArray(w.parts)||w.parts.length<2)return null;
    return {
      word:w.word,
      segs:w.parts.map((p,k)=>({t:(p&&p.t)||'',on:k===i}))
    };
  },
  closePart(){ this.setData({part:null}); },

  reveal(){ if(this.data.word)this.setData({revealed:true}); },
  unreveal(){ if(this.data.revealed)this.setData({revealed:false}); },

  // 点喇叭听读音：音频在包内（或云存储），不经过接口
  speak(){ const w=this.data.word; if(w)speech.play(w.id); },

  // 点例句旁的小喇叭：读整句
  speakLine(e){
    const w=this.data.word;
    if(!w)return;
    speech.playLine(w.id,Number(e.currentTarget.dataset.index));
  },

  onHide(){ speech.stop(); },

  // 复习队答「不认识」排回队尾；新词队答「还没记住」也一样，并且记一次没记住，
  // 攒到第 3 次就给出「放一放 / 进待回忆」的选择。
  async grade(e){
    if(this.data.busy||!this.data.word)return;
    const value=e.currentTarget.dataset.grade;
    const word=this.data.word;
    const freshMode=this.data.mode==='fresh';
    this._shiftOut(word);
    if(value==='again'){
      this._tries=this._tries||{};
      const strikes=(this._tries[word.id]||0)+1;
      this._tries[word.id]=strikes;
      const re={...word,kind:freshMode?'new':'review',strikes};
      (freshMode?this.freshQ:this.reviewQ).push(re);
      if(freshMode&&strikes<STRIKE_AT&&wx.showToast)wx.showToast({title:'一会儿再见',icon:'none'});
    }else if(freshMode){
      delete this._tries[word.id];
    }
    try{
      this.setData({busy:true});
      const today=await api('/learning/review','POST',{wordId:word.id,grade:value});
      change();
      this.today=today;
      this.paint(today);
    }catch(err){
      // 没存上就把词放回队首，别把词吞掉
      this._unshiftBack(word);
      this.paint(this.today);
      error(err);
    }
    finally{ this.setData({busy:false}); }
  },

  _shiftOut(word){
    this.reviewQ=this.reviewQ.filter(w=>w.id!==word.id);
    this.freshQ=this.freshQ.filter(w=>w.id!==word.id);
  },
  _unshiftBack(word){
    const q=word.kind==='new'?this.freshQ:this.reviewQ;
    this._shiftOut(word);
    q.unshift(word);
  },

  // 第 3 次还没记住：先放一放（待学）—— 不进曲线，也不再来每天的新词队列里
  async parkWord(){
    if(this.data.busy||!this.data.word)return;
    const word=this.data.word;
    this._shiftOut(word);
    delete this._tries[word.id];
    try{
      this.setData({busy:true});
      const today=await api('/learning/park','POST',{wordId:word.id});
      change();
      this.today=today;
      wx.showToast({title:'已放进待学',icon:'none'});
      this.paint(today);
    }catch(err){ this._unshiftBack(word); this.paint(this.today); error(err); }
    finally{ this.setData({busy:false}); }
  },

  // 第 3 次还没记住：放进待回忆 —— 从明天起按记忆曲线来（今天就算一次「模糊」）
  async startCurve(){
    if(this.data.busy||!this.data.word)return;
    const word=this.data.word;
    this._shiftOut(word);
    delete this._tries[word.id];
    try{
      this.setData({busy:true});
      const today=await api('/learning/review','POST',{wordId:word.id,grade:'hard'});
      change();
      this.today=today;
      wx.showToast({title:'明天开始复习',icon:'none'});
      this.paint(today);
    }catch(err){ this._unshiftBack(word); this.paint(this.today); error(err); }
    finally{ this.setData({busy:false}); }
  },

  // 学完当天的配额还能接着学：配额是「今天先给你几个」，不是上限
  async more(){
    if(this.data.busy)return;
    try{
      this.setData({busy:true,mode:'fresh'});
      const today=await api('/learning/today?extra=5');
      const have=new Set([...this.reviewQ,...this.freshQ].map(w=>w.id));
      const add=((today&&today.fresh)||[]).filter(w=>!have.has(w.id));
      if(!add.length){wx.showToast({title:'词库里的词都学过了',icon:'none'});return;}
      this.today=today;
      this.freshQ.push(...add.map(w=>lineUp(w,'new')));
      this.paint(today);
    }catch(e){error(e);}
    finally{this.setData({busy:false});}
  },

  // 例句里的词：点一下去看它，顺手也就进了词库
  openWord(e){
    const id=e.currentTarget.dataset.id;
    if(!id)return;
    wx.navigateTo({url:'/pages/word/word?id='+id});
  },

  openVocab(){ wx.navigateTo({url:'/pages/vocab/vocab'}); }
});
