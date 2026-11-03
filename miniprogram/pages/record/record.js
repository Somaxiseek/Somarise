const {api,error,change}=require('../../utils/api');
const {SPORTS,RULES}=require('../../utils/sports');
const {weeklyCardio,gap,CARDIO_TARGET_MIN}=require('../../utils/guidelines');
const tip=require('../../utils/tip');
// 截图识别开关：个人主体没法微信认证，OCR 云调用永久不可用，见 config/runtime.js 的说明。
const {ocrEnabled:OCR_ENABLED}=require('../../config/runtime');
const TYPES=SPORTS.map(s=>s.type);
// 记录心肺训练时可选的运动类型：只放最基础的几类（2026-11-01：原下拉弹窗类别太多、滑动麻烦，改小胶囊）。
// 不含「其他心肺训练」这种兜底项，避免列表过长；编辑旧 cardio 记录时若当前类型不在其中，会临时补到末尾。
const PICKER_TYPES=['running','incline','walking','swimming','cycling','stairs','ball'];
const PICKER_SPORTS=PICKER_TYPES.map(t=>({type:t,label:(RULES[t]||{}).label||t}));
function pickerChips(type){const base=PICKER_SPORTS.slice();if(type&&!base.some(c=>c.type===type)){const s=RULES[type];if(s)base.push({type:s.type,label:s.label});}return base;}
function localFields(instant){const date=new Date(instant);const minutes=-date.getTimezoneOffset();const local=new Date(date.getTime()+minutes*60000).toISOString();return {date:local.slice(0,10),time:local.slice(11,19),offset:(minutes>=0?'+':'-')+String(Math.floor(Math.abs(minutes)/60)).padStart(2,'0')+':'+String(Math.abs(minutes)%60).padStart(2,'0')};}
// 时间只到分钟：带秒的 16:16:12 既难读又要用户去删，保存时补 :00 就行。
// 强度只有三档，说的都是身体感受（说话测试），不用心率、不用百分比：
//   低 = VT1 以下，不觉得喘；中 = 会喘但能讲完整一句话；高 = 只能断续冒出几个字。
// 折算规则跟服务端 server/goals.js 一致：中 1 倍、高 2 倍、低 0 倍。
const INTENSITIES=[
  {key:'low',label:'低强度',sub:'不觉得喘',note:'散步不用记时长，记一笔就好。这一条不进每周训练量。'},
  {key:'moderate',label:'中等强度',sub:'会喘，但还能讲完整一句话',note:'按 1 倍计入本周，目标是每周 150 分钟。'},
  {key:'vigorous',label:'高强度',sub:'只能断续冒出一两个字',note:'按 2 倍计入，所以每周 75 分钟就够。'}
];
const PARTS=[{key:'upper',label:'上肢'},{key:'lower',label:'下肢'},{key:'full',label:'全身'}];
// 抗阻强度三档（2026-10-30 用户定稿）：打卡时必须登记，强度饼图和教练端都靠它。
// 说明是抗阻语境的，不复用有氧那句「能唱歌是低」。
const STRENGTH_NOTE={
  low:'更像是活动身体、出出汗。记下来就好，下次可以加一点重量或组数。',
  moderate:'标准的力量训练强度，练完肌肉有发酸但动作不变形。',
  vigorous:'很重的一练。恢复日要安排够，同一个部位隔 48 小时再练。'
};
function strengthNoteOf(key){return STRENGTH_NOTE[key]||'选一下这次练到什么程度：动作轻松是低，标准发力是中，接近力竭是高。';}
function noteOf(key){
  // 没选强度时先不说教，选了才给对应的折算说明（用户 10-29：不默认选择）
  if(!key)return '选一下这次有多喘：能唱歌是低，会喘但能说话是中，说不出整话是高。';
  const x=INTENSITIES.find(i=>i.key===key)||INTENSITIES[1];return x.note;
}
// 类型默认 = 上一次保存的选择（用户 10-29 定稿）：常跑步的人进来就是跑步，不用每次再点。
// 强度仍不默认选。从别处带明确意图进来的（?type= / OCR / 编辑）覆盖默认。
const LAST_SPORT_KEY='Somarise.lastSport';
function lastSport(){try{const v=wx.getStorageSync&&wx.getStorageSync(LAST_SPORT_KEY);if(TYPES.includes(v))return v;}catch(e){}return '';}
// 爬楼、球类没有「公里」这种量，记录页不显示距离、也不算配速（只记时长 + 强度即可）。
function showDistanceFor(type){return type!=='ball'&&type!=='stairs';}
function blank(){const t=localFields(Date.now()-60000);return {type:lastSport()||SPORTS[0].type,...t,time:t.time.slice(0,5),timeZone:'Asia/Shanghai',distance:'',durationMin:'',intensity:'moderate',heartRate:'',cadence:'',stroke:'',visibility:'private',source:'manual'};}
// 日期只给一个滚筒下拉（用户 10-29：不记时间点，日期默认今天）：今天/昨天说人话，更早的给「M月D日」
function dateText(d,today,yesterday){return d===today?'今天':d===yesterday?'昨天':(Number(d.slice(5,7))+'月'+Number(d.slice(8,10))+'日');}
function minutesText(sec){return sec%60===0?String(sec/60):String(Math.round(sec/6)/10);}
// 截图识别：手机拍的照片动辄几 MB，把 base64 塞进云函数调用在真机上很容易直接 fail
// （10-30 用户撞到的「无法连接测试云服务」就是这条路）。所以云模式先把图压小再传云存储，
// 只把一个 fileID 交给云函数；本地开发沿用 base64，行为和以前一致。
function shrink(path){return new Promise(resolve=>{try{wx.compressImage({src:path,quality:55,success:r=>resolve(r.tempFilePath),fail:()=>resolve(path)});}catch(e){resolve(path);}});}
function readBase64(path){return new Promise((resolve,reject)=>wx.getFileSystemManager().readFile({filePath:path,encoding:'base64',success:r=>resolve(r.data),fail:reject}));}
async function readDraft(tempFilePath){
  const app=getApp();
  if(app.globalData.mode==='wechat-cloud'){
    if(!wx.cloud||!wx.cloud.uploadFile)throw new Error('当前微信版本传不了图，请更新微信或手动填写');
    const small=await shrink(tempFilePath);
    const cloudPath='ocr/'+Date.now()+'-'+Math.random().toString(36).slice(2)+'.jpg';
    let fileID='';
    try{const up=await new Promise((resolve,reject)=>wx.cloud.uploadFile({cloudPath,filePath:small,success:resolve,fail:reject}));fileID=up.fileID;}
    catch(e){throw new Error('图片没传上去，检查下网络再试，或手动填写');}
    return api('/ocr','POST',{fileID});
  }
  const image=await readBase64(tempFilePath);
  if(image.length>2800000)throw new Error('请选择小于2MB的图片');
  return api('/ocr','POST',{image});
}
Page({popupNoop(){},dismissCelebrate(){this.setData({celebrate:false});},data:{ocrEnabled:OCR_ENABLED,tip:'',form:blank(),typeIndex:Math.max(0,TYPES.indexOf(blank().type)),durOnly:false,celebrate:false,mode:'cardio',part:'full',intensities:INTENSITIES,parts:PARTS,intensityNote:noteOf('moderate'),strengthIntensity:'moderate',strengthNote:strengthNoteOf('moderate'),sportLabels:SPORTS.map(s=>s.label),pickerSports:pickerChips(blank().type),dateText:dateText(blank().date,localFields(Date.now()).date,localFields(Date.now()-86400000).date),sports:SPORTS.map(s=>({type:s.type,label:s.label})),today:localFields(Date.now()).date,yesterday:localFields(Date.now()-86400000).date,busy:false,showDistance:true,metric:'请填写距离与时长'},toggleTip(e){tip.toggle.call(this,e);},pickIntensity(e){const key=e.currentTarget.dataset.intensity;this.setData({'form.intensity':key,intensityNote:noteOf(key)});this.preview();},pickStrengthIntensity(e){const key=e.currentTarget.dataset.intensity;this.setData({strengthIntensity:key,strengthNote:strengthNoteOf(key)});},pickPart(e){this.setData({part:e.currentTarget.dataset.part});},onShow(){this.syncGuide();},syncGuide(){try{const home=getApp().globalData.home;if(!home)return;
    // 优先用服务端算好的本周有氧（已按强度折算），拿不到再退回本地估算
    const week=(home.goals&&home.goals.week)||[];const c=week.find(i=>i.key==='cardio');
    if(c&&c.target>0){this.setData({cardioGuide:{current:c.current,target:c.target,remain:Math.max(0,c.target-c.current),percent:Math.min(100,Math.round(c.current/c.target*100))}});return;}
    if(!Array.isArray(home.activities))return;const w=weeklyCardio(home);const target=w.target||CARDIO_TARGET_MIN;this.setData({cardioGuide:{current:w.current,target,remain:gap(w),percent:Math.min(100,Math.round(w.current/target*100))}});}catch(e){}},onLoad(q){this.requestId=Date.now()+'-'+Math.random().toString(36).slice(2);this.id=q.id;this.projectId=q.projectId||null;this.projectType=q.projectId?q.type:null;this.setData({projectBound:!!q.projectId,editing:!!q.id,mode:q.mode==='strength'?'strength':'cardio'});if(!q.id){const form=blank();if(TYPES.includes(q.type))form.type=q.type;if(q.date)form.date=q.date;this.setData({form,typeIndex:Math.max(0,TYPES.indexOf(form.type)),durOnly:!!(RULES[form.type]&&RULES[form.type].minDuration),showDistance:showDistanceFor(form.type),pickerSports:pickerChips(form.type),dateText:dateText(form.date,this.data.today,this.data.yesterday)});}if(q.id){const a=getApp().globalData.home.activities.find(a=>a.id===q.id);if(a){this.projectType=a.projectId?a.type:null;this.setData({projectBound:!!a.projectId});this.fill(a);}}if(!q.id&&q.from){try{wx.setNavigationBarTitle({title:'再来一次'});}catch(e){}this.setData({copying:true});const home=getApp().globalData.home;const src=((home&&home.activities)||[]).find(a=>a.id===q.from);if(src){this.fill(src);this.freshTime();}else this.copyFrom(q.from);}if(q.part&&['upper','lower','full'].indexOf(q.part)>=0)this.setData({part:q.part});if(q.ocr&&OCR_ENABLED)this.chooseImage();},fill(a){const t=localFields(a.occurredAt);this._exactTime={shown:t.time.slice(0,5),full:t.time};const form={...a,...t,time:t.time.slice(0,5),intensity:a.intensity||'moderate',heartRate:a.heartRate??'',cadence:a.cadence??'',stroke:a.stroke??'',distance:a.type==='swimming'?a.distanceM:a.distanceM/1000,durationMin:a.durationSec?minutesText(a.durationSec):''};delete form.durationSec;this.setData({form,typeIndex:Math.max(0,TYPES.indexOf(a.type)),durOnly:!!RULES[a.type].minDuration,showDistance:showDistanceFor(a.type),pickerSports:pickerChips(a.type),intensityNote:noteOf(form.intensity),dateText:dateText(form.date,this.data.today,this.data.yesterday)});this.preview();},
  // 「再来一次」预填的是这一笔的内容，但日期和时间要是「现在」：
  // 用户是在说「我又做了一遍」，不是补录历史。原记录的时间不能带过来。
  freshTime(){const t=localFields(Date.now()-60000);this._exactTime=null;this.setData({'form.date':t.date,'form.time':t.time.slice(0,5),dateText:dateText(t.date,this.data.today,this.data.yesterday)});},
  // 「再来一次」可能从记录页直接进来，那时首页缓存（globalData.home）还没人拉过，
  // 光靠它找原记录会拿到空表单。兜底：现拉一次 /home 再填。
  async copyFrom(id){try{let home=getApp().globalData.home;let src=((home&&home.activities)||[]).find(a=>a.id===id);if(!src){const d=new Date();home=await api('/home?month='+d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0'));getApp().globalData.home=home;src=((home&&home.activities)||[]).find(a=>a.id===id);}if(!src){wx.showToast({title:'找不到这条记录，手动填一下吧',icon:'none'});return;}this.fill(src);this.freshTime();}catch(e){error(e);}},input(e){this.setData({['form.'+e.currentTarget.dataset.key]:e.detail.value});this.preview();},pickType(e){const type=e.currentTarget.dataset.type;if(!RULES[type]||type===this.data.form.type)return;if(this.id){wx.showToast({title:'编辑记录时不能更换类型',icon:'none'});return;}const wasBound=this.data.projectBound;this.projectId=null;this.projectType=null;this.setData({'form.type':type,'form.distance':'','form.stroke':'','form.cadence':'',typeIndex:Math.max(0,TYPES.indexOf(type)),durOnly:!!RULES[type].minDuration,showDistance:showDistanceFor(type),projectBound:false});if(wasBound){const label=(SPORTS.find(s=>s.type===type)||{}).label||'';wx.showToast({title:'保存后自动归入「'+label+'」',icon:'none'});}this.preview();},pickDate(e){const value=e.detail&&e.detail.value;if(!value)return;this.setData({'form.date':value,dateText:dateText(value,this.data.today,this.data.yesterday)});},share(e){this.setData({'form.visibility':e.detail.value?'groups':'private'});},preview(){const f=this.data.form;const mins=Number(f.durationMin),s=mins>0?Math.round(mins*60):0;const d=Number(f.distance)*(f.type==='swimming'?1:1000);if(d>0&&s>0&&this.data.showDistance){if(f.type==='cycling'){this.setData({metric:(d/s*3.6).toFixed(2)+' km/h'});return;}const pace=Math.round(s/d*(f.type==='swimming'?100:1000));this.setData({metric:'配速 '+Math.floor(pace/60)+':'+String(pace%60).padStart(2,'0')+(f.type==='swimming'?' /100m':' /km')});return;}if(f.intensity==='low'&&!s&&!d){this.setData({metric:'散步 · 记一笔就好，不计入训练量'});return;}if(s>0){this.setData({metric:(mins%1?mins.toFixed(1):mins)+' 分钟'+(this.data.durOnly?'':' · 填了距离会算配速')});return;}this.setData({metric:'请填写运动时长'});},async chooseImage(){if(this.id)return;this.cancelled=false;try{const pick=await new Promise((resolve,reject)=>wx.chooseMedia({count:1,mediaType:['image'],sizeType:['compressed'],success:resolve,fail:reject}));const file=pick.tempFiles[0];this.setData({busy:true});const r=await readDraft(file.tempFilePath);if(this.cancelled)return;if(this.projectType&&r.draft.type!==this.projectType)throw new Error('识别类型与所选项目不一致，请手动填写或选择正确项目');this.fill(r.draft);if(!r.draft.intensity)this.setData({'form.intensity':''});this.setData({notice:r.draft.warnings.join(' · ')});if(r.cleanupPending)throw new Error('临时资源清理待重试，请勿重复上传');}catch(e){if(!this.cancelled&&!String(e.errMsg||'').includes('cancel'))error(e.message?e:new Error('图片处理失败，可改为手动填写'));}finally{this.setData({busy:false});}},cancel(){this.cancelled=true;wx.navigateBack();},onUnload(){this.cancelled=true;},async save(){if(this.data.busy)return;if(this.data.mode==='strength')return this.saveStrength();const f=this.data.form;try{if(!f.type)throw new Error('先在下面选一个运动类型');if(!f.intensity)throw new Error('选一下这次有多喘');const low=f.intensity==='low';const mins=Number(f.durationMin);if(!low&&(!Number.isFinite(mins)||mins<=0))throw new Error('请填写运动时长（分钟）');if(low&&String(f.durationMin||'').trim()!==''&&(!Number.isFinite(mins)||mins<0))throw new Error('请填写有效运动时长');const durationSec=Number.isFinite(mins)?Math.round(mins*60):0;if(!/^([+-])(0\d|1[0-4]):[0-5]\d$/.test(f.offset))throw new Error('时间信息异常，请重新进入页面');if(!/^\d{2}:\d{2}(:\d{2})?$/.test(f.time))throw new Error('时间格式为 HH:mm:ss');const exact=(this._exactTime&&f.time===this._exactTime.shown)?this._exactTime.full:f.time;const occurredAt=f.date+'T'+exact+(exact.length===5?':00':'')+f.offset;const body={...f,projectId:this.projectId||f.projectId,occurredAt,distanceM:Number(f.distance||0)*(f.type==='swimming'?1:1000),durationSec,intensity:f.intensity||'moderate',heartRate:f.heartRate==null||f.heartRate===''?null:Number(f.heartRate),cadence:f.cadence==null||f.cadence===''?null:Number(f.cadence),stroke:f.stroke||null,confirmed:true,requestId:this.requestId};delete body.durationMin;body.distanceM=Math.round(body.distanceM*1000000)/1000000;this.setData({busy:true});await api('/activities'+(this.id?'/'+this.id:''),this.id?'PUT':'POST',body);change();try{wx.setStorageSync&&wx.setStorageSync(LAST_SPORT_KEY,f.type);}catch(err){}try{wx.vibrateShort&&wx.vibrateShort({type:'medium'});}catch(err){}getApp().globalData.pendingHealthTip=false;this.setData({celebrate:true});setTimeout(()=>wx.navigateBack(),1100);}catch(e){error(e);}finally{this.setData({busy:false});}},
  // 抗阻只记「练了哪一块」：时长在各自的训练 App 里，这里不重复记一遍。
  // 没有抗阻项目就顺手建一个「力量训练」，不让用户先跑去建项目再回来打卡。
  async saveStrength(){const f=this.data.form;try{if(!this.data.strengthIntensity)throw new Error('选一下这次练到什么程度');this.setData({busy:true});const project=await api('/strength-project','POST',{});await api('/projects/'+project.id+'/checkins','POST',{date:f.date,part:this.data.part,intensity:this.data.strengthIntensity,confirmed:true,requestId:this.requestId});change();try{wx.vibrateShort&&wx.vibrateShort({type:'medium'});}catch(err){}this.setData({celebrate:true});setTimeout(()=>wx.navigateBack(),1100);}catch(e){error(e);}finally{this.setData({busy:false});}},remove(){wx.showModal({title:'删除这条运动记录？',content:'删除后不可恢复，相关统计会重新计算。',confirmText:'删除',success:async r=>{if(r.confirm)try{await api('/activities/'+this.id,'DELETE');change();wx.navigateBack();}catch(e){error(e);}}});},onReady(){this.setData({editing:!!this.id});}});
