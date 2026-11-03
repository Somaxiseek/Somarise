'use strict';
// 词根词缀拆分（用户 10-30：monounsaturated fat 这类词要把词根词缀分开来）。
//
// 原则：
//   · 只给「难词」拆 —— 配合 word-levels 的难度档，入门词不拆（认识它的人不需要），
//     词长 ≥8 且能被词根/词缀完整覆盖才拆，拆不了宁可不显示（不出「把 cat 拆成 ca+t」的笑话）。
//   · 拆出来的每一段都带汉语释义，连成一个「小故事」：mono-（一）+ saturat（饱和）+ -ed（…的）。
//   · 表里的释义尽量用生活话，不用术语。

// 常见前缀：形 → 义
const PREFIX = {
  mono: '一', poly: '多', bi: '双', tri: '三', semi: '半', hemi: '半',
  hyper: '过度/过高', hypo: '不足/过低', super: '上/超', supra: '上', sub: '下/次', infra: '下',
  inter: '之间', intra: '内', extra: '外', intro: '入内', peri: '周围', circum: '环绕',
  trans: '横穿', ultra: '极端', ante: '前', pre: '前', post: '后', fore: '前',
  re: '再/又', de: '去掉/反向', dis: '不/分开', un: '不', in: '不/向内', im: '不/向内',
  mis: '错', non: '非', anti: '抗/反', counter: '反', contra: '反',
  over: '过度', under: '不足', out: '超过', auto: '自己', co: '共同',
  micro: '微小', macro: '大', mega: '巨大', multi: '多', omni: '全',
  mal: '坏', bene: '好', homo: '同', hetero: '异', homeo: '相似/稳态',
  en: '使进入', pro: '向前', meta: '变/超'
};

// 常见后缀：形 → 义（按长度优先匹配）
const SUFFIX = [
  ['ization', '（…化）'], ['isation', '（…化）'], ['ility', '（…性）'], ['ability', '（可…性）'], ['ibility', '（可…性）'],
  ['ation', '（动作/结果）'], ['ition', '（动作/状态）'], ['ution', '（动作/结果）'], ['ance', '（状态）'],
  ['ology', '…学'], ['ography', '…记录/学科'], ['ism', '（状态/学说）'],
  ['ment', '（结果/状态）'], ['ness', '（性质）'], ['ship', '（身份/关系）'], ['able', '可…的'],
  ['ible', '可…的'], ['ful', '充满…的'], ['less', '无…的'], ['ous', '多…的'], ['ious', '多…的'],
  ['ive', '…性的'], ['etic', '…的'], ['ical', '…的'], ['ic', '…的'], ['al', '…的'],
  ['ify', '使…化'], ['ize', '使…化'], ['ise', '使…化'], ['ate', '使/带…'], ['en', '使…'],
  ['itis', '…炎症'], ['osis', '（病症）'], ['algia', '…痛'], ['emia', '…血症'], ['trophy', '（营养/生长）'],
  ['ed', '（…的）'], ['ly', '（副词）'], ['ty', '（性质）'], ['y', '（状态）']
].sort((a, b) => b[0].length - a[0].length);

// 常见词根（健身/健康/学术向）：形 → 义
const ROOT = {
  saturat: '饱和', nutr: '营养', card: '心', cardi: '心', vas: '血管', vascular: '血管',
  pulmon: '肺', gastr: '胃', enter: '肠', hepat: '肝', ren: '肾', nephr: '肾',
  oste: '骨', chondr: '软骨', my: '肌', myo: '肌', sarc: '肌/肉', tend: '腱',
  lig: '绑/韧带', arthr: '关节', dactyl: '指/趾', cephal: '头', encephal: '脑',
  neur: '神经', derm: '皮肤', hem: '血', hemat: '血', glyc: '糖', gluc: '糖',
  lip: '脂', adip: '脂', prote: '蛋白', pept: '消化/肽', amyl: '淀粉',
  hydr: '水', hydro: '水', aer: '气/氧', therm: '热', metab: '代谢', bol: '抛/代谢',
  kine: '动', cin: '动', mot: '动', mob: '动', ped: '足', pod: '足', man: '手',
  dors: '背', ventr: '腹', later: '侧', medi: '中间', poster: '后', anter: '前',
  flex: '弯', tens: '伸紧', extend: '伸', rot: '转', vert: '转', duc: '牵引',
  tract: '拉', press: '压', pos: '放置', struct: '建造', ject: '投掷', spect: '看',
  vis: '看', aud: '听', dict: '说', log: '道理/说', graph: '写', scrib: '写', script: '写',
  cept: '拿取', capt: '抓取', mit: '送', miss: '送', port: '搬运', fer: '带来',
  fin: '界限', sol: '太阳/单独', lun: '月', ann: '年', tempor: '时间', chron: '时间',
  terr: '地', aqu: '水', bio: '生命', zo: '动物', gen: '产生', cred: '相信',
  memor: '记忆', cogn: '知道', sci: '知道', sent: '感觉', sens: '感觉', path: '感受/病',
  phil: '喜爱', phobia: '恐惧', scope: '看/镜', phon: '声音', luc: '光', lumin: '光',
  clar: '清楚', dur: '持久', val: '价值/强', vac: '空', popul: '人群', civi: '公民',
  physi: '身体/自然', psych: '心智', som: '身体', stas: '站立/稳态', stat: '站立',
  clin: '倾斜', grav: '重', bar: '压力', ox: '氧', capn: '二氧化碳',
  phag: '吃', gnath: '下巴', calcane: '跟骨',
  ilio: '髂骨', ischi: '坐骨', pub: '耻骨', femor: '大腿骨', tibi: '胫骨',
  fibul: '腓骨', patell: '膝盖骨', scapul: '肩胛', clavic: '锁骨', cervic: '颈',
  thorac: '胸', lumb: '腰', sacr: '骶骨', coccyg: '尾骨', brachi: '臂', cubit: '肘',
  carp: '腕', phalang: '指骨', tal: '距骨', calc: '钙/跟', navicul: '舟骨',
  cune: '楔', cuboid: '骰骨', scaph: '舟', luna: '月骨', mer: '部分', meter: '测量',
  scop: '看', troph: '营养/生长', plasia: '生长/形成', sthen: '力量', asthen: '无力',
  carb: '碳', chole: '胆', sterol: '甾醇', palp: '跳/摸', palpit: '跳/摸', fals: '假', ifi: '使',
  crastin: '明天'
};

