/* Sèries Control Center — app d'una sola pàgina, dades de TMDB + data/top10.json */
{
const KEY = '3cae83d0c61c9003373b08c875a48199';
const API = 'https://api.themoviedb.org/3';
const IMG = 'https://image.tmdb.org/t/p/';
const REGION = 'ES', LANG = 'es-ES';

const PLATS = [
  {slug:'netflix',     name:'Netflix',     bg:'#E50914', fg:'#fff',    dark:'#3A1416', re:/^netflix$/i,                id:8},
  {slug:'hbo-max',     name:'HBO Max',     bg:'#0026D9', fg:'#fff',    dark:'#121A3D', re:/^(hbo )?max$/i,             id:1899},
  {slug:'prime-video', name:'Prime Video', bg:'#00A8E1', fg:'#04131A', dark:'#0B2A36', re:/^amazon prime video$/i,     id:119},
  {slug:'disney',      name:'Disney+',     bg:'#0B2FA8', fg:'#fff',    dark:'#101C45', re:/^disney ?(\+|plus)$/i,      id:337},
  {slug:'apple-tv',    name:'Apple TV+',   bg:'#2A2B30', fg:'#fff',    dark:'#26272B', re:/^apple tv( ?\+| plus)?$/i,  id:350},
  {slug:'movistar',    name:'Movistar+',   bg:'#26B5F7', fg:'#031722', dark:'#0C2A3A', re:/^movistar ?(plus\+?|\+)$/i, id:149},
  {slug:'skyshowtime', name:'SkyShowtime', bg:'#5A2BD6', fg:'#fff',    dark:'#22163F', re:/^skyshowtime$/i,            id:1773},
  {slug:'filmin',      name:'Filmin',      bg:'#F3EFE6', fg:'#16140F', dark:'#2B2924', re:/^filmin$/i,                 id:63}
];
const STATUS = {
  tv:    [['vista','Vista'],['mirant','Mirant'],['pendent','Pendent']],
  movie: [['vista','Vista'],['pendent','Pendent']]
};
const STATUS_LABEL = {vista:'Vista', mirant:'Mirant', pendent:'Pendent'};

const $ = s => document.querySelector(s);
const view = $('#view');
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const tname = t => t.name || t.title || '';
const tyear = t => (t.first_air_date || t.release_date || '').slice(0, 4);
const today = new Date();
const iso = d => d.toISOString().slice(0, 10);
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };

/* ---------- emmagatzematge local ---------- */
const store = {
  get(k, def) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : def; } catch (e) { return def; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
};
let mode = store.get('scc-mode', 'tv');
if (mode !== 'tv' && mode !== 'movie') mode = 'tv';
let list = store.get('scc-list', {});
const saveList = () => store.set('scc-list', list);
const lkey = (type, id) => type + '-' + id;

/* ---------- TMDB ---------- */
const mem = {};
async function tmdb(path, params = {}, lang = LANG) {
  const q = new URLSearchParams({api_key: KEY, language: lang, ...params});
  const url = API + path + '?' + q;
  if (mem[url]) return mem[url];
  const p = fetch(url).then(r => { if (!r.ok) throw new Error('TMDB ' + r.status); return r.json(); });
  mem[url] = p;
  p.catch(() => { delete mem[url]; });
  return p;
}

let provReady = null;
function resolveProviders() {
  if (provReady) return provReady;
  provReady = Promise.all([
    tmdb('/watch/providers/tv', {watch_region: REGION}),
    tmdb('/watch/providers/movie', {watch_region: REGION})
  ]).then(([tv, mv]) => {
    const all = [...(tv.results || []), ...(mv.results || [])];
    for (const p of PLATS) {
      const m = all.filter(x => p.re.test((x.provider_name || '').trim()));
      if (m.length) p.id = m.sort((a, b) => (a.display_priority ?? 99) - (b.display_priority ?? 99))[0].provider_id;
    }
  }).catch(() => {});
  return provReady;
}
const platById = id => PLATS.find(p => p.id === id);

