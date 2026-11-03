'use strict';
// 把 OCR 出来的一堆文字块，拼成一条运动记录草稿。
// 会员上传的是华为运动健康 / 小米运动健康 / 苹果健身 的详情页截图，各家的排版不一样：
// 有的写「5.02 公里」上面一行大字、下面一行小字标签「距离」，有的写「距离 5.02 公里」。
// 所以取数策略是「先找标签，再看标签前后那一两个块里有没有数字」，不依赖固定排版。
// 一定记住：这只是草稿，字段找不到就留空并写进 warnings，绝不猜一个像样的数字糊过去。

const SPORTS = [
  [/游泳/, 'swimming'],
  [/骑行|单车|自行车|公路车/, 'cycling'],
  [/步行|散步|走路|健走/, 'walking'],
  [/爬山|登山|爬坡|徒步/, 'incline'],
  [/球/, 'ball'],
  [/跑步|慢跑|晨跑|夜跑|越野跑|跑/, 'running'],
  [/有氧|健身|划船|椭圆/, 'cardio'],
];

const DIST_KM = /(\d+(?:\.\d+)?)\s*(?:公里|千米|km|KM|Km)/;
const DIST_M = /(\d+(?:\.\d+)?)\s*(?:米|m)(?![a-zA-Z])/;
const DUR_HMS = /(\d{1,2}):([0-5]\d):([0-5]\d)/;
const DUR_MS = /(\d{1,3}):([0-5]\d)(?!:)/;
const DUR_MIN = /(\d{1,3})\s*(?:分钟|min)/i;
const PACE = /(\d{1,2})\s*['′’`]\s*(\d{1,2})/;
const BPM = /(\d{2,3})\s*(?:bpm|BPM|次\/分)/;
const CLOCK = /(?:^|\s)(\d{1,2}):([0-5]\d)(?!:)/;
const DATE_CN = /(\d{1,2})\s*月\s*(\d{1,2})\s*日/;
const DATE_ISO = /(\d{4})-(\d{2})-(\d{2})/;

const LABELS = {
  distance: /距离|里程/,
  duration: /时长|用时|耗时|运动时间|总时间/,
  heartRate: /心率/,
  cadence: /步频|步幅/,
  pace: /配速/,
  date: /今天|昨天|前天|月.*日|\d{4}-\d{2}-\d{2}/,
};

function textsOf(items) {
  if (!Array.isArray(items)) return [];
  return items
    .map((it) => (typeof it === 'string' ? it : it && it.text))
    .filter((t) => typeof t === 'string')
    .map((t) => t.trim())
    .filter(Boolean);
}

// 标签附近找数：先看下一条（华为是标签在上、数值在下），再看上一条，最多前后 3 条。
function near(texts, index, re) {
  const order = [1, -1, 2, -2, 3, -3];
  for (const step of order) {
    const t = texts[index + step];
    if (t && re.test(t)) {
      const m = t.match(re);
      if (m) return m;
    }
  }
  return null;
}

function pick(texts, labelRe, valueRe) {
  for (let i = 0; i < texts.length; i += 1) {
    if (!labelRe.test(texts[i])) continue;
    const same = texts[i].match(valueRe);
    if (same) return same;
    const found = near(texts, i, valueRe);
    if (found) return found;
  }
  return null;
}

function anywhere(texts, re) {
  for (const t of texts) {
    const m = t.match(re);
    if (m) return m;
  }
  return null;
}

// 大字「5.02」和小字「公里」在截图里是两个文字块，单块都匹配不上单位。
// 兜底把整页拼成一行再找一次，只用在「没有任何标签命中」的时候。
function flat(texts, re) {
  const m = texts.join(' ').match(re);
  return m || null;
}

function distanceMeters(texts) {
  const km = pick(texts, LABELS.distance, DIST_KM) || anywhere(texts, DIST_KM) || flat(texts, DIST_KM);
  if (km) return Math.round(parseFloat(km[1]) * 1000);
  const m = pick(texts, LABELS.distance, DIST_M) || anywhere(texts, DIST_M) || flat(texts, DIST_M);
  if (m) return Math.round(parseFloat(m[1]));
  return null;
}

function secondsOf(h, m, s) {
  return Number(h) * 3600 + Number(m) * 60 + Number(s || 0);
}

function durationSeconds(texts) {
  const hms = pick(texts, LABELS.duration, DUR_HMS) || anywhere(texts, DUR_HMS) || flat(texts, DUR_HMS);
  if (hms) return secondsOf(hms[1], hms[2], hms[3]);
  const ms = pick(texts, LABELS.duration, DUR_MS);
  if (ms) return secondsOf(0, ms[1], ms[2]);
  const min = pick(texts, LABELS.duration, DUR_MIN) || flat(texts, DUR_MIN);
  if (min) return Math.round(parseFloat(min[1]) * 60);
  // 苹果健身这类页面时长就只有一行「32:15」，没有「时长」两个字。
  // 只在页面里没有配速时兜底，且限制在 10 小时以内，免得把配速当时长。
  if (!pace(texts)) {
    const loose = anywhere(texts, /(?:^|\s)(\d{1,3}):([0-5]\d)(?!:)/);
    if (loose && Number(loose[1]) <= 600) return secondsOf(0, loose[1], loose[2]);
  }
  return null;
}

function pace(texts) {
  const m = pick(texts, LABELS.pace, PACE) || anywhere(texts, PACE);
  if (!m) return null;
  const sec = Number(m[1]) * 60 + Number(m[2]);
  // 配速 3 分到 20 分/km，超出这个范围多半是别的东西（比如日期 10'30）
  return sec >= 180 && sec <= 1200 ? sec : null;
}

function bpmAt(texts, labelRe) {
  const labeled = pick(texts, labelRe, /(\d{2,3})/);
  if (labeled) {
    const n = Number(labeled[1]);
    if (n >= 30 && n <= 240) return n;
  }
  const direct = anywhere(texts, BPM);
  if (direct) {
    const n = Number(direct[1]);
    if (n >= 30 && n <= 240) return n;
  }
  return null;
}

function sportOf(texts) {
  for (const [re, type] of SPORTS) {
    if (texts.some((t) => re.test(t))) return type;
  }
  return null;
}

function pad(n) {
  return String(n).padStart(2, '0');
}

// 截图里如果有「今天 / 10月28日 / 2026-10-28」，就按那一天；否则就是此刻。
// 时间只认「前面不是数字、后面不是冒号」的 HH:mm，避免把时长 00:32:15 当成上午 0:32。
function occurredAt(texts, now, timeZone) {
  const shift = timeZone === 'Asia/Shanghai' ? 8 * 3600 * 1000 : 0;
  const local = new Date(now + shift);
  const today = `${local.getUTCFullYear()}-${pad(local.getUTCMonth() + 1)}-${pad(local.getUTCDate())}`;
  let date = today;
  const iso = anywhere(texts, DATE_ISO);
  const cn = anywhere(texts, DATE_CN);
  const relative = texts.some((t) => /前天/.test(t)) ? -2 : texts.some((t) => /昨天/.test(t)) ? -1 : null;
  if (iso) {
    date = `${iso[1]}-${iso[2]}-${iso[3]}`;
  } else if (cn) {
    date = `${local.getUTCFullYear()}-${pad(Number(cn[1]))}-${pad(Number(cn[2]))}`;
  } else if (relative != null) {
    const d = new Date(now + shift + relative * 86400000);
    date = `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
  }
  const dated = date !== today || texts.some((t) => /今天|今日/.test(t));
  // 时间点只从「和日期同一块」或「看着像钟点」的块里取：
  // 时长 32:15 这种块小时数 > 23，天然被筛掉；配速块的分钟也可能撞，所以先排除配速块。
  let clock = null;
  if (dated) {
    const hits = [];
    for (const t of texts) {
      if (LABELS.pace.test(t) || LABELS.duration.test(t)) continue;
      const m = t.match(CLOCK);
      if (!m) continue;
      const h = Number(m[1]);
      if (h > 23) continue;
      hits.push({ h, min: Number(m[2]), dated: /今天|今日|昨天|前天|\d+\s*月\s*\d+\s*日|\d{4}-\d{2}-\d{2}/.test(t) });
    }
    const best = hits.find((x) => x.dated) || hits[0];
    if (best) clock = best;
  }
  const time = clock ? `${pad(clock.h)}:${pad(clock.min)}` : dated ? '08:00' : `${pad(local.getUTCHours())}:${pad(local.getUTCMinutes())}`;
  const offset = timeZone === 'Asia/Shanghai' ? '+08:00' : 'Z';
  return { occurredAt: `${date}T${time}:00${offset}`, dateFound: dated };
}

/**
 * @param {Array<string|{text:string}>} items OCR 识别出来的文字块
 * @param {{now?:number, timeZone?:string}} options
 */
function parseOcrItems(items, options = {}) {
  const texts = textsOf(items);
  const now = Number.isFinite(options.now) ? options.now : Date.now();
  const timeZone = options.timeZone || 'Asia/Shanghai';
  const warnings = [];

  if (!texts.length) {
    return {
      draft: null,
      warnings: ['这张图里没读到文字，换一张更清楚的截图，或者手动填'],
    };
  }

  let type = sportOf(texts);
  if (!type) {
    type = 'running';
    warnings.push('没认出运动类型，先按跑步填，请改一下');
  }

  const distanceM = distanceMeters(texts);
  let durationSec = durationSeconds(texts);
  const paceSec = pace(texts);
  // 有配速没时长：时长 = 配速 × 距离，比留空有用，但仍然要提示核对。
  if (!durationSec && paceSec && distanceM) {
    durationSec = Math.round((paceSec * distanceM) / 1000);
    warnings.push('时长是按配速和距离推算的，请核对');
  }
  if (distanceM == null) warnings.push('没读到距离，请手动填');
  if (durationSec == null) warnings.push('没读到时长，请手动填');

  const heartRate = bpmAt(texts, LABELS.heartRate);
  const cadence = bpmAt(texts, LABELS.cadence);
  const when = occurredAt(texts, now, timeZone);
  if (!when.dateFound) warnings.push('没读到日期，先按今天填');

  warnings.push('识别结果仅供参考，保存前请核对');

  return {
    draft: {
      type,
      distanceM: distanceM == null ? 0 : distanceM,
      durationSec: durationSec == null ? 0 : durationSec,
      heartRate: heartRate == null ? null : heartRate,
      cadence: cadence == null ? null : cadence,
      occurredAt: when.occurredAt,
      timeZone,
      visibility: 'private',
      source: 'ocr',
      confirmed: false,
      warnings,
    },
    warnings,
  };
}

module.exports = { parseOcrItems, textsOf };
