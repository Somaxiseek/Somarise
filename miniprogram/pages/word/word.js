const {api,error,change}=require('../../utils/api');
const speech=require('../../utils/speech');

// 单词页：例句里点到的那个词都落在这里。
// 进来就收进自己的词库（明天起按记忆曲线来，不打扰今天这一轮）；
// 想当场给个印象就点下面的评价，什么都不点直接返回也行 —— 收进去了就算数。
Page({
  data:{
    loaded:false, missing:false, busy:false, graded:false,
    word:null, state:'', next:''
  },

  async onLoad(q){
    this.id=(q&&q.id)||'';
    if(!this.id){ this.setData({loaded:true,missing:true}); return; }
    await this.load();
  },

  async load(){
    try{
      const r=await api('/learning/touch','POST',{wordId:this.id});
      change();
      // audio：有没有录音决定要不要画喇叭，没录就不画（画了点了说没读音是打扰）
      // 行里的 audio：整句读音有没有；有才画句旁的小喇叭
      this.setData({
        loaded:true, missing:false, graded:false, next:'',
        word:Object.assign({},r.word,{
          audio:speech.has(this.id),
          lines:((r.word&&r.word.lines)||[]).map((l,i)=>({...l,audio:speech.hasLine(this.id,i)}))
        }), state:this.stateOf(r)
      });
    }catch(e){ error(e); this.setData({loaded:true,missing:true}); }
  },

  // 这个词现在什么状态：刚收进来 / 什么时候再来一次 / 已经记住了
  stateOf(r){
    const card=r.card;
    if(!card)return '';
    if(card.status==='known')return '已经记住了';
    if(r.added)return '收进词库了 · 明天再见一次';
    if(card.due<=r.date)return '今天就在你的队列里';
    return card.due.slice(5).replace('-','/')+' 复习';
  },

  // 点喇叭听读音：有的词有预生成音频，没有的交给即时合成
  speak(){ const w=this.data.word; if(w)speech.play(w.id,w.word); },

  // 点例句旁的小喇叭：读整句
  speakLine(e){
    const w=this.data.word;
    if(!w)return;
    speech.playLine(this.id,Number(e.currentTarget.dataset.index));
  },
  onHide(){ speech.stop(); },

  // 例句里再点到别的词：替换当前页，返回还是回到进来时的那一页，页面栈不越堆越深
  openWord(e){
    const id=e.currentTarget.dataset.id;
    if(!id||id===this.id)return;
    wx.redirectTo({url:'/pages/word/word?id='+id});
  },

  async grade(e){
    if(this.data.busy||this.data.graded||!this.data.word)return;
    const value=e.currentTarget.dataset.grade;
    try{
      this.setData({busy:true});
      const r=await api('/learning/review','POST',{wordId:this.id,grade:value});
      change();
      const due=r&&r.last&&r.last.due;
      this.setData({
        graded:true, busy:false,
        state:r&&r.last&&r.last.status==='known'?'记住了 · 不用再复习':'记下了',
        next:due?'下次 '+due.slice(5).replace('-','/')+' 再来一次':''
      });
    }catch(err){ this.setData({busy:false}); error(err); }
  },

  back(){
    if(getCurrentPages().length>1)wx.navigateBack();
    else wx.reLaunch({url:'/pages/learn/learn'});
  }
});
