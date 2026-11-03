'use strict';

// 横滑手势的纯计算，跟界面无关，放这里是为了能直接测。
//
// 为什么要「方向锁」：记录页是长列表，竖着滑是很常见的动作。
// 手指一落下就接管手势的话，用户想滚动列表会变成一排记录左右乱扭 ——
// 自研横滑最容易翻车的地方就是这里。所以起手 8px 内不判方向，
// 横向位移必须超过纵向的 1.2 倍，才认定「这一下是横滑」。

const LOCK = 8;    // 起手这段位移不判方向，容忍手抖
const RATIO = 1.2; // 横向要明显大于纵向，才算横滑

// dx < 0：内容往左走，露出右边的按钮（撤销）
// dx > 0：内容往右走，露出左边的按钮（再来一次）
function lockDir(dx, dy) {
  if (Math.abs(dx) < LOCK) return '';
  if (Math.abs(dx) < Math.abs(dy) * RATIO) return '';
  return dx < 0 ? 'left' : 'right';
}

// 超过按钮宽之后加阻尼，手指还能走一点但走不远（橡皮筋），
// 让人感觉到「已经到底了」，而不是滑出去一片空白。
function resist(dx, limit) {
  const abs = Math.abs(dx);
  const dir = dx < 0 ? -1 : 1;
  if (abs <= limit) return abs * dir;
  const over = (abs - limit) * 0.32;
  return dir * Math.min(limit + over, limit * 1.35);
}

// 松手时够不够触发：滑不到就回弹，什么都不发生
function fires(dx, threshold) {
  return Math.abs(dx) >= threshold;
}

// 拖到几成：用于按钮文字的浓淡，越接近触发越实
function progress(dx, threshold) {
  return Math.min(1, Math.abs(dx) / Math.max(1, threshold));
}

module.exports = { lockDir, resist, fires, progress, LOCK, RATIO };
