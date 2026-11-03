// 预设头像目录（2026-11-03 第六版：成品圆图直接从用户给的参考拼图里切出来）。
//
// 前几版是自己画的字符画 / JPEG 拼图裁切，动物在圆里大小不一（美短、雪纳瑞偏小）。
// 这版改用用户确认过的参考图（1024×1536，5 行 × 4 列成品圆图）作为唯一来源：
// python3 scripts/slice-from-reference.py 按实测行列几何切圆 + 32 色索引，一步到位。
//
// 图片在 miniprogram/assets/avatars/，224×224、索引色 32 色，20 张共 ~107KB。
// 圆底 + 动物都在图里（圆外透明四角），组件只负责 <image>，不画底。
// id 只能是小写字母（2–12 位），服务端 /profile 用 /^px:[a-z]{2,12}$/ 卡着。

const DIR = '/assets/avatars/';

// 顺序 = 展示顺序（8 猫 / 4 狗 / 4 只 / 4 只），一行一行读得出来
// 2026-10-30 用户定：去掉乌龟 / 刺猬 / 泰迪 / 玄凤（玄凤跟小黄鸡太像，留蓝鸟多一个颜色）
const AVATARS = [
  // 第 1 行：8 只猫
  { id: 'grey', label: '灰白猫' },
  { id: 'orange', label: '橘猫' },
  { id: 'tuxedo', label: '奶牛猫' },
  { id: 'calico', label: '三花猫' },
  { id: 'ragdoll', label: '布偶猫' },
  { id: 'tabby', label: '美短' },
  { id: 'ginger', label: '狸花猫' },
  { id: 'white', label: '白猫' },
  // 第 2 行：4 只狗（泰迪去掉了，跟比熊、柴犬撞脸；雪纳瑞后加）
  { id: 'corgi', label: '柯基' },
  { id: 'bichon', label: '比熊' },
  { id: 'shihtzu', label: '柴犬' },
  { id: 'schnauzer', label: '雪纳瑞' },
  // 第 3 行：4 只（刺猬去掉了；兔子挪到最后一行）
  { id: 'chick', label: '小黄鸡' },
  { id: 'panda', label: '熊猫' },
  { id: 'hamster', label: '仓鼠' },
  { id: 'penguin', label: '企鹅' },
  // 第 4 行：4 只（玄凤、乌龟、垂耳兔去掉了；兔子挪到这行末尾）
  { id: 'bluebird', label: '蓝鸟' },
  { id: 'monkey', label: '猴子' },
  { id: 'duck', label: '鸭子' },
  { id: 'rabbit', label: '兔子' }
].map(a => Object.assign({ src: DIR + a.id + '.png' }, a));

// 更早几版的 id，老账号里还存着，读出来映射到最接近的新款。
// 只做读取兼容，不再出现在选择页里。
const LEGACY = {
  // 第一、二版的 12 款字符头像
  cat: 'orange',
  blackcat: 'tuxedo',
  shiba: 'poodle',
  husky: 'ragdoll',
  bunny: 'rabbit',
  bear: 'bichon',
  fox: 'calico',
  // 第三版（16 款成品图）里有、这一版没画的那一只，别让老账号掉头像
  siamese: 'ragdoll',
  // 第四版（24 款）里被砍掉的 4 只：已经有人选过，映射到最近的同类，别让他突然没头像
  poodle: 'shihtzu',     // 泰迪 → 柴犬（同样是狗）
  hedgehog: 'hamster',   // 刺猬 → 仓鼠（同样是圆滚滚的小家伙）
  cockatiel: 'bluebird', // 玄凤 → 蓝鸟（同样是鸟）
  turtle: 'rabbit'       // 乌龟 → 兔子（同样是小宠物；垂耳兔 guineapig 已下架）
};

const BY_ID = {};
AVATARS.forEach(a => { BY_ID[a.id] = a; });

// 'px:cat' / 'cat' 都能取到；空值或未知 id 返回 null（调用方退化成昵称首字）。
function get(id) {
  const key = String(id || '').replace(/^px:/, '');
  return BY_ID[key] || BY_ID[LEGACY[key]] || null;
}

module.exports = { AVATARS, LEGACY, get, DIR };
