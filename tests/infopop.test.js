// 说明弹层（info-pop）排版守规：长说明必须拆成多行 / 条目（ip-line / ip-bul），
// 不能整段糊在一行里。这条测试挡的是「又有人把一整段说明塞回一个字符串」的回潮。
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const root=path.join(__dirname,'../miniprogram');

function collectWxml(){
  const out=[];
  (function walk(dir){
    for(const e of fs.readdirSync(dir,{withFileTypes:true})){
      const p=path.join(dir,e.name);
      if(e.isDirectory())walk(p);
      else if(e.name.endsWith('.wxml'))out.push(p);
    }
  })(root);
  return out;
}

// 抓出每个 class 含 info-pop 的 <view ...> 到它配平的 </view> 之间的内部内容
function infoPopInners(src){
  const inners=[];const re=/<view\b[^>]*class="[^"]*info-pop[^"]*"[^>]*>/g;let m;
  while((m=re.exec(src))){
    const start=m.index+m[0].length;let depth=1,i=start;
    while(i<src.length&&depth>0){
      if(src.startsWith('<view',i)){depth++;i+=5;}
      else if(src.startsWith('</view>',i)){depth--;i+=7;}
      else i++;
    }
    inners.push(src.slice(start,i-7));
  }
  return inners;
}

const MAX_SINGLE=36; // 单行说明的字数上限，超过就该拆成多行/条目

test('info-pop 不再糊成一段：超长说明必须拆成多行或条目',()=>{
  const viol=[];
  for(const f of collectWxml()){
    const src=fs.readFileSync(f,'utf8');
    for(const inner of infoPopInners(src)){
      if(inner.includes('<view'))continue; // 已结构化（含子 view）
      const text=inner
        .replace(/<!--[\s\S]*?-->/g,'')
        .replace(/\{\{[\s\S]*?\}\}/g,'')
        .replace(/\s+/g,'')
        .trim();
      if(text.length>MAX_SINGLE)viol.push(f+' : '+text);
    }
  }
  assert.deepEqual(viol,[],'这些说明还是一整段，没拆开：\n'+viol.join('\n'));
});

test('info-pop 结构化子样式类存在（ip-lead / ip-line / ip-bul）',()=>{
  const wxss=fs.readFileSync(path.join(root,'app.wxss'),'utf8');
  for(const c of ['.info-pop .ip-lead','.info-pop .ip-line','.info-pop .ip-bul']){
    assert.ok(wxss.includes(c),'缺样式 '+c);
  }
});