let genres = {tv: {}, movie: {}};
const genresReady = Promise.all(['tv', 'movie'].map(t =>
  tmdb('/genre/' + t + '/list').then(d => { for (const g of d.genres || []) genres[t][g.id] = g.name; }).catch(() => {})));
const gname = (type, ids) => (ids || []).map(i => genres[type][i]).filter(Boolean).slice(0, 2).join(', ');

let topData = null;
function loadTop() {
  if (topData) return topData;
  topData = fetch('data/top10.json?d=' + iso(today)).then(r => r.ok ? r.json() : null).catch(() => null);
  return topData;
}

const resCache = store.get('scc-res', {});
async function resolveTitle(type, title) {
  const clean = title.replace(/:\s*(Season|Temporada|Part|Parte|Limited Series|Miniserie).*$/i, '').trim();
  const k = type + '|' + clean.toLowerCase();
  if (resCache[k]) return resCache[k];
  const d = await tmdb('/search/' + type, {query: clean, region: REGION, include_adult: 'false'});
  const r = (d.results || [])[0];
  if (!r) return null;
  const slim = {id: r.id, name: r.name, title: r.title, poster_path: r.poster_path, popularity: r.popularity,
    first_air_date: r.first_air_date, release_date: r.release_date, genre_ids: r.genre_ids};
  resCache[k] = slim;
  store.set('scc-res', resCache);
  return slim;
}

function discover(type, plat, extra = {}) {
  return tmdb('/discover/' + type, {watch_region: REGION, with_watch_providers: plat.id,
    with_watch_monetization_types: 'flatrate', sort_by: 'popularity.desc', page: 1, ...extra});
}

async function getTop(plat, type) {
  await resolveProviders();
  const data = await loadTop();
  const entry = data && data.platforms && data.platforms[plat.name] && data.platforms[plat.name][type];
  const titles = (entry && entry.titles) || [];
  const official = (await Promise.all(titles.map(t => resolveTitle(type, t).catch(() => null)))).filter(Boolean);
  const seen = new Set(official.map(x => x.id));
  let items = official.map(x => ({...x, official: true}));
  if (items.length < 10) {
    const d = await discover(type, plat).catch(() => ({results: []}));
    for (const r of d.results || []) {
      if (items.length >= 10) break;
      if (!seen.has(r.id)) { seen.add(r.id); items.push({...r, official: false}); }
    }
  }
  return {items, label: entry && entry.label, nOfficial: official.length};
}

/* ---------- utilitats d'interfície ---------- */
let tt;
function toast(msg) {
  const el = $('#toast'); el.textContent = msg; el.classList.add('on');
  clearTimeout(tt); tt = setTimeout(() => el.classList.remove('on'), 1900);
}
const poster = (path, size = 'w185', alt = '') => path ? `<img src="${IMG}${size}${path}" alt="${esc(alt)}" loading="lazy">` : `<span class="noimg" aria-hidden="true"></span>`;
const starsTxt = r => r ? '★★★★★'.slice(0, r) + '☆☆☆☆☆'.slice(0, 5 - r) : '';
const segHTML = () => `<div class="seg" role="tablist" aria-label="Tipus de contingut">
  <button role="tab" data-mode="tv" aria-selected="${mode === 'tv'}">Sèries</button>
  <button role="tab" data-mode="movie" aria-selected="${mode === 'movie'}">Pel·lícules</button></div>`;
const backBtn = () => `<button class="back" data-back aria-label="Enrere"><svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"/></svg></button>`;
const footer = () => `<footer>Dades i imatges: TMDB · Disponibilitat: JustWatch · Tops: Netflix i FlixPatrol.<br>Aquesta app fa servir l'API de TMDB però TMDB no l'avala ni la certifica.</footer>`;
const errBox = () => `<div class="err">No s'han pogut carregar les dades. Comprova la connexió i torna-ho a provar.</div>`;
const chipStatus = s => s ? `<span class="chip st-${s}">${STATUS_LABEL[s]}</span>` : '';
let renderId = 0;

