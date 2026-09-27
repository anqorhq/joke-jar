import { db, persistStorage } from "./db.js";

const VERSION = "1.0.0"; // keep in sync with sw.js
const $ = id => document.getElementById(id);
const uid = () => crypto.randomUUID?.() ?? Math.random().toString(36).slice(2) + Date.now().toString(36);
const norm = s => (s || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

/* ---------- Settings (per-device, localStorage) ---------- */
const SETTINGS_KEY = "jokejar.settings";
const DEFAULTS = { voice: "", rate: 1, pause: 1.5, gap: 4, pool: "all" };
let settings = { ...DEFAULTS };
try { Object.assign(settings, JSON.parse(localStorage.getItem(SETTINGS_KEY)) || {}); } catch {}
function saveSettings() { try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); } catch {} }

/* ---------- State ---------- */
let jokes = [];
let history = [], hIdx = -1, bag = [];
let libFilter = "all";

const byId = id => jokes.find(j => j.id === id);
const current = () => byId(history[hIdx]);
const categories = () => [...new Set(jokes.map(j => j.cat).filter(Boolean))].sort((a, b) => a.localeCompare(b));

// Filters are shared by the Play "From" picker and the Library chips.
function matches(j, f) {
  if (f === "all") return true;
  if (f === "fav") return j.fav;
  if (f === "yt") return isYouTube(j.source);
  if (f.startsWith("cat:")) return j.cat === f.slice(4);
  return true;
}
function filterLabel(f) {
  return f === "all" ? "All jokes" : f === "fav" ? "★ Favourites" : f === "yt" ? "▶ From YouTube" : f.slice(4);
}
function availableFilters() {
  const f = ["all", "fav"];
  if (jokes.some(j => isYouTube(j.source))) f.push("yt");
  return f.concat(categories().map(c => "cat:" + c));
}

/* ---------- Links ---------- */
function safeUrl(s) {
  try { const u = new URL(s); return /^https?:$/.test(u.protocol) ? u : null; } catch { return null; }
}
function isYouTube(s) { const u = safeUrl(s); return !!u && /(^|\.)(youtube\.com|youtu\.be)$/.test(u.hostname); }
function fmtTime(sec) {
  const h = Math.floor(sec / 3600), m = Math.floor(sec % 3600 / 60), s = sec % 60;
  return (h ? h + ":" + String(m).padStart(2, "0") : m) + ":" + String(s).padStart(2, "0");
}
function sourceLabel(s) {
  const u = safeUrl(s); if (!u) return null;
  if (!isYouTube(s)) return "🔗 " + u.hostname.replace(/^www\./, "");
  const t = u.searchParams.get("t") || u.searchParams.get("start");
  let sec = 0;
  if (t) {
    const m = t.match(/^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s?)?$/);
    if (m) sec = (+m[1] || 0) * 3600 + (+m[2] || 0) * 60 + (+m[3] || 0);
  }
  return "▶ Watch on YouTube" + (sec ? " at " + fmtTime(sec) : "");
}

/* ---------- Toast ---------- */
function toast(msg, action, ms = 2000) {
  const t = $("toast");
  t.textContent = msg;
  if (action) {
    const b = document.createElement("button");
    b.textContent = action.label; b.onclick = action.run; t.append(b);
    ms = 10000;
  }
  t.classList.add("show");
  clearTimeout(t._h); t._h = setTimeout(() => t.classList.remove("show"), ms);
}

/* ---------- Views ---------- */
function show(v) {
  if (v === "add") { openEditor(); return; }
  for (const n of ["play", "lib", "set"]) $("v-" + n).classList.toggle("hide", n !== v);
  document.querySelectorAll("nav.tabs button").forEach(b => b.classList.toggle("on", b.dataset.v === v));
  if (v === "lib") renderLib();
  window.scrollTo(0, 0);
}
document.querySelectorAll("nav.tabs button").forEach(b => b.onclick = () => show(b.dataset.v));

/* ---------- Random picking ---------- */
// Shuffle bag: every joke in the pool plays once before any repeats.
function nextRandom() {
  const pool = jokes.filter(j => matches(j, settings.pool)).map(j => j.id);
  bag = bag.filter(id => pool.includes(id));
  if (!bag.length) {
    bag = pool.sort(() => Math.random() - .5);
    if (bag.length > 1 && bag[0] === history[hIdx]) bag.push(bag.shift());
  }
  return bag.shift() ?? null;
}
function goTo(id) {
  if (!id) return;
  history = history.slice(0, hIdx + 1);
  history.push(id);
  if (history.length > 200) history.shift();
  hIdx = history.length - 1;
  renderPlayer();
}