// 把一段剥干净：大小写、连字符、撇号变体
const norm = s => s.toLowerCase();

// 尝试拆一个单词（单词 ≥8 字母才值得拆）。成功返回 [{t, zh}]，失败返回 null。
function splitToken(token) {
  return _split(norm(token)) || _split(norm(token).replace(/s$/, '')); // 复数 s 先静默重试
}

function _split(token) {
  let rest = token;
  const parts = [];
  // 最多剥两个前缀（un- / mono- 这类可以叠，但三层以上就是玄学了）
  for (let i = 0; i < 2; i++) {
    const hit = Object.keys(PREFIX)
      .filter(p => rest.startsWith(p) && rest.length - p.length >= 3)
      .sort((a, b) => b.length - a.length)[0];
    if (!hit) break;
    parts.push({ t: hit + '-', zh: PREFIX[hit] });
    rest = rest.slice(hit.length);
  }
  // 剥一个后缀（也可能不剥）
  let suffix = null;
  for (const [suf, zh] of SUFFIX) {
    if (rest.endsWith(suf) && rest.length - suf.length >= 3) { suffix = [suf, zh]; rest = rest.slice(0, -suf.length); break; }
  }
  // 中段必须能被词根完整覆盖（贪心，最多三段；词根之间的连接元音 o 跳过不展示）
  const mid = [];
  let cursor = rest;
  while (cursor.length) {
    const hit = Object.keys(ROOT)
      .filter(r => cursor.startsWith(r))
      .sort((a, b) => b.length - a.length)[0];
    if (!hit) return null;                      // 盖不住，宁可不拆
    mid.push({ t: hit, zh: ROOT[hit] });
    cursor = cursor.slice(hit.length);
    // 希腊/拉丁组合的连接元音：carb-o-hydrate、cardi-o-…，静默吃掉
    if (cursor.length > 1 && cursor[0] === 'o' && mid.length < 3) {
      const next = Object.keys(ROOT)
        .filter(r => cursor.slice(1).startsWith(r) && r.length >= 3)
        .sort((a, b) => b.length - a.length)[0];
      if (next) cursor = cursor.slice(1);
    }
    if (mid.length > 3) return null;
  }
  if (suffix) parts.push(...mid, { t: '-' + suffix[0], zh: suffix[1] });
  else parts.push(...mid);
  // 只有「词缀 + 词根」或「两个以上词根」才算拆得有意义，单根原形不拆
  const meaningful = parts.length >= 2 && (parts.some(p => /[—-]/.test(p.t)) || mid.length >= 2);
  return meaningful ? parts : null;
}

// 对词条拆分：多词短语逐词试，返回第一个成功的拆分。
// onlyLevel：传难度档（来自 word-levels），入门词不拆。
function split(word, wordLevel) {
  if ((wordLevel || 2) < 2) return null;        // 入门词不拆
  for (const token of String(word.w || '').split(/\s+/)) {
    if (token.length < 8) continue;
    const parts = splitToken(token);
    if (parts) return { token, parts };
  }
  return null;
}

// 拆分拼成一行展示文案：mono-（一）+ saturat（饱和）+ -ed（…的）
function join(parts) {
  return parts.map(p => p.t + '（' + p.zh + '）').join(' + ');
}

module.exports = { split, splitToken, join };
