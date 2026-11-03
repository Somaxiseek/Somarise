#!/usr/bin/env python3
# 从「24 款动物头像」拼图里逐只切出来，做成能塞进小程序的索引 PNG。
#
# 为什么要有这一步：
#   - 美术给的是一张 1536×1024 的拼图（4 行：8 猫 / 4 狗 / 6 只 / 6 只），不是 24 个文件；
#   - 拼图是 JPEG，每只头像只有 ~128px，边缘带压缩噪点，直接缩放会糊；
#   - 主包只剩 300 多 KB，一张原图 1.4MB 放不进去。
#
# 做法：按「非白像素」找连通块（每块就是一个彩底圆）→ 每个圆切正方形 →
#       圆外置透明 → 放大到 208（sips）→ 中位切分量化到 18 色 → 写索引 PNG。
#
# 用法：
#   python3 scripts/slice-avatars.py <拼图.png|jpg> [输出目录]
#   python3 scripts/slice-avatars.py <拼图> --probe     # 只报检测到的圆，不写文件
# 依赖：Python 标准库 + macOS 自带 sips。
import os
import subprocess
import sys
import tempfile
from collections import deque

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from pnglib import read_png, write_rgba, write_indexed  # noqa: E402

# 输出边长 224：主包卡在 2MB。真机最大显示 170rpx（3 倍屏≈265px），224 放大 18% 看不出来；
# 256→224→208 每张 11.3 → 8.0 → 6.6KB，取 224 是「还在 2MB 里」的最后一档。
SIZE = 224
# 量化色数 18：32 色与 18 色并排放大对比过，圆底那段浅渐变没有色带，
# 但每张从 11.3KB 掉到 8.0KB —— 这批图本来就是大色块，色深不是瓶颈。
COLORS = 18
MIN_AREA = 4000   # 小于这个面积的连通块当噪点丢掉（一个圆约 12000 px）

SKIP = {'turtle', 'hedgehog', 'poodle', 'cockatiel'}   # 已砍掉的 4 只，见上面 ORDER 的注释

# 拼图从左到右、从上到下的顺序（顺序必须跟拼图一致，切图按位置对号入座）。
# id 要过服务端 /^px:[a-z]{2,12}$/。
#
# 2026-10-30 用户定：24 款砍到 20 款，去掉乌龟 / 刺猬 / 泰迪 / 玄凤。
# 玄凤和小黄鸡太像，留蓝鸟多一种颜色；泰迪在狗那行跟比熊、西施犬撞脸。
# 下面 4 个仍留在 ORDER 里（否则后面 20 只的位置就对不上了），只是不输出。
ORDER = [
    # 第 1 行：8 只猫
    ('grey', '灰白猫'), ('orange', '橘猫'), ('tuxedo', '奶牛猫'), ('calico', '三花猫'),
    ('ragdoll', '布偶猫'), ('tabby', '美短'), ('ginger', '橘白猫'), ('white', '白猫'),
    # 第 2 行：4 只狗
    ('corgi', '柯基'), ('bichon', '比熊'), ('poodle', '泰迪'), ('shihtzu', '西施犬'),
    # 第 3 行：6 只
    ('rabbit', '兔子'), ('chick', '小黄鸡'), ('hedgehog', '刺猬'), ('panda', '熊猫'),
    ('hamster', '仓鼠'), ('penguin', '企鹅'),
    # 第 4 行：6 只
    ('cockatiel', '玄凤'), ('bluebird', '蓝鸟'), ('monkey', '猴子'), ('duck', '鸭子'),
    ('turtle', '乌龟'), ('guineapig', '豚鼠'),
]


def load_png(path):
    """sips 统一转成 PNG 再读（jpg 也一样）。"""
    if path.lower().endswith('.png'):
        return read_png(path)
    tmp = os.path.join(tempfile.mkdtemp(), 'sheet.png')
    subprocess.run(['sips', '-s', 'format', 'png', path, '--out', tmp],
                   check=True, capture_output=True)
    return read_png(tmp)


