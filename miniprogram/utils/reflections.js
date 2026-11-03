const entries=[{"text":"像水一样，保持流动。","kind":"translation","source":"https://brucelee.com/philosophies"},{"text":"以无法为有法，以无限为有限。","kind":"translation","source":"https://brucelee.com/philosophies"},{"text":"忠于自己，表达自己，相信自己。","kind":"translation","source":"https://brucelee.com/philosophies"},{"text":"做一个以行动支撑梦想的人。","kind":"translation","source":"https://brucelee.com/philosophies"},{"text":"随着变化而变化。","kind":"translation","source":"https://brucelee.com/philosophies"},{"text":"研究自己的经验。","kind":"translation","source":"https://brucelee.com/philosophies"},{"text":"吸收有用的，舍弃无用的。","kind":"translation","source":"https://brucelee.com/philosophies"},{"text":"加入真正属于自己的东西。","kind":"translation","source":"https://brucelee.com/philosophies"},{"text":"继续前行。","kind":"translation","source":"https://brucelee.com/philosophies"},{"text":"去掉不必要的，回到本质。","kind":"translation","source":"https://brucelee.com/podcast-blog/2017/6/28/52-hack-away-the-unessentials"},{"text":"不困在一种形式里，给自己留下变化的空间。","kind":"inspired","source":"https://brucelee.com/philosophies"},{"text":"柔软与力量，可以存在于同一个人身上。","kind":"inspired","source":"https://brucelee.com/philosophies"},{"text":"让方法适应你，而不是让你困在方法里。","kind":"inspired","source":"https://brucelee.com/philosophies"},{"text":"今天的练习，从诚实地认识自己开始。","kind":"inspired","source":"https://brucelee.com/philosophies"},{"text":"把注意力放回此刻这一组。","kind":"inspired","source":"https://brucelee.com/philosophies"},{"text":"少一点装饰，多一点扎实的行动。","kind":"inspired","source":"https://brucelee.com/philosophies"},{"text":"练习表达自己，不必复制别人。","kind":"inspired","source":"https://brucelee.com/philosophies"},{"text":"从自己的体验里，找到真正有效的方法。","kind":"inspired","source":"https://brucelee.com/philosophies"},{"text":"把有用的留下，让多余的离开。","kind":"inspired","source":"https://brucelee.com/philosophies"},{"text":"改变方法，也是一种前进。","kind":"inspired","source":"https://brucelee.com/philosophies"},{"text":"给身体空间，也给心留一点空白。","kind":"inspired","source":"https://brucelee.com/philosophies"},{"text":"不急着证明自己，先把这一刻做好。","kind":"inspired","source":"https://brucelee.com/philosophies"},{"text":"保持开放，才有机会学到新的东西。","kind":"inspired","source":"https://brucelee.com/philosophies"},{"text":"练习之后，听听自己的感受。","kind":"inspired","source":"https://brucelee.com/philosophies"},{"text":"训练可以有计划，也要能回应变化。","kind":"inspired","source":"https://brucelee.com/philosophies"},{"text":"不追求花哨，追求清楚、直接。","kind":"inspired","source":"https://brucelee.com/philosophies"},{"text":"让每一次练习，都更接近真实的自己。","kind":"inspired","source":"https://brucelee.com/philosophies"},{"text":"把梦想放进今天的一次行动。","kind":"inspired","source":"https://brucelee.com/philosophies"},{"text":"带着觉察练习，带着经验继续走。","kind":"inspired","source":"https://brucelee.com/philosophies"},{"text":"稳稳向前，也可以像水一样轻盈。","kind":"inspired","source":"https://brucelee.com/philosophies"}];
// Original practice prompts are explicitly distinguished from attributed quotations.
const sources={idoHome:'https://www.idoportal.com/',idoCulture:'https://www.idoportal.com/culture/',idoPractice:'https://www.idoportal.com/blog/',leeSelf:'https://brucelee.com/podcast-blog/2016/8/3/4-honestly-express-yourself',leeSimple:'https://brucelee.com/podcast-blog/2017/6/28/52-hack-away-the-unessentials'};
for(const e of entries)e.author='李小龙';
function add(author,kind,source,texts){for(const text of texts)entries.push({text,author,kind,source});}
add('Ido Portal','quote',sources.idoHome,[
 'Live life dynamically. MOVE. MORE.',
 'Movement is big.',
 'Leading is done from the front.',
 'There is always a better way, so find it.'
]);
add('Ido Portal 官网','quote',sources.idoCulture,['No one can be a master of all movement pursuits.']);
add('Ido Portal','inspired',sources.idoHome,[
 '把练习带进生活，不只留在训练里。','今天多探索一种移动方式。','先实践，再谈理解。','好方法也值得继续打磨。','别让擅长成为探索的边界。','练习者的身份，比流派更宽。','让好奇心带着身体出发。','用自己的练习支持自己的表达。','把身体当成探索世界的伙伴。','完成一次训练，也继续观察生活。','不只增加难度，也改善过程。','熟悉的方法，不必成为唯一的方法。','边做边研究，边研究边改变。','把今天的发现带进下一次练习。','走出熟悉的动作，看看还有什么。','让行动走在漂亮的解释前面。','把精力放在练习本身。','学习一种方法，也看见它的边界。'
]);
add('Ido Portal','inspired',sources.idoCulture,[
 '跨过项目的边界，交换新的问题。','专业很深，身体的世界也很宽。','向不同领域的练习者学习。','让力量、协调与表达相遇。','看见动作，也看见动作背后的意图。','今天做学生，不急着做大师。','不必会所有动作，仍可以持续学习。','在差异中寻找值得借鉴的东西。','借别人的视角，重新观察自己。','训练之外，也有身体的语言。','把技巧放回完整的身体里。','关注能力，也关注你如何使用它。','不同的练习，可以彼此照亮。','别急着给身体贴上单一标签。','研究一个细节，也保持宽阔的视野。','保留专长，同时欢迎新经验。','交流不是比较谁更厉害。','让练习成为对话。'
]);
add('Ido Portal','inspired',sources.idoPractice,[
 '试着改变节奏，重新认识熟悉的动作。','把简单的动作，练出新的层次。','在限制里，寻找另一种解法。','同一个动作，也能有不同的质感。','探索不总需要增加重量。','观察过渡，不只观察终点。','带着问题练习，比机械重复更有趣。','让身体尝试一个不同的方向。','给即兴留一点空间。','今天研究一个小细节。','把已知动作重新组合。','先看清自己如何移动。','有意识地尝试，也认真地观察。','从简单形式里，发现复杂的可能。','练习质量，值得单独花时间。','变化一个条件，观察身体的回答。','把一次尝试当成一次研究。','不急着追逐答案，先感受问题。','让探索保持具体，让练习保持鲜活。'
]);
add('李小龙','quote',sources.leeSelf,[
 'Research your own experience.',
 'Absorb what is useful, reject what is useless and add what is essentially your own.'
]);
add('李小龙','quote',sources.leeSimple,[
 'Hack away the unessentials.',
 'The closer to the source, the less wastage there is.'
]);
add('李小龙','inspired',sources.leeSelf,[
 '借鉴别人，也验证自己的感受。','把练习变成认识自己的机会。','不为模仿一个形象而训练。','观察自己，比急着评价自己更有用。','允许经验修正原来的想法。','把学到的方法放进实际体验。','认真表达自己，不必表演别人。','留意自己的习惯，也看见新的选择。','不用别人的样子衡量每一步成长。','用实践检验今天的理解。','学习之后，形成自己的判断。','找到适合自己的表达方式。','带着诚实练习，而不是带着角色练习。'
]);
add('李小龙','inspired',sources.leeSimple,[
 '把多余的步骤减掉，让行动更直接。','简单不是草率，而是清楚。','先把基础做明白。','少追逐形式，多理解目的。','给每个动作一个清楚的理由。','不需要的装饰，可以放下。','在熟悉的基础里继续深入。','减少干扰，把注意力还给练习。','保留有效的部分，放下多余的负担。','清楚地做一件事，胜过忙乱地做许多事。','删去一个多余步骤，也是一种进步。','让方法更简洁，让体验更清晰。','不以复杂证明价值。'
]);

