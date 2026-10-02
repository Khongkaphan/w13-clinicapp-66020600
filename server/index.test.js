// คาบ B — test ฟีเจอร์ "ยกเลิกนัด"
// ใช้ node:test + fetch ที่มากับ Node 20+ — ไม่ต้อง npm install เพิ่ม
// จุดสอน: test เหล่านี้รันได้โดยไม่ต้องมีฐานข้อมูล (400 เช็คก่อนแตะ DB)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import app from './index.js';



// helper: เปิด server ชั่วคราวบน port สุ่ม แล้วปิดทิ้งเมื่อจบ test
async function withServer(fn) {
  const server = await new Promise(resolve => {
    const s = app.listen(0, () => resolve(s));
  });
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    await fn(base);
  } finally {
    server.close();
  }
}



test('GET / returns service status', async () => {
  await withServer(async (base) => {
    const r = await fetch(`${base}/`);
    assert.equal(r.status, 200);
    const body = await r.json();
    assert.equal(body.ok, true);
    assert.equal(body.service, 'clinic-api');
  });
});



test('DELETE /appointments/:id rejects non-numeric id (400)', async () => {
  await withServer(async (base) => {
    const r = await fetch(`${base}/appointments/abc`, { method: 'DELETE' });
    assert.equal(r.status, 400);
    const body = await r.json();
    assert.equal(body.error, 'invalid_id');
  });
});



test('DELETE /appointments/:id rejects zero and negative id (400)', async () => {
  await withServer(async (base) => {
    for (const bad of ['0', '-5']) {
      const r = await fetch(`${base}/appointments/${bad}`, { method: 'DELETE' });
      assert.equal(r.status, 400, `expected 400 for id=${bad}`);
    }
  });
});