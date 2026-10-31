(function () {
  'use strict';
  var KEY = 'mes-exercices-v1';
  var DAY = 86400000;
  var NIV = ['Échec total', 'Beaucoup d’erreurs', 'Compréhension partielle', 'Compréhension correcte', 'Presque parfait', 'Maîtrise totale'];
  var JOURS = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];
  var DEF = { intervalles: [2, 4, 10, 25, 35, 50, 70, 90, 110, 130, 150, 170], minutesDefaut: 5, debutExam: 50, seuilButoire: 15, butoireSi: 5, butoireSinon: 0, planning: [60, 60, 30, 180, 30, 180, 30], semestres: [] };
  var data = { ex: [], mats: [], reglages: JSON.parse(JSON.stringify(DEF)) };
  var view = 'today', editingId = null, doingId = null, shown = 120;

  function $(id) { return document.getElementById(id); }
  function el(tag, cls, txt) { var e = document.createElement(tag); if (cls) e.className = cls; if (txt !== undefined) e.textContent = txt; return e; }
  function toast(m) { var t = $('toast'); t.textContent = m; t.className = 'on'; clearTimeout(toast.t); toast.t = setTimeout(function () { t.className = ''; }, 2800); }
  function newId() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }
  function norm(s) { return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, ''); }

  /* ---------- dates (jours entiers, sans décalage d'heure) ---------- */
  function dnum(s) { var p = String(s).split('-'); return Date.UTC(+p[0], +p[1] - 1, +p[2]) / DAY; }
  function todayISO() { var d = new Date(); return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2); }
  function fromNum(n) { var d = new Date(Math.floor(n) * DAY); return ('0' + d.getUTCDate()).slice(-2) + '/' + ('0' + (d.getUTCMonth() + 1)).slice(-2) + '/' + d.getUTCFullYear(); }
  function TODAY() { return dnum(todayISO()); }

  /* ---------- données ---------- */
  function fix(d) {
    d = d && typeof d === 'object' ? d : {};
    var r = Object.assign({}, JSON.parse(JSON.stringify(DEF)), d.reglages || {});
    for (var i = 0; i < 12; i++) if (typeof r.intervalles[i] !== 'number') r.intervalles[i] = DEF.intervalles[i];
    return { ex: Array.isArray(d.ex) ? d.ex : [], mats: Array.isArray(d.mats) ? d.mats : [], reglages: r };
  }
  function load() { try { var raw = localStorage.getItem(KEY); if (raw) data = fix(JSON.parse(raw)); } catch (e) { /* départ à vide */ } }
  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(data)); localStorage.setItem(KEY + '-modif', String(Date.now())); return true; }
    catch (e) { toast('Impossible d’enregistrer (stockage plein ou bloqué).'); return false; }
  }

  /* ---------- tes règles de révision (reprises de ton Excel) ---------- */
  function examNum(sem, mat) {
    for (var i = 0; i < data.mats.length; i++) { var m = data.mats[i]; if (m.semestre === sem && m.nom === mat) return m.examen ? dnum(m.examen) : null; }
    return null;
  }
  function interval(n) { var v = data.reglages.intervalles[n]; return typeof v === 'number' ? v : 0; }
  function revision(x) {
    var R = data.reglages, I = dnum(x.evalue), iv = interval(x.succes), E = examNum(x.semestre, x.matiere);
    if (E !== null) {
      var dE = E - I;
      if (dE >= 0 && dE <= R.debutExam) {
        var X = dE > R.seuilButoire ? R.butoireSi : R.butoireSinon;
        var plafond = dE > X ? dE - X : 1e9;
        return I + Math.min(iv / interval(5) * (dE - X), plafond);
      }
    }
    return I + iv;
  }
  function modeExam(x) {
    var E = examNum(x.semestre, x.matiere); if (E === null) return false;
    var d = E - TODAY(); return d >= 0 && d <= data.reglages.debutExam;
  }
  function mins(x) { return x.minutes > 0 ? +x.minutes : data.reglages.minutesDefaut; }
  function visible(x) { var s = data.reglages.semestres; return !s.length || s.indexOf(x.semestre) >= 0; }
  function budgetDuJour() {
    var d = new Date(), v = data.reglages.planning[(d.getDay() + 6) % 7];
    return typeof v === 'number' && !isNaN(v) ? v : 1e9;
  }
  function dejaFait() {
    var t = todayISO(), s = 0;
    data.ex.forEach(function (x) { if (x.evalue === t && visible(x)) s += mins(x); });
    return s;
  }
  function plan() {
    var t = TODAY(), list = [];
    data.ex.forEach(function (x, i) {
      if (!visible(x) || !x.evalue) return;
      var r = revision(x);
      if (r < t + 1) list.push({ x: x, r: r, ex: modeExam(x), i: i });
    });
    list.sort(function (a, b) {
      var ka = (a.ex ? 0 : 1) * 1e11 + a.r * 1e5 + (a.x.succes || 0) * 1e4 + a.i;
      var kb = (b.ex ? 0 : 1) * 1e11 + b.r * 1e5 + (b.x.succes || 0) * 1e4 + b.i;
      return ka - kb;
    });
    var budget = budgetDuJour(), fait = dejaFait(), cum = 0;
    list.forEach(function (o) {
      var m = mins(o.x); cum += m;
      o.in = (budget >= 1e9) || cum <= budget - fait || (cum === m && budget > fait);
    });
    return { list: list, budget: budget, fait: fait };
  }

  /* ---------- filtres semestres ---------- */
  function semestres() { var s = []; data.mats.forEach(function (m) { if (s.indexOf(m.semestre) < 0) s.push(m.semestre); }); return s; }
  function renderFilters() {
    var box = $('filters'); box.textContent = '';
    var all = semestres(); if (all.length < 2) return;
    all.forEach(function (s) {
      var b = el('button', 'chip', s); b.type = 'button';
      b.setAttribute('aria-pressed', data.reglages.semestres.indexOf(s) >= 0 ? 'true' : 'false');
      b.addEventListener('click', function () {
        var a = data.reglages.semestres, k = a.indexOf(s);
        if (k >= 0) a.splice(k, 1); else a.push(s);
        save(); render();
      });
      box.appendChild(b);
    });
  }

  /* ---------- vue : à faire aujourd'hui ---------- */
  function exoCard(o, withBtn) {
    var x = o.x, c = el('div', 'card' + (o.ex ? ' exam' : ''));
    var top = el('div', 'row2');
    var l = el('div'); l.appendChild(el('b', '', x.matiere + (x.intitule ? ' · ' + x.intitule : '')));
    l.appendChild(el('div', 'muted', x.semestre + ' · fait le ' + fromNum(dnum(x.evalue)) + ' · niveau ' + x.succes));
    top.appendChild(l);
    if (withBtn) { var b = el('button', 'primary', 'Refait'); b.type = 'button'; b.addEventListener('click', function () { openDone(x.id); }); top.appendChild(b); }
    c.appendChild(top);
    var p = el('div'); p.style.marginTop = '6px';
    var late = Math.floor(TODAY() - o.r);
    if (late > 0) p.appendChild(el('span', 'pill late', 'en retard de ' + late + ' j'));
    else p.appendChild(el('span', 'pill', 'à revoir ' + fromNum(o.r)));
    if (o.ex) p.appendChild(el('span', 'pill', 'mode examen · J-' + (examNum(x.semestre, x.matiere) - TODAY())));
    p.appendChild(el('span', 'pill', mins(x) + ' min'));
    c.appendChild(p);
    c.addEventListener('click', function (e) { if (e.target.tagName !== 'BUTTON') openEditor(x.id); });
    return c;
  }
  function renderToday() {
    var box = $('v-today'); box.textContent = '';
    var P = plan(), d = new Date();
    var head = el('div', 'card');
    var tot = 0; P.list.forEach(function (o) { if (o.in) tot += mins(o.x); });
    head.appendChild(el('h2', '', 'Aujourd’hui · ' + JOURS[(d.getDay() + 6) % 7]));
    var bud = P.budget >= 1e9 ? 'sans limite' : P.budget + ' min';
    head.appendChild(el('div', 'muted', 'Budget du jour : ' + bud + ' · déjà fait : ' + P.fait + ' min · prévu : ' + tot + ' min'));
    var bar = el('div', 'bar'), fill = el('i'); fill.style.width = (P.budget >= 1e9 ? 0 : Math.min(100, Math.round(P.fait / P.budget * 100))) + '%'; bar.appendChild(fill); head.appendChild(bar);
    box.appendChild(head);
    var inP = P.list.filter(function (o) { return o.in; }), out = P.list.filter(function (o) { return !o.in; });
    if (!inP.length) box.appendChild(el('p', 'muted', data.ex.length ? 'Rien à faire aujourd’hui. Bravo !' : 'Aucun exercice. Ajoute-en avec le bouton + (onglet Exos) ou restaure ta sauvegarde (menu ⋮).'));
    inP.forEach(function (o) { box.appendChild(exoCard(o, true)); });
    if (out.length) {
      var det = document.createElement('details'); det.appendChild(el('summary', '', 'Reportés à demain ou après (' + out.length + ')'));
      out.slice(0, 60).forEach(function (o) { det.appendChild(exoCard(o, true)); });
      box.appendChild(det);
    }
  }

  /* ---------- vue : tous les exercices ---------- */
  function renderExos() {
    var box = $('exoList'); box.textContent = '';
    var q = norm($('search').value), t = TODAY();
    var l = data.ex.filter(function (x) { return visible(x) && (!q || norm(x.matiere + ' ' + x.intitule + ' ' + x.semestre).indexOf(q) >= 0); })
      .map(function (x) { return { x: x, r: x.evalue ? revision(x) : 1e9, ex: modeExam(x) }; })
      .sort(function (a, b) { return a.r - b.r; });
    box.appendChild(el('p', 'muted', l.length + ' exercice(s)'));
    l.slice(0, shown).forEach(function (o) { box.appendChild(exoCard(o, false)); });
    if (l.length > shown) { var m = el('button', 'row plain', 'Afficher plus'); m.addEventListener('click', function () { shown += 120; renderExos(); }); box.appendChild(m); }
  }

  /* ---------- vue : examens ---------- */
  function renderMats() {
    var box = $('v-mats'); box.textContent = '';
    box.appendChild(el('p', 'muted', 'La date d’examen déclenche le mode examen (voir Réglages). Laisse vide s’il n’y a pas d’examen.'));
    semestres().forEach(function (s) {
      var det = document.createElement('details'); det.appendChild(el('summary', '', s));
      var tb = document.createElement('table');
      data.mats.forEach(function (m) {
        if (m.semestre !== s) return;
        var tr = document.createElement('tr'), td1 = document.createElement('td'), td2 = document.createElement('td');
        td1.textContent = m.nom;
        var inp = document.createElement('input'); inp.type = 'date'; inp.value = m.examen || '';
        inp.addEventListener('change', function () { m.examen = inp.value || null; save(); toast('Date enregistrée.'); });
        td2.appendChild(inp); tr.appendChild(td1); tr.appendChild(td2); tb.appendChild(tr);
      });
      det.appendChild(tb);
      var add = el('button', 'plain', '+ Ajouter une matière'); add.type = 'button'; add.style.marginTop = '8px';
      add.addEventListener('click', function () {
        var n = window.prompt('Nom de la matière pour ' + s + ' :'); if (!n || !n.trim()) return;
        data.mats.push({ semestre: s, nom: n.trim(), examen: null }); save(); render();
      });
      det.appendChild(add); box.appendChild(det);
    });
    var ns = el('button', 'row plain', '+ Ajouter un semestre'); ns.type = 'button';
    ns.addEventListener('click', function () {
      var n = window.prompt('Nom du semestre (ex. Sec_S8) :'); if (!n || !n.trim()) return;
      var m = window.prompt('Première matière de ' + n.trim() + ' :'); if (!m || !m.trim()) return;
      data.mats.push({ semestre: n.trim(), nom: m.trim(), examen: null }); save(); render();
    });
    box.appendChild(ns);
  }

  /* ---------- vue : tableau de bord ---------- */
  var C_LATE = '#7a1f3d', C_EXAM = '#e0527f', C_NORM = '#f1b3c6';
  function renderDash() {
    var box = $('v-dash'); box.textContent = '';
    var t = TODAY(), L = data.ex.filter(function (x) { return visible(x) && x.evalue; });
    var late = 0, due = 0, week = 0;
    L.forEach(function (x) { var r = revision(x); if (r < t) late++; else if (r < t + 1) due++; else if (r < t + 8) week++; });
    var P = plan(), prevu = 0; P.list.forEach(function (o) { if (o.in) prevu += mins(o.x); });
    var k = el('div', 'kpis');
    [['Exercices', L.length], ['En retard', late], ['Dus aujourd’hui', due], ['Prévu aujourd’hui', prevu + ' min']].forEach(function (a) {
      var d = el('div', 'kpi'); d.appendChild(el('b', '', a[1])); d.appendChild(el('span', 'muted', a[0])); k.appendChild(d);
    });
    box.appendChild(k);

    var c1 = el('div', 'card'); c1.appendChild(el('h2', '', 'Charge de révision (14 jours)'));
    var cv = document.createElement('canvas'); c1.appendChild(cv);
    var lg = el('div', 'legend');
    [['En retard', C_LATE], ['Mode examen', C_EXAM], ['Normal', C_NORM]].forEach(function (a) { var s = el('span'); var i = el('i'); i.style.background = a[1]; s.appendChild(i); s.appendChild(document.createTextNode(a[0])); lg.appendChild(s); });
    c1.appendChild(lg); box.appendChild(c1);
    drawCharge(cv, L, t);

    var c2 = el('div', 'card'); c2.appendChild(el('h2', '', 'Niveaux de réussite'));
    var cnt = [0, 0, 0, 0, 0, 0]; L.forEach(function (x) { if (cnt[x.succes] !== undefined) cnt[x.succes]++; });
    var mx = Math.max.apply(null, cnt.concat([1]));
    cnt.forEach(function (n, i) {
      var r = el('div', 'row2'); r.appendChild(el('span', 'muted', i + ' · ' + NIV[i] + ' (' + n + ')'));
      c2.appendChild(r); var bar = el('div', 'bar'), f = el('i'); f.style.width = Math.round(n / mx * 100) + '%'; bar.appendChild(f); c2.appendChild(bar);
    });
    box.appendChild(c2);

    var c3 = el('div', 'card'); c3.appendChild(el('h2', '', 'Prochains examens'));
    var ex = data.mats.filter(function (m) { return m.examen && dnum(m.examen) >= t && (!data.reglages.semestres.length || data.reglages.semestres.indexOf(m.semestre) >= 0); })
      .sort(function (a, b) { return dnum(a.examen) - dnum(b.examen); }).slice(0, 8);
    if (!ex.length) c3.appendChild(el('p', 'muted', 'Aucune date d’examen à venir (onglet Examens).'));
    ex.forEach(function (m) { var r = el('div', 'row2'); r.appendChild(el('span', '', m.nom + ' (' + m.semestre + ')')); r.appendChild(el('span', 'pill', 'J-' + (dnum(m.examen) - t) + ' · ' + fromNum(dnum(m.examen)))); c3.appendChild(r); });
    box.appendChild(c3);
  }
  function drawCharge(cv, L, t) {
    var N = 14, late = [], ex = [], nm = []; for (var i = 0; i < N; i++) { late.push(0); ex.push(0); nm.push(0); }
    L.forEach(function (x) {
      var r = revision(x), m = mins(x), d = Math.max(0, Math.floor(r) - t); if (d >= N) return;
      if (r < t) late[0] += m; else if (modeExam(x)) ex[d] += m; else nm[d] += m;
    });
    var w = cv.clientWidth || 320, h = 190, dpr = window.devicePixelRatio || 1;
    cv.width = w * dpr; cv.height = h * dpr; cv.style.height = h + 'px';
    var g = cv.getContext('2d'); g.scale(dpr, dpr); g.clearRect(0, 0, w, h);
    var tot = late.map(function (_, i) { return late[i] + ex[i] + nm[i]; }), mx = Math.max.apply(null, tot.concat([60]));
    var step = mx > 600 ? 240 : mx > 240 ? 120 : 60; mx = Math.ceil(mx / step) * step;
    var L0 = 34, B = h - 24, T = 8, bw = (w - L0 - 4) / N;
    g.font = '10px system-ui'; g.fillStyle = '#8a6573'; g.strokeStyle = '#ecd3db'; g.textAlign = 'right';
    for (var v = 0; v <= mx; v += step) { var y = B - (B - T) * v / mx; g.beginPath(); g.moveTo(L0, y); g.lineTo(w, y); g.stroke(); g.fillText(v >= 60 ? (v / 60) + ' h' : v + ' min', L0 - 4, y + 3); }
    g.textAlign = 'center';
    for (var j = 0; j < N; j++) {
      var x0 = L0 + j * bw + bw * 0.15, ww = bw * 0.7, yy = B;
      [[late[j], C_LATE], [ex[j], C_EXAM], [nm[j], C_NORM]].forEach(function (s) {
        if (!s[0]) return; var hh = (B - T) * s[0] / mx; g.fillStyle = s[1]; g.fillRect(x0, yy - hh, ww, hh); yy -= hh;
      });
      var dd = new Date((t + j) * DAY); g.fillStyle = '#8a6573'; g.fillText(('0' + dd.getUTCDate()).slice(-2), x0 + ww / 2, h - 8);
    }
  }

  /* ---------- vue : réglages ---------- */
  function numInput(val, cb, w) {
    var i = document.createElement('input'); i.type = 'number'; i.inputMode = 'numeric'; i.value = val === null || val === undefined || isNaN(val) ? '' : val;
    if (w) i.style.width = w; i.addEventListener('change', function () { cb(i.value === '' ? null : +i.value); save(); toast('Réglage enregistré.'); }); return i;
  }
  function renderSet() {
    var box = $('v-set'); box.textContent = ''; var R = data.reglages;
    var c1 = el('div', 'card'); c1.appendChild(el('h2', '', 'Intervalles de révision'));
    c1.appendChild(el('p', 'muted', 'Prochaine révision = date de l’exo + intervalle de sa note (en jours).'));
    var tb = document.createElement('table');
    for (var n = 0; n < 12; n++) (function (n) {
      var tr = document.createElement('tr'), a = document.createElement('td'), b = document.createElement('td');
      a.textContent = n + (NIV[n] ? ' · ' + NIV[n] : ''); b.appendChild(numInput(R.intervalles[n], function (v) { R.intervalles[n] = v === null ? 0 : v; }, '80px'));
      tr.appendChild(a); tr.appendChild(b); tb.appendChild(tr);
    })(n);
    c1.appendChild(tb); box.appendChild(c1);

    var c2 = el('div', 'card'); c2.appendChild(el('h2', '', 'Mode examen'));
    [['Début du mode examen : jours avant l’examen', 'debutExam'], ['Butoire : seuil en jours avant l’examen', 'seuilButoire'], ['Butoire si l’exo est fait avant ce seuil (J-…)', 'butoireSi'], ['Butoire sinon (0 = jour de l’examen)', 'butoireSinon'], ['Minutes comptées par exo sans durée', 'minutesDefaut']].forEach(function (a) {
      var lb = el('label', '', a[0]); lb.appendChild(numInput(R[a[1]], function (v) { R[a[1]] = v === null ? 0 : v; })); c2.appendChild(lb);
    });
    box.appendChild(c2);

    var c3 = el('div', 'card'); c3.appendChild(el('h2', '', 'Planning de la semaine (minutes)'));
    c3.appendChild(el('p', 'muted', 'Temps de révision dispo chaque jour. Vide = sans limite, 0 = jour de repos.'));
    JOURS.forEach(function (j, i) { var lb = el('label', '', j); lb.appendChild(numInput(R.planning[i], function (v) { R.planning[i] = v; })); c3.appendChild(lb); });
    box.appendChild(c3);
  }

  /* ---------- édition d'un exercice ---------- */
  function fillSem(sel) {
    $('fSem').textContent = ''; semestres().forEach(function (s) { var o = el('option', '', s); o.value = s; $('fSem').appendChild(o); });
    if (sel) $('fSem').value = sel; fillMat();
  }
  function fillMat(sel) {
    $('fMat').textContent = ''; data.mats.forEach(function (m) { if (m.semestre === $('fSem').value) { var o = el('option', '', m.nom); o.value = m.nom; $('fMat').appendChild(o); } });
    if (sel) $('fMat').value = sel;
  }
  function openEditor(id) {
    if (!data.mats.length) { toast('Ajoute d’abord une matière (onglet Examens).'); return; }
    editingId = id; var x = id ? data.ex.filter(function (e) { return e.id === id; })[0] : null;
    $('editorTitle').textContent = x ? 'Modifier l’exercice' : 'Nouvel exercice';
    $('fSucces').textContent = ''; NIV.forEach(function (n, i) { var o = el('option', '', i + ' · ' + n); o.value = i; $('fSucces').appendChild(o); });
    fillSem(x ? x.semestre : (data.reglages.semestres[0] || null)); if (x) fillMat(x.matiere);
    $('fTitre').value = x ? x.intitule || '' : ''; $('fSucces').value = x ? x.succes : 3;
    $('fDate').value = x ? x.evalue : todayISO(); $('fMin').value = x && x.minutes ? x.minutes : '';
    $('delBtn').hidden = !x; $('editor').showModal();
  }
  function saveEditor(ev) {
    ev.preventDefault();
    var o = { intitule: $('fTitre').value.trim(), succes: +$('fSucces').value, semestre: $('fSem').value, matiere: $('fMat').value, minutes: $('fMin').value ? +$('fMin').value : null, evalue: $('fDate').value };
    if (!o.matiere || !o.evalue) { toast('Choisis une matière et une date.'); return; }
    if (editingId) { data.ex.forEach(function (x) { if (x.id === editingId) Object.assign(x, o); }); }
    else { o.id = newId(); data.ex.push(o); }
    save(); $('editor').close(); render(); toast('Exercice enregistré.');
  }
  function openDone(id) {
    doingId = id; var x = data.ex.filter(function (e) { return e.id === id; })[0]; if (!x) return;
    $('doneTitle').textContent = x.matiere + (x.intitule ? ' · ' + x.intitule : '');
    $('doneTxt').textContent = 'Comment ça s’est passé ? Choisis ton niveau de réussite : la prochaine révision se calcule toute seule.';
    var b = $('doneBtns'); b.textContent = '';
    NIV.forEach(function (n, i) {
      var bt = el('button', '', String(i)); bt.type = 'button'; bt.appendChild(el('small', '', n));
      bt.addEventListener('click', function () { x.succes = i; x.evalue = todayISO(); save(); $('doneDlg').close(); render(); toast('Prochaine révision : ' + fromNum(revision(x))); });
      b.appendChild(bt);
    });
    $('doneDlg').showModal();
  }


  /* ---------- import de ton tableur (Excel .xlsx ou CSV) ---------- */
  function u16(b, o) { return b[o] | (b[o + 1] << 8); }
  function u32(b, o) { return (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24)) >>> 0; }
  function inflateRaw(bytes) {
    var ds = new DecompressionStream('deflate-raw'), w = ds.writable.getWriter();
    w.write(bytes); w.close();
    return new Response(ds.readable).arrayBuffer().then(function (b) { return new Uint8Array(b); });
  }
  function readZip(buf) {
    var b = new Uint8Array(buf), e = b.length - 22;
    while (e >= 0 && u32(b, e) !== 0x06054b50) e--;
    if (e < 0) throw new Error('zip');
    var n = u16(b, e + 10), p = u32(b, e + 16), files = {};
    for (var i = 0; i < n; i++) {
      var method = u16(b, p + 10), csize = u32(b, p + 20), nl = u16(b, p + 28), xl = u16(b, p + 30), cl = u16(b, p + 32), lo = u32(b, p + 42);
      var name = new TextDecoder().decode(b.subarray(p + 46, p + 46 + nl));
      var ds = lo + 30 + u16(b, lo + 26) + u16(b, lo + 28);
      files[name] = { method: method, data: b.subarray(ds, ds + csize) };
      p += 46 + nl + xl + cl;
    }
    return files;
  }
  function zipText(files, name) {
    var f = files[name]; if (!f) return Promise.resolve(null);
    var p = f.method === 0 ? Promise.resolve(f.data) : inflateRaw(f.data);
    return p.then(function (u) { return new TextDecoder().decode(u); });
  }
  function colNum(ref) { var m = /^([A-Z]+)(\d+)$/.exec(ref), c = 0; for (var i = 0; i < m[1].length; i++) c = c * 26 + m[1].charCodeAt(i) - 64; return [c, +m[2]]; }
  function parseSheet(xml, shared) {
    var doc = new DOMParser().parseFromString(xml, 'application/xml'), cells = {}, cs = doc.getElementsByTagName('c');
    for (var i = 0; i < cs.length; i++) {
      var c = cs[i], t = c.getAttribute('t'), v = c.getElementsByTagName('v')[0], val = null;
      if (t === 'inlineStr') { val = c.textContent; }
      else if (v) { val = v.textContent; if (t === 's') val = shared[+val]; else if (t === 'str' || t === 'e') { /* texte */ } else if (t === 'b') val = val === '1'; else val = +val; }
      if (val === null || val === '') continue;
      var rc = colNum(c.getAttribute('r')); cells[rc[1] + ',' + rc[0]] = val;
    }
    return cells;
  }
  function readXlsx(buf) {
    var files = readZip(buf), sheets = {};
    return Promise.all([zipText(files, 'xl/workbook.xml'), zipText(files, 'xl/_rels/workbook.xml.rels'), zipText(files, 'xl/sharedStrings.xml')]).then(function (a) {
      var shared = [];
      if (a[2]) { var sd = new DOMParser().parseFromString(a[2], 'application/xml'), sis = sd.getElementsByTagName('si'); for (var i = 0; i < sis.length; i++) shared.push(sis[i].textContent); }
      var rels = {}, rd = new DOMParser().parseFromString(a[1], 'application/xml').getElementsByTagName('Relationship');
      for (var j = 0; j < rd.length; j++) rels[rd[j].getAttribute('Id')] = rd[j].getAttribute('Target');
      var sh = new DOMParser().parseFromString(a[0], 'application/xml').getElementsByTagName('sheet'), jobs = [];
      for (var k = 0; k < sh.length; k++) (function (el0) {
        var t = rels[el0.getAttribute('r:id')] || rels[el0.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'id')];
        if (!t) return; t = t.replace(/^\//, ''); if (t.indexOf('xl/') !== 0) t = 'xl/' + t;
        jobs.push(zipText(files, t).then(function (x) { if (x) sheets[el0.getAttribute('name')] = parseSheet(x, shared); }));
      })(sh[k]);
      return Promise.all(jobs);
    }).then(function () { return sheets; });
  }
  function toISO(v) {
    if (typeof v === 'number' && v > 20000) { var d = new Date(Math.round((v - 25569) * DAY)); return d.getUTCFullYear() + '-' + ('0' + (d.getUTCMonth() + 1)).slice(-2) + '-' + ('0' + d.getUTCDate()).slice(-2); }
    if (typeof v === 'string') {
      var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(v.trim()); if (m) return m[1] + '-' + m[2] + '-' + m[3];
      m = /^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{2,4})/.exec(v.trim());
      if (m) { var y = +m[3]; if (y < 100) y += 2000; return y + '-' + ('0' + m[2]).slice(-2) + '-' + ('0' + m[1]).slice(-2); }
    }
    return null;
  }
  function parseCsv(txt) {
    var sep = (txt.split(';').length > txt.split(',').length) ? ';' : ',', rows = [], row = [], cur = '', q = false;
    for (var i = 0; i < txt.length; i++) {
      var ch = txt[i];
      if (q) { if (ch === '"') { if (txt[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += ch; }
      else if (ch === '"') q = true; else if (ch === sep) { row.push(cur); cur = ''; }
      else if (ch === '\n') { row.push(cur); rows.push(row); row = []; cur = ''; } else if (ch !== '\r') cur += ch;
    }
    row.push(cur); rows.push(row);
    var cells = {}; rows.forEach(function (r, ri) { r.forEach(function (v, ci) { v = v.trim(); if (v === '') return; cells[(ri + 1) + ',' + (ci + 1)] = isNaN(+v.replace(',', '.')) || /[\/-]/.test(v) ? v : +v.replace(',', '.'); }); });
    return { 'Table exercice': cells };
  }
  function importSheets(sh) {
    var keys = Object.keys(sh), tn = keys.filter(function (k) { return norm(k).indexOf('exercice') >= 0; })[0] || keys[0];
    var T = sh[tn], out = { ex: [], mats: [], reglages: JSON.parse(JSON.stringify(data.reglages)) };
    var hr = 0, cols = {};
    for (var r = 1; r <= 30 && !hr; r++) {
      var hs = {}; for (var c = 1; c <= 30; c++) { var v = T[r + ',' + c]; if (typeof v === 'string') hs[norm(v)] = c; }
      if (hs['succes'] && hs['matiere']) { hr = r; cols = hs; }
    }
    if (!hr) throw new Error('entetes');
    var cT = cols['intitule'], cS = cols['succes'], cSem = cols['semestre'], cM = cols['matiere'], cD = cols['temps'], cE = cols['evalue le'] || cols['evalue'];
    var seen = {};
    for (var rr = hr + 1; rr < hr + 5000; rr++) {
      var sem = T[rr + ',' + cSem], mat = T[rr + ',' + cM], suc = T[rr + ',' + cS];
      if (!sem && !mat && rr > hr + 800 && !suc) break;
      var ev = toISO(T[rr + ',' + cE]);
      if (!sem || !mat || typeof suc !== 'number' || !ev) continue;
      var ti = cT ? T[rr + ',' + cT] : '', mn = cD ? T[rr + ',' + cD] : null;
      out.ex.push({ id: newId() + rr, intitule: ti !== undefined && ti !== null ? String(ti) : '', succes: Math.max(0, Math.min(11, Math.round(suc))), semestre: String(sem), matiere: String(mat), minutes: typeof mn === 'number' && mn > 0 ? mn : null, evalue: ev });
      seen[sem + '|' + mat] = [String(sem), String(mat)];
    }
    var pn = keys.filter(function (k) { return norm(k).indexOf('param') >= 0; })[0], P = pn ? sh[pn] : null, ex = {};
    if (P) {
      Object.keys(P).forEach(function (k) {
        var rc = k.split(',').map(Number), v = P[k];
        if (v === 'Date de contrôle' || norm(v) === 'date de controle') {
          var sem2 = P[rc[0] + ',' + (rc[1] - 1)]; if (typeof sem2 !== 'string') return;
          for (var q = rc[0] + 1; q < rc[0] + 200; q++) { var nm = P[q + ',' + (rc[1] - 1)]; if (nm === undefined) break; out.mats.push({ semestre: sem2, nom: String(nm), examen: toISO(P[q + ',' + rc[1]]) }); ex[sem2 + '|' + nm] = 1; }
        }
        if (typeof v === 'string') {
          var nv = norm(v), R = out.reglages;
          function right() { for (var cc = rc[1] + 1; cc < rc[1] + 8; cc++) if (typeof P[rc[0] + ',' + cc] === 'number') return P[rc[0] + ',' + cc]; return undefined; }
          var val;
          if (nv.indexOf('minutes comptees') === 0 && (val = right()) !== undefined) R.minutesDefaut = val;
          else if (nv.indexOf('debut du mode exam') === 0 && (val = right()) !== undefined) R.debutExam = val;
          else if (nv.indexOf('butoire : seuil') === 0 && (val = right()) !== undefined) R.seuilButoire = val;
          else if (nv.indexOf('butoire sinon') === 0 && (val = right()) !== undefined) R.butoireSinon = val;
          else if (nv.indexOf('butoire si ') === 0 && (val = right()) !== undefined) R.butoireSi = val;
          else if (nv === 'intervalles') { for (var n = 0; n < 12; n++) { var iv = P[(rc[0] + 1 + n) + ',' + rc[1]]; if (typeof iv === 'number') R.intervalles[n] = iv; } }
          else if (v === 'Lun' && P[rc[0] + ',' + (rc[1] + 1)] === 'Mar') { for (var j = 0; j < 7; j++) { var pv = P[(rc[0] + 1) + ',' + (rc[1] + j)]; R.planning[j] = typeof pv === 'number' ? pv : null; } }
        }
      });
    }
    Object.keys(seen).forEach(function (k) { if (!ex[k]) out.mats.push({ semestre: seen[k][0], nom: seen[k][1], examen: null }); });
    return out;
  }
  function importSheetFile(f) {
    var isCsv = /\.csv$/i.test(f.name), r = new FileReader();
    r.onerror = function () { toast('Impossible de lire ce fichier.'); };
    r.onload = function () {
      var p = isCsv ? Promise.resolve(parseCsv(new TextDecoder().decode(r.result))) : readXlsx(r.result);
      p.then(importSheets).then(function (out) {
        if (!out.ex.length) { toast('Aucun exercice trouvé : il faut les colonnes Succès, Semestre, Matière et Evalué le.'); return; }
        if (data.ex.length && !window.confirm('Remplacer les ' + data.ex.length + ' exercices actuels par les ' + out.ex.length + ' du tableur ?')) return;
        data = fix(out); save(); view = 'today'; render(); toast(out.ex.length + ' exercices importés.');
      }).catch(function () { toast('Ce fichier n’a pas le bon format (onglet « Table exercice » attendu).'); });
    };
    r.readAsArrayBuffer(f);
  }

  /* ---------- sauvegarde / synchro ---------- */
  function exportFile() {
    var blob = new Blob([JSON.stringify(data)], { type: 'application/json' }), a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = 'mes-exercices-' + todayISO() + '.json'; document.body.appendChild(a); a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  }
  function importBackup(f) {
    var r = new FileReader();
    r.onload = function () { try { data = fix(JSON.parse(r.result)); save(); render(); toast('Sauvegarde restaurée (' + data.ex.length + ' exercices).'); } catch (e) { toast('Ce fichier n’est pas une sauvegarde valide.'); } };
    r.readAsText(f);
  }
  var SYNC_KEY = 'mes-exercices-synchro-adresse';
  function syncUrl() { try { return localStorage.getItem(SYNC_KEY) || ''; } catch (e) { return ''; } }
  function askSyncUrl() {
    var u = window.prompt('Colle ici l’adresse de ton application web Apps Script (elle finit par /exec) :', syncUrl()); if (u === null) return '';
    u = u.trim(); try { localStorage.setItem(SYNC_KEY, u); } catch (e) { /* ignoré */ } return u;
  }
  function syncNow(forceAsk) {
    var url = forceAsk ? askSyncUrl() : (syncUrl() || askSyncUrl()); if (!url) return;
    toast('Synchronisation en cours…');
    var localUpd = Number(localStorage.getItem(KEY + '-modif') || 0);
    fetch(url + (url.indexOf('?') < 0 ? '?' : '&') + 't=' + Date.now()).then(function (r) { return r.json(); }).then(function (remote) {
      var rUpd = Number(remote && remote.updated || 0);
      if (remote && remote.data && rUpd > localUpd) {
        data = fix(remote.data); try { localStorage.setItem(KEY, JSON.stringify(data)); localStorage.setItem(KEY + '-modif', String(rUpd)); } catch (e) { /* ignoré */ }
        render(); toast('Exercices récupérés depuis ton Drive.');
      } else if (localUpd > rUpd) {
        return fetch(url, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify({ updated: localUpd, data: data }) })
          .then(function (r) { return r.json(); }).then(function () { toast('Exercices envoyés vers ton Drive.'); });
      } else toast('Déjà à jour.');
    }).catch(function () { toast('Synchronisation impossible : vérifie l’adresse et la connexion.'); });
  }

  /* ---------- affichage ---------- */
  function render() {
    renderFilters();
    ['today', 'exos', 'mats', 'dash', 'set'].forEach(function (v) { $('v-' + v).hidden = v !== view; });
    document.querySelectorAll('#tabs button').forEach(function (b) { b.setAttribute('aria-pressed', b.dataset.view === view ? 'true' : 'false'); });
    $('addBtn').hidden = view !== 'exos';
    if (view === 'today') renderToday(); else if (view === 'exos') renderExos(); else if (view === 'mats') renderMats(); else if (view === 'dash') renderDash(); else renderSet();
  }

  load();
  document.querySelectorAll('#tabs button').forEach(function (b) { b.addEventListener('click', function () { view = b.dataset.view; shown = 120; render(); window.scrollTo(0, 0); }); });
  $('addBtn').addEventListener('click', function () { openEditor(null); });
  $('search').addEventListener('input', function () { shown = 120; renderExos(); });
  $('menuBtn').addEventListener('click', function () { $('menu').showModal(); });
  $('closeMenu').addEventListener('click', function () { $('menu').close(); });
  $('syncBtn').addEventListener('click', function () { $('menu').close(); syncNow(false); });
  $('syncUrlBtn').addEventListener('click', function () { $('menu').close(); syncNow(true); });
  $('exportBtn').addEventListener('click', function () { $('menu').close(); exportFile(); });
  $('importSheet').addEventListener('click', function () { $('sheetInput').click(); });
  $('sheetInput').addEventListener('change', function (e) { var f = e.target.files[0]; if (f) { $('menu').close(); importSheetFile(f); } e.target.value = ''; });
  $('importFile').addEventListener('click', function () { $('fileInput').click(); });
  $('fileInput').addEventListener('change', function (e) { var f = e.target.files[0]; if (f) { $('menu').close(); importBackup(f); } e.target.value = ''; });
  $('form').addEventListener('submit', saveEditor);
  $('fSem').addEventListener('change', function () { fillMat(); });
  $('cancelBtn').addEventListener('click', function () { $('editor').close(); });
  $('delBtn').addEventListener('click', function () { data.ex = data.ex.filter(function (x) { return x.id !== editingId; }); save(); $('editor').close(); render(); toast('Exercice supprimé.'); });
  $('doneCancel').addEventListener('click', function () { $('doneDlg').close(); });
  window.addEventListener('resize', function () { if (view === 'dash') renderDash(); });
  render();
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(function () { /* hors ligne non dispo */ });
})();
