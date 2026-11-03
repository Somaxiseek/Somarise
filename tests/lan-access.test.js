'use strict';
// 局域网体验模式：私有网段 Host 放行、公网 Host 仍拒绝。
const test = require('node:test');
const assert = require('node:assert');
const http = require('node:http');
const { createApp } = require('../server/http');

function start() {
  const { server } = createApp({ memory: true });
  return new Promise(resolve => server.listen(0, '0.0.0.0', () => resolve(server)));
}

function call(server, hostHeader) {
  const { port } = server.address();
  return new Promise((resolve, reject) => {
    const req = http.request(
      { host: '127.0.0.1', port, path: '/local-session', method: 'GET', headers: { Host: hostHeader } },
      res => {
        let body = '';
        res.on('data', c => (body += c));
        res.on('end', () => resolve({ status: res.statusCode, body }));
      }
    );
    req.on('error', reject);
    req.end();
  });
}

test('私有网段 Host 可通过（手机同一 Wi-Fi 直连）', async t => {
  const server = await start();
  t.after(() => server.close());
  for (const host of ['172.20.10.3:8787', '192.168.1.8:8787', '10.0.0.5:8787', '127.0.0.1:8787', 'localhost:8787']) {
    const r = await call(server, host);
    assert.notEqual(r.status, 403, `${host} 应被放行，实际 ${r.status}`);
  }
});

test('公网域名 Host 仍被拒绝', async t => {
  const server = await start();
  t.after(() => server.close());
  for (const host of ['evil.example.com', '8.8.8.8:8787', 'Somarise.com:8787']) {
    const r = await call(server, host);
    assert.equal(r.status, 403, `${host} 应被拒绝`);
    assert.match(r.body, /仅限本机或局域网访问/);
  }
});