/* ---------- INICI ---------- */
async function renderHome() {
  const id = ++renderId;
  const isS = mode === 'tv';
  const dstr = today.toLocaleDateString('ca-ES', {weekday: 'long', day: 'numeric', month: 'short'});
  view.innerHTML = `
    <header style="display:flex;flex-direction:column;gap:8px">
      <div class="top"><span class="sub">${esc(dstr)} · Espanya</span>${segHTML()}</div>
      <h1>${isS ? 'Sèries' : 'Pel·lícules'}</h1>
    </header>
    <section><h2>Plataformes</h2><div class="grid2" id="plats">
      ${PLATS.map(p => `<a class="plat" href="#/p/${p.slug}" style="background:${p.bg};color:${p.fg}"><span class="txt"><b>${p.name}</b><small>Carregant…</small></span></a>`).join('')}
    </div></section>
    <section><div style="display:flex;justify-content:space-between;align-items:baseline;gap:8px"><h2>El més vist ara</h2><span class="sub" style="font-size:12px">Nº1 de cada plataforma</span></div>
      <div class="grid3" id="hot">${[1, 2, 3].map(() => `<div class="poster"><span class="pimg sk"></span></div>`).join('')}</div></section>
    <p class="note" id="upd"></p>
    ${footer()}`;
  try {
    const res = await Promise.all(PLATS.map(p => getTop(p, mode).then(r => ({p, r})).catch(() => ({p, r: {items: []}}))));
    if (id !== renderId) return;
    $('#plats').innerHTML = res.map(({p, r}) => {
      const t = r.items[0];
      return `<a class="plat" href="#/p/${p.slug}" style="background:${p.bg};color:${p.fg}"><span class="txt"><b>${p.name}</b><small>${t ? 'Nº1: ' + esc(tname(t)) : 'Sense dades'}</small></span>${t && t.poster_path ? `<img src="${IMG}w154${t.poster_path}" alt="">` : ''}</a>`;
    }).join('');
    const tops = res.filter(x => x.r.items[0]).map(x => ({p: x.p, t: x.r.items[0]}))
      .sort((a, b) => (b.t.official - a.t.official) || (b.t.popularity - a.t.popularity)).slice(0, 3);
    $('#hot').innerHTML = tops.map((x, i) => `
      <a class="poster" href="#/t/${mode}/${x.t.id}">
        <span class="pimg">${x.t.poster_path ? `<img src="${IMG}w342${x.t.poster_path}" alt="">` : `<span class="ph">${esc(tname(x.t))}</span>`}
          <span class="rank">${i + 1}</span><span class="tag" style="background:${x.p.bg};color:${x.p.fg}">${x.p.name}</span></span>
        <span class="ptitle">${esc(tname(x.t))}</span></a>`).join('');
    const data = await loadTop();
    if (id === renderId) $('#upd').textContent = data ? `Tops actualitzats el ${new Date(data.updated).toLocaleDateString('ca-ES', {day: 'numeric', month: 'long'})}. On no hi ha top oficial, s'ordena per popularitat a TMDB.` : 'Ordenat per popularitat a Espanya segons TMDB.';
  } catch (e) { if (id === renderId) $('#hot').innerHTML = errBox(); }
}

