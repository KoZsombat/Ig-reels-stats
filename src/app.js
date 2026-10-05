import { isWatchHistoryFile, extractEntries, dedupe, computeStats } from "./stats.js";

const $ = (id) => document.getElementById(id);
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const fmt1 = (n) => (Math.round(n * 10) / 10).toLocaleString();
const fmtDate = (key, opts = { month: "short", day: "numeric", year: "numeric" }) => {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, opts);
};

let entries = [];
let rangeDays = null;
let current = null;

function setStatus(msg, isError = false) {
  const el = $("status");
  el.textContent = msg;
  el.classList.toggle("error", isError);
}

// ---------- Loading ----------

async function readFiles(files) {
  const found = [];
  let scanned = 0;
  for (const file of files) {
    const name = file.name.toLowerCase();
    if (name.endsWith(".zip")) {
      if (!window.JSZip) throw new Error("ZIP reader failed to load. Check your connection and reload.");
      setStatus(`Opening ${file.name}…`);
      const zip = await window.JSZip.loadAsync(file);
      const matches = Object.values(zip.files).filter((f) => !f.dir && isWatchHistoryFile(f.name));
      if (!matches.length && Object.keys(zip.files).some((p) => /videos_watched\.html$/i.test(p))) {
        throw new Error("This export is in HTML format. Request a new export with Format: JSON.");
      }
      for (const f of matches) {
        found.push(...extractEntries(JSON.parse(await f.async("string"))));
        scanned++;
      }
    } else if (name.endsWith(".json")) {
      found.push(...extractEntries(JSON.parse(await file.text())));
      scanned++;
    }
  }
  if (!scanned) {
    throw new Error("Couldn't find videos_watched.json. Make sure the export includes \"Ads information\" and is in JSON format.");
  }
  return found;
}

async function handleFiles(fileList) {
  const files = [...fileList];
  if (!files.length) return;
  try {
    setStatus("Reading…");
    const found = dedupe(await readFiles(files));
    if (!found.length) throw new Error("The watch history file was found but it's empty.");
    load(found);
    setStatus(`Loaded ${found.length.toLocaleString()} watched videos.`);
  } catch (err) {
    console.error(err);
    setStatus(err.message || "Couldn't read that file.", true);
  }
}

function demoEntries() {
  const out = [];
  const now = new Date();
  for (let i = 59; i >= 0; i--) {
    const day = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
    const weekend = day.getDay() === 0 || day.getDay() === 6;
    const base = weekend ? 70 : 35;
    const n = Math.random() < 0.08 ? 0 : Math.max(0, Math.round(base + (Math.random() - 0.5) * base));
    for (let j = 0; j < n; j++) {
      out.push({ ts: day.getTime() + Math.floor(Math.random() * 86_400_000), author: `demo${j}` });
    }
  }
  return out;
}

function load(list) {
  entries = list;
  $("results").hidden = false;
  render();
  $("results").scrollIntoView({ behavior: "smooth", block: "start" });
}

// ---------- Rendering ----------

function render() {
  current = computeStats(entries, { lastNDays: rangeDays });
  const s = current;
  $("span").textContent = `${fmtDate(s.firstDay)} – ${fmtDate(s.lastDay)} · ${s.dayCount} days`;
  $("k-avg").innerHTML = `${fmt1(s.avgPerDay)} <small>reels/day</small>`;
  $("k-total").textContent = s.total.toLocaleString();
  $("k-median").textContent = fmt1(s.median);
  $("k-active").textContent = fmt1(s.avgPerActiveDay);
  $("k-busiest").innerHTML = `${s.busiest.count} <small>${fmtDate(s.busiest.date, { month: "short", day: "numeric" })}</small>`;
  renderChart(s);
  renderWeekday(s);
  renderTable(s);
}

