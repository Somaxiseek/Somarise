'use strict';
const {fail,day}=require('./domain');
const srs=require('../miniprogram/utils/srs');
// 词库（data/words 下 16 个文件、约 1.5MB）和词根表只有「真去学词」时才用得上。
// 首页 /home 只需要知道「今天学没学」，所以这三样都改成按需 require：
// 冷启动少读 1.6MB JS，会员点开首页时不用为背单词的字典等这一下。
let _pool=null,_roots=null,_link=null;
function wordBank(){return _pool||(_pool=require('../miniprogram/data/words'));}
function rootTable(){return _roots||(_roots=require('../miniprogram/data/roots'));}
function wordLink(){return _link||(_link=require('../miniprogram/utils/wordlink'));}

// 默认学习范围：未设置时只发「日常向」4 类，解剖/足踝/健康/理化/哲学需手动勾选。
// 肌肉/骨骼/关节名多是古典拉丁词，普通会员不必背，专业向（教练）才需要；
// 想学就到「学习范围」里勾上对应分类即可。复习不受影响（学过的词照常按曲线回来）。
const DEFAULT_CATS=['daily','training','nutrition','mind'];

// ---- 每人每天一队词：同一个人同一天得到同一队，换一天或换一个人就换一队 ----
// 洗牌用「uid + 日期」当种子算出来，不存库：当天反复进出不会重排（否则「还剩几个」
// 和答错排队尾都没意义），但第二天、以及不同的人拿到的顺序都不一样。
function hash32(str){
  let h=2166136261>>>0;
  for(let i=0;i<str.length;i++){ h^=str.charCodeAt(i); h=Math.imul(h,16777619)>>>0; }
  return h>>>0;
}
// mulberry32：小、够随机、同种子必得同一串数
function rngFrom(seed){
  let a=seed>>>0;
  return ()=>{
    a=(a+0x6D2B79F5)>>>0;
    let t=a;
    t=Math.imul(t^(t>>>15),t|1);
    t^=t+Math.imul(t^(t>>>7),t|61);
    return ((t^(t>>>14))>>>0)/4294967296;
  };
}
// Fisher–Yates，只打乱副本，不动原数组（词库顺序本身是有意义的分类顺序）
function shuffled(list,rand){
  const a=list.slice();
  for(let i=a.length-1;i>0;i--){
    const j=Math.floor(rand()*(i+1));
    const t=a[i]; a[i]=a[j]; a[j]=t;
  }
  return a;
}

// 每天学几个新词 + 按记忆曲线把旧词排回来复习。
// 只做两件事：给你今天的词、记下你对每个词的评价；不设「必须学完」的门槛。
class Learning{
  constructor(habits){this.h=habits;this.db=habits.db;this.db.word_cards||=[];this.db.word_settings||=[];this.db.word_parked||=[];}
  save(){this.h.s.save();}
  dateOf(uid){return day(this.h.s.clock(),this.h.s.user(uid).timeZone);}
  shiftDay(d,n){return new Date(Date.parse(d+'T12:00:00Z')+n*86400000).toISOString().slice(0,10);}
  // 最近 N 天每天学了几个词（去重词数，跟目标口径一致）：首页英语卡展开用，只读不改状态。
  recent(uid,n=7){
    const today=this.dateOf(uid);
    const byDate={};
    for(const c of this.cardsOf(uid)){
      if(!c.lastAt)continue;
      byDate[c.lastAt]=byDate[c.lastAt]||new Set();
      byDate[c.lastAt].add(c.wordId);
    }
    const days=[];
    for(let i=n-1;i>=0;i--){
      const date=this.shiftDay(today,-i);
      days.push({date,words:byDate[date]?byDate[date].size:0});
    }
    return {today,days};
  }

  cardsOf(uid){return this.db.word_cards.filter(c=>c.userId===uid);}

  // 首页只要一个布尔「今天学没学」：别为了这个把整个词池拼出来（today() 会）。
  // 判定口径和 today() 返回的 doneToday 完全一致，读的是同一批卡片上的 lastAt。
  doneToday(uid){
    const date=this.dateOf(uid);
    return this.cardsOf(uid).some(c=>c.lastAt===date);
  }

  // 每天新学 1–5 个，默认 3 个；cats = 会员勾选的学习范围（null = 全部分类）。
  // 有些会员年纪大，不想碰训练词，只想学日常对话——范围是偏好，不是进度。
  setting(uid){
    const row=this.db.word_settings.find(x=>x.userId===uid);
    const n=row?Number(row.dailyNew):3;
    const cats=row&&Array.isArray(row.cats)?row.cats:null;
    return {dailyNew:Number.isInteger(n)&&n>=1&&n<=5?n:3,cats};
  }