/* ---------- Player rendering ---------- */
function renderPool() {
  const opts = availableFilters();
  if (!opts.includes(settings.pool)) settings.pool = "all";
  $("pool").replaceChildren(...opts.map(f => {
    const o = new Option(`${filterLabel(f)} (${jokes.filter(j => matches(j, f)).length})`, f);
    o.selected = f === settings.pool; return o;
  }));
}
function renderPlayer() {
  renderPool();
  const j = current();
  const has = !!j;
  $("p-cat").textContent = has ? (j.cat || "Uncategorised") : "";
  $("p-setup").textContent = has ? j.setup
    : jokes.length ? "No jokes match this filter." : "Your jar is empty — tap ➕ to add a joke.";
  $("p-punch").textContent = j?.punch || "";
  $("p-punch").classList.toggle("hide", !j?.punch);
  $("p-punch").classList.add("hidden");
  $("b-reveal").disabled = !j?.punch;
  for (const id of ["b-speak", "b-fav", "b-edit", "b-hands"]) $(id).disabled = !has;
  $("b-random").disabled = !jokes.some(x => matches(x, settings.pool));
  $("b-prev").disabled = hIdx <= 0;
  const favTxt = j?.fav ? "★ Favourited" : "☆ Favourite";
  $("b-fav").textContent = favTxt; $("hf-fav").textContent = favTxt;

  const label = has && sourceLabel(j.source);
  $("p-source").classList.toggle("hide", !label);
  if (label) { $("p-source").textContent = label; $("p-source").href = safeUrl(j.source).href; }

  const poolSize = jokes.filter(x => matches(x, settings.pool)).length;
  $("p-meta").textContent = `${jokes.length} joke${jokes.length === 1 ? "" : "s"} in the jar` +
    (poolSize ? ` · ${poolSize - bag.length} of ${poolSize} told this round` : "");
}
const reveal = () => $("p-punch").classList.remove("hidden");
$("p-punch").onclick = reveal;
$("b-reveal").onclick = reveal;
$("pool").onchange = e => {
  settings.pool = e.target.value; saveSettings(); bag = [];
  if (speech.mode === "hands") skip(); else { stopSpeech(); goTo(nextRandom()); }
};
$("b-random").onclick = () => { stopSpeech(); goTo(nextRandom()); };
$("b-prev").onclick = () => { if (hIdx > 0) { stopSpeech(); hIdx--; renderPlayer(); } };
async function toggleFav() {
  const j = current(); if (!j) return;
  j.fav = !j.fav; j.updated = Date.now();
  await db.put(j); renderPlayer();
}
$("b-fav").onclick = toggleFav;
$("hf-fav").onclick = toggleFav;
$("b-edit").onclick = () => current() && openEditor(current());

/* ---------- Speech engine ----------
   One engine drives both "Read aloud" (single joke) and hands-free mode.
   Every scheduled callback captures `gen`; bumping it cancels anything in flight,
   which lets pause/skip/stop interrupt cleanly even mid-utterance. */
const synth = window.speechSynthesis;
const speech = { mode: "idle", phase: "setup", paused: false, gen: 0, timer: 0 };

function utter(text) {
  const u = new SpeechSynthesisUtterance(text);
  const v = synth.getVoices().find(v => v.name === settings.voice);
  if (v) { u.voice = v; u.lang = v.lang; }
  u.rate = settings.rate;
  return u;
}
function say(text, then) {
  const g = speech.gen;
  const u = utter(text);
  u.onend = () => { if (g === speech.gen) then(); };
  u.onerror = e => { if (g === speech.gen && e.error !== "interrupted" && e.error !== "canceled") then(); };
  synth.speak(u);
}
function wait(ms, then) {
  const g = speech.gen;
  speech.timer = setTimeout(() => { if (g === speech.gen) then(); }, ms);
}
function halt() { speech.gen++; clearTimeout(speech.timer); synth?.cancel(); }

function runPhase(phase) {
  speech.phase = phase;
  const j = current();
  if (!j) { stopSpeech(); return; }
  renderSpeechUI();
  if (phase === "setup") {
    $("p-punch").classList.add("hidden");
    say(j.setup, () => j.punch ? wait(settings.pause * 1000, () => runPhase("punch")) : jokeDone());
  } else if (phase === "punch") {
    reveal();
    say(j.punch, jokeDone);
  } else if (phase === "gap") {
    wait(settings.gap * 1000, () => {
      const id = nextRandom();
      if (!id) { stopSpeech(); return; }
      goTo(id); runPhase("setup");
    });
  }
}
function jokeDone() { speech.mode === "hands" ? runPhase("gap") : stopSpeech(); }