add('Ido Portal','quote','https://www.hubermanlab.com/episode/ido-portal-the-science-and-practice-of-movement',[
 "It's important to stay within the experiences.",
 'There is no winning concept.',
 "We're constantly in a dynamic exchange, cultural exchange."
]);
add('Ido Portal','quote','https://www.hubermanlab.com/episode/movement-practice-to-strengthen-your-mind-body-connection-ido-portal',[
 'We need better education, and we need better tools.'
]);
add('Ido Portal','quote',sources.idoPractice,[
 'Stay on the move.',"Don't get attached.",'Movement Practice COUNTS.','There are other tools besides techniques.','SAVE YOUR PRACTICE.'
]);
add('李小龙','translation','https://brucelee.com/podcast-blog/2016/7/27/3',[
 '知道还不够，我们必须应用；愿意还不够，我们必须行动。'
]);
add('李小龙','quote','https://brucelee.com/podcast-blog/2016/9/21/11-walk-on',['Walk on.']);
add('李小龙','quote','https://brucelee.com/podcast-blog/2018/4/11/93-conquer-yourself-part-2-the-keys',[
 'True mastery stems from mastery of oneself.',
 'A man is born to achieve great things if he can conquer himself.'
]);
add('李小龙','quote','https://brucelee.com/podcast-blog/2017/9/12/63-research-your-own-experience',[
 'Become real, learn to take a stand, develop your center to the support of your total personality. Release to spontaneity.'
]);

function pick(){let bag=wx.getStorageSync('somactive-reflections-bag-v3');if(!Array.isArray(bag)||!bag.length||bag.some(i=>!Number.isInteger(i)||i<0||i>=entries.length)){bag=entries.map((_,i)=>i);for(let i=bag.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[bag[i],bag[j]]=[bag[j],bag[i]]}}const previous=wx.getStorageSync('somactive-reflections-last');if(bag.length>1&&bag[bag.length-1]===previous)[bag[0],bag[bag.length-1]]=[bag[bag.length-1],bag[0]];const index=bag.pop();wx.setStorageSync('somactive-reflections-bag-v3',bag);wx.setStorageSync('somactive-reflections-last',index);return entries[index]}function current(){const index=wx.getStorageSync('somactive-reflections-last');return Number.isInteger(index)?entries[index]:undefined;}module.exports={entries,pick,current};
