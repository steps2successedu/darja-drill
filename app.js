/* Darja Drill — app */
(() => {
'use strict';

/* =========================================================
   1. Data
   ========================================================= */
const HARAKAT = /[ً-ِْٰ]/g;           // every mark except shadda (ّ)
const joinWaw = s => s.replace(/(^|\s)وْ\s+/g, '$1وَ');      // "خمسة وْ تلاتين" → "خمسة وَتلاتين"
const TOPICS = window.VOCAB.topics;
const NEWEST = Math.max(...TOPICS.map(t => t.week));
const ITEMS = [];
TOPICS.forEach(t => t.items.forEach(([dz, en, ar = '', alt = '', flags = '']) => {
  const marked = joinWaw(ar);
  ITEMS.push({key: `${t.id}|${dz}`, topic: t, dz, en, alt, ar: marked, arPlain: marked.replace(HARAKAT, ''),
    x: flags.includes('x'), u: flags.includes('u')});
}));
const CARDS = [];
ITEMS.forEach(it => {
  CARDS.push({id: it.key + '|en', item: it, mode: 'en'});
  CARDS.push({id: it.key + '|dz', item: it, mode: 'dz'});
  if (it.ar) CARDS.push({id: it.key + '|ear', item: it, mode: 'ear'});
});
const CARD = Object.fromEntries(CARDS.map(c => [c.id, c]));

/* =========================================================
   2. State
   ========================================================= */
const KEY = 'darja-drill-v1';
const DEFAULTS = {dir: 'both', len: 20, newCap: 10, lLen: 20, lNewCap: 10, topics: TOPICS.map(t => t.id),
  mLen: 20, additions: false, theme: 'auto', vowels: 'marked', rate: 0.85, voice: ''};
function loadState() {
  let s = null;
  try { s = JSON.parse(localStorage.getItem(KEY)); } catch (e) {}
  s = s || {};
  s.cards = s.cards || {};
  s.days = s.days || {};
  s.set = Object.assign({}, DEFAULTS, s.set || {});
  // new topics added in a weekly update are switched on automatically
  s.knownTopics = s.knownTopics || TOPICS.map(t => t.id);
  TOPICS.forEach(t => { if (!s.knownTopics.includes(t.id)) { s.knownTopics.push(t.id); if (!s.set.topics.includes(t.id)) s.set.topics.push(t.id); } });
  return s;
}
const S = loadState();
function save() { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) {} }

const DAY = 864e5;
const GAPS = [0, 0, 1, 3, 7, 21];            // days until due, by box
const now = () => Date.now();
const dayKey = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/* =========================================================
   3. Helpers
   ========================================================= */
const $ = id => document.getElementById(id);
const esc = s => String(s).replace(/[&<>"]/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;'}[c]));
const digits = s => esc(s).replace(/([35679])(?![\d,])/g, '<span class="n">$1</span>');
const shuffle = a => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };

/* =========================================================
   4. Scheduler
   ========================================================= */
function eligible(modes) {
  const st = S.set;
  return CARDS.filter(c => modes.includes(c.mode) && st.topics.includes(c.item.topic.id) && (st.additions || !c.item.x));
}
function plan(modes) {
  const t = now(), due = [], fresh = [];
  eligible(modes).forEach(c => { const s = S.cards[c.id]; if (!s) fresh.push(c); else if (s.due <= t) due.push(c); });
  return {due, fresh};
}
function roundRobin(list, limit, used, score) {
  const groups = {};
  list.forEach(c => { c._s = score(c); (groups[c.item.topic.id] ||= []).push(c); });
  const order = Object.values(groups).map(g => g.sort((a, b) => b._s - a._s)).sort((a, b) => b[0]._s - a[0]._s);
  const out = [];
  let moved = true;
  while (out.length < limit && moved) {
    moved = false;
    for (const g of order) {
      if (out.length >= limit) break;
      while (g.length && used.has(g[0].item.key)) g.shift();
      if (g.length) { const c = g.shift(); used.add(c.item.key); out.push(c); moved = true; }
    }
  }
  return out;
}
/* Number combos take a fair share of the session: all of it if they are the only topic picked */
function comboCount(len) {
  if (!Combo.on()) return 0;
  const others = S.set.topics.filter(id => TOPICS.some(t => t.id === id)).length;
  return others ? Math.max(2, Math.round(len / (others + 1))) : len;
}
function buildSession(modes, len, newCap) {
  const k = comboCount(len);
  const q = buildRegular(modes, len - k, newCap);
  for (let i = 0; i < k; i++) {                // spread the combos through the session
    const c = Combo.make(modes[Math.floor(Math.random() * modes.length)]);
    q.splice(Math.round((i + .5) * (q.length + 1) / k) % (q.length + 1), 0, {c, repeat: false});
  }
  return q;
}
function buildRegular(modes, len, newCap) {
  if (len <= 0) return [];
  const {due, fresh} = plan(modes);
  const used = new Set();                      // one direction of a word per session
  const d = roundRobin(due, len, used, c => {
    const s = S.cards[c.id];
    return (now() - s.due) / DAY + (s.b === 1 ? 5 : 0) + (c.mode === 'en' ? 1 : 0) + s.lapses * .5 + Math.random() * .3;
  });
  const n = roundRobin(fresh, Math.min(newCap, len - d.length), used,
    c => c.item.topic.week * 10 + (c.mode === 'en' ? 2 : 0) + Math.random());
  const q = [];
  const step = n.length ? Math.max(1, Math.floor((d.length + n.length) / n.length)) : 0;
  let di = 0, ni = 0;
  for (let i = 0; di < d.length || ni < n.length; i++) {
    if (ni < n.length && (di >= d.length || (step && i % step === step - 1))) q.push(n[ni++]); else q.push(d[di++]);
  }
  return q.map(c => ({c, repeat: false}));
}
function planCounts(modes, len, newCap) {
  const {due, fresh} = plan(modes);
  const combo = comboCount(len), room = len - combo;
  const dueN = Math.min(due.length, room);
  return {dueN, newN: Math.min(newCap, fresh.length, room - dueN), dueAll: due.length, freshAll: fresh.length, combo};
}
/* apply a grade; returns true if the card should come back this session */
function applyGrade(c, g, firstTime) {
  const t = now();
  if (c.combo) {                               // made fresh each session, so nothing to schedule
    if (firstTime) { const k = dayKey(); const d = S.days[k] || {n: 0, ok: 0}; d.n++; if (g === 'got') d.ok++; S.days[k] = d; save(); Sync.soon(); }
    return g === 'miss';
  }
  const s = S.cards[c.id] || {b: 0, seen: 0, lapses: 0, due: t};
  if (g === 'miss') { s.b = 1; s.lapses++; s.due = t; }
  else if (g === 'almost') { s.b = Math.max(1, s.b); s.due = t + GAPS[s.b] * DAY; }
  else { s.b = s.b === 0 ? 2 : Math.min(5, s.b + 1); s.due = t + GAPS[s.b] * DAY; }
  s.seen++; s.last = g; s.t = t;
  S.cards[c.id] = s;
  if (firstTime) {
    const k = dayKey(); const d = S.days[k] || {n: 0, ok: 0};
    d.n++; if (g === 'got') d.ok++; S.days[k] = d;
  }
  save(); Sync.soon();
  return g === 'miss' || (g === 'almost' && s.b === 1);
}

/* =========================================================
   4b. Number combinations (built from the Numbers slides)
   ========================================================= */
// Rules taken from the slides: parts go biggest first, joined by "w";
// below 100 the units come before the tens (khemsa w tlatin = 35); 11–19 have their own words.
// Every building block comes from the Numbers topic, so fixing a spelling there fixes it here too.
const Combo = (() => {
  const COMBO_ID = 'numcombo';
  const topic = {id: COMBO_ID, name: 'Number combos', week: 0, deck: 'Built from Numbers'};
  const NUM = {};
  (TOPICS.find(t => t.id === 'numbers') || {items: []}).items.forEach(([dz, en, ar]) => {
    if (/^[\d,]+$/.test(en)) NUM[+en.replace(/,/g, '')] = {dz: dz.split(' · ')[0].toLowerCase(), ar};
  });
  const ok = [1, 2, 9, 10, 11, 19, 20, 90, 100, 900, 1000, 10000, 11000, 19000, 100000, 900000, 1000000, 9000000].every(n => NUM[n]);
  const W = {dz: ' w ', ar: ' وْ '};
  const TNIN = {dz: 'tnin', ar: 'تْنِينْ'};            // 2 inside "units w tens", as in 11,542 (tnin w reb3in)
  const ALF = {dz: 'alf', ar: 'أَلْفْ'};              // "alf" after a compound, as in 25,363 and 88,888
  const join = parts => ({dz: parts.map(p => p.dz).join(W.dz), ar: parts.map(p => p.ar).join(W.ar)});
  const cat = (a, b) => ({dz: a.dz + ' ' + b.dz, ar: a.ar + ' ' + b.ar});
  function below100(n) {                                   // 1–99
    if (n <= 19 || n % 10 === 0) return NUM[n];
    const u = n % 10;
    return join([u === 2 ? TNIN : NUM[u], NUM[n - u]]);
  }
  function below1000(n) {                                  // 1–999
    const h = n - n % 100, r = n % 100, parts = [];
    if (h) parts.push(NUM[h]);
    if (r) parts.push(below100(r));
    return join(parts);
  }
  // how many thousands (1–999); returns {main, alt}
  function thousands(t, alone) {
    if (t <= 10 || t % 100 === 0) return {main: NUM[t * 1000]};          // alf, alfyn, teltalaf… mia talef, teltmia talef…
    if (t <= 19) return {main: alone ? NUM[t * 1000] : cat(NUM[t], ALF)};   // 7dach nalef on its own; Hdach alf w… in a longer number (11,542)
    return {main: cat(t % 100 === 0 ? NUM[t] : t < 100 ? below100(t) : below1000(t), ALF)};
  }
  function say(n) {
    const m = Math.floor(n / 1e6), t = Math.floor(n / 1e3) % 1000, r = n % 1000;
    const main = [], alt = [];
    if (m) { main.push(NUM[m * 1e6]); alt.push(NUM[m * 1e6]); }
    if (t) { const th = thousands(t, !r); main.push(th.main); alt.push(th.alt || th.main); }
    if (r) { const x = below1000(r); main.push(x); alt.push(x); }
    const a = join(main), b = join(alt);
    a.dz = a.dz.charAt(0).toUpperCase() + a.dz.slice(1);
    b.dz = b.dz.charAt(0).toUpperCase() + b.dz.slice(1);
    return {main: a, alt: b.dz !== a.dz ? b.dz : ''};
  }
  const rnd = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
  // thousands counts the slides give a pattern for (skips e.g. 105, where the form isn't shown)
  const tOk = t => t <= 99 || t % 100 === 0 || t % 100 > 10;
  function pick() {
    const r = Math.random();
    let n;
    if (r < .14) n = rnd(21, 99);                                        // 45
    else if (r < .36) n = rnd(101, 999);                                 // 416
    else if (r < .56) n = rnd(1, 9) * 1000 + rnd(1, 999);                // 7,245
    else if (r < .76) n = rnd(10, 99) * 1000 + (Math.random() < .15 ? 0 : rnd(1, 999));   // 10,212
    else if (r < .90) { let t; do t = rnd(100, 999); while (!tOk(t)); n = t * 1000 + (Math.random() < .15 ? 0 : rnd(1, 999)); }
    else {                                                               // 4,321,555
      let t; do t = Math.random() < .25 ? 0 : rnd(11, 999); while (!tOk(t));
      n = rnd(1, 9) * 1e6 + t * 1000 + (Math.random() < .3 ? 0 : rnd(1, 999));
    }
    return n;
  }
  function make(mode) {
    let n, tries = 0;
    do n = pick(); while ((NUM[n] || n % 10 === 0 && n < 100 || n > 100 && n % 100 === 2) && ++tries < 50);  // skip numbers that are already on the slides
    const s = say(n), en = n.toLocaleString('en-AU');
    const marked = joinWaw(s.main.ar);
    const item = {key: `${COMBO_ID}|${en}`, topic, dz: s.main.dz, en, alt: s.alt, ar: marked, arPlain: marked.replace(HARAKAT, ''),
      x: false, u: false, combo: true};
    const c = {id: `${item.key}|${mode}|${Math.random().toString(36).slice(2, 7)}`, item, mode, combo: true};
    CARD[c.id] = c;
    return c;
  }
  return {ID: COMBO_ID, ok, make, say, on: () => ok && S.set.topics.includes(COMBO_ID)};
})();
window.__Combo = Combo;
window.__match = () => M;

/* =========================================================
   5. Speech
   ========================================================= */
const Voice = (() => {
  const ok = 'speechSynthesis' in window && 'SpeechSynthesisUtterance' in window;
  let voices = [], current = null;
  function load() {
    if (!ok) { renderVoiceSelect(); return; }
    const rank = v => v.lang.startsWith('ar-DZ') ? 0 : /ar-(MA|TN|LY)/.test(v.lang) ? 1 : 2;
    voices = speechSynthesis.getVoices().filter(v => v.lang && v.lang.toLowerCase().startsWith('ar')).sort((a, b) => rank(a) - rank(b));
    renderVoiceSelect();
  }
  function pick() {
    const all = ok ? speechSynthesis.getVoices() : [];
    return all.find(v => v.name === S.set.voice) || voices[0] || null;
  }
  function speak(it, slow, statusEl) {
    const say = (m, bad) => { if (statusEl) { statusEl.textContent = m; statusEl.style.color = bad ? 'var(--miss)' : ''; } };
    if (!ok) { say('This browser can’t produce speech.', true); return; }
    if (!voices.length) load();
    const text = S.set.vowels === 'plain' ? it.arPlain : it.ar;
    const go = () => {
      const u = new SpeechSynthesisUtterance(text);
      const v = pick();
      if (v) { u.voice = v; u.lang = v.lang; } else u.lang = 'ar';
      u.rate = slow ? .55 : S.set.rate;
      let started = false;
      u.onstart = () => { started = true; say('Playing'); };
      u.onend = () => say('');
      u.onerror = e => { if (e.error !== 'interrupted' && e.error !== 'canceled') say('The voice failed. Press Play again.', true); };
      current = u;                                  // keep a reference: Chrome can drop unreferenced utterances
      speechSynthesis.resume();
      speechSynthesis.speak(u);
      setTimeout(() => { if (!started && current === u) say('Nothing played. Press Play again, or fully quit and reopen the browser.', true); }, 2500);
    };
    say('Starting…');
    if (speechSynthesis.speaking || speechSynthesis.pending) { speechSynthesis.cancel(); setTimeout(go, 120); } else go();
  }
  if (ok) speechSynthesis.onvoiceschanged = load;
  return {ok, speak, refresh: load, list: () => voices, stop: () => ok && speechSynthesis.cancel()};
})();

function renderVoiceSelect() {
  const sel = $('sVoice'), note = $('sVoiceNote'), warn = $('lVoiceWarn');
  const vs = Voice.list();
  if (!Voice.ok || !vs.length) {
    sel.innerHTML = '<option>No Arabic voice found</option>'; sel.disabled = true;
    const msg = Voice.ok
      ? 'No Arabic voice is installed. iPhone or Mac: Settings → Accessibility → Spoken Content → Voices → Arabic. Windows: the Edge browser has online Arabic voices.'
      : 'This browser can’t produce speech. Try Chrome, Safari or Edge.';
    note.textContent = msg; warn.textContent = msg; warn.hidden = false;
    return;
  }
  sel.disabled = false; warn.hidden = true;
  sel.innerHTML = vs.map(v => `<option value="${esc(v.name)}">${esc(v.name)} · ${esc(v.lang)}</option>`).join('');
  if (vs.some(v => v.name === S.set.voice)) sel.value = S.set.voice; else S.set.voice = vs[0].name;
  note.textContent = vs.some(v => v.lang.startsWith('ar-DZ')) ? 'An Algerian Arabic voice is available.' : 'No Algerian voice on this device, so expect a different Arabic accent.';
}

/* =========================================================
   6. Marking typed English (listening)
   ========================================================= */
const Mark = (() => {
  const SYN = {auntie: 'aunt', aunty: 'aunt', mum: 'mother', mom: 'mother', mam: 'mother', mummy: 'mother', mommy: 'mother', mama: 'mother', ma: 'mother',
    dad: 'father', daddy: 'father', papa: 'father', pa: 'father', grandma: 'grandmother', granny: 'grandmother', nan: 'grandmother', nana: 'grandmother', gran: 'grandmother',
    grandpa: 'grandfather', grandad: 'grandfather', granddad: 'grandfather', gramps: 'grandfather', bro: 'brother', sis: 'sister',
    u: 'you', ya: 'you', r: 'are', ur: 'your', yr: 'your', im: 'i', thanks: 'thank', thx: 'thank', allah: 'god', good: 'fine', ok: 'fine', okay: 'fine', well: 'fine', alright: 'fine',
    awesome: 'great', excellent: 'great', amazing: 'great', brilliant: 'great', job: 'work', enjoy: 'like', love: 'like', algeria: 'algiers', alger: 'algiers',
    fall: 'autumn', vacation: 'holiday', holidays: 'holiday', tmrw: 'tomorrow', tmr: 'tomorrow', tomoz: 'tomorrow', yday: 'yesterday', wk: 'week', yr2: 'year',
    guy: 'man', male: 'man', female: 'woman', lady: 'woman', girl: 'daughter', boy: 'son', kid: 'child', travel: 'travelling', traveling: 'travelling', travelling: 'travelling',
    reading: 'read', books: 'book', sports: 'sport'};
  const STOP = new Set('a an the to do does did and of in on at it its will be am is are was were for that this with that s d ll ve'.split(' '));
  const PRON = {i: 1, me: 1, my: 1, mine: 1, we: 1, our: 1, us: 1, you: 2, your: 2, yours: 2, he: 3, his: 3, him: 3, she: 4, her: 4, hers: 4};
  const WHO = {1: 'you yourself', 2: '“you”', 3: 'a man (he / his)', 4: 'a woman (she / her)'};
  const GROUPS = [['maternal', 'paternal'], ['mother', 'father'], ['brother', 'sister'], ['son', 'daughter'], ['nephew', 'niece'], ['uncle', 'aunt'],
    ['grandmother', 'grandfather'], ['next', 'last'], ['tomorrow', 'yesterday'], ['before', 'after'], ['man', 'woman'], ['day', 'week', 'month', 'year'],
    ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'], ['spring', 'summer', 'autumn', 'winter'],
    ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december']];
  const EXTRA = {
    'How old are you?': ['what is your age'],
    'thank God': ['praise god', 'alhamdulillah'],
    'daytime — a calendar day': ['day'],
    'fine': ['i am fine']
  };
  function stem(w) {
    if (w.length <= 4) return w;
    if (/ing$/.test(w)) return w.slice(0, -3);
    if (/ies$/.test(w)) return w.slice(0, -3) + 'y';
    if (/(sh|ch|x|ss)es$/.test(w)) return w.slice(0, -2);
    if (/ed$/.test(w)) return w.slice(0, -2);
    if (/s$/.test(w) && !/ss$/.test(w)) return w.slice(0, -1);
    return w;
  }
  const raw = s => s.toLowerCase()
    .replace(/\b(father|dad|daddy|papa)(['’]?s)?\s+side\b/g, 'paternal').replace(/\b(mother|mum|mom|mam|mama)(['’]?s)?\s+side\b/g, 'maternal').replace(/\[[^\]]*\]/g, ' ').replace(/\((m|f)\)/g, ' ').replace(/[’']s\b/g, '').replace(/[’']/g, '')
    .split(/[^a-z0-9]+/).filter(Boolean).map(w => SYN[w] || (w.endsWith('s') && SYN[w.slice(0, -1)]) || w);
  const persons = toks => new Set(toks.filter(w => PRON[w]).map(w => PRON[w]));
  const content = toks => [...new Set(toks.filter(w => !STOP.has(w) && !PRON[w]).map(stem))];
  function alternatives(en) {
    const segs = en.split(/\s+[—·\/]\s+/).map(s => s.trim()).filter(s => s && !/^(to )?an? (man|woman)$/i.test(s));
    return segs.concat(EXTRA[en] || []);
  }
  // every content word in the bank, stemmed — typos must be closest to the intended word
  const KNOWN = new Set();
  ITEMS.forEach(it => alternatives(it.en).forEach(a => content(raw(a)).forEach(w => KNOWN.add(w))));
  GROUPS.flat().forEach(w => KNOWN.add(stem(w)));
  function lev(a, b) {
    const d = Array.from({length: a.length + 1}, (_, i) => [i]);
    for (let j = 1; j <= b.length; j++) d[0][j] = j;
    for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++)
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    return d[a.length][b.length];
  }
  function hit(tok, target) {
    tok = stem(tok);
    if (tok === target) return true;
    if (KNOWN.has(tok)) return false;                       // a real word that means something else
    const len = Math.max(tok.length, target.length);
    const allow = len >= 8 ? 2 : len >= 4 ? 1 : 0;
    if (!allow || Math.abs(tok.length - target.length) > allow) return false;
    const d = lev(tok, target);
    if (d > allow) return false;
    for (const k of KNOWN) if (k !== target && lev(tok, k) <= d) return false;
    return true;
  }
  const NUMW = {zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, thirteen: 13,
    fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19, twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90};
  function parseNumber(input) {
    const s = input.toLowerCase().replace(/,/g, '').replace(/-/g, ' ').trim();
    const m = s.match(/^(\d+(?:\.\d+)?)\s*(k|thousand|m|mil|million)?$/);
    if (m) return Math.round(parseFloat(m[1]) * ({k: 1e3, thousand: 1e3, m: 1e6, mil: 1e6, million: 1e6}[m[2]] || 1));
    const compact = s.replace(/\s+/g, '');
    if (/^\d+$/.test(compact)) return +compact;
    let total = 0, cur = 0, any = false;
    for (const w of s.split(/[^a-z0-9.]+/).filter(Boolean)) {
      if (w === 'and' || w === 'a') continue;
      if (w in NUMW) { cur += NUMW[w]; any = true; }
      else if (/^\d+(\.\d+)?$/.test(w)) { cur += parseFloat(w); any = true; }
      else if (w === 'hundred') { cur = (cur || 1) * 100; any = true; }
      else if (w === 'thousand' || w === 'k') { total += (cur || 1) * 1e3; cur = 0; any = true; }
      else if (w === 'million' || w === 'm') { total += (cur || 1) * 1e6; cur = 0; any = true; }
      else return NaN;
    }
    return any ? Math.round(total + cur) : NaN;
  }
  function check(item, input) {
    if (/^[\d,]+$/.test(item.en)) {
      const want = +item.en.replace(/,/g, ''), got = parseNumber(input);
      if (got === want) return {v: 'got', msg: 'Right'};
      return {v: 'miss', msg: isNaN(got) ? 'Not this one' : `Not quite — you wrote ${got.toLocaleString('en-AU')}`};
    }
    const inTok = raw(input), inStems = inTok.map(stem), inPers = persons(inTok);
    let best = {v: 'miss', msg: 'Not this one', rank: 0};
    for (const alt of alternatives(item.en)) {
      const aTok = raw(alt), words = content(aTok), aPers = persons(aTok);
      // opposite-word check: "maternal" for "paternal", "next" for "last"…
      let conflict = null;
      for (const w of words) {
        if (inStems.includes(w)) continue;
        const g = GROUPS.find(gr => gr.map(stem).includes(w));
        const other = g && g.map(stem).find(o => o !== w && inStems.includes(o));
        if (other) { conflict = {w, other}; break; }
      }
      if (conflict) {
        const r = {v: 'miss', msg: `It's “${conflict.w}”, not “${conflict.other}”.`, rank: 1};
        if (r.rank > best.rank) best = r;
        continue;
      }
      const n = words.length;
      const h = words.filter(w => inTok.some(t => hit(t, w))).length;
      let v = 'miss';
      if (n === 0) v = (aPers.size ? [...aPers].some(q => inPers.has(q)) : inTok.length) ? 'got' : 'miss';   // e.g. "And you?"
      else if (n <= 2) v = h === n ? 'got' : h >= 1 && n === 2 ? 'almost' : 'miss';
      else v = h / n >= (n >= 5 ? .6 : .66) ? 'got' : h >= 1 && h / n >= .25 ? 'almost' : 'miss';
      // who it's about: "his name" typed for "your name"
      if (v !== 'miss' && aPers.size && inPers.size && ![...aPers].some(p => inPers.has(p))) {
        const r = {v: 'miss', msg: `Check who it's about: this one is about ${WHO[[...aPers][0]]}.`, rank: 2};
        if (r.rank > best.rank) best = r;
        continue;
      }
      const r = v === 'got' ? {v, msg: 'Right', rank: 4} : v === 'almost' ? {v, msg: 'Close, but not quite all of it.', rank: 3} : {v, msg: 'Not this one', rank: 0};
      if (r.rank > best.rank) best = r;
    }
    return best;
  }
  return {check, parseNumber};
})();
window.__Mark = Mark;

/* =========================================================
   7. Drill (spoken, self-marked)
   ========================================================= */
let D = null;
function dModes() { return S.set.dir === 'both' ? ['en', 'dz'] : [S.set.dir]; }
function renderDrillSetup() {
  const p = planCounts(dModes(), S.set.len, S.set.newCap);
  $('dPlan').innerHTML = `<div><b>${p.dueAll}</b><span>due now</span></div><div><b>${p.freshAll}</b><span>not seen yet</span></div>` +
    (p.combo ? `<div><b>${p.combo}</b><span>number combos</span></div>` : '');
  const n = p.dueN + p.newN + p.combo;
  $('dStart').disabled = n === 0;
  $('dStart').textContent = n ? `Start — ${n} cards` : (p.freshAll ? 'Nothing due. Allow new cards in the options.' : 'All done for now. Come back later.');
}
function dStart(queue) {
  D = {q: queue, i: 0, first: {}, again: {}};
  $('dSetup').hidden = true; $('dDone').hidden = true; $('dRun').hidden = false;
  dCard();
}
function dCard() {
  if (D.i >= D.q.length) return dFinish();
  const {c, repeat} = D.q[D.i], it = c.item, fromDz = c.mode === 'dz';
  $('dCount').textContent = `${D.i + 1} / ${D.q.length}`;
  $('dDir').textContent = fromDz ? 'Darja → English' : 'English → Darja';
  $('dBar').style.width = (D.i / D.q.length * 100) + '%';
  const s = S.cards[c.id];
  $('dMeta').innerHTML = `<span class="tag">${esc(it.topic.name)}</span>` + (!s && !c.combo ? '<span class="tag acc">New</span>' : '') +
    (repeat ? '<span class="tag acc">Again</span>' : '') + (it.x ? '<span class="tag warn">Not from slides</span>' : '') + (c.combo ? '<span class="tag">Built from the slide pattern</span>' : '');
  const p = $('dPrompt');
  p.className = 'prompt ' + (fromDz ? '' : 'en');
  p.innerHTML = fromDz ? digits(it.dz) : esc(it.en);
  $('dAnswer').className = 'answer ' + (fromDz ? 'en' : '');
  $('dMain').innerHTML = fromDz ? esc(it.en) : digits(it.dz);
  $('dAlt').innerHTML = !fromDz && it.alt ? (c.combo ? 'Or: ' : 'Also heard: ') + digits(it.alt) : '';
  $('dAr').textContent = !fromDz ? (S.set.vowels === 'plain' ? it.arPlain : it.ar) : '';
  $('dSpeak').hidden = !it.ar || !Voice.ok;
  $('dAnswer').hidden = true; $('dHint').hidden = false;
  $('dRevealRow').hidden = false; $('dGradeRow').hidden = true;
  $('dReveal').focus({preventScroll: true});
}
function dReveal() {
  if (!D || !$('dAnswer').hidden) return;
  $('dAnswer').hidden = false; $('dHint').hidden = true;
  $('dRevealRow').hidden = true; $('dGradeRow').hidden = false;
}
function dGrade(g) {
  if (!D || $('dGradeRow').hidden) return;
  const e = D.q[D.i], c = e.c, first = !(c.id in D.first);
  if (first) D.first[c.id] = g;
  if (applyGrade(c, g, first) && (D.again[c.id] || 0) < 2) {
    D.again[c.id] = (D.again[c.id] || 0) + 1;
    D.q.splice(Math.min(D.i + 1 + (g === 'miss' ? 7 : 11), D.q.length), 0, {c, repeat: true});
  }
  D.i++; dCard();
}
function doneHTML(first, weakIds, againId) {
  const f = Object.values(first);
  const weak = weakIds.map(id => CARD[id]).filter(Boolean);
  return `<h2>Session done</h2>
    <p class="muted">Counted on first attempt only.</p>
    <div class="tally">
      <div class="t-got"><b>${f.filter(x => x === 'got').length}</b><span>got it</span></div>
      <div class="t-almost"><b>${f.filter(x => x === 'almost').length}</b><span>almost</span></div>
      <div class="t-miss"><b>${f.filter(x => x === 'miss').length}</b><span>missed</span></div>
    </div>
    ${weak.length ? `<p class="label" style="margin:0">To look at again</p><ul class="list">${weak.map(c =>
      `<li><span class="d">${digits(c.item.dz)}</span><span class="e">${esc(c.item.en)}</span></li>`).join('')}</ul>` : '<p class="muted">Clean sweep.</p>'}
    <div class="row">${weak.length ? `<button class="go" id="${againId}" type="button">Go over these again</button>` : ''}
      <button class="ghost" data-back type="button">Back</button></div>`;
}
function dFinish() {
  const weak = Object.keys(D.first).filter(id => D.first[id] !== 'got');
  $('dRun').hidden = true; $('dDone').hidden = false;
  $('dDone').innerHTML = doneHTML(D.first, weak, 'dAgain');
  const again = $('dAgain');
  if (again) again.onclick = () => dStart(shuffle(weak.map(id => ({c: CARD[id], repeat: true}))));
  Sync.now();
}

/* =========================================================
   8. Listen (voice → typed English)
   ========================================================= */
let L = null;
function renderListenSetup() {
  const p = planCounts(['ear'], S.set.lLen, S.set.lNewCap);
  $('lPlan').innerHTML = `<div><b>${p.dueAll}</b><span>due now</span></div><div><b>${p.freshAll}</b><span>not heard yet</span></div>` +
    (p.combo ? `<div><b>${p.combo}</b><span>number combos</span></div>` : '');
  const n = p.dueN + p.newN + p.combo;
  $('lStart').disabled = n === 0;
  $('lStart').textContent = n ? `Start — ${n} words` : (p.freshAll ? 'Nothing due. Allow new cards in the options.' : 'All done for now. Come back later.');
}
function lStart(queue) {
  L = {q: queue, i: 0, first: {}, again: {}};
  $('lSetup').hidden = true; $('lDone').hidden = true; $('lRun').hidden = false;
  lCard();
}
function lCard() {
  if (L.i >= L.q.length) return lFinish();
  const {c} = L.q[L.i];
  Object.assign(L, {answered: false, hinted: false, verdict: null});
  $('lCount').textContent = `${L.i + 1} / ${L.q.length}`;
  $('lTopic').textContent = c.item.topic.name;
  $('lBar').style.width = (L.i / L.q.length * 100) + '%';
  $('lHint').hidden = true; $('lHintBtn').hidden = false;
  $('lInput').value = ''; $('lInput').disabled = false; $('lCheck').disabled = false;
  $('lResult').hidden = true; $('lStatus').textContent = '';
  $('lInput').focus({preventScroll: true});
  Voice.speak(c.item, false, $('lStatus'));
}
function lHint() {
  if (!L || L.answered) return;
  L.hinted = true;
  $('lHint').innerHTML = digits(L.q[L.i].c.item.dz);
  $('lHint').hidden = false; $('lHintBtn').hidden = true;
}
function lShowVerdict() {
  const {v, msg} = L.verdict;
  const el = $('lVerdict');
  el.textContent = v === 'got' && L.hinted ? 'Right, with the Arabizi hint' : msg;
  el.style.color = v === 'got' ? 'var(--accent)' : v === 'almost' ? 'var(--almost)' : 'var(--miss)';
  $('lOverride').hidden = v === 'got';
}
function lCheck(e) {
  e.preventDefault();
  if (!L || L.answered) return;
  const it = L.q[L.i].c.item, val = $('lInput').value;
  if (!val.trim()) return;
  L.answered = true;
  L.verdict = Mark.check(it, val);
  lShowVerdict();
  $('lDz').innerHTML = digits(it.dz);
  $('lAr').textContent = S.set.vowels === 'plain' ? it.arPlain : it.ar;
  $('lEn').textContent = it.en;
  $('lTags').innerHTML = (it.u ? '<span class="tag warn">Arabic spelling unchecked</span>' : '') + (it.x ? '<span class="tag warn">Not from slides</span>' : '') + (it.combo ? '<span class="tag">Built from the slide pattern</span>' : '');
  $('lInput').disabled = true; $('lCheck').disabled = true;
  $('lHint').hidden = true; $('lHintBtn').hidden = true;
  $('lResult').hidden = false;
  $('lNext').focus({preventScroll: true});
}
function lNext() {
  if (!L || !L.answered) return;
  const e = L.q[L.i], c = e.c;
  let g = L.verdict.v;
  if (g === 'got' && L.hinted) g = 'almost';           // a hinted answer counts as almost
  const first = !(c.id in L.first);
  if (first) L.first[c.id] = g;
  if (applyGrade(c, g, first) && (L.again[c.id] || 0) < 2) {
    L.again[c.id] = (L.again[c.id] || 0) + 1;
    L.q.splice(Math.min(L.i + 1 + (g === 'miss' ? 7 : 11), L.q.length), 0, {c, repeat: true});
  }
  L.i++; lCard();
}
function lFinish() {
  Voice.stop();
  const weak = Object.keys(L.first).filter(id => L.first[id] !== 'got');
  $('lRun').hidden = true; $('lDone').hidden = false;
  $('lDone').innerHTML = doneHTML(L.first, weak, 'lAgain');
  const again = $('lAgain');
  if (again) again.onclick = () => lStart(shuffle(weak.map(id => ({c: CARD[id], repeat: true}))));
  Sync.now();
}

/* =========================================================
   8b. Match (one prompt, eight options, timed)
   ---------------------------------------------------------
   The clock starts when the prompt appears, so the time is thinking time for that word.
   - First tap wrong: "missed". The word comes back later this session and is brought
     forward in Drill/Listen.
   - Right but slow (well over your usual time for that kind of question): "slow". It comes
     back sooner here and is made due in Drill/Listen, keeping its box.
   - Right and quick: "clean". Picking from options is recognition, weaker evidence than
     recall, so it never pushes Drill/Listen back. It only lets the word show up less often
     here, once it has been clean on two different days.
   Your usual time is the median of your recent clean answers, kept separately for
   words, numbers and combos, and for each direction.
   ========================================================= */
const NUM_TOPICS = ['numbers', Combo.ID];
let M = null;
S.match = S.match || {};
S.rt = S.rt || {};
function matchPool() {
  const st = S.set, words = [], nums = [];
  ITEMS.forEach(it => {
    if (!st.topics.includes(it.topic.id) || (!st.additions && it.x)) return;
    (NUM_TOPICS.includes(it.topic.id) ? nums : words).push(it);
  });
  return {words, nums, combos: Combo.on()};
}
// A word is "passed" in Match once you've picked it cleanly in BOTH directions
// (English → Darja and Darja → English), with those clean answers on different days.
const cleanDays = (m, dir) => (m && m[dir] && m[dir].days) || [];
function isPassed(m) {
  if (!m || m.flag) return false;
  const a = cleanDays(m, 'en'), b = cleanDays(m, 'dz');
  return a.some(x => b.some(y => x !== y));
}
function nextDir(it) {                                          // the direction you still need, else the staler one
  if (it.combo) return Math.random() < .5 ? 'en' : 'dz';
  const m = S.match[it.key], a = cleanDays(m, 'en'), b = cleanDays(m, 'dz');
  if (!a.length && !b.length) return Math.random() < .5 ? 'en' : 'dz';
  if (!a.length) return 'en';
  if (!b.length) return 'dz';
  return a[a.length - 1] <= b[b.length - 1] ? 'en' : 'dz';
}
function matchScore(it) {
  const m = S.match[it.key], cards = ['en', 'dz'].map(md => S.cards[it.key + '|' + md]).filter(Boolean);
  let s = Math.random() * 6;
  if (!m) s += 20;
  else { if (m.flag) s += 100; if (isPassed(m)) s -= 40; else s += 10; s += Math.min(10, (Date.now() - (m.t || 0)) / DAY); }
  cards.forEach(c => { if (c.b <= 2) s += 8; s += c.lapses * 2; });
  return s;
}
const digitsOf = it => it.en.replace(/,/g, '').length;
function comboLike(it) {                                        // a fresh combo with the same number of digits
  for (let i = 0; i < 60; i++) { const c = Combo.make('en').item; if (digitsOf(c) === digitsOf(it)) return c; }
  return Combo.make('en').item;
}
function distractors(it, pool) {
  const out = [], en = new Set([it.en.toLowerCase()]), dz = new Set([it.dz.toLowerCase()]);
  const add = x => { const e = x.en.toLowerCase(), d = x.dz.toLowerCase(); if (en.has(e) || dz.has(d)) return false; en.add(e); dz.add(d); out.push(x); return true; };
  if (it.combo) { for (let i = 0; i < 40 && out.length < 7; i++) add(comboLike(it)); }
  else if (NUM_TOPICS.includes(it.topic.id)) {                // numbers: similar size, so the length isn't a clue
    const near = shuffle(pool.filter(x => x !== it)).sort((a, b) => Math.abs(digitsOf(a) - digitsOf(it)) - Math.abs(digitsOf(b) - digitsOf(it)));
    near.slice(0, 5).forEach(add);
    if (Combo.on()) for (let i = 0; i < 20 && out.length < 7; i++) add(comboLike(it));
    near.slice(5).forEach(x => out.length < 7 && add(x));
  }
  else {
    const same = shuffle(pool.filter(x => x.topic.id === it.topic.id && x !== it));
    const other = shuffle(pool.filter(x => x.topic.id !== it.topic.id));
    same.slice(0, 4).forEach(add);                            // near neighbours make it a real test
    [...other, ...same.slice(4)].forEach(x => out.length < 7 && add(x));
  }
  return out;
}
function buildMatch(n) {
  const p = matchPool(), items = [...p.words, ...p.nums];
  const nTopics = S.set.topics.filter(id => TOPICS.some(t => t.id === id)).length;
  const nC = p.combos ? (nTopics ? Math.max(2, Math.round(n / (nTopics + 1))) : n) : 0;
  const q = items.map(it => [matchScore(it), it]).sort((a, b) => b[0] - a[0]).slice(0, n - nC).map(([, it]) => it);
  for (let i = 0; i < nC; i++) q.splice(Math.floor(Math.random() * (q.length + 1)), 0, Combo.make('en').item);
  return shuffle(q).map(it => ({it, dir: nextDir(it), repeat: false}));
}
function renderMatchSetup() {
  const p = matchPool();
  const all = [...p.words, ...p.nums];
  const flagged = all.filter(it => S.match[it.key] && S.match[it.key].flag).length;
  const passed = all.filter(it => isPassed(S.match[it.key])).length;
  $('mPlan').innerHTML = `<div><b>${all.length}${p.combos ? '+' : ''}</b><span>in play${p.combos ? ' + combos' : ''}</span></div><div><b>${passed}</b><span>passed both ways</span></div><div><b>${flagged}</b><span>to revisit</span></div>`;
  const ok = p.words.length >= 8 || p.nums.length >= 8 || p.combos;
  $('mStart').disabled = !ok;
  $('mStart').textContent = ok ? `Start — ${S.set.mLen} questions` : 'Pick some topics in the options.';
}
function mStart(queue) {
  M = {q: queue, i: 0, first: {}, again: {}, pool: matchPool()};
  $('mSetup').hidden = true; $('mDone').hidden = true; $('mRun').hidden = false;
  mCard();
}
const famOf = it => it.combo ? 'combo' : NUM_TOPICS.includes(it.topic.id) ? 'num' : 'word';
function mCard() {
  if (M.i >= M.q.length) return mFinish();
  const {it, repeat, dir} = M.q[M.i], fam = famOf(it);
  const pool = fam === 'word' ? M.pool.words : M.pool.nums;
  const opts = shuffle([it, ...distractors(it, pool)]);
  Object.assign(M, {it, dir, fam, opts, tapped: false, done: false});
  $('mCount').textContent = `${M.i + 1} / ${M.q.length}`;
  $('mDir').textContent = dir === 'en' ? 'English → Darja' : 'Darja → English';
  $('mBar').style.width = (M.i / M.q.length * 100) + '%';
  $('mMeta').innerHTML = `<span class="tag">${esc(it.topic.name)}</span>` + (repeat ? '<span class="tag acc">Again</span>' : '');
  const p = $('mPrompt');
  p.className = 'prompt ' + (dir === 'en' ? 'en' : '');
  p.innerHTML = dir === 'en' ? esc(it.en) : digits(it.dz);
  $('mGrid').innerHTML = opts.map((o, i) => `<button class="tile ${dir === 'en' ? 'dz' : 'en'}" data-i="${i}" type="button"><kbd>${i + 1}</kbd><span>${dir === 'en' ? digits(o.dz) : esc(o.en)}</span></button>`).join('');
  requestAnimationFrame(() => { M.t0 = performance.now(); });     // start once it is on screen
}
function rtKey() { return M.fam + '|' + M.dir; }
function usualTime() {
  const xs = (S.rt[rtKey()] || []).slice().sort((a, b) => a - b);
  if (xs.length < 5) return {en: 4000, dz: 4000}[M.dir] * (M.fam === 'combo' ? 2 : 1);   // until it has your times
  return xs[Math.floor(xs.length / 2)];
}
function mPick(i) {
  if (!M || M.done || i >= M.opts.length) return;
  const tile = $('mGrid').children[i], o = M.opts[i];
  if (tile.classList.contains('bad')) return;
  const first = !M.tapped; M.tapped = true;
  if (o !== M.it) {
    tile.classList.add('bad');
    if (first) M.g = 'miss';
    return;
  }
  const rt = performance.now() - M.t0;
  tile.classList.add('good'); M.done = true;
  if (first) {
    const usual = usualTime();
    M.g = rt > Math.max(1.8 * usual, usual + 2500) ? 'almost' : 'got';
    const arr = S.rt[rtKey()] = S.rt[rtKey()] || [];
    arr.push(Math.round(rt)); if (arr.length > 40) arr.shift();
  }
  const e = M.q[M.i], key = e.it.key, firstTime = !(key in M.first);
  if (firstTime) M.first[key] = {g: M.g, it: e.it, rt, dir: M.dir};
  mApply(e.it, M.g, firstTime, M.dir);
  if (M.g !== 'got' && (M.again[key] || 0) < 2) {
    M.again[key] = (M.again[key] || 0) + 1;
    M.q.splice(Math.min(M.i + 1 + (M.g === 'miss' ? 7 : 11), M.q.length), 0, {it: e.it, dir: M.dir, repeat: true});   // same direction: that's the one you missed
  }
  setTimeout(() => { M.i++; mCard(); }, M.g === 'got' ? 350 : 1100);   // a moment to see the right answer
}
function mApply(it, g, firstTime, dir) {
  const t = Date.now(), today = dayKey();
  if (firstTime) { const d = S.days[today] || {n: 0, ok: 0}; d.n++; if (g === 'got') d.ok++; S.days[today] = d; }
  if (!it.combo) {
    const m = S.match[it.key] || {seen: 0};
    m.seen = (m.seen || 0) + 1;
    const d = m[dir] = m[dir] || {days: []};
    d.days = d.days || [];
    if (g === 'got') {
      if (!d.days.includes(today)) { d.days.push(today); if (d.days.length > 3) d.days.shift(); }
      m.flag = false;                                           // cleared by a clean answer; passing still needs both ways
    } else { d.days = []; m.flag = true; }                     // a slip wipes that direction's evidence
    m.day = today; m.t = t; m.last = g; m.lastDir = dir;
    S.match[it.key] = m;
    if (g !== 'got') ['en', 'dz', 'ear'].forEach(md => {        // mistakes reach Drill/Listen; clean answers don't
      const c = S.cards[it.key + '|' + md]; if (!c) return;
      if (g === 'miss') c.b = Math.max(1, c.b - 1);
      c.due = Math.min(c.due, t); c.t = t;
    });
  }
  save(); Sync.soon();
}
function mFinish() {
  const f = Object.values(M.first), c = g => f.filter(x => x.g === g).length;
  const weak = f.filter(x => x.g !== 'got').sort((a, b) => (b.g === 'miss') - (a.g === 'miss'));
  const med = f.filter(x => x.g === 'got').map(x => x.rt).sort((a, b) => a - b);
  $('mRun').hidden = true; $('mDone').hidden = false;
  $('mDone').innerHTML = `<h2>Session done</h2>
    <p class="muted">${med.length ? `Typical clean answer: ${(med[Math.floor(med.length / 2)] / 1000).toFixed(1)} s. ` : ''}Counted on first attempt only.</p>
    <div class="tally">
      <div class="t-got"><b>${c('got')}</b><span>clean</span></div>
      <div class="t-almost"><b>${c('almost')}</b><span>slow</span></div>
      <div class="t-miss"><b>${c('miss')}</b><span>missed</span></div>
    </div>
    ${weak.length ? `<p class="label" style="margin:0">Coming back sooner</p><ul class="list">${weak.map(x =>
      `<li><span class="d">${digits(x.it.dz)}</span><span class="e">${esc(x.it.en)} · ${x.g === 'miss' ? 'missed' : 'slow'}</span></li>`).join('')}</ul>` : '<p class="muted">Clean sweep.</p>'}
    <div class="row">${weak.length ? '<button class="go" id="mAgain" type="button">Go over these again</button>' : ''}<button class="ghost" data-back type="button">Back</button></div>`;
  const again = $('mAgain');
  if (again) again.onclick = () => mStart(shuffle(weak.map(x => ({it: x.it, dir: x.dir, repeat: true}))));
  Sync.now();
}

/* =========================================================
   9. Progress
   ========================================================= */
let pMode = 'speak';
function renderProgress() {
  // streak
  let streak = 0; const d = new Date();
  if (!S.days[dayKey(d)]) d.setDate(d.getDate() - 1);    // today not done yet doesn't break it
  while (S.days[dayKey(d)]) { streak++; d.setDate(d.getDate() - 1); }
  const today = S.days[dayKey()] || {n: 0};
  const seenItems = new Set(Object.keys(S.cards).map(id => id.split('|').slice(0, 2).join('|')));
  $('pStats').innerHTML =
    `<div class="stat"><b>${streak}</b><span>day streak</span></div>` +
    `<div class="stat"><b>${today.n}</b><span>reviewed today</span></div>` +
    `<div class="stat"><b>${seenItems.size}<small style="font-size:15px; color:var(--ink-3)">/${ITEMS.length}</small></b><span>words started</span></div>`;
  // last 28 days
  const cells = [];
  for (let i = 27; i >= 0; i--) {
    const x = new Date(); x.setDate(x.getDate() - i);
    const n = (S.days[dayKey(x)] || {n: 0}).n;
    cells.push(`<i class="${n >= 40 ? 'l3' : n >= 15 ? 'l2' : n > 0 ? 'l1' : ''}" title="${dayKey(x)}: ${n}"></i>`);
  }
  $('pDays').innerHTML = cells.join('');
  // by topic
  const modes = pMode === 'speak' ? ['en', 'dz'] : ['ear'];
  const labels = ['Not seen', 'Box 1', 'Box 2', 'Box 3', 'Box 4', 'Box 5'];
  $('pLegend').innerHTML = labels.map((l, i) => `<span><i style="background:var(--b${i})"></i>${l}</span>`).join('');
  $('pTopics').innerHTML = TOPICS.map(t => {
    const cs = CARDS.filter(c => c.item.topic.id === t.id && modes.includes(c.mode) && (S.set.additions || !c.item.x));
    if (!cs.length) return '';
    const counts = [0, 0, 0, 0, 0, 0];
    cs.forEach(c => { const s = S.cards[c.id]; counts[s ? s.b : 0]++; });
    const secure = counts[3] + counts[4] + counts[5];
    return `<div><div class="tb-head"><span>${esc(t.name)}</span><span>${Math.round(secure / cs.length * 100)}% in box 3+</span></div>
      <div class="stackbar">${counts.map((n, i) => i === 0 ? '' : `<i style="width:${n / cs.length * 100}%; background:var(--b${i})"></i>`).join('')}</div></div>`;
  }).join('');
  // hardest
  const byItem = {};
  Object.entries(S.cards).forEach(([id, s]) => {
    const c = CARD[id]; if (!c || !s.lapses) return;
    const k = c.item.key, cur = byItem[k];
    if (!cur || s.lapses > cur.lapses) byItem[k] = {item: c.item, lapses: s.lapses, b: s.b};
  });
  const hard = Object.values(byItem).sort((a, b) => b.lapses - a.lapses || a.b - b.b).slice(0, 10);
  $('pHard').innerHTML = hard.length ? hard.map(h => `<li><span class="d">${digits(h.item.dz)}</span><span class="e">${esc(h.item.en)} · missed ${h.lapses}×</span></li>`).join('')
    : '<li><span class="e">Nothing yet. Misses will show up here.</span></li>';
}

/* =========================================================
   10. Sync (Supabase, keyed by a private sync code)
   ========================================================= */
const Sync = (() => {
  const cfg = window.DRILL_CONFIG || {};
  let timer = null, busy = false, again = false;
  const ALPHA = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  function makeCode() {
    const b = new Uint8Array(24); crypto.getRandomValues(b);
    const s = [...b].map(x => ALPHA[x % ALPHA.length]).join('');
    return s.match(/.{4}/g).join('-');
  }
  const clean = s => (s || '').toUpperCase().replace(/[^A-Z0-9]/g, '').match(/.{1,4}/g)?.join('-') || '';
  function status(kind, text) {
    const b = $('syncDot'); b.className = 'syncdot ' + kind; $('syncText').textContent = text;
    if (S.lastSync) $('sLast').textContent = 'Last synced ' + new Date(S.lastSync).toLocaleString('en-AU', {dateStyle: 'medium', timeStyle: 'short'});
  }
  async function rpc(fn, body) {
    const r = await fetch(`${cfg.supabaseUrl}/rest/v1/rpc/${fn}`, {method: 'POST',
      headers: {apikey: cfg.supabaseKey, 'Content-Type': 'application/json'}, body: JSON.stringify(body)});
    if (!r.ok) throw new Error(r.status + ' ' + (await r.text()).slice(0, 200));
    return r.json();
  }
  function merge(remote) {
    if (!remote || typeof remote !== 'object') return;
    Object.entries(remote.cards || {}).forEach(([id, rc]) => {
      const lc = S.cards[id];
      if (!lc || (rc.t || 0) > (lc.t || 0)) S.cards[id] = rc;
    });
    Object.entries(remote.days || {}).forEach(([k, rd]) => {
      const ld = S.days[k] || {n: 0, ok: 0};
      S.days[k] = {n: Math.max(ld.n, rd.n || 0), ok: Math.max(ld.ok, rd.ok || 0)};
    });
    Object.entries(remote.match || {}).forEach(([k, rm]) => {
      const lm = S.match[k];
      if (!lm || (rm.t || 0) > (lm.t || 0)) S.match[k] = rm;
    });
    Object.entries(remote.rt || {}).forEach(([k, xs]) => {     // reaction times: keep the longer history
      if (Array.isArray(xs) && xs.length > (S.rt[k] || []).length) S.rt[k] = xs;
    });
  }
  async function run() {
    if (!S.syncKey) { status('', 'Not synced'); return; }
    if (!navigator.onLine) { status('err', 'Offline'); return; }
    if (busy) { again = true; return; }
    busy = true; status('busy', 'Syncing…');
    try {
      const remote = await rpc('get_progress', {p_key: S.syncKey});
      merge(remote);
      await rpc('save_progress', {p_key: S.syncKey, p_data: {v: 1, cards: S.cards, days: S.days, match: S.match, rt: S.rt}});
      S.lastSync = Date.now(); save();
      status('ok', 'Synced');
      refreshVisible();
    } catch (e) {
      console.warn('sync failed', e);
      status('err', 'Sync failed');
    } finally {
      busy = false;
      if (again) { again = false; run(); }
    }
  }
  return {
    makeCode, clean,
    now: () => { clearTimeout(timer); return run(); },
    soon: () => { if (!S.syncKey) return; clearTimeout(timer); timer = setTimeout(run, 4000); },
    status
  };
})();

/* =========================================================
   11. Settings
   ========================================================= */
function applyTheme() {
  if (S.set.theme === 'auto') document.documentElement.removeAttribute('data-theme');
  else document.documentElement.setAttribute('data-theme', S.set.theme);
}
function syncSegs() {
  document.querySelectorAll('.seg[data-setting]').forEach(seg => {
    const k = seg.dataset.setting;
    seg.querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', String(String(S.set[k]) === b.dataset.v)));
  });
}
function renderTopicChips() {
  document.querySelectorAll('[data-topics]').forEach(box => {
    box.innerHTML = TOPICS.map(t => {
      const n = t.items.filter(i => S.set.additions || !(i[4] || '').includes('x')).length;
      return `<button class="chip" data-t="${t.id}" aria-pressed="${S.set.topics.includes(t.id)}" type="button">${esc(t.name)} <small>${n}</small>${t.week === NEWEST ? '<span class="wk">newest</span>' : ''}</button>`;
    }).join('') + (Combo.ok ? `<button class="chip" data-t="${Combo.ID}" aria-pressed="${S.set.topics.includes(Combo.ID)}" type="button">Number combos <small>mix</small></button>` : '');
  });
}
function renderSettings() {
  const has = !!S.syncKey;
  $('sNoKey').hidden = has; $('sHasKey').hidden = !has;
  if (has) $('sCode').textContent = S.syncKey;
  $('sAdditions').checked = S.set.additions;
  $('sUnsure').innerHTML = ITEMS.filter(i => i.u).map(i =>
    `<li><span class="d">${digits(i.dz)}</span><span class="e ar" lang="ar">${esc(i.ar)}</span></li>`).join('');
  $('sInfo').textContent = `Vocab last updated ${window.VOCAB.updated} · ${ITEMS.length} words across ${TOPICS.length} topics`;
}
function joinCode(code) {
  code = Sync.clean(code);
  if (code.replace(/-/g, '').length < 24) { alertNote('That code looks too short. Copy the whole code from your other device.'); return; }
  S.syncKey = code; save();
  renderSettings();
  alertNote('Joined. Progress from both devices is being merged.');
  Sync.now();
}
function alertNote(msg, html) {
  const n = $('sJoinConfirm'); n.hidden = false;
  if (html) n.innerHTML = html; else n.textContent = msg;
}

/* =========================================================
   12. Tabs, events, start-up
   ========================================================= */
let tab = 'drill';
function showTab(t) {
  tab = t;
  document.querySelectorAll('nav.tabs button').forEach(b => b.setAttribute('aria-current', String(b.dataset.tab === t)));
  ['drill', 'listen', 'match', 'progress', 'settings'].forEach(x => $('tab-' + x).hidden = x !== t);
  if (t !== 'listen') Voice.stop();
  refreshVisible();
  window.scrollTo({top: 0});
}
function refreshVisible() {
  if (tab === 'drill' && !$('dSetup').hidden) renderDrillSetup();
  if (tab === 'listen' && !$('lSetup').hidden) renderListenSetup();
  if (tab === 'match' && !$('mSetup').hidden) renderMatchSetup();
  if (tab === 'progress') renderProgress();
  if (tab === 'settings') renderSettings();
}
function backToSetup() {
  D = null; L = null; M = null; Voice.stop();
  ['dRun', 'dDone', 'lRun', 'lDone', 'mRun', 'mDone'].forEach(id => $(id).hidden = true);
  $('dSetup').hidden = false; $('lSetup').hidden = false; $('mSetup').hidden = false;
  refreshVisible();
}

document.querySelector('nav.tabs').addEventListener('click', e => { const b = e.target.closest('button'); if (b) showTab(b.dataset.tab); });
document.addEventListener('click', e => {
  const seg = e.target.closest('.seg[data-setting] button');
  if (seg) {
    const box = seg.parentElement, k = box.dataset.setting;
    S.set[k] = box.dataset.num ? Number(seg.dataset.v) : seg.dataset.v;
    save(); syncSegs(); if (k === 'theme') applyTheme(); refreshVisible();
    return;
  }
  const chip = e.target.closest('[data-topics] .chip');
  if (chip) {
    const t = chip.dataset.t, list = S.set.topics;
    S.set.topics = list.includes(t) ? list.filter(x => x !== t) : [...list, t];
    save(); renderTopicChips(); refreshVisible();
    return;
  }
  if (e.target.closest('[data-back]')) backToSetup();
});

$('dStart').onclick = () => { const q = buildSession(dModes(), S.set.len, S.set.newCap); if (q.length) dStart(q); };
$('dReveal').onclick = dReveal;
$('dGradeRow').onclick = e => { const b = e.target.closest('.grade'); if (b) dGrade(b.dataset.g); };
$('dSpeak').onclick = () => { if (D) Voice.speak(D.q[D.i].c.item, false, null); };
$('dEnd').onclick = () => { if (D) { D.q = D.q.slice(0, D.i); dFinish(); } };

$('lStart').onclick = () => { const q = buildSession(['ear'], S.set.lLen, S.set.lNewCap); if (q.length) lStart(q); };
$('lPlay').onclick = () => { if (L) Voice.speak(L.q[L.i].c.item, false, $('lStatus')); };
$('lSlow').onclick = () => { if (L) Voice.speak(L.q[L.i].c.item, true, $('lStatus')); };
$('lHintBtn').onclick = lHint;
$('lForm').addEventListener('submit', lCheck);
$('lNext').onclick = lNext;
$('lOverride').onclick = () => { if (L && L.answered) { L.verdict = {v: 'got', msg: 'Counted as right'}; lShowVerdict(); $('lOverride').hidden = true; } };
$('lEnd').onclick = () => { if (L) { L.q = L.q.slice(0, L.i); lFinish(); } };

$('mStart').onclick = () => { const q = buildMatch(S.set.mLen); if (q.length) mStart(q); };
$('mGrid').addEventListener('click', e => { const t = e.target.closest('.tile'); if (t) mPick(+t.dataset.i); });
$('mEnd').onclick = () => { if (M) { M.q = M.q.slice(0, M.i); mFinish(); } };

$('pMode').onclick = e => {
  const b = e.target.closest('button'); if (!b) return;
  pMode = b.dataset.v;
  $('pMode').querySelectorAll('button').forEach(x => x.setAttribute('aria-pressed', String(x === b)));
  renderProgress();
};

$('sVoice').onchange = e => { S.set.voice = e.target.value; save(); };
$('sAdditions').onchange = e => { S.set.additions = e.target.checked; save(); renderTopicChips(); };
$('sMake').onclick = () => { S.syncKey = Sync.makeCode(); save(); renderSettings(); Sync.now(); };
$('sJoinForm').addEventListener('submit', e => { e.preventDefault(); joinCode($('sJoinInput').value); });
$('sSyncNow').onclick = () => Sync.now();
$('sCopyLink').onclick = async () => {
  const link = location.origin + location.pathname + '#sync=' + S.syncKey;
  try { await navigator.clipboard.writeText(link); alertNote('Link copied. Open it on your other device.'); }
  catch (e) { alertNote('', `Copy this link and open it on your other device:<br><span class="codebox" style="display:block; margin-top:8px; font-size:14px">${esc(link)}</span>`); }
};
$('sForget').onclick = () => {
  alertNote('', 'Stop syncing on this device? Your progress stays here, and the other device keeps its copy. <div class="row" style="margin-top:10px"><button class="ghost danger" id="sForgetYes" type="button">Stop syncing</button><button class="ghost" id="sForgetNo" type="button">Keep syncing</button></div>');
};
$('sJoinConfirm').addEventListener('click', e => {
  if (e.target.id === 'sForgetYes') { delete S.syncKey; save(); Sync.status('', 'Not synced'); renderSettings(); $('sJoinConfirm').hidden = true; }
  if (e.target.id === 'sForgetNo' || e.target.id === 'sJoinNo') $('sJoinConfirm').hidden = true;
  if (e.target.id === 'sJoinYes') { joinCode(e.target.dataset.code); }
});
$('sExport').onclick = () => {
  const blob = new Blob([JSON.stringify({v: 1, exported: new Date().toISOString(), cards: S.cards, days: S.days, set: S.set}, null, 1)], {type: 'application/json'});
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = `darja-drill-backup-${dayKey()}.json`;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
};
$('sImport').onchange = async e => {
  const f = e.target.files[0]; if (!f) return;
  try {
    const data = JSON.parse(await f.text());
    if (!data.cards) throw new Error('no cards');
    Object.entries(data.cards).forEach(([id, rc]) => { const lc = S.cards[id]; if (!lc || (rc.t || 0) > (lc.t || 0)) S.cards[id] = rc; });
    Object.entries(data.days || {}).forEach(([k, rd]) => { const ld = S.days[k] || {n: 0, ok: 0}; S.days[k] = {n: Math.max(ld.n, rd.n || 0), ok: Math.max(ld.ok, rd.ok || 0)}; });
    save(); Sync.soon();
    $('sInfo').textContent = 'Backup loaded and merged with this device.';
  } catch (err) { $('sInfo').textContent = 'That file isn’t a Darja Drill backup.'; }
  e.target.value = '';
};
$('sResetZone').addEventListener('click', e => {
  const z = $('sResetZone');
  if (e.target.id === 'sReset') z.innerHTML = '<div class="note">Wipe all progress on this device? If you sync, the other device keeps its copy and will send it back. <div class="row" style="margin-top:10px"><button class="ghost danger" id="sResetYes" type="button">Yes, wipe it</button><button class="ghost" id="sResetNo" type="button">Keep it</button></div></div>';
  if (e.target.id === 'sResetYes') { S.cards = {}; S.days = {}; save(); }
  if (e.target.id === 'sResetYes' || e.target.id === 'sResetNo') z.innerHTML = '<button class="ghost danger" id="sReset" type="button">Reset all progress</button>';
});

// Listen shortcuts. With Option (Mac) or Alt they work while typing in the answer box;
// on their own they work anywhere else on the card.
const IS_MAC = /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
const MOD = IS_MAC ? '⌥' : 'Alt+';
document.querySelectorAll('#lRun kbd[data-k]').forEach(k => { k.textContent = MOD + k.dataset.k; });
$('lKeys').textContent = `Keys work while you type: ${MOD}P play · ${MOD}S slowly · ${MOD}H Arabizi · Enter to check, then Enter for next · ${MOD}R if you were right.`;
function listenKey(code) {
  const it = L.q[L.i].c.item;
  if (code === 'KeyP') { Voice.speak(it, false, $('lStatus')); return true; }
  if (code === 'KeyS') { Voice.speak(it, true, $('lStatus')); return true; }
  if (code === 'KeyH') { if (!L.answered) lHint(); return true; }
  if (code === 'KeyR') { if (L.answered && !$('lOverride').hidden) $('lOverride').click(); return true; }
  return false;
}
document.addEventListener('keydown', e => {
  if (tab === 'listen' && L && !$('lRun').hidden && e.altKey && !e.ctrlKey && !e.metaKey && !e.repeat) {
    if (listenKey(e.code)) { e.preventDefault(); return; }
  }
  if (e.target.closest('input, select, textarea')) {
    if (tab === 'listen' && L && L.answered && e.key === 'Enter') { e.preventDefault(); lNext(); }
    return;
  }
  if (tab === 'drill' && D && !$('dRun').hidden) {
    if (e.key === ' ' || e.key === 'Enter') { if ($('dAnswer').hidden) { e.preventDefault(); dReveal(); } }
    if (e.key === '1') dGrade('miss');
    if (e.key === '2') dGrade('almost');
    if (e.key === '3') dGrade('got');
  }
  if (tab === 'match' && M && !$('mRun').hidden && /^[1-8]$/.test(e.key) && !e.altKey && !e.ctrlKey && !e.metaKey) { mPick(+e.key - 1); return; }
  if (tab === 'listen' && L && !$('lRun').hidden) {
    if (!e.altKey && !e.ctrlKey && !e.metaKey && !e.repeat && /^Key[PSHR]$/.test(e.code)) { e.preventDefault(); listenKey(e.code); }
  }
});
$('syncDot').onclick = () => showTab('settings');
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') Sync.now(); });
window.addEventListener('online', () => Sync.now());

// a link like …#sync=CODE joins this device to that code (after asking)
function checkHash() {
  const m = location.hash.match(/sync=([A-Za-z0-9-]+)/);
  if (!m) return;
  history.replaceState(null, '', location.pathname + location.search);
  const code = Sync.clean(m[1]);
  if (code === S.syncKey) return;
  showTab('settings');
  alertNote('', `Join the sync code <b>${esc(code)}</b> on this device? Progress already here will be merged with it.
    <div class="row" style="margin-top:10px"><button class="go" id="sJoinYes" data-code="${esc(code)}" type="button">Join</button><button class="ghost" id="sJoinNo" type="button">Not now</button></div>`);
}

applyTheme(); syncSegs(); renderTopicChips(); Voice.refresh();
showTab('drill');
checkHash();
Sync.status(S.syncKey ? '' : '', S.syncKey ? 'Sync on' : 'Not synced');
Sync.now();
if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => {});
})();
