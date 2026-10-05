import { test } from 'node:test';
import assert from 'node:assert/strict';
import sql from 'mssql';
import { createSqlStore } from './store.js';

// Only run against the disposable SQL Server provided by the test workflow.
const connection = process.env.WASHQ_TEST_SQL;
test('SQL: schema is repeatable; simultaneous bookings cannot collide; cancellation keeps history', {
  skip: !connection, timeout: 180000,
}, async () => {
  let pool;
  for (let attempt = 0; attempt < 30; attempt++) {
    const candidate = new sql.ConnectionPool(connection);
    try { pool = await candidate.connect(); break; }
    catch (error) {
      await candidate.close().catch(() => {});
      if (attempt === 29) throw error;
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  }
  try {
    const store = createSqlStore(async () => pool);
    assert.equal((await store.machines()).length, 3);
    const secondInstance = createSqlStore(async () => pool);
    assert.equal((await secondInstance.machines()).length, 3);
    const booking = { machine_id: 1, customer_name: 'TEST SQL', slot: new Date('2099-01-02T03:00:00Z') };
    const results = await Promise.allSettled([store.book(booking), secondInstance.book(booking)]);
    assert.equal(results.filter(r => r.status === 'fulfilled').length, 1);
    const failed = results.find(r => r.status === 'rejected');
    assert.ok([2601, 2627].includes(failed.reason.number));
    const first = results.find(r => r.status === 'fulfilled').value;
    const cancelled = await store.cancel(first.id);
    assert.equal(cancelled.status, 'cancelled'); assert.ok(cancelled.cancelled_at);
    assert.equal(+(await store.cancel(first.id)).cancelled_at, +cancelled.cancelled_at);
    const next = await store.book(booking);
    assert.notEqual(next.id, first.id);
    const all = await store.bookings();
    assert.equal(all.find(b => b.id === first.id).status, 'cancelled');
    assert.equal(all.find(b => b.id === next.id).status, 'booked');
    assert.equal(await store.cancel(2147483647), null);
    assert.equal(await store.book({ ...booking, machine_id: 999 }), null);
  } finally { await pool.close(); }
});
