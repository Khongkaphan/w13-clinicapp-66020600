import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createApp, parseSlot } from './index.js';

async function withApp(fn, overrides = {}) {
  const records = [];
  const machines = [{ id: 1, name: 'เครื่อง 01', capacity_kg: 9 }, { id: 2, name: 'เครื่อง 02', capacity_kg: 12 }];
  const store = {
    async machines() { return machines; },
    async bookings() { return records; },
    async book(data) {
      if (!machines.some(m => m.id === data.machine_id)) return null;
      if (records.some(b => b.machine_id === data.machine_id && +b.slot === +data.slot && b.status === 'booked')) {
        throw Object.assign(new Error('duplicate'), { number: 2601 });
      }
      const booking = { ...data, id: records.length + 1, status: 'booked', cancelled_at: null };
      records.push(booking); return booking;
    },
    async cancel(id) {
      const booking = records.find(b => b.id === id);
      if (!booking) return null;
      if (booking.status === 'booked') {
        booking.status = 'cancelled'; booking.cancelled_at = '2030-01-01T00:00:00.000Z';
      }
      return booking;
    },
    ...overrides,
  };
  const app = createApp({ store, now: () => Date.parse('2030-01-01T00:00:00Z') });
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const call = (path, method = 'GET', body) => fetch(base + path, {
    method, headers: { 'Content-Type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  try { await fn(call); }
  finally { await new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }); }
}
const good = { machine_id: 1, customer_name: ' ทดสอบ ', date: '2030-01-02', hour: 10 };

test('Thai hourly slots use UTC+7; impossible dates and non-hour slots are rejected', () => {
  assert.equal(parseSlot('2030-01-02', 10).toISOString(), '2030-01-02T03:00:00.000Z');
  for (const [date, hour] of [['2030-02-30', 10], ['2030-01-02', 7], ['2030-01-02', 20], ['2030-01-02', 10.5], ['bad', 10], ['2030-01-02', '10']]) {
    assert.equal(parseSlot(date, hour), null);
  }
});
test('health and machine list', () => withApp(async call => {
  assert.deepEqual(await (await call('/')).json(), { ok: true, service: 'washq-api' });
  assert.equal((await (await call('/machines')).json()).length, 2);
}));
test('book, reject duplicate, cancel, retain history, and rebook the same slot', () => withApp(async call => {
  let response = await call('/bookings', 'POST', good);
  assert.equal(response.status, 201);
  const original = await response.json();
  assert.equal(original.customer_name, 'ทดสอบ');
  assert.equal((await call('/bookings', 'POST', good)).status, 409);
  assert.equal((await call('/bookings', 'POST', { ...good, machine_id: 2 })).status, 201);
  response = await call(`/bookings/${original.id}/cancel`, 'PATCH');
  assert.equal(response.status, 200);
  const cancelled = await response.json();
  assert.equal(cancelled.status, 'cancelled'); assert.ok(cancelled.cancelled_at);
  const repeated = await (await call(`/bookings/${original.id}/cancel`, 'PATCH')).json();
  assert.equal(repeated.cancelled_at, cancelled.cancelled_at);
  assert.equal((await call('/bookings', 'POST', good)).status, 201);
  const list = await (await call('/bookings')).json();
  assert.equal(list.length, 3);
  assert.equal(list.filter(b => b.status === 'cancelled').length, 1);
  assert.equal(list.filter(b => b.machine_id === 1 && b.status === 'booked').length, 1);
}));
test('validation rejects bad names, machines, dates, hours and past bookings before touching DB', () => withApp(async call => {
  for (const body of [null, {}, { ...good, machine_id: 0 }, { ...good, machine_id: '1' },
    { ...good, customer_name: '   ' }, { ...good, customer_name: 'x'.repeat(101) },
    { ...good, date: '2030-02-30' }, { ...good, hour: 10.5 }, { ...good, hour: 20 },
    { ...good, date: '2029-12-31' }]) {
    assert.equal((await call('/bookings', 'POST', body)).status, 400);
  }
}, { async book() { throw new Error('validation must not touch SQL'); } }));
test('missing machines and missing cancellation IDs return 404', () => withApp(async call => {
  assert.equal((await call('/bookings', 'POST', { ...good, machine_id: 999 })).status, 404);
  assert.equal((await call('/bookings/999/cancel', 'PATCH')).status, 404);
}));
test('invalid cancellation IDs are rejected without SQL', () => withApp(async call => {
  for (const id of ['abc', '-1', '0', '1.5', '2147483648', '1e2']) {
    assert.equal((await call(`/bookings/${id}/cancel`, 'PATCH')).status, 400);
  }
}, { async cancel() { throw new Error('must not touch SQL'); } }));
test('database errors are handled without exposing connection details', () => withApp(async call => {
  const r = await call('/bookings'); assert.equal(r.status, 503);
  assert.deepEqual(await r.json(), { error: 'database_not_configured' });
}, { async bookings() { throw Object.assign(new Error('secret'), { code: 'NO_DB_CONFIG' }); } }));
test('SQL unique constraint errors return conflict', () => withApp(async call => {
  const r = await call('/bookings', 'POST', good); assert.equal(r.status, 409);
  assert.deepEqual(await r.json(), { error: 'slot_taken' });
}, { async book() { throw Object.assign(new Error('duplicate'), { number: 2627 }); } }));