/* ---------- PLATAFORMA ---------- */
let platTab = 'top';
async function renderPlatform(slug) {
  const p = PLATS.find(x => x.slug === slug);
  if (!p) return go('#/');
  const id = ++renderId;
  const isS = mode === 'tv';
  view.innerHTML = `
    <header style="display:flex;flex-direction:column;gap:14px">
      <div class="top">${backBtn()}${segHTML()}</div>
      <div style="display:flex;align-items:center;gap:10px">
        <span aria-hidden="true" style="width:12px;height:12px;border-radius:6px;background:${p.bg};flex:none"></span>
        <h1>${p.name}</h1><span class="sub" style="margin-left:auto">${isS ? 'Sèries' : 'Pel·lícules'}</span>
      </div>
      <div class="tabs" role="tablist">
        ${[['top', 'Top 10'], ['nous', 'Novetats'], ['millors', 'Millor valorades']].map(([k, l]) => `<button role="tab" data-ptab="${k}" aria-selected="${platTab === k}">${l}</button>`).join('')}
      </div>
    </header>
    <div id="pbody"><ul class="list">${Array.from({length: 6}, () => `<li class="trow"><span class="noimg sk" style="width:40px;height:60px;border-radius:6px"></span></li>`).join('')}</ul></div>
    ${footer()}`;
  await resolveProviders();
  await genresReady;
  try {
    let items = [], label = '';
    if (platTab === 'top') {
      const r = await getTop(p, mode);
      items = r.items;
      label = r.nOfficial ? `${r.label}. ${r.nOfficial < 10 ? 'La resta, per popularitat a TMDB.' : ''}` : 'Encara no hi ha top oficial d\'aquesta plataforma: ordenat per popularitat a Espanya (TMDB).';
    } else if (platTab === 'nous') {
      const extra = isS
        ? {'air_date.gte': iso(addDays(today, -30)), 'air_date.lte': iso(addDays(today, 7))}
        : {'primary_release_date.gte': iso(addDays(today, -120)), 'primary_release_date.lte': iso(today)};
      items = ((await discover(mode, p, extra)).results || []).slice(0, 15);
      label = isS ? 'Sèries amb episodis nous aquest mes, per popularitat.' : 'Pel·lícules estrenades els últims mesos, per popularitat.';
    } else {
      items = ((await discover(mode, p, {sort_by: 'vote_average.desc', 'vote_count.gte': isS ? 300 : 800})).results || []).slice(0, 15);
      label = 'Les més ben valorades de la plataforma disponibles a Espanya.';
    }
    if (id !== renderId) return;
    if (!items.length) { $('#pbody').innerHTML = `<div class="empty">No hi ha títols per mostrar.</div>`; return; }
    $('#pbody').innerHTML = `<p class="note" style="margin-bottom:8px">${esc(label)}</p><ol class="list">${items.map((t, i) => {
      const st = list[lkey(mode, t.id)];
      const meta = [gname(mode, t.genre_ids), tyear(t)].filter(Boolean).join(' · ');
      return `<li><a class="trow" href="#/t/${mode}/${t.id}">
        <span class="n">${i + 1}</span>${poster(t.poster_path, 'w92')}
        <span class="info"><span class="t">${esc(tname(t))}</span><span class="m">${esc(meta)}</span></span>
        ${st ? chipStatus(st.status) : ''}${platTab === 'top' && t.official ? '<span class="src" title="Top oficial">TOP</span>' : ''}
      </a></li>`;
    }).join('')}</ol>`;
  } catch (e) { if (id === renderId) $('#pbody').innerHTML = errBox(); }
}

