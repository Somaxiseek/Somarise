#!/usr/bin/env node
'use strict';
// 把本机当前局域网地址写入 miniprogram/config/runtime.js 的 apiBase，
// 让手机（同一 Wi-Fi）能直连本机演示服务。
// 用法：npm run lan   （只写配置，不启动服务）
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const PORT = 8787;
const CONFIG = path.join(__dirname, '../miniprogram/config/runtime.js');

function candidates() {
  const out = [];
  for (const [name, list] of Object.entries(os.networkInterfaces())) {
    for (const net of list || []) {
      if (net.family !== 'IPv4' || net.internal) continue;
      const loopbackLike = net.address.startsWith('169.254.');
      if (loopbackLike) continue;
      // en0（Wi-Fi）优先，其余靠后
      const weight = name === 'en0' ? 0 : name.startsWith('en') ? 1 : 2;
      out.push({ name, address: net.address, weight });
    }
  }
  return out.sort((a, b) => a.weight - b.weight);
}

const list = candidates();
if (!list.length) {
  console.error('没有找到局域网 IPv4 地址，请确认已连接 Wi-Fi。');
  process.exit(1);
}

const picked = list[0];
const base = `http://${picked.address}:${PORT}`;
const source = fs.readFileSync(CONFIG, 'utf8');
const updated = source.replace(/apiBase:\s*'[^']*'/, `apiBase:'${base}'`);

if (updated === source && !source.includes(`apiBase:'${base}'`)) {
  console.error('runtime.js 里没找到 apiBase 字段，请先恢复默认模板再运行。');
  process.exit(1);
}
fs.writeFileSync(CONFIG, updated);

console.log('已写入小程序配置：apiBase = ' + base);
if (list.length > 1) {
  console.log('其它可用地址（若上面这个连不上可手工替换）：');
  for (const item of list.slice(1)) console.log(`  ${item.name}  http://${item.address}:${PORT}`);
}
console.log('\n下一步：');
console.log('  1) 在另一个终端执行 npm run start:lan（让后端监听 0.0.0.0）');
console.log('  2) 微信开发者工具里点「编译」，再点「预览」生成二维码');
console.log('  3) 手机扫码进入后，右上角「…」→「开发调试」→ 打开调试，重新进入一次');
