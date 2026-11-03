const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs'),path=require('node:path');
const root=path.join(__dirname,'../miniprogram');
function pages(){const app=JSON.parse(fs.readFileSync(path.join(root,'app.json')));return app.pages.map(r=>({route:r,wxml:fs.readFileSync(path.join(root,r+'.wxml'),'utf8')}));}
function keys(source,re){const out=[];for(const m of source.matchAll(re))out.push(m[1]);return out;}

test('说明圆点：点开、再点收起、同时只开一个',()=>{
  const tip=require(path.join(root,'utils/tip.js'));
  const page={data:Object.assign({},tip.data),setData(o){Object.assign(this.data,o);},toggleTip(e){tip.toggle.call(this,e);}};
  assert.equal(page.data.tip,'','默认全部收起');
  page.toggleTip({currentTarget:{dataset:{tip:'a'}}});
  assert.equal(page.data.tip,'a');
  page.toggleTip({currentTarget:{dataset:{tip:'a'}}});
  assert.equal(page.data.tip,'','再点一下收起');
  page.toggleTip({currentTarget:{dataset:{tip:'b'}}});
  page.toggleTip({currentTarget:{dataset:{tip:'c'}}});
  assert.equal(page.data.tip,'c','换一个就关掉上一个');
  tip.close.call(page);
  assert.equal(page.data.tip,'');
});

test('每个说明面板都有对应的圆点，圆点都能点',()=>{
  for(const {route,wxml} of pages()){
    const dots=keys(wxml,/data-tip="([a-zA-Z]+)"/g);
    const panels=keys(wxml,/wx:if="\{\{tip===?'([a-zA-Z]+)'\}\}"/g);
    assert.deepEqual(dots.slice().sort(),panels.slice().sort(),route+' 的圆点和说明面板要一一对应');
    for(const m of wxml.matchAll(/class="info-dot[^"]*"/g))assert.ok(true);
    const dotTags=(wxml.match(/class="info-dot/g)||[]).length;
    assert.equal(dotTags,dots.length,route+' 每个圆点都要带 data-tip');
    assert.equal((wxml.match(/catchtap="toggleTip"/g)||[]).length,dots.length,route+' 圆点要用 catchtap，避免点到外层卡片');
  }
});

test('页面上不再直接铺大段说明：field-note 只剩短状态',()=>{
  for(const {route,wxml} of pages()){
    for(const m of wxml.matchAll(/class="field-note"[^>]*>([^<]+)</g)){
      assert.ok(m[1].length<=60,route+' 这条说明太长，应该收进圆点：'+m[1]);
    }
  }
});