function start(mode) {
  if (!synth) { toast("Read-aloud isn't supported in this browser"); return; }
  halt();
  speech.mode = mode; speech.paused = false;
  if (mode === "hands") { wakeLock(true); if (!current()) goTo(nextRandom()); }
  runPhase("setup");
}
function stopSpeech() {
  halt();
  if (speech.mode === "hands") wakeLock(false);
  speech.mode = "idle"; speech.paused = false;
  renderSpeechUI();
}
function togglePause() {
  if (speech.mode !== "hands") return;
  if (speech.paused) { speech.paused = false; runPhase(speech.phase); }
  else { halt(); speech.paused = true; renderSpeechUI(); }
}
function skip() {
  halt();
  const id = nextRandom();
  if (!id) { stopSpeech(); return; }
  goTo(id);
  if (speech.paused) { speech.phase = "setup"; renderSpeechUI(); } else runPhase("setup");
}

function renderSpeechUI() {
  const hands = speech.mode === "hands";
  $("manual").classList.toggle("hide", hands);
  $("hf").classList.toggle("hide", !hands);
  $("b-speak").textContent = speech.mode === "single" ? "⏹ Stop" : "🔊 Read aloud";
  if (!hands) return;
  $("hf-pause").textContent = speech.paused ? "▶ Resume" : "⏸ Pause";
  $("hf-status").textContent = speech.paused ? "Paused"
    : speech.phase === "gap" ? `Next joke in ${settings.gap}s…` : "🎧 Hands-free · reading…";
}

$("b-speak").onclick = () => speech.mode === "single" ? stopSpeech() : start("single");
$("b-hands").onclick = () => start("hands");
$("hf-pause").onclick = togglePause;
$("hf-skip").onclick = skip;
$("hf-stop").onclick = stopSpeech;

// Keyboard shortcuts on Mac/iPad keyboards: space = pause/resume, → = next.
document.addEventListener("keydown", e => {
  if (e.target.closest("input, textarea, select, dialog") || $("v-play").classList.contains("hide")) return;
  if (e.code === "Space") { e.preventDefault(); speech.mode === "hands" ? togglePause() : $("b-speak").click(); }
  if (e.code === "ArrowRight") speech.mode === "hands" ? skip() : $("b-random").click();
  if (e.code === "ArrowLeft" && speech.mode !== "hands") $("b-prev").click();
});

// Keep the screen awake during hands-free so the device doesn't lock mid-joke.
let lock = null;
async function wakeLock(on) {
  try {
    if (on && !lock && navigator.wakeLock) {
      lock = await navigator.wakeLock.request("screen");
      lock.addEventListener("release", () => { lock = null; });
    } else if (!on && lock) { await lock.release(); lock = null; }
  } catch {}
}
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible" && speech.mode === "hands") wakeLock(true);
});

/* ---------- Library ---------- */
function renderLib() {
  const filters = availableFilters();
  if (!filters.includes(libFilter)) libFilter = "all";
  $("chips").replaceChildren(...filters.map(f => {
    const b = document.createElement("button");
    b.className = "chip" + (f === libFilter ? " on" : "");
    b.textContent = f === "all" ? "All" : filterLabel(f);
    b.onclick = () => { libFilter = f; renderLib(); };
    return b;
  }));

  const q = norm($("q").value);
  const items = jokes
    .filter(j => matches(j, libFilter) && (!q || norm(`${j.setup} ${j.punch} ${j.cat}`).includes(q)))
    .sort((a, b) => (b.created || 0) - (a.created || 0));

  const count = document.createElement("div");
  count.className = "count";
  count.textContent = `${items.length} joke${items.length === 1 ? "" : "s"}`;
  const rows = items.map(j => {
    const el = document.createElement("div");
    el.className = "item";
    el.innerHTML = `<div class="txt"><div class="s"></div><div class="c"></div></div>
      <button class="icon-btn" aria-label="Edit">✏️</button>`;
    el.querySelector(".s").textContent = (j.fav ? "★ " : "") + j.setup;
    el.querySelector(".c").textContent = (j.cat || "Uncategorised") + (isYouTube(j.source) ? " · ▶ YouTube" : "");
    el.querySelector("button").onclick = e => { e.stopPropagation(); openEditor(j); };
    el.onclick = () => { stopSpeech(); goTo(j.id); show("play"); };
    return el;
  });
  if (!rows.length) {
    const e = document.createElement("div");
    e.className = "empty"; e.textContent = jokes.length ? "No jokes match." : "No jokes yet — tap ➕ to add one.";
    rows.push(e);
  }
  $("list").replaceChildren(count, ...rows);
}
$("q").oninput = renderLib;

