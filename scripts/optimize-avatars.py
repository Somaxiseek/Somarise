#!/usr/bin/env python3
# 把美术给的 400×400 原图压成能塞进小程序的索引 PNG。
#
# 为什么需要这一步：16 张原图共 1.4MB（80–95KB/张），主包余额只有 600KB 左右，
# 直接放进去必然超限。原图是「像素风插画」，每个像素带 ±3 的噪点，颜色数 7000+，
# 所以 PNG 压不动。把噪点量化掉、只留 24 个色之后，大片同色区域才连成游程，
# 体积掉到 6–12KB/张，16 张共 139KB，肉眼看不出差别（做过放大对比）。
#
# 用法：
#   python3 scripts/optimize-avatars.py <原图目录> [输出目录]
#   原图文件名要以 01_xxx.png 这种序号开头，映射表见下面的 SLUG。
# 依赖：只用 Python 标准库 + macOS 自带的 sips（负责缩放）。
import os
import struct
import subprocess
import sys
import zlib
from collections import Counter

SIZE = 400        # 输出边长。头像最大显示 85px，400 已经是 4.7 倍，够用
COLORS = 24       # 量化色数。再少会让渐变的毛发出现色带

# 中文名 → 英文 id（id 要过服务端 /^px:[a-z]{2,12}$/）
SLUG = {
    '01_灰白猫': 'grey', '02_橘猫': 'orange', '03_黑白猫': 'tuxedo', '04_三花猫': 'calico',
    '05_布偶猫': 'ragdoll', '06_美短猫': 'tabby', '07_白猫': 'white', '08_暹罗猫': 'siamese',
    '09_比熊犬': 'bichon', '10_柯基犬': 'corgi', '11_泰迪犬': 'poodle', '12_西施犬': 'shihtzu',
    '13_兔子': 'rabbit', '14_小鸭': 'duck', '15_刺猬': 'hedgehog', '16_熊猫': 'panda',
}


def read_png(path):
    """读 8bit PNG（RGB / RGBA / 索引色）成 [(r,g,b[,a]), ...]。"""
    d = open(path, 'rb').read()
    assert d[:8] == b'\x89PNG\r\n\x1a\n', path + ' 不是 PNG'
    pos, idat, plte = 8, b'', None
    w = h = bitd = ctype = None
    while pos < len(d):
        ln = struct.unpack_from('>I', d, pos)[0]
        typ = d[pos + 4:pos + 8]
        body = d[pos + 8:pos + 8 + ln]
        if typ == b'IHDR':
            w, h, bitd, ctype, _, _, interlace = struct.unpack('>IIBBBBB', body)
            assert interlace == 0, '不支持隔行扫描'
        elif typ == b'PLTE':
            plte = body
        elif typ == b'IDAT':
            idat += body
        elif typ == b'IEND':
            break
        pos += 12 + ln
    assert bitd == 8, '只处理 8bit，实际 %s' % bitd
    raw = zlib.decompress(idat)
    ch = {0: 1, 2: 3, 3: 1, 4: 2, 6: 4}[ctype]
    stride = w * ch
    out = bytearray(w * h * ch)
    prev = bytearray(stride)
    p = 0
    for y in range(h):
        f = raw[p]; p += 1
        line = bytearray(raw[p:p + stride]); p += stride
        if f == 1:
            for i in range(ch, stride):
                line[i] = (line[i] + line[i - ch]) & 255
        elif f == 2:
            for i in range(stride):
                line[i] = (line[i] + prev[i]) & 255
        elif f == 3:
            for i in range(stride):
                a = line[i - ch] if i >= ch else 0
                line[i] = (line[i] + ((a + prev[i]) >> 1)) & 255
        elif f == 4:
            for i in range(stride):
                a = line[i - ch] if i >= ch else 0
                b = prev[i]
                c = prev[i - ch] if i >= ch else 0
                pa, pb, pc = abs(a + b - c - a), abs(a + b - c - b), abs(a + b - c - c)
                pr = a if (pa <= pb and pa <= pc) else (b if pb <= pc else c)
                line[i] = (line[i] + pr) & 255
        out[y * stride:(y + 1) * stride] = line
        prev = line
    px = [tuple(out[i * ch:(i + 1) * ch]) for i in range(w * h)]
    if ctype == 3:
        px = [tuple(plte[c * 3:c * 3 + 3]) for c in out]
    elif ctype == 0:
        px = [(v, v, v) for (v,) in px]
    elif ctype == 4:
        px = [(v, v, v, a) for (v, a) in px]
    return w, h, px


