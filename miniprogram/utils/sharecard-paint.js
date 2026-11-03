'use strict';
const {strokeFor,gapFor,arcList}=require('./arcs');
const W=320,H=360,RADIUS=18,RING_BOX=100,RING_CY=124,MAX_W_PAD=48;
const PUNCT='。，、．；：！？…—～」』）》】〕”’';
function squeezeOf(a,b){return a&&b&&PUNCT.includes(a)&&PUNCT.includes(b)?.5:0;}
function roundRectPath(c,x,y,w,h,r){c.beginPath();c.moveTo(x+r,y);c.lineTo(x+w-r,y);c.arcTo(x+w,y,x+w,y+r,r);c.lineTo(x+w,y+h-r);c.arcTo(x+w,y+h,x+w-r,y+h,r);c.lineTo(x+r,y+h);c.arcTo(x,y+h,x,y+h-r,r);c.lineTo(x,y+r);c.arcTo(x,y,x+r,y,r);c.closePath();}
// 分享文字只保留项目与进度；完整记录仍保存在原数据中。
function compactItem(i,col,summary){
 const value=i.valueText||i.shortText||'未设置';
 if(i.key==='move'){
  const raw=String(summary||'').trim();
  const detail=raw.replace(/今天还没有运动记录/g,'未记录').replace(/(?:低|中等|中|高)强度/g,'').replace(/分钟/g,'min').replace(/[；;]/g,' + ').replace(/抗阻[ ·・]+全身/g,'全身抗阻').replace(/抗阻[ ·・]+上肢/g,'上肢抗阻').replace(/抗阻[ ·・]+下肢/g,'下肢抗阻').replace(/\s*[·・]\s*(?=\+|$)/g,'').trim();
  return {label:'运动',value:detail||'未记录'};
 }
 if(i.target>0&&Number.isFinite(Number(i.current))){
  const n=Number(i.current),t=Number(i.target);
  if(i.key==='water'&&col===0)return {label:'饮水',value:Math.round(n/t*100)+'%'};
  const unit=i.key==='cardio'?' min':i.key==='strength'?' 次':i.key==='water'?' 天':'';
  return {label:i.label,value:n+'/'+t+unit};
 }
 return {label:i.label,value:value.replace(/等效分钟|分钟/g,'min').replace(/达标\s*/g,'').replace(/\s*词/g,'').replace(/\s*天/g,' 天')};
}
function paintShareCard(c,width,height,card){if(!c||!card)return false;const scale=width/W;c.save();c.scale(scale,height/H);roundRectPath(c,0,0,W,H,RADIUS);if(c.clip)c.clip();c.fillStyle='#fff';c.fillRect(0,0,W,H);
 function text(str,x,y,size,color='#555',bold=false,max=132){c.textAlign='center';c.fillStyle=color;let n=size;c.font=(bold?'bold ':'')+n+'px sans-serif';while(n>7&&c.measureText(String(str)).width>max){n-=.5;c.font=(bold?'bold ':'')+n+'px sans-serif';}c.fillText(String(str),x,y);}
 function lines(str,x,y,max,limit,size,color){let rows=[''];for(const ch of String(str||'')){c.font=size+'px sans-serif';let last=rows.length-1;if(c.measureText(rows[last]+ch).width>max){if(rows.length===limit){rows[last]=rows[last].slice(0,-1)+'…';break;}rows.push(ch);}else rows[last]+=ch;}rows.forEach((v,i)=>text(v,x,y+i*(size+6),size,color,false,max));}
 c.textAlign='left';c.fillStyle='#34423e';c.font='500 18px sans-serif';c.fillText('Somarise',24,33);c.textAlign='right';c.fillStyle='#72817e';c.font='7px sans-serif';c.fillText(card.date||card.dateEn||'',296,31);c.fillStyle='#dfe8e5';c.fillRect(24,44,272,.5);
 const groups=card.groups||[{title:'今日记录',items:(card.rings||[]).map((v,i)=>({...v,label:'',valueText:''}))},{title:'本周进度',items:[]}];
 groups.slice(0,2).forEach((g,col)=>{const x=col?232:88;text(col?'THIS WEEK':'TODAY',x,64,10,'#536660',true);const values=g.items.map(i=>({percent:i.percent||0,color:i.color,soft:!!(i.recordOnly||i.soft)}));const arcs=arcList(values,RING_BOX,strokeFor(RING_BOX),gapFor(RING_BOX));c.save();c.translate(x-RING_BOX/2,RING_CY-RING_BOX/2);c.lineCap='round';for(const a of arcs){const r=(a.box-a.inset)/2;c.lineWidth=a.inset;c.strokeStyle=a.track;c.beginPath();c.arc(50,50,r,0,Math.PI*2);c.stroke();if(a.percent>0){c.strokeStyle=a.color;c.beginPath();c.arc(50,50,r,-Math.PI/2,-Math.PI/2+a.percent*Math.PI/50);c.stroke();}}c.restore();g.items.slice(0,3).forEach((i,j)=>{const y=192+j*30,v=compactItem(i,col,card.summary);text(v.label,x,y,10,'#536660');text(v.value,x,y+15,12,i.percent>0?'#203a34':'#87928e',true);c.fillStyle=i.color||'#87928e';c.fillRect(x-29,y-6,3,3);});});
 c.fillStyle='#e3ebe6';c.fillRect(144,286,32,1);lines(card.quote,160,312,256,2,12,'#203e33');c.restore();return true;}
module.exports={compactItem,paintShareCard,roundRectPath,squeezeOf,PUNCT,W,H,RADIUS,RING_BOX,RING_CY,MAX_W_PAD};