/* ---------- FITXA ---------- */
async function renderTitle(type, tid) {
  const id = ++renderId;
  view.innerHTML = `<div class="hero sk">${backBtn()}</div><div class="dhead"><span class="noimg sk"></span></div>`;
  try {
    const d = await tmdb('/' + type + '/' + tid, {append_to_response: 'watch/providers,recommendations'});
    if (!d.overview) {
      const en = await tmdb('/' + type + '/' + tid, {}, 'en-US').catch(() => null);
      if (en && en.overview) d.overview = en.overview;
    }
    if (id !== renderId) return;
    const k = lkey(type, d.id);
    const it = list[k];
    const meta = type === 'tv'
      ? [tyear(d), d.number_of_seasons ? d.number_of_seasons + (d.number_of_seasons === 1 ? ' temporada' : ' temporades') : '', d.status === 'Ended' ? 'Acabada' : (d.status === 'Returning Series' ? 'En emissió' : '')]
      : [tyear(d), d.runtime ? Math.floor(d.runtime / 60) + ' h ' + (d.runtime % 60) + ' min' : ''];
    const gen = (d.genres || []).map(g => g.name).slice(0, 3).join(', ');
    const wp = (d['watch/providers'] && d['watch/providers'].results && d['watch/providers'].results[REGION]) || {};
    const flat = wp.flatrate || [];
    const recs = ((d.recommendations && d.recommendations.results) || []).filter(r => r.poster_path).slice(0, 9);
    const vote = d.vote_average ? d.vote_average.toFixed(1).replace('.', ',') : '';
    view.innerHTML = `
      <div class="hero" style="${d.backdrop_path ? `background-image:url('${IMG}w780${d.backdrop_path}')` : ''}">${backBtn()}</div>
      <div class="dhead">${poster(d.poster_path, 'w342', 'Pòster de ' + tname(d))}
        <div class="info"><h1 style="font-size:26px">${esc(tname(d))}</h1>
          <span class="sub">${esc(meta.filter(Boolean).join(' · '))}</span>
          <span class="sub">${esc(gen)}</span>
          ${vote ? `<span class="sub" style="color:var(--gold);font-weight:600">★ ${vote} a TMDB</span>` : ''}</div></div>
      ${d.overview ? `<p class="overview">${esc(d.overview)}</p>` : ''}
      <section><h2>El meu estat</h2>
        <div class="${type === 'tv' ? 'status3' : 'status2'}">
          ${STATUS[type].map(([s, l]) => `<button class="${s}" data-status="${s}" aria-pressed="${!!(it && it.status === s)}">${l}</button>`).join('')}
        </div></section>
      <section><h2>La meva nota</h2><div class="rate">
        ${[1, 2, 3, 4, 5].map(n => `<button data-rate="${n}" aria-label="${n} estrelles"><svg aria-hidden="true" width="30" height="30" viewBox="0 0 24 24" fill="${it && it.rating >= n ? '#FFD166' : 'none'}" stroke="#FFD166" stroke-width="1.8" stroke-linejoin="round"><path d="M12 3l2.6 5.6 6.1.7-4.5 4.2 1.2 6L12 16.6 6.6 19.5l1.2-6L3.3 9.3l6.1-.7z"/></svg></button>`).join('')}
      </div>${it ? `<button class="btn ghost sm" data-remove style="align-self:flex-start">Treure de la llista</button>` : ''}</section>
      <section><h2>On es pot veure a Espanya</h2>
        ${flat.length ? `<div class="provs">${flat.map(f => `<span class="prov">${f.logo_path ? `<img src="${IMG}w92${f.logo_path}" alt="">` : ''}${esc(f.provider_name)}</span>`).join('')}</div>` : `<p class="note">No està inclosa a cap plataforma de subscripció a Espanya ara mateix.</p>`}
      </section>
      ${recs.length ? `<section><h2>Si t'agrada, prova</h2><div class="grid3">${recs.map(r => `
        <a class="poster" href="#/t/${type}/${r.id}"><span class="pimg"><img src="${IMG}w185${r.poster_path}" alt=""></span><span class="ptitle">${esc(tname(r))}</span></a>`).join('')}</div></section>` : ''}
      ${footer()}`;
    view.dataset.title = JSON.stringify({id: d.id, type, title: tname(d), poster_path: d.poster_path, year: tyear(d), genre_ids: (d.genres || []).map(g => g.id)});
  } catch (e) { if (id === renderId) view.innerHTML = `<div class="top">${backBtn()}</div>${errBox()}`; }
}

function upsertFromView(patch) {
  let info;
  try { info = JSON.parse(view.dataset.title || 'null'); } catch (e) { info = null; }
  if (!info) return null;
  const k = lkey(info.type, info.id);
  const cur = list[k] || {id: info.id, type: info.type, title: info.title, poster_path: info.poster_path, year: info.year, genre_ids: info.genre_ids, status: 'pendent', rating: 0, added: Date.now()};
  list[k] = {...cur, ...patch, updated: Date.now()};
  saveList();
  return info;
}

/* ---------- LA MEVA LLISTA ---------- */
let listFilter = 'totes';
let searchTimer;
function renderList() {
  ++renderId;
  const isS = mode === 'tv';
  const items = Object.values(list).filter(x => x.type === mode);
  const counts = {totes: items.length, vista: 0, mirant: 0, pendent: 0};
  items.forEach(x => { counts[x.status] = (counts[x.status] || 0) + 1; });
  const filters = isS ? [['totes', 'Totes'], ['mirant', 'Mirant'], ['pendent', 'Pendents'], ['vista', 'Vistes']] : [['totes', 'Totes'], ['pendent', 'Pendents'], ['vista', 'Vistes']];
  if (!filters.some(f => f[0] === listFilter)) listFilter = 'totes';
  const order = {mirant: 0, pendent: 1, vista: 2};
  const shown = items.filter(x => listFilter === 'totes' || x.status === listFilter)
    .sort((a, b) => (order[a.status] - order[b.status]) || ((b.updated || b.added) - (a.updated || a.added)));
  view.innerHTML = `
    <header style="display:flex;flex-direction:column;gap:10px">
      <div class="top"><h1>La meva llista</h1>${segHTML()}</div>
    </header>
    <div style="position:relative;display:flex;flex-direction:column;gap:8px">
      <label class="search"><svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#9AA0AA" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/></svg>
        <input id="q" type="search" autocomplete="off" placeholder="${isS ? 'Busca una sèrie per afegir-la…' : 'Busca una pel·lícula per afegir-la…'}" aria-label="Cerca"></label>
      <ul class="list" id="results"></ul>
    </div>
    <div class="chips">${filters.map(([k, l]) => `<button data-filter="${k}" aria-pressed="${listFilter === k}">${l} ${counts[k] || 0}</button>`).join('')}</div>
    ${shown.length ? `<ul class="list">${shown.map(x => `<li><a class="card" href="#/t/${x.type}/${x.id}">${poster(x.poster_path, 'w92')}
        <span class="info"><span style="font-size:15px;font-weight:600">${esc(x.title)}</span><span class="sub" style="font-size:12px">${esc(x.year || '')}</span>
        ${x.rating ? `<span class="stars">${starsTxt(x.rating)}</span>` : `<span class="sub" style="font-size:12px">Sense nota</span>`}</span>
        ${chipStatus(x.status)}</a></li>`).join('')}</ul>`
      : `<div class="empty">${items.length ? 'No hi ha cap títol amb aquest filtre.' : (isS ? 'Encara no tens cap sèrie a la llista. Busca-la a dalt, o entra a qualsevol fitxa i marca-la com a vista, mirant o pendent.' : 'Encara no tens cap pel·lícula a la llista. Busca-la a dalt, o entra a qualsevol fitxa i marca-la.')}</div>`}
    <details><summary>Còpia de seguretat de la llista</summary>
      <p class="note" style="margin:10px 0">La llista es guarda en aquest mòbil. Copia-la i desa-la (per exemple, a les Notes) per poder-la recuperar si canvies de telèfon.</p>
      <div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn sm" data-export>Copiar la llista</button></div>
      <p class="note" style="margin:14px 0 6px">Per restaurar-la, enganxa aquí la còpia:</p>
      <textarea id="imp" aria-label="Còpia per restaurar"></textarea>
      <button class="btn ghost sm" data-import style="margin-top:8px">Restaurar</button>
    </details>
    ${footer()}`;
}

async function doSearch(q) {
  const box = $('#results');
  if (!box) return;
  if (q.length < 2) { box.innerHTML = ''; return; }
  try {
    const d = await tmdb('/search/' + mode, {query: q, region: REGION, include_adult: 'false'});
    if ($('#q') && $('#q').value.trim() !== q) return;
    const rs = (d.results || []).slice(0, 6);
    box.innerHTML = rs.length ? rs.map(r => {
      const inList = list[lkey(mode, r.id)];
      return `<li class="card"><a href="#/t/${mode}/${r.id}" style="display:flex;align-items:center;gap:12px;flex:1">${poster(r.poster_path, 'w92')}
        <span class="info"><span style="font-size:15px;font-weight:600">${esc(tname(r))}</span><span class="sub" style="font-size:12px">${esc(tyear(r))}</span></span></a>
        ${inList ? chipStatus(inList.status) : `<button class="btn sm" data-add='${esc(JSON.stringify({id: r.id, title: tname(r), poster_path: r.poster_path, year: tyear(r), genre_ids: r.genre_ids}))}'>+ Pendent</button>`}</li>`;
    }).join('') : `<li class="empty">No s'ha trobat res.</li>`;
  } catch (e) { box.innerHTML = `<li>${errBox()}</li>`; }
}