  setDailyNew(uid,input){
    const n=Number(input);
    if(!Number.isInteger(n)||n<1||n>5)fail('每天新学数量可选 1–5 个');
    let row=this.db.word_settings.find(x=>x.userId===uid);
    if(!row){row={userId:uid,dailyNew:n};this.db.word_settings.push(row);}else row.dailyNew=n;
    this.save();
    return this.setting(uid);
  }

  // 学习范围：只从勾选的分类里发新词。空数组 = 恢复默认范围（日常4类），不是全库；不认识的分类直接报错。
  setCats(uid,list){
    const arr=Array.isArray(list)?[...new Set(list)]:null;
    if(!arr)fail('cats 要是一个数组');
    for(const c of arr)if(!wordBank().CATS[c])fail('不认识的分类：'+c);
    const cats=arr.length?arr:null;
    let row=this.db.word_settings.find(x=>x.userId===uid);
    if(!row){row={userId:uid,dailyNew:3,cats};this.db.word_settings.push(row);}
    else row.cats=cats;
    this.save();
    return this.setting(uid);
  }

  // PATCH /learning/settings 的统一入口：dailyNew、cats 都可选，至少改一样。
  setSettings(uid,input){
    const b=input||{};
    if(b.dailyNew===undefined&&b.cats===undefined)fail('没有要改的设置');
    if(b.dailyNew!==undefined)this.setDailyNew(uid,b.dailyNew);
    if(b.cats!==undefined)this.setCats(uid,b.cats);
    return this.setting(uid);
  }

  // 出新词的池子：勾了范围就只在范围内发；不勾 = 默认「日常向」4 类
  // （daily/训练/营养/心理），解剖/足踝/健康/理化/哲学需手动勾选。
  // 原因：肌肉/骨骼/关节多为古典拉丁词，普通会员不必背，专业向（教练）才需要。
  // 复习不受影响（学过的词照常按曲线回来）。
  poolOf(uid){
    const s=this.setting(uid);
    const cats=(s.cats&&s.cats.length)?s.cats:DEFAULT_CATS;
    return wordBank().WORDS.filter(w=>cats.includes(w.cat)&&!w.ref);
  }

  // 英语目标和「每天发几个新词」是同一件事：目标改成 5，当天就该发 5 个，
  // 不然环上永远差两个，用户只能自己去「再学几个」补。
  alignQuota(uid,n){
    const v=Math.max(1,Math.min(20,Math.round(Number(n)||0)));
    let row=this.db.word_settings.find(x=>x.userId===uid);
    if(!row){row={userId:uid,dailyNew:v};this.db.word_settings.push(row);}else row.dailyNew=v;
    this.save();
    return {dailyNew:v};
  }

  // 一句英文切成片段：句子里出现的别的词库词会带着它自己的 id，页面上就能点进去。
  // 自己的例句不标自己（selfId），点来点去还在原地没意义。
  line(en,zh,selfId){
    return {en,zh:zh||'',segs:wordLink().annotate(en,selfId)};
  }
  hasLinks(lines){ return (lines||[]).some(l=>Array.isArray(l.segs)&&l.segs.some(s=>s.id)); }

  wordView(w,extra){
    // say/sayZh/example/translation 只用来拼 lines（口语句 + 2–3 句说明句），
    // 客户端只读 lines，所以这四个原始字段不再单独下发 —— 否则同一段句子在
    // 响应体里出现两次（raw + lines），实测占 today() 载荷约 15%。
    const lines=[];
    if(w.say)lines.push(this.line(w.say,w.sayZh,w.id));
    if(w.ex)lines.push(this.line(w.ex,w.exZh,w.id));
    if(w.ex2)lines.push(this.line(w.ex2,w.ex2Zh,w.id));
    if(w.ex3)lines.push(this.line(w.ex3,w.ex3Zh,w.id));
    return {id:w.id,word:w.w,ipa:w.ipa,pos:w.pos,meaning:w.zh,
      parts:rootTable().explainParts(w.parts),
      lines,
      linked:this.hasLinks(lines),
      cat:w.cat,catLabel:w.catLabel,no:w.no,...extra};
  }

  parkedOf(uid){return this.db.word_parked.filter(p=>p.userId===uid);}

  // 「先放一放」：一个词试了几次都记不住，可以先搁进待学 —— 不建卡、不发新词，
  // 只是不再出现在每天的新词队列里；想学的时候随时捞回来。
  park(uid,input){
    const word=wordBank().BY_ID.get(input&&typeof input.wordId==='string'?input.wordId:'');
    if(!word)fail('词库里没有这个词');
    if(!this.parkedOf(uid).some(p=>p.wordId===word.id)){
      this.db.word_parked.push({userId:uid,wordId:word.id,at:this.dateOf(uid)});
      this.save();
    }
    return this.today(uid);
  }

