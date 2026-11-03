// 圆环的纯计算：把 percent 换算成可以直接写进 style 的 conic-gradient 与几何尺寸。
// 圆环画在 WXSS 里（不用 canvas），所以页面滚动时圆环会跟着内容一起走，不会浮在上面。
//
// 角度约定：conic-gradient 的 0deg 就是 12 点方向，顺时针为正。
// 千万不要写 `from -90deg`——那会把整条弧转到 9 点起，圆头却还在按 12 点算，端点就会「飘」到别处。
'use strict';

// 环宽 / 环间距都跟着尺寸走：环要够粗才像 Apple Watch，缝要够窄才显得是一组。
// 环宽 11.5% → 12.5%（用户 10-29 点名「粗一点，Apple 的那种感觉」）：中心永久留白，
// 没有数字要塞，环可以放心加厚。120px 时环宽 14 → 15，孔径相应收小。
const STROKE_RATIO = 0.125;
const GAP_RATIO = 0.02;

function clamp(v){ return Math.max(0, Math.min(100, Number(v) || 0)); }
function round(v){ return Math.round(v * 100) / 100; }

function strokeFor(size){
  const s = Number(size) || 120;
  return Math.max(6, Math.round(s * STROKE_RATIO));
}
function gapFor(size){
  const s = Number(size) || 120;
  return Math.max(2, Math.round(s * GAP_RATIO));
}

// 轨道色 = 环色淡到 14%，没走完的那截也还是「这一项」的颜色，比灰底更像手表
function hexToRgba(hex, alpha){
  const h = String(hex || '').replace('#', '');
  const full = h.length === 3 ? h.split('').map(c => c + c).join('') : h;
  if(!/^[0-9a-fA-F]{6}$/.test(full)) return 'rgba(0,0,0,' + alpha + ')';
  const n = parseInt(full, 16);
  return 'rgba(' + ((n >> 16) & 255) + ',' + ((n >> 8) & 255) + ',' + (n & 255) + ',' + alpha + ')';
}