/* ---------- Editor ---------- */
let editing = null;
function openEditor(j = null) {
  editing = j;
  $("f-title").textContent = j ? "Edit joke" : "Add a joke";
  $("f-setup").value = j?.setup || "";
  $("f-punch").value = j?.punch || "";
  $("f-cat").value = j?.cat || (!j && libFilter.startsWith("cat:") ? libFilter.slice(4) : "");
  $("f-source").value = j?.source || "";
  $("f-fav").checked = !!j?.fav;
  $("f-del").classList.toggle("hide", !j);
  $("cats").replaceChildren(...categories().map(c => new Option(c)));
  $("dlg").showModal();
  if (!matchMedia("(pointer: coarse)").matches) $("f-setup").focus();
}
$("f-cancel").onclick = () => $("dlg").close();
$("form").onsubmit = async e => {
  e.preventDefault();
  const data = {
    setup: $("f-setup").value.trim(),
    punch: $("f-punch").value.trim(),
    cat: $("f-cat").value.trim(),
    source: $("f-source").value.trim(),
    fav: $("f-fav").checked,
  };
  if (!data.setup) return;
  if (data.source && !safeUrl(data.source)) { toast("That source link doesn't look like a web address"); return; }
  const dupe = jokes.find(j => j !== editing && norm(j.setup) === norm(data.setup));
  if (dupe && !confirm("A joke with the same setup already exists. Save anyway?")) return;
  let j = editing;
  if (j) Object.assign(j, data, { updated: Date.now() });
  else {
    j = { id: uid(), ...data, created: Date.now(), updated: Date.now() };
    jokes.push(j);
    if (bag.length) bag.splice(Math.floor(Math.random() * (bag.length + 1)), 0, j.id);
  }
  await db.put(j);
  $("dlg").close();
  toast(editing ? "Joke updated" : "Joke added");
  if (!editing && !current()) goTo(j.id);
  refresh();
};
$("f-del").onclick = async () => {
  const j = editing;
  if (!j || !confirm("Delete this joke?")) return;
  await db.remove(j.id);
  jokes = jokes.filter(x => x !== j);
  bag = bag.filter(id => id !== j.id);
  history = history.filter(id => id !== j.id);
  hIdx = Math.min(hIdx, history.length - 1);
  $("dlg").close();
  if (!current()) { stopSpeech(); goTo(nextRandom()); }
  refresh();
  toast("Joke deleted", { label: "Undo", run: async () => { jokes.push(j); await db.put(j); refresh(); toast("Restored"); } });
};

function refresh() { renderPlayer(); if (!$("v-lib").classList.contains("hide")) renderLib(); }

/* ---------- Settings ---------- */
function fillVoices() {
  const all = synth?.getVoices() || [];
  const lang = (navigator.language || "en").slice(0, 2);
  const vs = all.filter(v => v.lang.startsWith(lang)).sort((a, b) => a.name.localeCompare(b.name));
  $("s-voice").replaceChildren(new Option("System default", ""), ...vs.map(v => {
    const o = new Option(`${v.name} (${v.lang})${v.localService ? "" : " · online"}`, v.name);
    o.selected = v.name === settings.voice; return o;
  }));
}
if (synth) { fillVoices(); synth.addEventListener?.("voiceschanged", fillVoices); }
$("s-voice").onchange = e => { settings.voice = e.target.value; saveSettings(); };

const sliders = { rate: v => v.toFixed(2) + "×", pause: v => v + "s", gap: v => v + "s" };
for (const [k, fmt] of Object.entries(sliders)) {
  const el = $("s-" + k), out = $(`s-${k}-v`);
  el.value = settings[k]; out.textContent = fmt(+settings[k]);
  el.oninput = () => { settings[k] = +el.value; out.textContent = fmt(settings[k]); saveSettings(); };
}
$("b-test").onclick = () => {
  if (!synth) { toast("Read-aloud isn't supported in this browser"); return; }
  synth.cancel(); synth.speak(utter("Knock knock. Who's there? Joke Jar!"));
};

