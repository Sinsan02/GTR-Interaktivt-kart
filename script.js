(() => {
  const $ = id => document.getElementById(id);
  const main = $('main'), vp = $('vp'), stage = $('stage'), img = $('mapImg'), pinsEl = $('pins'), grid = $('grid');
  const GRID_SIZES = [20, 40, 60, 80, 120];
  let COLS = 40, ROWS = 56;
  let W = 1000, H = 1400;
  let view = { x: 0, y: 0, s: 1 };
  let mode = 'cell', sel = null, labels = true;
  let pins = [];
  let cellStore = {}, cells = new Set();

  // ---------- storage ----------
  const LS = 'npcjakt.pins.v1', LSC = 'npcjakt.cells.v1', LSG = 'npcjakt.gridsize';
  function save() { try { localStorage.setItem(LS, JSON.stringify(pins)); } catch (e) {} }
  function load() { try { const v = JSON.parse(localStorage.getItem(LS)); if (Array.isArray(v)) return v; } catch (e) {} return null; }
  // checked cells are stored per grid size, so switching size doesn't scramble them
  function saveCells() { cellStore[COLS] = [...cells]; try { localStorage.setItem(LSC, JSON.stringify(cellStore)); } catch (e) {} }
  function loadCells() { try { const v = JSON.parse(localStorage.getItem(LSC)); if (v && typeof v === 'object') return v; } catch (e) {} return {}; }
  function idb(mode, fn) {
    return new Promise(res => {
      try {
        const r = indexedDB.open('npcjakt', 1);
        r.onupgradeneeded = () => r.result.createObjectStore('kv');
        r.onsuccess = () => { try { const tx = r.result.transaction('kv', mode); const q = fn(tx.objectStore('kv')); q.onsuccess = () => res(q.result); q.onerror = () => res(null); } catch (e) { res(null); } };
        r.onerror = () => res(null);
      } catch (e) { res(null); }
    });
  }
  const saveImg = d => idb('readwrite', s => s.put(d, 'map'));
  const loadImg = () => idb('readonly', s => s.get('map'));

  // ---------- placeholder map ----------
  function placeholder() {
    const c = document.createElement('canvas'); c.width = W; c.height = H;
    const g = c.getContext('2d');
    g.fillStyle = '#1d3a4a'; g.fillRect(0, 0, W, H);
    // generic island blob
    g.fillStyle = '#2b3b2f';
    g.beginPath();
    const pts = [[.42,.04],[.62,.08],[.78,.18],[.86,.32],[.8,.46],[.72,.58],[.66,.7],[.6,.84],[.48,.95],[.3,.93],[.2,.8],[.24,.66],[.16,.52],[.22,.36],[.28,.2]];
    pts.forEach(([x,y],i) => i ? g.lineTo(x*W, y*H) : g.moveTo(x*W, y*H));
    g.closePath(); g.fill();
    g.fillStyle = '#3a4a3d';
    g.beginPath(); g.ellipse(.5*W,.3*H,.18*W,.1*H,0.4,0,7); g.fill();
    g.fillStyle = '#4a4f55';
    g.beginPath(); g.ellipse(.42*W,.8*H,.14*W,.09*H,-0.3,0,7); g.fill();
    g.fillStyle = 'rgba(227,232,230,.55)'; g.font = '600 34px "IBM Plex Sans", sans-serif'; g.textAlign = 'center';
    g.fillText('Eksempelkart', W/2, H*.5);
    g.font = '400 22px "IBM Plex Sans", sans-serif';
    g.fillText('Last inn ditt eget skjermbilde av kartet', W/2, H*.5 + 36);
    return c.toDataURL('image/png');
  }

  // ---------- grid ----------
  // A..Z, AA..AZ, BA.. (spreadsheet-style column names)
  const colName = i => (i >= 26 ? String.fromCharCode(64 + Math.floor(i / 26)) : '') + String.fromCharCode(65 + i % 26);
  const cellIdx = (x, y) => ({ c: Math.min(COLS-1, Math.max(0, Math.floor(x * COLS))), r: Math.min(ROWS-1, Math.max(0, Math.floor(y * ROWS))) });
  const cellOf = (x, y) => { const { c, r } = cellIdx(x, y); return colName(c) + (r + 1); };

  function drawGrid() {
    ROWS = Math.max(1, Math.round(COLS * H / W)); // square cells
    grid.setAttribute('viewBox', `0 0 ${W} ${H}`);
    grid.setAttribute('width', W); grid.setAttribute('height', H);
    const cw = W / COLS, rh = H / ROWS;
    let d = '';
    for (let i = 1; i < COLS; i++) d += `M${i*cw} 0V${H}`;
    for (let j = 1; j < ROWS; j++) d += `M0 ${j*rh}H${W}`;
    const fs = Math.min(cw, rh) * 0.34;
    let t = '';
    for (let i = 0; i < COLS; i++) t += `<text x="${i*cw + cw/2}" y="${fs + 2}" text-anchor="middle">${colName(i)}</text>`;
    for (let j = 1; j < ROWS; j++) t += `<text x="3" y="${j*rh + rh - 3}">${j+1}</text>`;
    grid.innerHTML = `<g id="gCells"></g><path d="${d}" class="lines"/><g class="labels" font-size="${fs.toFixed(1)}">${t}</g><rect id="gHover" class="hover" width="${cw}" height="${rh}" visibility="hidden"/>`;
    drawCells();
  }
  function drawCells() {
    const cw = W / COLS, rh = H / ROWS;
    let s = '';
    cells.forEach(k => { const [c, r] = k.split(',').map(Number); if (c < COLS && r < ROWS) s += `<rect x="${c*cw}" y="${r*rh}" width="${cw}" height="${rh}"/>`; });
    $('gCells').innerHTML = s;
    const total = COLS * ROWS, n = [...cells].filter(k => { const [c, r] = k.split(',').map(Number); return c < COLS && r < ROWS; }).length;
    $('cellStat').textContent = `Ruter sjekket: ${n} / ${total} (${(n / total * 100).toFixed(1)} %)`;
  }
  function toggleCell(x, y) {
    const { c, r } = cellIdx(x, y), k = c + ',' + r;
    cells.has(k) ? cells.delete(k) : cells.add(k);
    saveCells(); drawCells();
  }
  function setGridSize(n) {
    COLS = n; cells = new Set(cellStore[n] || []);
    try { localStorage.setItem(LSG, n); } catch (e) {}
    drawGrid(); render();
  }

  // ---------- view ----------
  function apply() {
    stage.style.transform = `translate(${view.x}px, ${view.y}px) scale(${view.s})`;
    stage.style.setProperty('--inv', (1 / view.s).toFixed(4));
  }
  function fit() {
    const r = vp.getBoundingClientRect();
    const s = Math.min(r.width / W, r.height / H) * 0.96;
    view = { s, x: (r.width - W*s) / 2, y: (r.height - H*s) / 2 };
    apply();
  }
  function zoomAt(f, cx, cy) {
    const ns = Math.min(12, Math.max(0.05, view.s * f));
    const k = ns / view.s;
    view.x = cx - (cx - view.x) * k; view.y = cy - (cy - view.y) * k; view.s = ns;
    apply();
  }
  function toMap(clientX, clientY) {
    const r = vp.getBoundingClientRect();
    return { x: (clientX - r.left - view.x) / view.s / W, y: (clientY - r.top - view.y) / view.s / H };
  }

  // ---------- pointer: pan / pinch / click ----------
  const pts = new Map(); let start = null, pinch = null, moved = false;
  vp.addEventListener('pointerdown', e => {
    if (e.target.closest('.pin')) return;
    vp.setPointerCapture(e.pointerId);
    pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pts.size === 1) { start = { x: e.clientX, y: e.clientY, vx: view.x, vy: view.y }; moved = false; }
    if (pts.size === 2) { const [a, b] = [...pts.values()]; pinch = { d: Math.hypot(a.x-b.x, a.y-b.y), s: view.s }; moved = true; }
  });
  vp.addEventListener('pointermove', e => {
    const p = toMap(e.clientX, e.clientY);
    const inside = p.x >= 0 && p.x < 1 && p.y >= 0 && p.y < 1;
    $('coords').textContent = inside ? `Rute ${cellOf(p.x, p.y)}` : '—';
    const hv = $('gHover');
    if (inside && mode === 'cell' && !e.pointerType.startsWith('touch')) {
      const { c, r } = cellIdx(p.x, p.y);
      hv.setAttribute('x', c * W / COLS); hv.setAttribute('y', r * H / ROWS); hv.setAttribute('visibility', 'visible');
    } else hv.setAttribute('visibility', 'hidden');
    if (!pts.has(e.pointerId)) return;
    pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pts.size === 2 && pinch) {
      const [a, b] = [...pts.values()];
      const d = Math.hypot(a.x-b.x, a.y-b.y);
      const r = vp.getBoundingClientRect();
      zoomAt((pinch.s * d / pinch.d) / view.s, (a.x+b.x)/2 - r.left, (a.y+b.y)/2 - r.top);
    } else if (pts.size === 1 && start) {
      const dx = e.clientX - start.x, dy = e.clientY - start.y;
      if (Math.hypot(dx, dy) > 5) { moved = true; vp.classList.add('drag'); }
      if (moved) { view.x = start.vx + dx; view.y = start.vy + dy; apply(); }
    }
  });
  function up(e) {
    if (!pts.has(e.pointerId)) return;
    pts.delete(e.pointerId);
    vp.classList.remove('drag');
    if (pts.size < 2) pinch = null;
    if (pts.size === 0) {
      if (!moved) {
        const p = toMap(e.clientX, e.clientY);
        const inside = p.x >= 0 && p.x < 1 && p.y >= 0 && p.y < 1;
        if (inside && mode === 'pin') addPin(p.x, p.y);
        else if (inside && mode === 'cell') toggleCell(p.x, p.y);
        else select(null);
      }
      start = null;
    } else { const [a] = [...pts.values()]; start = { x: a.x, y: a.y, vx: view.x, vy: view.y }; }
  }
  vp.addEventListener('pointerup', up); vp.addEventListener('pointercancel', up);
  vp.addEventListener('wheel', e => { e.preventDefault(); const r = vp.getBoundingClientRect(); zoomAt(e.deltaY < 0 ? 1.15 : 1/1.15, e.clientX - r.left, e.clientY - r.top); }, { passive: false });

  // ---------- pins ----------
  const uid = () => Math.random().toString(36).slice(2, 9);
  function addPin(x, y) {
    const n = pins.length + 1;
    const p = { id: uid(), x, y, name: `Sted ${n}`, note: '', done: false };
    pins.push(p); save(); render(); select(p.id, true);
  }
  function select(id, focusName) {
    sel = id;
    const p = pins.find(q => q.id === id);
    $('sheet').hidden = !p;
    if (p) {
      $('shName').value = p.name; $('shNote').value = p.note || '';
      $('shCell').textContent = cellOf(p.x, p.y);
      $('shToggle').textContent = p.done ? 'Marker som ikke sjekket' : 'Marker sjekket';
      if (focusName) setTimeout(() => { $('shName').focus(); $('shName').select(); }, 0);
    }
    render();
  }
  function centerOn(p) {
    const r = vp.getBoundingClientRect();
    if (view.s < 1) view.s = Math.min(1.2, view.s * 2.5);
    view.x = r.width/2 - p.x * W * view.s; view.y = r.height/2 - p.y * H * view.s; apply();
  }
  const pinSvg = c => `<svg viewBox="0 0 26 34"><path d="M13 33C13 33 2 20 2 12.5A11 11 0 0 1 24 12.5C24 20 13 33 13 33Z" fill="${c}" stroke="#0e1214" stroke-width="2"/><circle cx="13" cy="12.5" r="4" fill="#0e1214"/></svg>`;
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;' }[c]));

  function render() {
    const css = getComputedStyle(document.documentElement);
    const cTodo = css.getPropertyValue('--todo').trim(), cDone = css.getPropertyValue('--done').trim(), cSel = css.getPropertyValue('--accent').trim();
    pinsEl.innerHTML = pins.map(p => `
      <div class="pin${p.id === sel ? ' sel' : ''}" style="left:${p.x*W}px;top:${p.y*H}px">
        <button type="button" data-id="${p.id}" aria-label="${esc(p.name)}">${pinSvg(p.id === sel ? cSel : p.done ? cDone : cTodo)}</button>
        <span class="lbl">${esc(p.name)}</span>
      </div>`).join('');
    const q = $('q').value.trim().toLowerCase(), f = $('flt').value;
    const shown = pins.map((p, i) => ({ p, i })).filter(({ p }) =>
      (f === 'all' || (f === 'done') === p.done) &&
      (!q || (p.name + ' ' + (p.note||'') + ' ' + cellOf(p.x,p.y)).toLowerCase().includes(q)));
    $('list').innerHTML = shown.length ? shown.map(({ p }) => `
      <li class="item${p.done ? ' done' : ''}${p.id === sel ? ' sel' : ''}">
        <button class="chk" type="button" data-chk="${p.id}" aria-label="${p.done ? 'Fjern avkryssing' : 'Kryss av'} ${esc(p.name)}"></button>
        <div class="name" data-go="${p.id}"><b>${esc(p.name)}</b>${p.note ? `<small>${esc(p.note)}</small>` : ''}</div>
        <span class="cell">${cellOf(p.x, p.y)}</span>
      </li>`).join('') : `<li class="empty">${pins.length ? 'Ingen steder passer søket.' : 'Ingen steder ennå. Trykk på kartet for å legge til det første.'}</li>`;
    const d = pins.filter(p => p.done).length;
    $('sTotal').textContent = pins.length; $('sDone').textContent = d; $('sLeft').textContent = pins.length - d;
    $('prog').style.width = pins.length ? (d / pins.length * 100) + '%' : '0';
    $('exNote').hidden = !pins.some(p => p.ex);
  }

  pinsEl.addEventListener('click', e => { const b = e.target.closest('[data-id]'); if (b) select(b.dataset.id); });
  $('list').addEventListener('click', e => {
    const c = e.target.closest('[data-chk]');
    if (c) { const p = pins.find(q => q.id === c.dataset.chk); p.done = !p.done; save(); if (sel === p.id) select(p.id); else render(); return; }
    const g = e.target.closest('[data-go]');
    if (g) { const p = pins.find(q => q.id === g.dataset.go); select(p.id); centerOn(p); }
  });
  $('shName').addEventListener('input', e => { const p = pins.find(q => q.id === sel); if (p) { p.name = e.target.value || 'Uten navn'; delete p.ex; save(); render(); } });
  $('shNote').addEventListener('input', e => { const p = pins.find(q => q.id === sel); if (p) { p.note = e.target.value; save(); render(); } });
  $('shName').addEventListener('keydown', e => { if (e.key === 'Enter') select(null); });
  $('shToggle').addEventListener('click', () => { const p = pins.find(q => q.id === sel); if (p) { p.done = !p.done; save(); select(p.id); } });
  $('shDel').addEventListener('click', () => { pins = pins.filter(q => q.id !== sel); save(); select(null); });
  $('shClose').addEventListener('click', () => select(null));
  $('q').addEventListener('input', render); $('flt').addEventListener('change', render);
  $('clearEx').addEventListener('click', () => { pins = pins.filter(p => !p.ex); save(); select(null); });

  $('modes').addEventListener('click', e => {
    const b = e.target.closest('[data-mode]'); if (!b) return;
    mode = b.dataset.mode;
    $('modes').querySelectorAll('[data-mode]').forEach(x => { x.classList.toggle('on', x === b); x.setAttribute('aria-pressed', x === b); });
    vp.classList.toggle('adding', mode !== 'pan');
    $('gHover').setAttribute('visibility', 'hidden');
  });
  GRID_SIZES.forEach(n => $('gridSize').add(new Option(`Rutenett: ${n} bred`, n)));
  $('gridSize').addEventListener('change', e => setGridSize(+e.target.value));
  let cellArmed = false;
  $('cellReset').addEventListener('click', () => {
    const btn = $('cellReset');
    if (!cellArmed) { cellArmed = true; btn.textContent = 'Trykk igjen'; setTimeout(() => { cellArmed = false; btn.textContent = 'Nullstill ruter'; }, 3000); return; }
    cells.clear(); saveCells(); drawCells(); cellArmed = false; btn.textContent = 'Nullstill ruter';
  });
  $('lblBtn').addEventListener('click', () => { labels = !labels; document.body.classList.toggle('nolabels', !labels); $('lblBtn').textContent = 'Navn: ' + (labels ? 'på' : 'av'); });
  $('zin').addEventListener('click', () => { const r = vp.getBoundingClientRect(); zoomAt(1.4, r.width/2, r.height/2); });
  $('zout').addEventListener('click', () => { const r = vp.getBoundingClientRect(); zoomAt(1/1.4, r.width/2, r.height/2); });
  $('zfit').addEventListener('click', fit);
  document.addEventListener('keydown', e => { if (e.key === 'Escape') { select(null); $('io').hidden = true; } });

  // ---------- map image ----------
  function setMap(src, persist) {
    const im = new Image();
    im.onload = () => {
      W = im.naturalWidth; H = im.naturalHeight;
      img.src = src; img.width = W; img.height = H;
      drawGrid(); render(); fit();
      if (persist) { saveImg(src); $('hint').hidden = true; }
    };
    im.src = src;
  }
  function readFile(file) {
    if (!file || !file.type.startsWith('image/')) return;
    const r = new FileReader(); r.onload = () => setMap(r.result, true); r.readAsDataURL(file);
  }
  $('file').addEventListener('change', e => readFile(e.target.files[0]));
  document.addEventListener('paste', e => { const it = [...(e.clipboardData?.items || [])].find(i => i.type.startsWith('image/')); if (it) readFile(it.getAsFile()); });
  main.addEventListener('dragover', e => e.preventDefault());
  main.addEventListener('drop', e => { e.preventDefault(); readFile(e.dataTransfer.files[0]); });

  // ---------- import / export ----------
  $('ioBtn').addEventListener('click', () => { $('ioText').value = JSON.stringify({ pins: pins.map(({ex, ...p}) => p), cells: cellStore }); $('ioMsg').textContent = ''; $('io').hidden = false; });
  $('ioClose').addEventListener('click', () => $('io').hidden = true);
  $('ioCopy').addEventListener('click', () => {
    navigator.clipboard?.writeText($('ioText').value).then(() => $('ioMsg').textContent = 'Kopiert.', () => { $('ioText').select(); $('ioMsg').textContent = 'Teksten er markert. Trykk Ctrl+C for å kopiere.'; })
      ?? ($('ioText').select(), $('ioMsg').textContent = 'Teksten er markert. Trykk Ctrl+C for å kopiere.');
  });
  $('ioLoad').addEventListener('click', () => {
    try {
      const v = JSON.parse($('ioText').value);
      // older copies are a bare array of pins
      const list = Array.isArray(v) ? v : v && Array.isArray(v.pins) ? v.pins : null;
      if (!list) throw 0;
      pins = list.filter(p => typeof p.x === 'number' && typeof p.y === 'number').map(p => ({ id: p.id || uid(), x: p.x, y: p.y, name: String(p.name || 'Sted'), note: String(p.note || ''), done: !!p.done }));
      if (v.cells && typeof v.cells === 'object') {
        cellStore = {};
        for (const [n, arr] of Object.entries(v.cells)) if (Array.isArray(arr)) cellStore[n] = arr.filter(k => /^\d+,\d+$/.test(k));
        cells = new Set(cellStore[COLS] || []); saveCells(); drawCells();
      }
      save(); select(null); $('ioMsg').textContent = `Hentet inn ${pins.length} steder og ${cells.size} sjekkede ruter.`;
    } catch (e) { $('ioMsg').textContent = 'Teksten kunne ikke leses. Lim inn en kopi som er laget med «Kopier».'; }
  });
  let armed = false;
  $('ioReset').addEventListener('click', () => {
    if (!armed) { armed = true; $('ioReset').textContent = 'Trykk igjen for å slette'; setTimeout(() => { armed = false; $('ioReset').textContent = 'Slett alle punkter'; }, 3000); return; }
    pins = []; save(); select(null); $('ioText').value = '[]'; $('ioMsg').textContent = 'Alle punkter er slettet.'; armed = false; $('ioReset').textContent = 'Slett alle punkter';
  });

  // ---------- boot ----------
  const stored = load();
  pins = stored ?? [
    { id: uid(), x: .44, y: .78, name: 'Torget (eksempel)', note: 'Ikke her kl 20', done: true, ex: true },
    { id: uid(), x: .55, y: .72, name: 'Bryggen (eksempel)', note: '', done: false, ex: true },
    { id: uid(), x: .5, y: .3, name: 'Fjellveien (eksempel)', note: 'Sjekk bak bensinstasjonen', done: false, ex: true },
  ];
  cellStore = loadCells();
  try { const g = +localStorage.getItem(LSG); if (GRID_SIZES.includes(g)) COLS = g; } catch (e) {}
  cells = new Set(cellStore[COLS] || []);
  $('gridSize').value = COLS;
  window.addEventListener('resize', fit);
  loadImg().then(d => { if (d) { $('hint').hidden = true; setMap(d, false); } else setMap(placeholder(), false); });
})();