function rgbOf(hex){
  const h = String(hex || '').replace('#', '');
  const full = h.length === 3 ? h.split('').map(c => c + c).join('') : h;
  if(!/^[0-9a-fA-F]{6}$/.test(full)) return [255, 255, 255];
  const n = parseInt(full, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function hex2(v){ return ('0' + Math.max(0, Math.min(255, Math.round(v))).toString(16)).slice(-2); }

// 把「半透明色」预先压成「不透明色」：色 × a + 底色 × (1-a)。
// 为什么必须压成不透明：端头（cap）是压在环身上的一个同色圆点，如果两者都用半透明色，
// 重叠处会二次混合、比周围深一块 —— 用户 10-30 看到的就是「两个头重叠出的影子」。
// 环身做成不透明实色以后，端头盖上去就是纯粹的「覆盖」，接缝完全看不出来。
function blendOn(hex, alpha, bg){
  const a = Math.max(0, Math.min(1, Number(alpha)));
  const f = rgbOf(hex);
  const b = rgbOf(bg || '#ffffff');
  return '#' + hex2(f[0] * a + b[0] * (1 - a)) + hex2(f[1] * a + b[1] * (1 - a)) + hex2(f[2] * a + b[2] * (1 - a));
}

// 0% 不画（露出轨道色）；100% 直接铺满；中间用 conic-gradient 从 12 点顺时针铺到 X 度
function fillFor(color, percent){
  const p = clamp(percent);
  if(p <= 0) return 'none';
  if(p >= 100) return color;
  const deg = round(p * 3.6);
  return 'conic-gradient(' + color + ' 0deg,' + color + ' ' + deg + 'deg,' +
    'rgba(0,0,0,0) ' + deg + 'deg,rgba(0,0,0,0) 360deg)';
}

// 圆头的中心落在环身中心线上：半径 r=(box-stroke)/2，0 度在 12 点，顺时针增角。
// 直接用 left/top 定位（不用 transform: rotate），端点和弧的起止角度是同一套算法，不会再错位。
function capAt(box, stroke, dotSize, deg){
  const r = (box - stroke) / 2;
  const rad = (deg - 90) * Math.PI / 180;
  const cx = box / 2 + r * Math.cos(rad);
  const cy = box / 2 + r * Math.sin(rad);
  return { left: round(cx - dotSize / 2), top: round(cy - dotSize / 2) };
}

// 端点阴影：跟着「头前进的方向」落，不是固定朝下。
// 环从 12 点顺时针走，所以某一点的前进方向 = 该点的顺时针切线：
//   12 点 → 正右；3 点 → 正下；6 点 → 正左；9 点 → 正上。
// 于是闭合时（头回到 12 点压在起点上）阴影只出现在头的右边，左边干净
// —— 用户 10-30 点名要的正是这个：起点永远无影，只有末端有影，且影只在一侧。
// 观感对齐品牌 logo 的那道「柔和月牙」：
//   模糊略大于偏移 —— 边缘渐隐、不成硬边深色块；
//   但偏移不小于模糊的一半 —— 模糊不反向溢出，端头左侧不留暗边（否则端头看着像凸起的圆碟）；
//   暗核紧贴端头的边（偏移太小会和端头之间留一道亮缝，看着像两个头分开）。
//   浓度 0.20：实机（dpr3）看着比设计稿更重，压到 0.20 才和 logo 的纸片感一致。
function capShadowAt(deg, stroke){
  const off = Math.max(1, Math.round(stroke * 0.12));
  const blur = Math.max(1, Math.round(stroke * 0.18));
  const rad = (deg - 90) * Math.PI / 180;
  const dx = Math.round(off * -Math.sin(rad));
  const dy = Math.round(off * Math.cos(rad));
  return dx + 'px ' + dy + 'px ' + blur + 'px rgba(0,0,0,0.20)';
}

// 由外到内第 i 环：偏移 i*(stroke+gap)，环本身是正方形，洞是正方形减去两倍环宽
// bg = 环所在的底色（挖洞用同一个颜色），「仅记录」那种压一档明度的环
// 需要它把半透明色预算成不透明色，端头盖上去才不会二次混色。
function arcList(values, size, stroke, gap, bg){
  const total = Number(size) || 120;
  const s = Math.max(2, Number(stroke) || strokeFor(total));
  const g = Math.max(1, Number(gap) || gapFor(total));
  const page = bg || '#ffffff';
  const out = [];
  (values || []).forEach((v, i) => {
    const offset = i * (s + g);
    const box = total - offset * 2;
    const hole = box - s * 2;
    if(hole <= 2) return;
    // 隐藏的项：槽位照占（offset/box 都按序号算，位置不许动），只是什么都不画。
    // 用户 10-29：关掉某一个圈，剩下的圈和图例必须原地不动。
    if(v && v.hidden){
      out.push({ idx: i, offset: round(offset), box: round(box), inset: s, hole: round(hole),
        color: 'rgba(0,0,0,0)', percent: 0, fill: 'none', deg: 0, showCap: false,
        dotSize: s, track: 'rgba(0,0,0,0)', caps: [], hidden: true });
      return;
    }
    const p = clamp(v && v.percent);
    // soft = 仅记录且记过了：整圈划满，但压一档明度。0.45 太浅淡成了粉白，
    // 用户 10-28 反馈「太浅」→ 0.62：仍和达标的实心圈区分开，但红色看得出来。
    // 必须预算成不透明色（见 blendOn）：半透明会让端头压在环身上时深一块。
    const soft = !!(v && v.soft) && p > 0;
    const base = (v && v.color) || '#171717';
    const color = soft ? blendOn(base, 0.62, page) : base;
    const deg = round(p * 3.6);
    // 圆头直径 = 环宽：端头正好补成一个半圆，和环身严丝合缝，不会鼓出来一坨
    const dotSize = s;
    // 起点永远无影；只有「头/终点」有影，且影落在头前进方向那一侧（见 capShadowAt）。
    const showCap = p > 0;
    const caps = showCap
      ? (p >= 100
          ? [{ key: 'close', head: true, shadow: capShadowAt(0, s), ...capAt(box, s, dotSize, 0) }]
          : [{ key: 'start', head: false, shadow: 'none', ...capAt(box, s, dotSize, 0) },
             { key: 'end', head: true, shadow: capShadowAt(deg, s), ...capAt(box, s, dotSize, deg) }])
      : [];
    out.push({
      idx: i, offset: round(offset), box: round(box), inset: s, hole: round(hole),
      color, percent: p, fill: fillFor(color, p), deg, showCap, dotSize,
      track: hexToRgba(base, 0.14), caps
    });
  });
  return out;
}

module.exports = { STROKE_RATIO, GAP_RATIO, strokeFor, gapFor, hexToRgba, blendOn, fillFor, capAt, capShadowAt, arcList };