/* ---------- PER A TU ---------- */
async function renderForYou() {
  const id = ++renderId;
  const isS = mode === 'tv';
  view.innerHTML = `
    <header class="top"><h1>Per a tu</h1>${segHTML()}</header>
    <div id="fy"><ul class="list">${Array.from({length: 5}, () => `<li class="card"><span class="noimg sk"></span></li>`).join('')}</ul></div>
    ${footer()}`;
  await resolveProviders();
  const mine = Object.values(list).filter(x => x.type === mode);
  let seeds = mine.filter(x => x.rating >= 4);
  if (!seeds.length) seeds = mine.filter(x => x.status === 'vista' || x.status === 'mirant');
  seeds = seeds.sort((a, b) => (b.rating || 0) - (a.rating || 0)).slice(0, 8);
  try {
    let recs = [];
    let intro = '';
    if (seeds.length) {
      const agg = {};
      const lists = await Promise.all(seeds.map(s => tmdb('/' + mode + '/' + s.id + '/recommendations').then(d => ({s, r: d.results || []})).catch(() => ({s, r: []}))));
      for (const {s, r} of lists) r.forEach((t, i) => {
        if (list[lkey(mode, t.id)]) return;
        const a = agg[t.id] || (agg[t.id] = {t, score: 0, because: s.title});
        a.score += (s.rating || 3) * (20 - Math.min(i, 19));
      });
      recs = Object.values(agg).sort((a, b) => b.score - a.score).slice(0, 15).map(a => ({...a.t, because: a.because}));
      intro = isS ? 'Sèries triades a partir de les que has valorat i vist.' : 'Pel·lícules triades a partir de les que has valorat i vist.';
    }
    if (!recs.length) {
      const ids = PLATS.map(p => p.id).join('|');
      const d = await tmdb('/discover/' + mode, {watch_region: REGION, with_watch_providers: ids, with_watch_monetization_types: 'flatrate', sort_by: 'vote_average.desc', 'vote_count.gte': isS ? 1000 : 3000});
      recs = (d.results || []).filter(t => !list[lkey(mode, t.id)]).slice(0, 15);
      intro = isS ? 'Valora sèries amb 4 o 5 estrelles i els suggeriments s\'adaptaran a tu. Mentrestant, aquí tens les més ben valorades de les teves plataformes.' : 'Valora pel·lícules amb 4 o 5 estrelles i els suggeriments s\'adaptaran a tu. Mentrestant, aquí tens les més ben valorades de les teves plataformes.';
    }
    const provs = await Promise.all(recs.map(t => tmdb('/' + mode + '/' + t.id + '/watch/providers').then(d => {
      const f = (d.results && d.results[REGION] && d.results[REGION].flatrate) || [];
      const ours = f.map(x => platById(x.provider_id)).filter(Boolean);
      return ours.length ? ours.map(p => p.name).join(', ') : (f[0] ? f[0].provider_name : '');
    }).catch(() => '')));
    if (id !== renderId) return;
    $('#fy').innerHTML = `<p class="note" style="margin-bottom:10px">${esc(intro)}</p><ul class="list">${recs.map((t, i) => `
      <li class="card"><a href="#/t/${mode}/${t.id}" style="display:flex;align-items:center;gap:12px;flex:1">${poster(t.poster_path, 'w92')}
        <span class="info"><span style="font-size:15px;font-weight:600">${esc(tname(t))}</span>
        <span class="sub" style="font-size:12px">${esc([provs[i] || 'No disponible en subscripció', tyear(t)].filter(Boolean).join(' · '))}</span>
        ${t.because ? `<span style="font-size:12px;color:var(--soft)">Perquè t'agrada ${esc(t.because)}</span>` : ''}</span></a>
        <button class="btn sm" data-add='${esc(JSON.stringify({id: t.id, title: tname(t), poster_path: t.poster_path, year: tyear(t), genre_ids: t.genre_ids}))}'>+ Pendent</button></li>`).join('')}</ul>`;
  } catch (e) { if (id === renderId) $('#fy').innerHTML = errBox(); }
}