  unpark(uid,input){
    const word=wordBank().BY_ID.get(input&&typeof input.wordId==='string'?input.wordId:'');
    if(!word)fail('词库里没有这个词');
    const before=this.db.word_parked.length;
    this.db.word_parked=this.db.word_parked.filter(p=>!(p.userId===uid&&p.wordId===word.id));
    if(this.db.word_parked.length!==before)this.save();
    return this.today(uid);
  }

  // 重新开始：清掉这个人的全部学习进度——记忆曲线卡片、待学、英语项目的打卡记录。
  // 「每天新学几个」是偏好不是进度，保留。清完从今天起像新用户一样发新词。
  reset(uid){
    this.db.word_cards=this.db.word_cards.filter(c=>c.userId!==uid);
    if(Array.isArray(this.db.word_parked))this.db.word_parked=this.db.word_parked.filter(p=>p.userId!==uid);
    const lp=this.db.projects.find(p=>p.userId===uid&&p.kind==='learning');
    if(lp)this.db.checkins=this.db.checkins.filter(c=>!(c.userId===uid&&c.projectId===lp.id));
    this.save();
    return this.today(uid);
  }

  // 未学词库（轻量条目，不带例句）：待学的排前面，其余按词库顺序；分页给
  newWords(uid,offset,limit){
    const seen=new Set(this.cardsOf(uid).map(c=>c.wordId));
    const parked=new Set(this.parkedOf(uid).map(p=>p.wordId));
    const all=wordBank().WORDS.filter(w=>!seen.has(w.id)&&!w.ref)
      .map(w=>({id:w.id,word:w.w,meaning:w.zh,pos:w.pos,cat:w.cat,catLabel:w.catLabel,no:w.no,parked:parked.has(w.id)}))
      .sort((a,b)=>(b.parked?1:0)-(a.parked?1:0)||a.no-b.no);
    const off=Math.max(0,Number(offset)||0),lim=Math.min(200,Math.max(1,Number(limit)||100));
    return {date:this.dateOf(uid),total:all.length,parkedCount:all.filter(w=>w.parked).length,
      words:all.slice(off,off+lim),offset:off,limit:lim,more:off+lim<all.length};
  }

  // 今天：到期该复习的 + 还没见过的新词（按新词配额发放）。
  // extra>0 = 用户主动「再学几个」：配额之外再发一些，学多少不算超额，也没有封顶。
  today(uid,extra=0){
    const date=this.dateOf(uid);
    const s=this.setting(uid);
    const {dailyNew}=s;
    const bonus=Math.max(0,Math.min(50,Number(extra)||0));
    const cards=this.cardsOf(uid);
    const seen=new Set(cards.map(c=>c.wordId));
    const parked=new Set(this.parkedOf(uid).map(p=>p.wordId));
    const rand=rngFrom(hash32(uid+'|'+date));

    // 到期该复习的：越欠的越先出现（这是记忆曲线该有的顺序），同一天到期的内部打乱，
    // 免得每天睁眼都是同一串固定顺序。已掌握的词到点也会回来遛一遛（kindLabel 靠 status 区分）。
    const dueList=cards.filter(c=>srs.isDue(c,date))
      .sort((a,b)=>a.due.localeCompare(b.due)||a.wordId.localeCompare(b.wordId))
      .map(c=>{const w=wordBank().BY_ID.get(c.wordId);return w?this.wordView(w,{stage:c.stage,due:c.due,status:c.status,lapses:c.lapses||0}):null;})
      .filter(Boolean);
    const byDue=new Map();
    for(const w of dueList){
      if(!byDue.has(w.due))byDue.set(w.due,[]);
      byDue.get(w.due).push(w);
    }
    const due=[...byDue.keys()].sort().reduce((acc,k)=>acc.concat(shuffled(byDue.get(k),rand)),[]);

    const freshToday=cards.filter(c=>c.learnedAt===date).length;
    const freshLeft=Math.max(0,dailyNew-freshToday)+bonus;
    const pool=this.poolOf(uid);
    const poolSeen=cards.filter(c=>pool.some(w=>w.id===c.wordId)).length;
    const fresh=[];
    for(const w of shuffled(pool,rand)){
      if(fresh.length>=freshLeft)break;
      if(!seen.has(w.id)&&!parked.has(w.id))fresh.push(this.wordView(w,{stage:0,status:'new'}));
    }

    const unseen=pool.length-poolSeen;
    const cats=s.cats;
    return {
      date,
      plan:{dailyNew,freshToday,freshLeft,unseen,more:unseen>fresh.length,parked:this.parkedOf(uid).length,
        cats, scope:(cats&&cats.length)?cats:DEFAULT_CATS, defaultCats:DEFAULT_CATS, pool:pool.length},
      due,
      fresh,
      doneToday:cards.filter(c=>c.lastAt===date).length,
      stats:{...srs.summarize(cards,date),total:pool.length},
      tomorrow:srs.upcoming(cards,date,1)
    };
  }

