import { useEffect, useState } from 'react';
import './styles.css';

const API_BASE = (import.meta.env.VITE_API_BASE || '/api').replace(/\/$/, '');
const hours = Array.from({ length: 12 }, (_, i) => i + 8);
const timeRange = hour => `${String(hour).padStart(2, '0')}:00–${String(hour + 1).padStart(2, '0')}:00`;
const thaiDate = value => new Intl.DateTimeFormat('th-TH', {
  timeZone: 'Asia/Bangkok', day: 'numeric', month: 'short', year: 'numeric',
}).format(new Date(value));
const thaiTime = value => new Intl.DateTimeFormat('th-TH', {
  timeZone: 'Asia/Bangkok', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
}).format(new Date(value));
const today = () => new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Bangkok', year: 'numeric', month: '2-digit', day: '2-digit',
}).format(new Date());
const startTime = (date, hour) => new Date(`${date}T${String(hour).padStart(2, '0')}:00:00+07:00`).getTime();
const messages = {
  invalid_machine: 'กรุณาเลือกเครื่องซักผ้า', invalid_name: 'กรุณากรอกชื่อ 1–100 ตัวอักษร',
  invalid_slot: 'กรุณาเลือกวันที่และรอบเวลาให้ถูกต้อง', past_slot: 'รอบนี้ผ่านไปแล้ว กรุณาเลือกรอบใหม่',
  machine_not_found: 'ไม่พบเครื่องซักผ้านี้', slot_taken: 'มีคนจองรอบนี้แล้ว กรุณาเลือกรอบอื่น',
  not_found: 'ไม่พบรายการจอง', database_not_configured: 'ยังไม่ได้ตั้งค่าการเชื่อมต่อฐานข้อมูล',
  internal_error: 'ระบบขัดข้อง กรุณาลองอีกครั้ง', network_error: 'เชื่อมต่อระบบไม่ได้ กรุณาลองอีกครั้ง',
};
async function request(path, options) {
  let response;
  try { response = await fetch(`${API_BASE}${path}`, { ...options, signal: AbortSignal.timeout(30000) }); }
  catch { throw new Error('network_error'); }
  const body = await response.json().catch(() => null);
  if (!response.ok) throw new Error(body?.error || 'internal_error');
  if (body === null) throw new Error('internal_error');
  return body;
}

