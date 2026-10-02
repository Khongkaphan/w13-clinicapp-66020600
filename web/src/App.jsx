import { useEffect, useState } from 'react';

const API_BASE = import.meta.env.VITE_API_BASE || '/api';

export default function App() {
  const [doctors, setDoctors] = useState([]);
  const [appointments, setAppointments] = useState([]);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ doctor_id: '', patient_name: '', slot: '' });
  const [submitting, setSubmitting] = useState(false);
  const [cancellingId, setCancellingId] = useState(null);


  async function load() {
    try {
      setError(null);
      const [d, a] = await Promise.all([
        fetch(`${API_BASE}/doctors`).then(r => r.ok ? r.json() : r.json().then(e => Promise.reject(e))),
        fetch(`${API_BASE}/appointments`).then(r => r.ok ? r.json() : r.json().then(e => Promise.reject(e))),
      ]);
      setDoctors(d);
      setAppointments(a);
      if (d.length && !form.doctor_id) setForm(f => ({ ...f, doctor_id: d[0].id }));
    } catch (e) {
      setError(e.error || 'failed_to_load');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  async function onSubmit(e) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const r = await fetch(`${API_BASE}/appointments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      if (!r.ok) {
        const e = await r.json().catch(() => ({ error: 'http_error' }));
        throw e;
      }
      setForm({ doctor_id: doctors[0]?.id || '', patient_name: '', slot: '' });
      await load();
    } catch (e) {
      setError(e.error || 'failed_to_book');
    } finally {
      setSubmitting(false);
    }
  }
  async function onCancel(id) {if (!confirm('ยกเลิกนัดนี้จริงไหม?')) return;setCancellingId(id);setError(null);try {const r = await fetch(`${API_BASE}/appointments/${id}`, { method: 'DELETE' });if (!r.ok) throw await r.json().catch(() => ({ error: 'http_error' }));await load();} catch (e) {setError(e.error || 'failed_to_cancel');} finally {setCancellingId(null);}}



  return (
    <main style={{ fontFamily: 'system-ui, sans-serif', maxWidth: 720, margin: '2rem auto', padding: '0 1rem' }}>
      <h1>Bangkok Hospital — Clinic Appointments</h1>
      <p style={{ color: '#666' }}>225381 · W13 starter</p>

      {loading && <p>Loading…</p>}
      {error && <p style={{ color: '#c00' }}>Error: {error}</p>}

      <section>
        <h2>Doctors</h2>
        {doctors.length === 0
          ? <p>(no doctors — load schema.sql + seed-data.sql first)</p>
          : <ul>{doctors.map(d => <li key={d.id}>{d.name} — <em>{d.specialty}</em></li>)}</ul>}
      </section>

      <section>
        <h2>Book an appointment</h2>
        <form onSubmit={onSubmit} style={{ display: 'grid', gap: '0.5rem', maxWidth: 360 }}>
          <label>
            Doctor
            <select
              value={form.doctor_id}
              onChange={e => setForm(f => ({ ...f, doctor_id: e.target.value }))}
              required
            >
              {doctors.map(d => <option key={d.id} value={d.id}>{d.name} — {d.specialty}</option>)}
            </select>
          </label>
          <label>
            Patient name
            <input
              type="text"
              value={form.patient_name}
              onChange={e => setForm(f => ({ ...f, patient_name: e.target.value }))}
              required
            />
          </label>
          <label>
            Slot (ISO datetime)
            <input
              type="datetime-local"
              value={form.slot}
              onChange={e => setForm(f => ({ ...f, slot: e.target.value }))}
              required
            />
          </label>
          <button type="submit" disabled={submitting || !doctors.length}>
            {submitting ? 'Booking…' : 'Book'}
          </button>
        </form>
      </section>

      <section>
        <h2>Appointments</h2>
        {appointments.length === 0
          ? <p>(none yet)</p>
          : (
            <table style={{ borderCollapse: 'collapse', width: '100%' }}>
              <thead>
                <tr style={{ textAlign: 'left', borderBottom: '1px solid #ccc' }}>
                  <th style={{ padding: '0.25rem' }}>Slot</th>
                  <th style={{ padding: '0.25rem' }}>Patient</th>
                  <th style={{ padding: '0.25rem' }}>Doctor</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {appointments.map(a => (
                  <tr key={a.id} style={{ borderBottom: '1px solid #eee' }}>
                    <td style={{ padding: '0.25rem' }}>{new Date(a.slot).toLocaleString()}</td>
                    <td style={{ padding: '0.25rem' }}>{a.patient_name}</td>
                    <td style={{ padding: '0.25rem' }}>{a.doctor_name} <em>({a.specialty})</em></td>
                    <td style={{ padding: '0.25rem' }}><button onClick={() => onCancel(a.id)} disabled={cancellingId !== null} style={{ color: '#c00' }}>{cancellingId === a.id ? 'Cancelling…' : 'Cancel'}</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
      </section>
    </main>
  );
}
