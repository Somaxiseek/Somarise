#!/usr/bin/env python3
# 纯标准库的小 PNG 读写：读 8bit PNG（RGB/RGBA/索引色）+ 写 8bit 索引 PNG（PLTE + tRNS）。
# 项目里不让装 Pillow，切片/量化都靠这两个函数。
import struct
import zlib


def read_png(path):
    """读 8bit PNG 成 (w, h, [(r,g,b) 或 (r,g,b,a), ...])。"""
    d = open(path, 'rb').read()
    assert d[:8] == b'\x89PNG\r\n\x1a\n', path + ' 不是 PNG'
    pos, idat, plte, trns = 8, b'', None, None
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
        elif typ == b'tRNS':
            trns = body
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
        f = raw[p]
        p += 1
        line = bytearray(raw[p:p + stride])
        p += stride
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
        if trns:
            px = [tuple(plte[c * 3:c * 3 + 3]) + ((trns[c] if c < len(trns) else 255),) for c in out]
        else:
            px = [tuple(plte[c * 3:c * 3 + 3]) for c in out]
    elif ctype == 0:
        px = [(v, v, v) for (v,) in px]
    elif ctype == 4:
        px = [(v, v, v, a) for (v, a) in px]
    return w, h, px


def write_rgba(path, w, h, px):
    """写 8bit RGBA PNG（给 sips 缩放用；sips 能正确处理 alpha）。"""
    raw = bytearray()
    for y in range(h):
        raw.append(0)
        for x in range(w):
            raw += bytes(px[y * w + x])

    def chunk(t, d):
        return struct.pack('>I', len(d)) + t + d + struct.pack('>I', zlib.crc32(t + d) & 0xFFFFFFFF)

    out = b'\x89PNG\r\n\x1a\n'
    out += chunk(b'IHDR', struct.pack('>IIBBBBB', w, h, 8, 6, 0, 0, 0))
    out += chunk(b'IDAT', zlib.compress(bytes(raw), 6))
    out += chunk(b'IEND', b'')
    open(path, 'wb').write(out)


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
