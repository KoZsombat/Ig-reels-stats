// Pure parsing + statistics helpers. No DOM access, so this file can be
// unit-tested with `node --test`.

// Instagram's "Download your information" export stores watched videos/reels in
// a file named videos_watched.json. Its location has moved between export
// versions (ads_and_topics/, your_instagram_activity/ads_and_topics/,
// ads_information/ads_and_topics/ ...), so match on the file name only.
const WATCH_FILE_RE = /(videos_watched|reels_watched)[^/]*\.json$/i;

export function isWatchHistoryFile(path) {
  return WATCH_FILE_RE.test(path);
}

// Normalise a unix timestamp that may be in seconds or milliseconds.
function toMillis(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return null;
  return n < 1e12 ? n * 1000 : n;
}

function pickTimestamp(obj) {
  if (obj.timestamp != null) return toMillis(obj.timestamp);
  const smd = obj.string_map_data;
  if (smd && typeof smd === "object") {
    if (smd.Time?.timestamp != null) return toMillis(smd.Time.timestamp);
    for (const v of Object.values(smd)) {
      if (v && typeof v === "object" && v.timestamp != null) return toMillis(v.timestamp);
    }
  }
  return null;
}

function pickAuthor(obj) {
  const smd = obj.string_map_data;
  if (smd && typeof smd === "object") {
    const a = smd.Author ?? smd.Owner ?? smd.Username;
    if (a?.value) return String(a.value);
  }
  if (Array.isArray(obj.label_values)) {
    for (const lv of obj.label_values) {
      if (/author|owner|user/i.test(lv?.label ?? "")) {
        if (lv.value) return String(lv.value);
        const nested = lv.dict?.[0]?.dict?.find?.((d) => /user/i.test(d?.label ?? ""));
        if (nested?.value) return String(nested.value);
      }
    }
  }
  return "";
}

// Walk any JSON structure from the export and collect {ts, author} entries.
// An "entry" is an object inside an array that carries a usable timestamp.
export function extractEntries(json) {
  const out = [];
  const visit = (node) => {
    if (Array.isArray(node)) {
      for (const item of node) {
        if (item && typeof item === "object" && !Array.isArray(item)) {
          const ts = pickTimestamp(item);
          if (ts != null) {
            out.push({ ts, author: pickAuthor(item) });
            continue;
          }
        }
        visit(item);
      }
    } else if (node && typeof node === "object") {
      for (const v of Object.values(node)) visit(v);
    }
  };
  visit(json);
  return out;
}

export function dedupe(entries) {
  const seen = new Set();
  return entries.filter((e) => {
    const key = `${e.ts}|${e.author}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// Local-time calendar day key, e.g. "2026-10-05".
export function dayKey(ms) {
  const d = new Date(ms);
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

function nextDay(key) {
  const [y, m, d] = key.split("-").map(Number);
  return dayKey(new Date(y, m - 1, d + 1, 12).getTime());
}

// Build a gap-free list of days (zero-filled) between the first and last
// watched reel, optionally limited to the last `lastNDays` days of the data.
export function computeStats(entries, { lastNDays = null } = {}) {
  if (!entries.length) return null;
  const counts = new Map();
  let min = Infinity;
  let max = -Infinity;
  for (const { ts } of entries) {
    const k = dayKey(ts);
    counts.set(k, (counts.get(k) ?? 0) + 1);
    if (ts < min) min = ts;
    if (ts > max) max = ts;
  }

  const days = [];
  const last = dayKey(max);
  for (let k = dayKey(min); ; k = nextDay(k)) {
    days.push({ date: k, count: counts.get(k) ?? 0 });
    if (k === last) break;
  }

  const range = lastNDays ? days.slice(-lastNDays) : days;
  const total = range.reduce((s, d) => s + d.count, 0);
  const active = range.filter((d) => d.count > 0);
  const busiest = range.reduce((b, d) => (d.count > b.count ? d : b), range[0]);
  const sorted = range.map((d) => d.count).sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const median = sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;

  const weekday = Array.from({ length: 7 }, () => ({ total: 0, days: 0 }));
  for (const d of range) {
    const [y, m, dd] = d.date.split("-").map(Number);
    const w = weekday[new Date(y, m - 1, dd).getDay()];
    w.total += d.count;
    w.days += 1;
  }

  return {
    days: range,
    total,
    dayCount: range.length,
    activeDays: active.length,
    avgPerDay: total / range.length,
    avgPerActiveDay: active.length ? total / active.length : 0,
    median,
    busiest,
    weekdayAvg: weekday.map((w) => (w.days ? w.total / w.days : 0)),
    firstDay: range[0].date,
    lastDay: range[range.length - 1].date,
  };
}