/* ---------- navegació ---------- */
function go(h) { location.hash = h; }
function route() {
  const h = location.hash.replace(/^#/, '') || '/';
  const parts = h.split('/').filter(Boolean);
  let nav = 'home';
  if (parts[0] === 'p' && parts[1]) renderPlatform(parts[1]);
  else if (parts[0] === 't' && (parts[1] === 'tv' || parts[1] === 'movie') && parts[2]) { nav = ''; renderTitle(parts[1], parts[2]); }
  else if (parts[0] === 'llista') { nav = 'llista'; renderList(); }
  else if (parts[0] === 'pertu') { nav = 'pertu'; renderForYou(); }
  else renderHome();
  document.querySelectorAll('nav a').forEach(a => {
    if (a.dataset.nav === nav) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
  });
  window.scrollTo(0, 0);
}

document.addEventListener('click', e => {
  const m = e.target.closest('[data-mode]');
  if (m) { mode = m.dataset.mode; store.set('scc-mode', mode); route(); return; }
  if (e.target.closest('[data-back]')) { if (history.length > 1) history.back(); else go('#/'); return; }
  const pt = e.target.closest('[data-ptab]');
  if (pt) { platTab = pt.dataset.ptab; route(); return; }
  const st = e.target.closest('[data-status]');
  if (st) {
    const info = upsertFromView({status: st.dataset.status});
    if (info) { toast(`${info.title}: ${STATUS_LABEL[st.dataset.status]}`); renderTitle(info.type, info.id); }
    return;
  }
  const rt = e.target.closest('[data-rate]');
  if (rt) {
    let info; try { info = JSON.parse(view.dataset.title || 'null'); } catch (x) {}
    if (!info) return;
    const cur = list[lkey(info.type, info.id)];
    const n = +rt.dataset.rate;
    const rating = cur && cur.rating === n ? 0 : n;
    upsertFromView(cur ? {rating} : {rating, status: 'vista'});
    toast(rating ? `Nota: ${rating} estrelles` : 'Nota esborrada');
    renderTitle(info.type, info.id);
    return;
  }
  if (e.target.closest('[data-remove]')) {
    let info; try { info = JSON.parse(view.dataset.title || 'null'); } catch (x) {}
    if (info) { delete list[lkey(info.type, info.id)]; saveList(); toast('Tret de la llista'); renderTitle(info.type, info.id); }
    return;
  }
  const add = e.target.closest('[data-add]');
  if (add) {
    let t; try { t = JSON.parse(add.dataset.add); } catch (x) { return; }
    const k = lkey(mode, t.id);
    if (!list[k]) { list[k] = {...t, type: mode, status: 'pendent', rating: 0, added: Date.now(), updated: Date.now()}; saveList(); }
    add.outerHTML = chipStatus('pendent');
    toast(`${t.title} afegida a pendents`);
    if ((location.hash || '').includes('llista')) setTimeout(() => { const q = $('#q') ? $('#q').value : ''; renderList(); if (q) { $('#q').value = q; doSearch(q.trim()); } }, 400);
    return;
  }
  const f = e.target.closest('[data-filter]');
  if (f) { listFilter = f.dataset.filter; renderList(); return; }
  if (e.target.closest('[data-export]')) {
    const txt = JSON.stringify({app: 'scc', v: 1, list});
    (navigator.clipboard ? navigator.clipboard.writeText(txt) : Promise.reject()).then(() => toast('Llista copiada')).catch(() => { $('#imp').value = txt; toast('Copia el text del quadre'); });
    return;
  }
  if (e.target.closest('[data-import]')) {
    try {
      const d = JSON.parse($('#imp').value);
      if (!d || d.app !== 'scc' || typeof d.list !== 'object') throw 0;
      list = {...list, ...d.list}; saveList(); toast('Llista restaurada'); renderList();
    } catch (x) { toast('La còpia no és vàlida'); }
  }
});

document.addEventListener('input', e => {
  if (e.target.id === 'q') { clearTimeout(searchTimer); const q = e.target.value.trim(); searchTimer = setTimeout(() => doSearch(q), 350); }
});

window.addEventListener('hashchange', route);
route();
}
