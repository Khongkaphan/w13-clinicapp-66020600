import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { createSqlStore } from './store.js';

const validId = value => Number.isInteger(value) && value > 0 && value <= 2147483647;

export function parseSlot(date, hour) {
  if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
      !Number.isInteger(hour) || hour < 8 || hour > 19) return null;
  const midnight = new Date(`${date}T00:00:00.000Z`);
  if (!Number.isFinite(midnight.getTime()) || midnight.toISOString().slice(0, 10) !== date) return null;
  const slot = new Date(`${date}T${String(hour).padStart(2, '0')}:00:00+07:00`);
  return Number.isFinite(slot.getTime()) ? slot : null;
}

export function createApp({ store = createSqlStore(), now = () => Date.now() } = {}) {
  const app = express();
  app.use(cors());
  app.use(express.json({ limit: '16kb' }));
  app.get('/', (_req, res) => res.json({ ok: true, service: 'washq-api' }));
  app.get('/machines', async (_req, res, next) => {
    try { res.json(await store.machines()); } catch (error) { next(error); }
  });
  app.get('/bookings', async (_req, res, next) => {
    try { res.json(await store.bookings()); } catch (error) { next(error); }
  });
  app.post('/bookings', async (req, res, next) => {
    const { machine_id, customer_name, date, hour } = req.body || {};
    const slot = parseSlot(date, hour);
    if (!validId(machine_id)) return res.status(400).json({ error: 'invalid_machine' });
    if (typeof customer_name !== 'string' || !customer_name.trim() || customer_name.trim().length > 100) {
      return res.status(400).json({ error: 'invalid_name' });
    }
    if (!slot) return res.status(400).json({ error: 'invalid_slot' });
    if (slot.getTime() <= now()) return res.status(400).json({ error: 'past_slot' });
    try {
      const booking = await store.book({ machine_id, customer_name: customer_name.trim(), slot });
      if (!booking) return res.status(404).json({ error: 'machine_not_found' });
      res.status(201).json(booking);
    } catch (error) { next(error); }
  });
  app.patch('/bookings/:id/cancel', async (req, res, next) => {
    if (!/^\d+$/.test(req.params.id) || !validId(Number(req.params.id))) {
      return res.status(400).json({ error: 'invalid_id' });
    }
    try {
      const booking = await store.cancel(Number(req.params.id));
      if (!booking) return res.status(404).json({ error: 'not_found' });
      res.json(booking);
    } catch (error) { next(error); }
  });
  app.use((_req, res) => res.status(404).json({ error: 'not_found' }));
  app.use((error, _req, res, _next) => {
    if (error.type === 'entity.parse.failed') return res.status(400).json({ error: 'invalid_json' });
    if (error.type === 'entity.too.large') return res.status(413).json({ error: 'request_too_large' });
    if (error.code === 'NO_DB_CONFIG') return res.status(503).json({ error: 'database_not_configured' });
    if ([2601, 2627].includes(error.number) ||
        error.precedingErrors?.some(e => [2601, 2627].includes(e.number))) {
      return res.status(409).json({ error: 'slot_taken' });
    }
    console.error('WashQ request failed', error.code || error.number || error.name);
    res.status(500).json({ error: 'internal_error' });
  });
  return app;
}

const app = createApp();
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const port = process.env.PORT || 8080;
  app.listen(port, () => console.log(`washq-api listening on :${port}`));
}
export default app;
