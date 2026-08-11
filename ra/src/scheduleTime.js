const { DateTime } = require('luxon');

/** IANA timezone untuk parse .jadwal & pengulangan. Default Asia/Jakarta. */
function getScheduleTimeZone() {
  const raw = process.env.SCHEDULE_TZ && String(process.env.SCHEDULE_TZ).trim();
  if (!raw) return 'Asia/Jakarta';
  const probe = DateTime.now().setZone(raw);
  if (!probe.isValid) return 'Asia/Jakarta';
  return raw;
}

function padTimePart(tim) {
  const parts = String(tim || '').split(':');
  const h = Math.min(23, Math.max(0, parseInt(parts[0], 10) || 0));
  const m = Math.min(59, Math.max(0, parseInt(parts[1], 10) || 0));
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/** Tanggal + jam sebagai *wall time* di zona IANA → ISO UTC. */
function zonedYmdHmToUtcIso(dateYmd, timeHm, zone) {
  const t = padTimePart(timeHm);
  const dt = DateTime.fromISO(`${dateYmd}T${t}:00`, { zone });
  if (!dt.isValid) return null;
  return dt.toUTC().toISO();
}

/** Kirim berikutnya: jam tetap di `zone`, hari berikutnya jika sudah lewat. */
function nextDailyFromNow(timeHm, zone) {
  const t = padTimePart(timeHm);
  const [H, M] = t.split(':').map((x) => parseInt(x, 10));
  const now = DateTime.now().setZone(zone);
  let d = now.set({ hour: H, minute: M, second: 0, millisecond: 0 });
  if (d <= now) d = d.plus({ days: 1 });
  return d.toUTC().toISO();
}

/**
 * Hari minggu JS: 0=Minggu … 6=Sabtu (sama Date.getDay).
 * Luxon: 1=Senin … 7=Minggu.
 */
function nextWeeklyFromNow(jsDow, timeHm, zone) {
  const t = padTimePart(timeHm);
  const [H, M] = t.split(':').map((x) => parseInt(x, 10));
  const now = DateTime.now().setZone(zone);
  const luxWant = jsDow === 0 ? 7 : jsDow;
  for (let add = 0; add < 14; add++) {
    const cand = now.plus({ days: add }).set({ hour: H, minute: M, second: 0, millisecond: 0 });
    if (cand.weekday === luxWant && cand > now) return cand.toUTC().toISO();
  }
  return null;
}

/** Setelah kirim sukses: hitung jadwal berikutnya untuk harian/mingguan. */
function computeNextFireAfterSend(row) {
  const zone = row.schedule_timezone || getScheduleTimeZone();
  const kind = row.repeat_kind || 'once';
  const tl = row.repeat_time_local != null ? padTimePart(row.repeat_time_local) : null;
  if (kind === 'daily' && tl) return nextDailyFromNow(tl, zone);
  if (kind === 'weekly' && tl != null && row.repeat_dow !== null && row.repeat_dow !== undefined) {
    return nextWeeklyFromNow(Number(row.repeat_dow), tl, zone);
  }
  return null;
}

const ID_DAY = {
  minggu: 0,
  ahad: 0,
  senin: 1,
  selasa: 2,
  rabu: 3,
  kamis: 4,
  jumat: 5,
  sabtu: 6,
};

function parseIndonesianDayToken(s) {
  const k = String(s || '')
    .trim()
    .toLowerCase()
    .replace(/\.$/, '');
  return Object.prototype.hasOwnProperty.call(ID_DAY, k) ? ID_DAY[k] : null;
}

/** Luxon weekday 1–7 (Sen–Min) → JS 0–6 (Min–Sab) */
function luxonWeekdayToJs(lw) {
  return lw === 7 ? 0 : lw;
}

function formatRepeatLabel(row) {
  const k = row.repeat_kind || 'once';
  if (k === 'daily') return 'harian';
  if (k === 'weekly') {
    const names = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'];
    const d = row.repeat_dow;
    const nm = d >= 0 && d <= 6 ? names[d] : '?';
    return `mingguan · ${nm}`;
  }
  return 'sekali';
}

module.exports = {
  getScheduleTimeZone,
  padTimePart,
  zonedYmdHmToUtcIso,
  nextDailyFromNow,
  nextWeeklyFromNow,
  computeNextFireAfterSend,
  parseIndonesianDayToken,
  luxonWeekdayToJs,
  formatRepeatLabel,
};