def write_indexed(path, w, h, idx, pal, trans):
    """写 8bit 索引 PNG（PLTE + tRNS），索引 0 全透明。"""
    raw = bytearray()
    for y in range(h):
        raw.append(0)
        raw += bytes(idx[y * w:(y + 1) * w])

    def chunk(t, d):
        return struct.pack('>I', len(d)) + t + d + struct.pack('>I', zlib.crc32(t + d) & 0xFFFFFFFF)

    out = b'\x89PNG\r\n\x1a\n'
    out += chunk(b'IHDR', struct.pack('>IIBBBBB', w, h, 8, 3, 0, 0, 0))
    out += chunk(b'PLTE', b''.join(bytes(c) for c in pal))
    out += chunk(b'tRNS', bytes(trans))
    out += chunk(b'IDAT', zlib.compress(bytes(raw), 9))
    out += chunk(b'IEND', b'')
    open(path, 'wb').write(out)
    return len(out)


def optimize(src, dst):
    # 先把 400×400 原图交给 sips 缩放（原图本来就是 400，这一步主要是统一尺寸）
    tmp = dst + '.tmp.png'
    subprocess.run(['sips', '-z', str(SIZE), str(SIZE), src, '--out', tmp],
                   check=True, capture_output=True)
    w, h, px = read_png(tmp)
    os.remove(tmp)

    # 按 16 级粗量化统计，挑出互不相近的若干代表色（简单去重，不做完整中位切分，
    # 24 色对这组图已经够；想更准可以换 k-means，但没必要）
    key = lambda c: (c[0] // 16 * 16, c[1] // 16 * 16, c[2] // 16 * 16)
    cnt = Counter(key(p[:3]) for p in px if p[3] > 128)
    reps = []
    for k, _ in cnt.most_common(COLORS * 4):
        if not any(abs(q[0] - k[0]) + abs(q[1] - k[1]) + abs(q[2] - k[2]) < 24 for q in reps):
            reps.append(k)
        if len(reps) >= COLORS:
            break

    pal = [reps[0]]          # 索引 0 = 透明位，颜色随便填，靠 tRNS 抹掉
    trans = [0]
    for c in reps:
        pal.append(c)
        trans.append(255)

    idx = bytearray(w * h)
    for i, p in enumerate(px):
        if p[3] <= 128:
            idx[i] = 0
            continue
        best, bd = 1, 10 ** 9
        for j in range(1, len(pal)):
            d = (p[0] - pal[j][0]) ** 2 + (p[1] - pal[j][1]) ** 2 + (p[2] - pal[j][2]) ** 2
            if d < bd:
                bd, best = d, j
        idx[i] = best
    return write_indexed(dst, w, h, idx, pal, trans)


def main():
    src_dir = sys.argv[1] if len(sys.argv) > 1 else os.path.expanduser('~/Downloads/avatars')
    dst_dir = sys.argv[2] if len(sys.argv) > 2 else os.path.join(
        os.path.dirname(os.path.abspath(__file__)), '..', 'miniprogram', 'assets', 'avatars')
    os.makedirs(dst_dir, exist_ok=True)

    total = 0
    files = sorted(f for f in os.listdir(src_dir) if f.endswith('.png'))
    if not files:
        raise SystemExit(src_dir + ' 里没有 PNG')
    for f in files:
        base = f[:-4]
        if base not in SLUG:
            print('跳过（没有映射）：' + base)
            continue
        slug = SLUG[base]
        n = optimize(os.path.join(src_dir, f), os.path.join(dst_dir, slug + '.png'))
        total += n
        print('%-10s %-10s %6.1f KB' % (base, slug, n / 1024))
    print('--- %d 张，合计 %.1f KB' % (len(files), total / 1024))
    if total > 200 * 1024:
        print('警告：超过 200KB，主包可能放不下')


if __name__ == '__main__':
    main()