$("b-export").onclick = async () => {
  const data = jokes.map(({ setup, punch, cat, source, fav, created }) => ({ setup, punch, cat, source, fav, created }));
  const name = `jokes-${new Date().toISOString().slice(0, 10)}.json`;
  const file = new File([JSON.stringify(data, null, 2)], name, { type: "application/json" });
  // On iPhone/iPad the share sheet (AirDrop, Save to Files) is friendlier than a download.
  if (matchMedia("(pointer: coarse)").matches && navigator.canShare?.({ files: [file] })) {
    try { await navigator.share({ files: [file], title: "Joke Jar backup" }); return; }
    catch (e) { if (e.name === "AbortError") return; }
  }
  const a = document.createElement("a");
  a.href = URL.createObjectURL(file); a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
};
$("b-import").onclick = () => $("f-import").click();
$("f-import").onchange = async e => {
  const f = e.target.files[0]; e.target.value = "";
  if (!f) return;
  try {
    const n = await importJokes(JSON.parse(await f.text()));
    toast(n.added ? `Imported ${n.added} joke${n.added === 1 ? "" : "s"}` + (n.skipped ? ` · ${n.skipped} already here` : "")
                  : `Nothing new — ${n.skipped} already here`, null, 3000);
  } catch (err) { console.error(err); toast("Couldn't read that file"); }
};
async function importJokes(raw) {
  const list = Array.isArray(raw) ? raw : raw?.jokes;
  if (!Array.isArray(list)) throw new Error("not a joke list");
  const have = new Set(jokes.map(j => norm(j.setup)));
  const fresh = [];
  let skipped = 0;
  for (const r of list) {
    const setup = String(r.setup ?? r.joke ?? r.text ?? "").trim();
    if (!setup) continue;
    if (have.has(norm(setup))) { skipped++; continue; }
    have.add(norm(setup));
    const src = String(r.source ?? r.url ?? "").trim();
    fresh.push({
      id: uid(), setup,
      punch: String(r.punch ?? r.punchline ?? "").trim(),
      cat: String(r.cat ?? r.category ?? "").trim(),
      source: safeUrl(src) ? src : "",
      fav: !!r.fav,
      created: +r.created || Date.now(), updated: Date.now(),
    });
  }
  if (fresh.length) { await db.putMany(fresh); jokes.push(...fresh); if (bag.length) { bag.push(...fresh.map(j => j.id)); bag.sort(() => Math.random() - .5); } }
  if (!current()) goTo(nextRandom());
  refresh();
  return { added: fresh.length, skipped };
}
async function loadSamples() {
  const res = await fetch("jokes.sample.json");
  return importJokes(await res.json());
}
$("b-samples").onclick = async () => {
  const n = await loadSamples();
  toast(n.added ? `Added ${n.added} sample jokes` : "Samples are already in your jar");
};
$("b-wipe").onclick = async () => {
  if (!jokes.length || !confirm(`Delete all ${jokes.length} jokes from this device? Export a backup first if you might want them back.`)) return;
  if (!confirm("Are you sure? This can't be undone.")) return;
  stopSpeech();
  await db.clear();
  jokes = []; history = []; hIdx = -1; bag = [];
  refresh(); toast("All jokes deleted");
};
$("ver").textContent = `Joke Jar v${VERSION}`;

/* ---------- Online badge ---------- */
function net() {
  const off = !navigator.onLine;
  $("net").textContent = off ? "Offline — all good" : "Works offline";
  $("net").classList.toggle("offline", off);
}
addEventListener("online", net); addEventListener("offline", net); net();

/* ---------- Service worker ---------- */
if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("sw.js").then(reg => {
    reg.addEventListener("updatefound", () => {
      const sw = reg.installing;
      sw?.addEventListener("statechange", () => {
        if (sw.state === "installed" && navigator.serviceWorker.controller)
          toast("A new version is ready", { label: "Reload", run: () => location.reload() });
      });
    });
  }).catch(err => console.warn("SW registration failed", err));
}

/* ---------- Boot ---------- */
(async function boot() {
  jokes = await db.all();
  // Seed sample jokes on the very first launch only (not after the user deletes everything).
  let seeded = false;
  try { seeded = localStorage.getItem("jokejar.seeded") === "1"; } catch {}
  if (!jokes.length && !seeded) {
    try { await loadSamples(); } catch {}
    try { localStorage.setItem("jokejar.seeded", "1"); } catch {}
  }
  persistStorage();
  if (!current()) goTo(nextRandom());
  renderPlayer();
  renderSpeechUI();
})();
