#!/usr/bin/env python3
# 生成小程序头像（纯几何绘制，不依赖 PIL）：三圈同心环 = 产品核心视觉。
import math, zlib, struct, os

CARDIO=(0xD9,0x3B,0x36); STRENGTH=(0x3D,0x6E,0xDC); WATER=(0x06,0xB6,0xD4)

def render(size, bg, rings, ss=4):
    w=h=size
    acc=[[0.0]*(w*3) for _ in range(h)]
    n=ss*ss
    for y in range(h):
        row=acc[y]
        for x in range(w):
            r=g=b=0.0
            for sy in range(ss):
                py=y+(sy+0.5)/ss
                for sx in range(ss):
                    px=x+(sx+0.5)/ss
                    c=bg
                    for (cx,cy,R,sw,a0,length,col) in rings:
                        dx=px-cx; dy=py-cy
                        d=math.hypot(dx,dy)
                        if abs(d-R)<=sw/2:
                            ang=math.degrees(math.atan2(dy,dx))%360
                            if ((ang-a0)%360)<=length:
                                c=col
                            else:
                                hit=False
                                for au in (a0%360,(a0+length)%360):
                                    ex=cx+R*math.cos(math.radians(au))
                                    ey=cy+R*math.sin(math.radians(au))
                                    if math.hypot(px-ex,py-ey)<=sw/2:
                                        hit=True;break
                                if hit:c=col
                    r+=c[0]; g+=c[1]; b+=c[2]
            row[x*3]=r/n; row[x*3+1]=g/n; row[x*3+2]=b/n
    return acc

def write_png(path,w,h,rows):
    raw=b''
    for y in range(h):
        raw+=b'\x00'
        line=bytearray()
        for x in range(w):
            line+=bytes((max(0,min(255,int(round(rows[y][x*3])))),max(0,min(255,int(round(rows[y][x*3+1])))),max(0,min(255,int(round(rows[y][x*3+2]))))))
        raw+=bytes(line)
    def chunk(t,d):
        c=struct.pack('>I',len(d))+t+d
        return c+struct.pack('>I',zlib.crc32(t+d)&0xffffffff)
    png=b'\x89PNG\r\n\x1a\n'
    png+=chunk(b'IHDR',struct.pack('>IIBBBBB',w,h,8,2,0,0,0))
    png+=chunk(b'IDAT',zlib.compress(raw,9))
    png+=chunk(b'IEND',b'')
    open(path,'wb').write(png)

def rings_for(size):
    c=size/2; sw=size*0.052
    out=[]
    # 外→内：心肺红 / 抗阻蓝 / 饮水青；每圈 300°，缺口方位错开 120°
    for Rr,col,gapa in [(0.30,CARDIO,270),(0.222,STRENGTH,30),(0.144,WATER,150)]:
        out.append((c,c,size*Rr,sw,gapa,300,col))
    return out

os.makedirs('outputs/icon',exist_ok=True)
for name,bg in [('white',(0xFF,0xFF,0xFF)),('dark',(0x17,0x17,0x17)),('light',(0xF5,0xF5,0xF5))]:
    for size in (512,144):
        rows=render(size,bg,rings_for(size),4 if size>=512 else 6)
        p='outputs/icon/somactive-%s-%d.png'%(name,size)
        write_png(p,size,size,rows)
        print(p,os.path.getsize(p),'bytes')