function renderChart(s) {
  const W = 880, H = 260, padL = 36, padR = 8, padT = 12, padB = 28;
  const innerW = W - padL - padR, innerH = H - padT - padB;
  const maxVal = Math.max(1, ...s.days.map((d) => d.count));
  const step = niceStep(maxVal);
  const top = Math.ceil(maxVal / step) * step;
  const y = (v) => padT + innerH - (v / top) * innerH;
  const slot = innerW / s.days.length;
  const barW = Math.max(1, slot * 0.75);

  let svg = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Bar chart of reels watched per day">`;
  for (let v = 0; v <= top; v += step) {
    svg += `<line class="grid" x1="${padL}" x2="${W - padR}" y1="${y(v)}" y2="${y(v)}"/>`;
    svg += `<text class="axis" x="${padL - 6}" y="${y(v) + 4}" text-anchor="end">${v}</text>`;
  }
  const labelEvery = Math.ceil(s.days.length / 8);
  s.days.forEach((d, i) => {
    const x = padL + i * slot + (slot - barW) / 2;
    const h = Math.max(d.count ? 1 : 2, y(0) - y(d.count));
    svg += `<rect class="bar${d.count ? "" : " zero"}" x="${x}" y="${y(0) - h}" width="${barW}" height="${h}" rx="${Math.min(3, barW / 3)}">`
      + `<title>${fmtDate(d.date, { weekday: "short", month: "short", day: "numeric" })}: ${d.count} reels</title></rect>`;
    if (i % labelEvery === 0) {
      svg += `<text class="axis" x="${padL + i * slot + slot / 2}" y="${H - 8}" text-anchor="middle">${fmtDate(d.date, { month: "short", day: "numeric" })}</text>`;
    }
  });
  const ay = y(s.avgPerDay);
  svg += `<line class="avg" x1="${padL}" x2="${W - padR}" y1="${ay}" y2="${ay}"/>`;
  svg += `<text class="avg-label" x="${W - padR}" y="${ay - 5}" text-anchor="end">avg ${fmt1(s.avgPerDay)}</text>`;
  svg += "</svg>";
  $("chart").innerHTML = svg;
}

function niceStep(max) {
  const raw = max / 4;
  const mag = 10 ** Math.floor(Math.log10(raw || 1));
  const n = raw / mag;
  return Math.max(1, (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * mag);
}

function renderWeekday(s) {
  const max = Math.max(1, ...s.weekdayAvg);
  // Show Monday first.
  const order = [1, 2, 3, 4, 5, 6, 0];
  $("weekday").innerHTML = order.map((i) => {
    const v = s.weekdayAvg[i];
    return `<div class="col"><span class="v">${fmt1(v)}</span>`
      + `<div class="wbar" style="height:${(v / max) * 90}px"></div><span class="d">${WEEKDAYS[i]}</span></div>`;
  }).join("");
}

function renderTable(s) {
  const max = Math.max(1, ...s.days.map((d) => d.count));
  $("rows").innerHTML = [...s.days].reverse().map((d) => {
    const wd = fmtDate(d.date, { weekday: "short" });
    return `<tr class="${d.count ? "" : "zero"}"><td>${fmtDate(d.date)}</td><td>${wd}</td>`
      + `<td class="num">${d.count}</td><td><div class="tbar" style="width:${(d.count / max) * 100}%"></div></td></tr>`;
  }).join("");
}

function downloadCsv() {
  if (!current) return;
  const csv = "date,reels\n" + current.days.map((d) => `${d.date},${d.count}`).join("\n") + "\n";
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
  const a = Object.assign(document.createElement("a"), { href: url, download: "reels-per-day.csv" });
  a.click();
  URL.revokeObjectURL(url);
}

// ---------- Wiring ----------

$("file").addEventListener("change", (e) => handleFiles(e.target.files));
$("demo").addEventListener("click", () => {
  load(demoEntries());
  setStatus("Showing demo data. Drop your own export to see your real stats.");
});
$("csv").addEventListener("click", downloadCsv);

const drop = $("drop");
["dragenter", "dragover"].forEach((t) => drop.addEventListener(t, (e) => {
  e.preventDefault();
  drop.classList.add("over");
}));
["dragleave", "drop"].forEach((t) => drop.addEventListener(t, () => drop.classList.remove("over")));
drop.addEventListener("drop", (e) => {
  e.preventDefault();
  handleFiles(e.dataTransfer.files);
});

$("range").addEventListener("click", (e) => {
  const btn = e.target.closest("button");
  if (!btn) return;
  rangeDays = btn.dataset.days ? Number(btn.dataset.days) : null;
  for (const b of $("range").children) b.classList.toggle("on", b === btn);
  if (entries.length) render();
});
