#!/usr/bin/env python3
# 从用户给的参考图（Clipboard_Screenshot）里把 20 个圆形头像直接切出来。
# 圆底+动物一起保留（圆形蒙版外全透明），统一缩放到 224×224，替换 assets/avatars/ 下的图。
#
# 圆的几何参数不是逐只检测的——同一行内的圆共享同一组参数，从每行最可靠的一只
# （无白毛干扰竖向扫描的）实测「上边缘/下边缘」得出，列心从可靠圆的左右边缘得出：
#   行1 猫:  cy=227    R=97   (橘猫 top130 bot324)
#   行2 猫:  cy=492.5  R=96.5 (狸花猫 top396 bot589)
#   行3 狗:  cy=836.5  R=95.5 (柯基/柴犬 top741 bot932)
#   行4 其他: cy=1168   R=88   (小黄鸡 top1080 bot1256)
#   行5 其他: cy=1397.5 R=85.5 (猴子 top1312 bot1483)
# 白毛动物（白猫/比熊/鸭子/兔子等）的身体是白色的，从圆心竖直扫会提前碰到白身体，
# 所以不能用它们自身测量——直接继承所在行的参数即可（同一行圆本来就一样大）。
import os, math
from PIL import Image

SRC = '/Users/Zhuanz/.workbuddy/clipboard-images/clipboard-2026-11-02T23-46-44-264Z-20469679.jpg'
OUT = '/tmp/av_crop'
os.makedirs(OUT, exist_ok=True)

IDS = ['grey','orange','tuxedo','calico','ragdoll','tabby','ginger','white',
       'corgi','bichon','shihtzu','schnauzer',
       'chick','panda','hamster','penguin','bluebird','monkey','duck','rabbit']

ROWS = [(227.0, 97.0), (492.5, 96.5), (836.5, 95.5), (1168.0, 88.0), (1397.5, 85.5)]  # (cy, R)
COLS = [160.0, 394.0, 626.0, 862.0]

im = Image.open(SRC).convert('RGB')
W, H = im.size
px = im.load()

TARGET = 224
PAD = 3  # 圆外留白；标签在圆下缘 5px 外，蒙版只到圆边，进不来

for idx in range(20):
    r, c = idx // 4, idx % 4
    cy, R = ROWS[r]
    cx = COLS[c]
    half = int(round(R)) + PAD
    side = 2 * half
    x0 = int(round(cx)) - half; y0 = int(round(cy)) - half
    out = Image.new('RGBA', (side, side), (0, 0, 0, 0)); op = out.load()
    for yy in range(side):
        for xx in range(side):
            if math.hypot(xx - half, yy - half) > R + 0.5:
                continue  # 圆形蒙版：圆外一律透明（含下方标签）
            sx, sy = x0 + xx, y0 + yy
            if 0 <= sx < W and 0 <= sy < H:
                rr, gg, bb = px[sx, sy]
                op[xx, yy] = (rr, gg, bb, 255)
    out = out.resize((TARGET, TARGET), Image.NEAREST)  # 统一尺寸，最近邻保像素
    out.save(os.path.join(OUT, IDS[idx] + '.png'))
    print(f'{IDS[idx]:10s} cell(r{r},c{c}) center=({cx:.0f},{cy:.0f}) R={R}')

# 灰底拼接核对图（灰底能暴露白边/残字）
cell = 180; cols = 4
sheet = Image.new('RGBA', (cols * cell, 5 * cell), (214, 214, 214, 255))
for i, idd in enumerate(IDS):
    a = Image.open(os.path.join(OUT, idd + '.png')).convert('RGBA').resize((cell, cell), Image.NEAREST)
    sheet.paste(a, ((i % cols) * cell, (i // cols) * cell), a)
sheet.convert('RGB').save(os.path.join(OUT, '_sheet_grey.png'))
print('sheet ok')