def find_circles(w, h, px):
    """把「彩底圆」找出来：白底 (~254)，圆是浅彩或浅灰。

    判据要同时照顾彩底和灰底（第一只灰猫的底是 #EFEFEF，饱和度是 0）：
    饱和度 > 8 或者最亮通道暗于 246，就算「有东西」。

    不能只做连通块：第一行 8 只猫的圆是**贴在一起**的（列空隙里还有三四十个
    像素），连通块会把整行连成一条。所以先按行分带，再在带内按列投影的「深谷」
    切开——圆与圆之间那几列明显比圆内矮一大截。
    """
    mask = bytearray(w * h)
    for i in range(w * h):
        p = px[i]
        r, g, b = p[0], p[1], p[2]
        mx, mn = max(r, g, b), min(r, g, b)
        if mx - mn > 8 or mx < 246:
            mask[i] = 1

    # ① 行带：整行没有内容的行就是行与行之间的缝
    row_prof = [sum(mask[y * w:(y + 1) * w]) for y in range(h)]
    bands, start = [], None
    for y in range(h):
        if row_prof[y] > 0 and start is None:
            start = y
        elif row_prof[y] == 0 and start is not None:
            if y - start >= 60:
                bands.append((start, y - 1))
            start = None
    if start is not None:
        bands.append((start, h - 1))

    boxes = []
    for (y0, y1) in bands:
        bh = y1 - y0 + 1
        col_prof = []
        for x in range(w):
            c = 0
            for y in range(y0, y1 + 1):
                if mask[y * w + x]:
                    c += 1
            col_prof.append(c)
        # ② 列切分：只有「整列都没有内容」才是圆与圆之间的缝。
        #    用「低于某个高度」当缝会切进圆里（圆的边缘列本来就很矮），切窄了就露出灰边。
        segs, s = [], None
        for x in range(w):
            solid = col_prof[x] > 2
            if solid and s is None:
                s = x
            elif not solid and s is not None:
                segs.append((s, x - 1))
                s = None
        if s is not None:
            segs.append((s, w - 1))
        #    第一行 8 只猫的圆贴在一起，整列都非空，会连成一条 —— 这种「过宽的段」
        #    按等分拆开（这张拼图是排版生成的，行内间距是均匀的）。
        parts = []
        for (a, b) in segs:
            width = b - a + 1
            k = int(round(width / (bh * 0.92))) if width > bh * 1.4 else 1
            k = max(1, k)
            step = width / k
            for i in range(k):
                parts.append((int(round(a + i * step)), int(round(a + (i + 1) * step)) - 1))
        for (x0, x1) in parts:
            if x1 - x0 + 1 < bh * 0.6:
                continue
            # ③ 段内再收紧到真实上下边界（段高可能含地面阴影）
            ys = [y for y in range(y0, y1 + 1) if any(mask[y * w + x] for x in range(x0, x1 + 1))]
            if not ys:
                continue
            boxes.append((x0, ys[0], x1, ys[-1]))
    return boxes


def quantize(px, colors=COLORS):
    """中位切分：按像素数最多的色箱反复对半切，取每箱均值当调色板。"""
    from collections import Counter
    cnt = Counter((p[0], p[1], p[2]) for p in px if p[3] > 128)
    if not cnt:
        return [(255, 255, 255)], []

    boxes = [list(cnt.items())]
    while len(boxes) < colors:
        # 挑「体量最大（像素多且通道跨度大）」的箱子来切
        best, best_score = -1, -1
        for i, box in enumerate(boxes):
            if len(box) < 2:
                continue
            n = sum(c for _, c in box)
            span = max(max(cols[k] for cols, _ in box) - min(cols[k] for cols, _ in box)
                       for k in range(3))
            score = n * (span + 1)
            if score > best_score:
                best, best_score = i, score
        if best < 0:
            break
        box = boxes.pop(best)
        ch = max(range(3), key=lambda k: max(c[k] for c, _ in box) - min(c[k] for c, _ in box))
        box.sort(key=lambda it: it[0][ch])
        total = sum(c for _, c in box)
        acc, cut = 0, 0
        for i, (_, c) in enumerate(box):
            acc += c
            if acc >= total / 2:
                cut = i + 1
                break
        cut = min(max(cut, 1), len(box) - 1)
        boxes.extend([box[:cut], box[cut:]])

    pal = []
    for box in boxes:
        n = sum(c for _, c in box)
        if not n:
            continue
        pal.append(tuple(round(sum(c[k] * w for c, w in box) / n) for k in range(3)))
    return pal, None


