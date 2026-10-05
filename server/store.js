import { readFile } from 'node:fs/promises';
import sql from 'mssql';
import { getSqlPool } from './db.js';

export function createSqlStore(getPool = getSqlPool) {
  let initialization;
  async function ready() {
    const pool = await getPool();
    if (!initialization) {
      initialization = readFile(new URL('./sql/laundry.sql', import.meta.url), 'utf8')
        .then(script => pool.request().batch(script))
        .catch(error => { initialization = undefined; throw error; });
    }
    await initialization;
    return pool;
  }
  return {
    async machines() {
      const pool = await ready();
      return (await pool.request().query('SELECT id, name, capacity_kg FROM dbo.laundry_machines ORDER BY id')).recordset;
    },
    async bookings() {
      const pool = await ready();
      return (await pool.request().query(`
        SELECT b.*, m.name AS machine_name, m.capacity_kg
        FROM dbo.laundry_bookings b JOIN dbo.laundry_machines m ON m.id = b.machine_id
        ORDER BY b.slot DESC, b.id DESC
      `)).recordset;
    },
    async book({ machine_id, customer_name, slot }) {
      const pool = await ready();
      // A filtered unique index arbitrates simultaneous bookings, including across API instances.
      const result = await pool.request()
        .input('machine_id', sql.Int, machine_id)
        .input('customer_name', sql.NVarChar(100), customer_name)
        .input('slot', sql.DateTime2(0), slot)
        .query(`INSERT INTO dbo.laundry_bookings(machine_id, customer_name, slot)
          OUTPUT INSERTED.*
          SELECT @machine_id, @customer_name, @slot
          WHERE EXISTS (SELECT 1 FROM dbo.laundry_machines WHERE id = @machine_id)`);
      return result.recordset[0] || null;
    },
    async cancel(id) {
      const pool = await ready();
      const result = await pool.request().input('id', sql.Int, id).query(`
        UPDATE dbo.laundry_bookings
        SET status = 'cancelled', cancelled_at = SYSUTCDATETIME()
        OUTPUT INSERTED.*
        WHERE id = @id AND status = 'booked';
      `);
      if (result.recordset[0]) return result.recordset[0];
      // Repeating cancellation is safe and preserves the original cancellation time.
      return (await pool.request().input('id', sql.Int, id)
        .query('SELECT * FROM dbo.laundry_bookings WHERE id = @id')).recordset[0] || null;
    },
  };
}