  // 一次评价 = 一次复习。新词第一次被评价时才落库，所以反复打开页面不会把配额吃掉。
  review(uid,input){
    const word=wordBank().BY_ID.get(input&&typeof input.wordId==='string'?input.wordId:'');
    if(!word)fail('词库里没有这个词');
    const grade=input.grade;
    if(!srs.GRADES.includes(grade))fail('评价无效');

    const date=this.dateOf(uid);
    let card=this.cardsOf(uid).find(c=>c.wordId===word.id);
    if(!card){
      // 没学过的词都能开始学：配额只是「今天先给你几个」，不是墙。
      // 想接着学就接着学，不用等明天。
      card={id:'card-'+uid+'-'+word.id,userId:uid,...srs.blankCard(word.id,date)};
      this.db.word_cards.push(card);
    }

    Object.assign(card,srs.apply(card,grade,date));
    this.markLearning(uid,date);
    this.save();

    return Object.assign(this.today(uid),{last:{wordId:word.id,grade,stage:card.stage,due:card.due,status:card.status}});
  }

  // 例句里点到的词：收进词库，从明天起按记忆曲线来。
  // 只做「收进来」这一件事 —— 级数不动、不算一次复习，排期等你真评价了再说。
  // 反复点同一个词不会重复建卡，也不会把「今天学过了」刷两遍。
  touch(uid,input){
    const word=wordBank().BY_ID.get(input&&typeof input.wordId==='string'?input.wordId:'');
    if(!word)fail('词库里没有这个词');
    const date=this.dateOf(uid);
    let card=this.cardsOf(uid).find(c=>c.wordId===word.id);
    let added=false;
    if(!card){
      card={id:'card-'+uid+'-'+word.id,userId:uid,...srs.blankCard(word.id,date),due:srs.shift(date,1)};
      this.db.word_cards.push(card);
      added=true;
      this.markLearning(uid,date);
      this.save();
    }
    return {
      date,added,
      card:{stage:card.stage,status:card.status,due:card.due,learnedAt:card.learnedAt,lastAt:card.lastAt||null,lapses:card.lapses||0},
      word:this.wordView(word,{stage:card.stage,status:card.status,due:card.due})
    };
  }

  // 「我的词库」：学过的词全在这，随时进来翻。看得多不算复习，不改记忆曲线排期。
  vocab(uid){
    const date=this.dateOf(uid);
    const cards=this.cardsOf(uid)
      .map(c=>{
        const w=wordBank().BY_ID.get(c.wordId);
        if(!w)return null;
        return this.wordView(w,{stage:c.stage,status:c.status,due:c.due,learnedAt:c.learnedAt,lastAt:c.lastAt||null,lapses:c.lapses||0});
      })
      .filter(Boolean)
      // 已记住的沉到底，其余按复习日从近到远
      .sort((a,b)=>(a.status==='known'?1:0)-(b.status==='known'?1:0)||a.due.localeCompare(b.due)||a.no-b.no);
    return {
      date,
      stats:{...srs.summarize(cards,date),total:wordBank().WORDS.filter(w=>!w.ref).length},
      dueCount:cards.filter(c=>c.status!=='known'&&c.due<=date).length,
      cards
    };
  }

  // 学一个词就算今天学过了：英文项目自动打勾，不用再手动点一次。
  markLearning(uid,date){
    try{
      let p=this.db.projects.find(p=>p.userId===uid&&p.kind==='learning');
      if(!p){
        let c=this.db.categories.find(c=>c.userId===uid&&c.name==='英文学习');
        if(!c)c=this.h.createCategory(uid,{name:'英文学习'});
        p=this.h.createProject(uid,{categoryId:c.id,name:'每天学几个词',kind:'learning',goal:{period:'weekly',target:7}},true);
      }
      if(!this.db.checkins.some(c=>c.userId===uid&&c.projectId===p.id&&c.date===date))
        this.db.checkins.push({id:'english:'+uid+':'+date,userId:uid,projectId:p.id,date,timeZone:this.h.s.user(uid).timeZone,confirmed:true,source:'learning',createdAt:this.h.s.clock()});
    }catch(e){ /* 打卡是附带动作，不能因为它让学词失败 */ }
  }
}
module.exports={Learning,get WORDS(){return wordBank().WORDS;},hash32,rngFrom,shuffled,DEFAULT_CATS};