def slice_one(w, h, px, box):
    """切正方形 + 圆外透明，返回 (side, rgba 列表)。

    画布边长取 bbox 长边，遮罩半径取 bbox **短边**的一半再往里收 2px。
    为什么不拿「最宽那一行」当直径：这批图是「趴在圆底」的构图，动物和它的
    地面阴影会压到圆的下缘，按最宽行算圆心会偏上，遮罩就把上一行的投影也圈进来
    （预览里能看到一格角落里浮着一小片淡色）。短边=圆的直径，往内收 2px 保证
    遮罩始终落在彩底里，不会在圆的边缘露出一圈白。
    """
    x0, y0, x1, y1 = box
    bw, bh = x1 - x0 + 1, y1 - y0 + 1
    side = max(bw, bh)                    # 正方形画布，圆居中，四角留透明
    cx = (x0 + x1 + 1) / 2.0
    cy = (y0 + y1 + 1) / 2.0
    r_out = min(bw, bh) / 2.0 - 2.0
    r_in = r_out - 1.5                    # 这两圈之间做 1.5px 羽化，边缘才不是锯齿
    out = []
    for yy in range(side):
        for xx in range(side):
            sx = int(round(cx - side / 2.0 + xx))
            sy = int(round(cy - side / 2.0 + yy))
            d = ((xx + 0.5 - side / 2.0) ** 2 + (yy + 0.5 - side / 2.0) ** 2) ** 0.5
            if d >= r_out:
                out.append((0, 0, 0, 0))
                continue
            a = 255 if d <= r_in else int(round(255 * (r_out - d) / (r_out - r_in)))
            if 0 <= sx < w and 0 <= sy < h:
                p = px[sy * w + sx]
                out.append((p[0], p[1], p[2], a))
            else:
                out.append((0, 0, 0, 0))
    return side, out


def to_indexed(path, side, rgba):
    """rgba → 放大到 SIZE → 量化 → 写索引 PNG，返回字节数。"""
    tmpdir = tempfile.mkdtemp()
    raw_png = os.path.join(tmpdir, 'raw.png')
    big_png = os.path.join(tmpdir, 'big.png')
    write_rgba(raw_png, side, side, rgba)
    subprocess.run(['sips', '-z', str(SIZE), str(SIZE), raw_png, '--out', big_png],
                   check=True, capture_output=True)
    w, h, px = read_png(big_png)
    pal = quantize(px)[0]

    idx = bytearray(w * h)
    for i, p in enumerate(px):
        if p[3] <= 100:
            idx[i] = 0
            continue
        best, bd = 1, 10 ** 9
        for j, c in enumerate(pal):
            d = (p[0] - c[0]) ** 2 + (p[1] - c[1]) ** 2 + (p[2] - c[2]) ** 2
            if d < bd:
                bd, best = d, j + 1
        idx[i] = best
    table = [(0, 0, 0)] + pal
    trans = [0] + [255] * len(pal)
    return write_indexed(path, w, h, idx, table, trans)


def main():
    args = [a for a in sys.argv[1:] if not a.startswith('--')]
    probe = '--probe' in sys.argv
    sheet = args[0]
    dst = args[1] if len(args) > 1 else os.path.join(
        os.path.dirname(os.path.abspath(__file__)), '..', 'miniprogram', 'assets', 'avatars')

    w, h, px = load_png(sheet)
    boxes = find_circles(w, h, px)
    print('图 %d×%d，找到 %d 个圆' % (w, h, len(boxes)))
    for i, b in enumerate(boxes):
        print('  #%-2d x %4d–%-4d y %4d–%-4d  %d×%d' % (
            i + 1, b[0], b[2], b[1], b[3], b[2] - b[0] + 1, b[3] - b[1] + 1))
    if probe:
        return
    if len(boxes) != len(ORDER):
        raise SystemExit('圆的数量 %d 和名字表 %d 对不上，先用 --probe 看清楚' % (len(boxes), len(ORDER)))

    os.makedirs(dst, exist_ok=True)
    total = 0
    kept = 0
    for (slug, label), box in zip(ORDER, boxes):
        if slug in SKIP:
            continue
        side, rgba = slice_one(w, h, px, box)
        n = to_indexed(os.path.join(dst, slug + '.png'), side, rgba)
        total += n
        kept += 1
        print('%-11s %-5s 源 %dpx  %5.1f KB' % (slug, label, side, n / 1024))
    print('--- %d 张（砍掉 %d 只），合计 %.1f KB' % (kept, len(SKIP), total / 1024))


if __name__ == '__main__':
    main()