export default function App() {
  const [machines, setMachines] = useState([]);
  const [bookings, setBookings] = useState([]);
  const [form, setForm] = useState({ machine_id: 1, customer_name: '', date: today(), hour: '' });
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [clock, setClock] = useState(Date.now());
  const [filter, setFilter] = useState('all');

  async function refresh() {
    const [m, b] = await Promise.all([request('/machines'), request('/bookings')]);
    setMachines(m); setBookings(b);
  }
  async function reload() {
    setLoading(true); setError('');
    try { await refresh(); }
    catch (e) { setError(messages[e.message] || messages.internal_error); }
    finally { setLoading(false); }
  }
  useEffect(() => {
    reload();
    const timer = setInterval(() => setClock(Date.now()), 15000);
    return () => clearInterval(timer);
  }, []);
  const occupied = hour => bookings.some(b => b.status === 'booked' &&
    b.machine_id === form.machine_id && new Date(b.slot).getTime() === startTime(form.date, hour));
  const past = hour => !form.date || !Number.isFinite(startTime(form.date, hour)) || startTime(form.date, hour) <= clock;
  const validSelection = form.hour !== '' && !past(Number(form.hour)) && !occupied(Number(form.hour));

  async function book(event) {
    event.preventDefault();
    if (busy || !validSelection) return;
    setBusy('book'); setError(''); setSuccess('');
    try {
      const result = await request('/bookings', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, hour: Number(form.hour) }),
      });
      const machine = machines.find(m => m.id === result.machine_id);
      setBookings(previous => [{ ...result, machine_name: machine?.name }, ...previous]);
      setForm(f => ({ ...f, customer_name: '', hour: '' }));
      setSuccess(`จองสำเร็จ · ${machine?.name || 'เครื่องซักผ้า'} · ${thaiDate(result.slot)} ${thaiTime(result.slot)} น.`);
      try { await refresh(); }
      catch { setError('จองสำเร็จแล้ว แต่โหลดรายการล่าสุดไม่ได้ กรุณากดรีเฟรชรายการ'); }
    } catch (e) {
      setError(messages[e.message] || messages.internal_error);
      if (e.message === 'slot_taken') {
        setForm(f => ({ ...f, hour: '' }));
        await refresh().catch(() => {});
      }
    } finally { setBusy(null); }
  }
  async function cancel(booking) {
    if (busy || !window.confirm(`ยกเลิกคิวของ ${booking.customer_name}\n${booking.machine_name} · ${thaiDate(booking.slot)} ${thaiTime(booking.slot)} น. ใช่ไหม?`)) return;
    setBusy(booking.id); setError(''); setSuccess('');
    try {
      const updated = await request(`/bookings/${booking.id}/cancel`, { method: 'PATCH' });
      setBookings(previous => previous.map(b => b.id === booking.id ? { ...b, ...updated } : b));
      setSuccess('ยกเลิกคิวแล้ว รายการยังอยู่ในประวัติ และรอบนี้เปิดให้จองใหม่ได้');
      try { await refresh(); }
      catch { setError('ยกเลิกสำเร็จแล้ว แต่โหลดรายการล่าสุดไม่ได้ กรุณากดรีเฟรชรายการ'); }
    } catch (e) { setError(messages[e.message] || messages.internal_error); }
    finally { setBusy(null); }
  }
  const visible = bookings.filter(b => filter === 'all' || b.status === filter);
  const selectedMachine = machines.find(m => m.id === form.machine_id);
  return (
    <div className="app-shell">
      <header className="topbar"><a className="brand" href="#">Wash<span>Q</span><span className="brand-dot" /></a><span className="topbar-note">จองคิวซักผ้าออนไลน์</span><span className="open-hours">08:00–20:00 น.</span></header>
      <main>
        <section className="intro"><div><p className="eyebrow">YOUR LAUNDRY, ON YOUR TIME</p><h1>คิวซักผ้าที่เลือกได้<br /><span>ให้เวลาว่างเป็นของคุณ</span></h1><p className="intro-copy">เลือกเครื่อง เลือกเวลา แล้วมาซักตามนัด<br />จองง่าย ยกเลิกได้ และดูประวัติได้ในที่เดียว</p></div><div className="hero-mark" aria-hidden="true"><div className="washer-top"><i /><i /><b /></div><div className="washer-door"><div className="water" /></div><span>WASH · RINSE · RELAX</span></div></section>
        <div aria-live="polite" className="notices">{success && <p className="notice success" role="status">✓ {success}</p>}{error && <p className="notice error" role="alert">{error}</p>}</div>
        <div className="booking-layout">
          <section aria-labelledby="machine-heading"><div className="section-heading"><span className="step">01</span><div><h2 id="machine-heading">เลือกเครื่องซักผ้า</h2><p>หนึ่งรอบใช้เวลา 1 ชั่วโมง</p></div></div>
            <div className="machine-list">{machines.map(m => <button type="button" key={m.id} aria-pressed={form.machine_id === m.id} disabled={busy !== null || loading} className={`machine-card ${form.machine_id === m.id ? 'selected' : ''}`} onClick={() => setForm(f => ({ ...f, machine_id: m.id, hour: '' }))}><span className="mini-washer" aria-hidden="true">◉</span><span className="machine-info"><strong>{m.name}</strong><span>ความจุ {m.capacity_kg} กก.</span></span><span className="select-circle" aria-hidden="true">{form.machine_id === m.id ? '✓' : ''}</span></button>)}</div>
            {loading && <p className="empty">กำลังโหลดข้อมูล…</p>}{!loading && !machines.length && <p className="empty">ยังไม่มีข้อมูลเครื่องซักผ้า ลองรีเฟรชรายการอีกครั้ง</p>}
            <div className="how-it-works"><strong>มาให้ตรงรอบ แล้วเริ่มซักได้เลย</strong><p>ชำระเงินโดยหยอดเหรียญที่ร้าน<br />หากเปลี่ยนแผน กดยกเลิกคิวด้านล่างได้</p></div>
          </section>
          <section className="form-panel" aria-labelledby="booking-heading"><div className="section-heading"><span className="step">02</span><div><h2 id="booking-heading">จองเวลาของคุณ</h2><p>{selectedMachine ? `${selectedMachine.name} · ${selectedMachine.capacity_kg} กก.` : 'เลือกเครื่องเพื่อเริ่มจอง'}</p></div></div>
            <form onSubmit={book}><fieldset disabled={busy !== null || loading || !machines.length}><div className="form-fields"><label>ชื่อผู้จอง<input name="customer_name" autoComplete="name" placeholder="กรอกชื่อของคุณ" maxLength={100} required value={form.customer_name} onChange={e => setForm(f => ({ ...f, customer_name: e.target.value }))} /></label><label>วันที่ต้องการซัก<input type="date" required min={today()} value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value, hour: '' }))} /></label></div>
              <div className="slot-label"><span id="slot-label">เลือกรอบเวลา</span><small>เวลาไทย · รอบละ 1 ชั่วโมง</small></div><div className="slots" role="group" aria-labelledby="slot-label">{hours.map(hour => <button key={hour} type="button" className={`slot ${form.hour === hour ? 'chosen' : ''}`} aria-pressed={form.hour === hour} disabled={past(hour) || occupied(hour)} onClick={() => setForm(f => ({ ...f, hour }))}><strong>{timeRange(hour)}</strong><span>{past(hour) ? 'ผ่านแล้ว' : occupied(hour) ? 'เต็มแล้ว' : 'ว่าง'}</span></button>)}</div>
              <button className="primary-button" type="submit" disabled={!validSelection || !form.customer_name.trim()}>{busy === 'book' ? 'กำลังจอง…' : 'ยืนยันการจอง'}<span aria-hidden="true">→</span></button>
            </fieldset></form>
          </section>
        </div>
        <section className="history" aria-labelledby="history-heading"><div className="history-heading"><div className="section-heading"><span className="step">03</span><div><h2 id="history-heading">รายการจองและประวัติ</h2><p>รายการที่ยกเลิกจะยังอยู่ให้ตรวจสอบได้</p></div></div><button type="button" className="refresh" onClick={reload} disabled={loading || busy !== null}>{loading ? 'กำลังโหลด…' : '↻ รีเฟรชรายการ'}</button></div>
          <div className="filters" role="group" aria-label="กรองสถานะ">{[['all', 'ทั้งหมด'], ['booked', 'จองแล้ว'], ['cancelled', 'ยกเลิกแล้ว']].map(([value, label]) => <button type="button" key={value} aria-pressed={filter === value} className={filter === value ? 'active' : ''} onClick={() => setFilter(value)}>{label}<span>{value === 'all' ? bookings.length : bookings.filter(b => b.status === value).length}</span></button>)}</div>
          <div className="table-scroll"><table><thead><tr><th>ผู้จอง</th><th>เครื่องซักผ้า</th><th>รอบเวลา</th><th>สถานะ</th><th>จัดการ</th></tr></thead><tbody>{visible.map(b => <tr key={b.id} className={b.status === 'cancelled' ? 'cancelled-row' : ''}><td><strong>{b.customer_name}</strong></td><td>{b.machine_name}</td><td>{thaiDate(b.slot)}<small>{thaiTime(b.slot)}–{thaiTime(new Date(new Date(b.slot).getTime() + 3600000))} น.</small></td><td><span className={`status ${b.status}`}>{b.status === 'booked' ? 'จองแล้ว' : 'ยกเลิกแล้ว'}</span>{b.cancelled_at && <small>ยกเลิก {thaiDate(b.cancelled_at)} {thaiTime(b.cancelled_at)} น.</small>}</td><td>{b.status === 'booked' ? <button className="cancel-button" disabled={busy !== null || loading} onClick={() => cancel(b)} aria-label={`ยกเลิกคิวของ ${b.customer_name} ${b.machine_name}`}>{busy === b.id ? 'กำลังยกเลิก…' : 'Cancel'}</button> : <span className="muted">—</span>}</td></tr>)}</tbody></table>{!visible.length && <div className="empty-state"><span aria-hidden="true">◷</span><h3>{loading ? 'กำลังโหลดรายการ' : 'ยังไม่มีรายการในหมวดนี้'}</h3><p>เริ่มจองเครื่องและรอบเวลาที่คุณสะดวกได้ด้านบน</p></div>}</div>
        </section>
      </main><footer><span className="brand">Wash<span>Q</span></span><span>มินิโปรเจกต์สาธิต · รายการจองใช้ร่วมกันและทุกคนสามารถยกเลิกได้</span></footer>
    </div>
  );
}
