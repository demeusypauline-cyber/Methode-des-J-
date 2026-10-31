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
    return { ex: Array.isArray(d.ex) ? d.ex : [], mats: Array.isArray(d.mats) ? d.mats : [], hist: Array.isArray(d.hist) ? d.hist : [], jours: d.jours && typeof d.jours === 'object' ? d.jours : {}, reglages: r };
  }
  function load() { try { var raw = localStorage.getItem(KEY); if (raw) data = fix(JSON.parse(raw)); } catch (e) { /* départ à vide */ } }
  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(data)); localStorage.setItem(KEY + '-modif', String(Date.now())); syncSoon(); return true; }
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
    box.appendChild(histBlock());
  }


  /* ---------- historique de la semaine ---------- */
  function addHist(x, niv) {
    var lim = Date.now() - 30 * DAY; data.hist = (data.hist || []).filter(function (h) { return h.ts > lim; });
    data.hist.push({ id: x.id, ts: Date.now(), jour: todayISO(), avant: { succes: x.succes, evalue: x.evalue || '' }, niveau: niv });
    data.jours = data.jours || {}; data.jours[todayISO()] = (data.jours[todayISO()] || 0) + mins(x);
  }
  function histBlock() {
    var lim = Date.now() - 7 * DAY, L = (data.hist || []).filter(function (h) { return h.ts > lim; }).sort(function (a, b) { return b.ts - a.ts; });
    var det = document.createElement('details'); det.appendChild(el('summary', '', 'Historique de la semaine (' + L.length + ')'));
    if (!L.length) { det.appendChild(el('p', 'muted', 'Rien de fait cette semaine.')); return det; }
    det.appendChild(el('p', 'muted', 'Cliqué « fait » par erreur ? Annule, ou corrige le niveau.'));
    L.forEach(function (h) {
      var x = data.ex.filter(function (e) { return e.id === h.id; })[0]; if (!x) return;
      var c = el('div', 'card'), top = el('div', 'row2'), l = el('div');
      l.appendChild(el('b', '', x.matiere + (x.intitule ? ' · ' + x.intitule : '')));
      var d = new Date(h.ts); l.appendChild(el('div', 'muted', JOURS[(d.getDay() + 6) % 7] + ' ' + fromNum(dnum(h.jour)).slice(0, 5) + ' · niveau ' + h.avant.succes + ' → ' + h.niveau));
      top.appendChild(l); c.appendChild(top);
      var row = el('div', 'row2'); row.style.marginTop = '8px';
      var sel = document.createElement('select'); NIV.forEach(function (n, i) { var o = el('option', '', i + ' · ' + n); o.value = i; sel.appendChild(o); }); sel.value = h.niveau;
      sel.addEventListener('change', function () { h.niveau = +sel.value; x.succes = h.niveau; save(); render(); toast('Niveau corrigé.'); });
      var un = el('button', 'plain', 'Annuler'); un.type = 'button';
      un.addEventListener('click', function () { x.succes = h.avant.succes; x.evalue = h.avant.evalue; data.hist = data.hist.filter(function (z) { return z !== h; }); if (data.jours && data.jours[h.jour]) data.jours[h.jour] = Math.max(0, data.jours[h.jour] - mins(x)); save(); render(); toast('Remis comme avant.'); });
      row.appendChild(sel); row.appendChild(un); c.appendChild(row); det.appendChild(c);
    });
    return det;
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


  function renameSem(old) {
    var n = window.prompt('Nouveau nom du semestre « ' + old + ' » :', old); if (n === null) return; n = n.trim();
    if (!n || n === old) return;
    if (semestres().indexOf(n) >= 0 && !window.confirm('« ' + n + ' » existe déjà : les deux semestres vont être regroupés. Continuer ?')) return;
    data.mats.forEach(function (m) { if (m.semestre === old) m.semestre = n; });
    data.ex.forEach(function (x) { if (x.semestre === old) x.semestre = n; });
    data.reglages.semestres = data.reglages.semestres.map(function (z) { return z === old ? n : z; });
    save(); render(); toast('Semestre renommé.');
  }
  function renameMat(m) {
    var n = window.prompt('Nouveau nom de la matière « ' + m.nom + ' » :', m.nom); if (n === null) return; n = n.trim();
    if (!n || n === m.nom) return;
    var old = m.nom;
    data.ex.forEach(function (x) { if (x.semestre === m.semestre && x.matiere === old) x.matiere = n; });
    m.nom = n; save(); render(); toast('Matière renommée.');
  }

  /* ---------- vue : examens ---------- */
  function renderMats() {
    var box = $('v-mats'); box.textContent = '';
    box.appendChild(el('p', 'muted', 'La date d’examen déclenche le mode examen (voir Réglages). Laisse vide s’il n’y a pas d’examen.'));
    semestres().forEach(function (s) {
      var det = document.createElement('details'); det.appendChild(el('summary', '', s));
      var tb = document.createElement('table'); tb.className = 'tbl';
      var hd = document.createElement('tr'); ['Matière', 'Examen', 'Note /20'].forEach(function (h) { hd.appendChild(el('th', '', h)); }); tb.appendChild(hd);
      data.mats.forEach(function (m) {
        if (m.semestre !== s) return;
        var tr = document.createElement('tr'), td1 = document.createElement('td'), td2 = document.createElement('td'), td3 = document.createElement('td');
        var rb = el('button', 'namebtn', m.nom + ' ✎'); rb.type = 'button';
        rb.addEventListener('click', function () { renameMat(m); });
        td1.appendChild(rb);
        var inp = document.createElement('input'); inp.type = 'date'; inp.value = m.examen || '';
        inp.addEventListener('change', function () { m.examen = inp.value || null; save(); toast('Date enregistrée.'); });
        td2.appendChild(inp);
        var nt = document.createElement('input'); nt.type = 'number'; nt.inputMode = 'decimal'; nt.step = '0.01'; nt.min = 0; nt.max = 20; nt.placeholder = '–'; nt.value = typeof m.note === 'number' ? m.note : '';
        nt.addEventListener('change', function () { m.note = nt.value === '' ? null : +nt.value; save(); toast('Note enregistrée.'); });
        td3.appendChild(nt);
        tr.appendChild(td1); tr.appendChild(td2); tr.appendChild(td3); tb.appendChild(tr);
      });
      det.appendChild(tb);
      var ren = el('button', 'plain', 'Renommer ce semestre'); ren.type = 'button'; ren.style.margin = '8px 8px 0 0';
      ren.addEventListener('click', function () { renameSem(s); });
      det.appendChild(ren);
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
  var C_NIV = ['#7a1f3d', '#a33c5e', '#cc597f', '#e57d9f', '#f0a9c0', '#f8d3e0'];
  var JS = ['dim', 'lun', 'mar', 'mer', 'jeu', 'ven', 'sam'];
  function dcard(title, extra) { var c = el('div', 'dcard' + (extra ? ' ' + extra : '')); if (title) c.appendChild(el('h2', '', title)); return c; }
  function scale(v) {
    var A = [122, 31, 61], B = [224, 103, 143], C = [249, 211, 224], f, p, q;
    v = Math.max(0, Math.min(5, v)); if (v <= 2.5) { f = v / 2.5; p = A; q = B; } else { f = (v - 2.5) / 2.5; p = B; q = C; }
    return 'rgb(' + [0, 1, 2].map(function (i) { return Math.round(p[i] + (q[i] - p[i]) * f); }).join(',') + ')';
  }
  function fmt1(v) { return (Math.round(v * 100) / 100).toString().replace('.', ','); }
  function renderDash() {
    var box = $('v-dash'); box.textContent = '';
    var t = TODAY(), L = data.ex.filter(function (x) { return visible(x) && x.evalue; });
    var late = 0, due = 0;
    L.forEach(function (x) { var r = revision(x); if (r < t) late++; else if (r < t + 1) due++; });
    var todo = late + due;
    var matsV = data.mats.filter(function (m) { return !data.reglages.semestres.length || data.reglages.semestres.indexOf(m.semestre) >= 0; });
    var fut = matsV.filter(function (m) { return m.examen && dnum(m.examen) >= t; }).sort(function (a, b) { return dnum(a.examen) - dnum(b.examen); });
    var ban = el('div', 'banner');
    ban.textContent = todo + ' exercice' + (todo > 1 ? 's' : '') + ' à réviser aujourd’hui';
    if (fut.length) { var dd = dnum(fut[0].examen) - t; ban.textContent = todo + ' exercice' + (todo > 1 ? 's' : '') + ' à réviser aujourd’hui  ·  Prochain examen : ' + fut[0].nom + ' ' + (dd === 0 ? 'aujourd’hui' : 'dans ' + dd + ' jour' + (dd > 1 ? 's' : '')); }
    box.appendChild(ban);

    var notes = matsV.filter(function (m) { return typeof m.note === 'number'; }).map(function (m) { return m.note; });
    var moy = notes.length ? notes.reduce(function (a, b) { return a + b; }, 0) / notes.length : null;
    var k = el('div', 'kpis3');
    [['EXERCICES', L.length, 'enregistrés'], ['À FAIRE AUJOURD’HUI', todo, 'dont ' + late + ' en retard'], ['MOYENNE /20', moy === null ? '–' : fmt1(moy), 'd’après tes relevés']].forEach(function (a, i) {
      var d = el('div', 'kpi3'); d.appendChild(el('small', '', a[0])); d.appendChild(el('b', '', a[1])); d.appendChild(el('span', '', a[2])); d.appendChild(el('u', i === 1 ? 'mid' : '')); k.appendChild(d);
    });
    box.appendChild(k);

    /* moyenne par semestre */
    var c0 = dcard('Moyenne par semestre'), sems = semestres().filter(function (s) { return !data.reglages.semestres.length || data.reglages.semestres.indexOf(s) >= 0; });
    var cols = el('div', 'cols');
    sems.forEach(function (sm) {
      var ns = data.mats.filter(function (m) { return m.semestre === sm && typeof m.note === 'number'; }).map(function (m) { return m.note; });
      var v = ns.length ? ns.reduce(function (a, b) { return a + b; }, 0) / ns.length : 0;
      var col = el('div', 'col'); col.appendChild(el('span', 'v', v ? fmt1(v) : ''));
      var bar = el('i'); bar.style.height = Math.round(v / 20 * 100) + 'px'; col.appendChild(bar); col.appendChild(el('span', 'l', sm)); cols.appendChild(col);
    });
    c0.appendChild(cols); box.appendChild(c0);

    /* charge */
    var c1 = dcard('Charge de révision à venir');
    var lg = el('div', 'legend');
    [['En retard', C_LATE], ['Examen', C_EXAM], ['Prévu', C_NORM]].forEach(function (a) { var sp = el('span'); var i = el('i'); i.style.background = a[1]; sp.appendChild(i); sp.appendChild(document.createTextNode(a[0])); lg.appendChild(sp); });
    c1.appendChild(lg);
    var cv = document.createElement('canvas'); c1.appendChild(cv);
    var rep = plan().list.filter(function (o) { return !o.in; }).length; c1.appendChild(el('p', 'muted', 'Chaque jour respecte ton planning de la semaine (Réglages) : ce qui ne tient pas est reporté au jour suivant.')); box.appendChild(c1);
    drawCharge(cv, L, t);

    box.appendChild(habitCard());

    /* prochains examens */
    var c3 = dcard('Prochains examens');
    if (!fut.length) c3.appendChild(el('p', 'muted', 'Aucune date d’examen à venir (onglet Examens).'));
    else {
      var tb = document.createElement('table'); tb.className = 'tbl dark';
      var hd = document.createElement('tr'); ['Matière', 'Date', 'Dans', 'Niveau'].forEach(function (h) { hd.appendChild(el('th', '', h)); }); tb.appendChild(hd);
      fut.slice(0, 10).forEach(function (m) {
        var tr = document.createElement('tr'); tr.appendChild(el('td', '', m.nom));
        var dn = dnum(m.examen); tr.appendChild(el('td', 'c', fromNum(dn).slice(0, 6) + fromNum(dn).slice(8)));
        tr.appendChild(el('td', 'c b', 'J-' + (dn - t)));
        var es = L.filter(function (x) { return x.semestre === m.semestre && x.matiere === m.nom; }), av = es.length ? es.reduce(function (a, x) { return a + (x.succes || 0); }, 0) / es.length : null;
        var nt = el('td', 'c n', av === null ? '' : fmt1(Math.round(av * 10) / 10));
        if (av !== null) { var cc = scale(av); nt.style.background = cc; nt.style.color = av < 3.2 ? '#fff' : '#5c1530'; }
        tr.appendChild(nt); tb.appendChild(tr);
      });
      c3.appendChild(tb);
    }
    box.appendChild(c3);

    /* anneau succès */
    var c2 = dcard('Succès : exos / examens');
    var cv2 = document.createElement('canvas'); c2.appendChild(cv2);
    var lg2 = el('div', 'legend'); [0, 1, 2, 3, 4, 5].forEach(function (i) { var sp = el('span'); var ic = el('i'); ic.style.background = C_NIV[i]; sp.appendChild(ic); sp.appendChild(document.createTextNode(i === 5 ? '5+' : String(i))); lg2.appendChild(sp); });
    c2.appendChild(lg2); c2.appendChild(el('p', 'muted', 'Anneau extérieur : tous les exos · anneau intérieur : exos en mode examen')); box.appendChild(c2);
    drawDonut(cv2, L);
  }

  function faitsDu(iso) {
    var c = 0; data.ex.forEach(function (x) { if (x.evalue === iso && visible(x)) c += mins(x); });
    return Math.max(c, (data.jours && data.jours[iso]) || 0);
  }
  function dur(m) { return m >= 60 ? Math.floor(m / 60) + ' h' + (m % 60 ? ' ' + ('0' + m % 60).slice(-2) : '') : m + ' min'; }
  function habitCard() {
    var c = dcard('Régularité · temps de révision par jour'), W = 15, t = TODAY(), wd = (new Date(t * DAY).getUTCDay() + 6) % 7, start = t - wd - (W - 1) * 7;
    var vals = [], mx = 1; for (var i = 0; i < W * 7; i++) { var dn = start + i, v = dn > t ? -1 : faitsDu(new Date(dn * DAY).toISOString().slice(0, 10)); vals.push(v); if (v > mx) mx = v; }
    var cols = ['#f6e9ee', '#f9d3e0', '#f0a9c0', '#e0678f', '#a33c5e', '#7a1f3d'];
    function lvl(v) { if (v <= 0) return 0; var f = v / mx; return f > .75 ? 5 : f > .5 ? 4 : f > .3 ? 3 : f > .12 ? 2 : 1; }
    var wrap = el('div', 'habit'), lab = el('div', 'hl');
    ['L', 'M', 'M', 'J', 'V', 'S', 'D'].forEach(function (z) { lab.appendChild(el('span', '', z)); }); wrap.appendChild(lab);
    var grid = el('div', 'hg'); grid.style.gridTemplateColumns = 'repeat(' + W + ',1fr)';
    var mois = ['janv', 'févr', 'mars', 'avr', 'mai', 'juin', 'juil', 'août', 'sept', 'oct', 'nov', 'déc'], last = -1;
    for (var w = 0; w < W; w++) { var d0 = new Date((start + w * 7) * DAY), m = d0.getUTCMonth(); var ml = el('span', 'hm', m !== last ? mois[m] : ''); last = m; ml.style.gridColumn = (w + 1); ml.style.gridRow = 1; grid.appendChild(ml); }
    for (var w2 = 0; w2 < W; w2++) for (var r = 0; r < 7; r++) {
      var idx = w2 * 7 + r, v2 = vals[idx], dn2 = start + idx, cell = el('i', 'hc'); cell.style.gridColumn = (w2 + 1); cell.style.gridRow = (r + 2);
      if (v2 < 0) cell.style.visibility = 'hidden'; else {
        cell.style.background = cols[lvl(v2)]; if (dn2 === t) cell.style.outline = '2px solid #7a1f3d';
        (function (n, vv) { cell.addEventListener('click', function () { toast(fromNum(n).slice(0, 5) + ' : ' + (vv ? dur(vv) : 'rien de fait')); }); })(dn2, v2);
      }
      grid.appendChild(cell);
    }
    wrap.appendChild(grid); c.appendChild(wrap);
    var lg = el('div', 'legend'); lg.appendChild(document.createTextNode('Moins')); cols.forEach(function (k) { var i2 = el('i'); i2.style.background = k; lg.appendChild(i2); }); lg.appendChild(document.createTextNode('Plus (jusqu’à ' + dur(mx) + ')'));
    c.appendChild(lg); return c;
  }

  function drawDonut(cv, L) {
    var all = [0, 0, 0, 0, 0, 0], inn = [0, 0, 0, 0, 0, 0], sum = 0;
    L.forEach(function (x) { var n = Math.min(5, x.succes || 0); all[n]++; if (modeExam(x)) inn[n]++; sum += n; });
    var w = cv.clientWidth || 320, h = 230, dpr = window.devicePixelRatio || 1;
    cv.width = w * dpr; cv.height = h * dpr; cv.style.height = h + 'px';
    var g = cv.getContext('2d'); g.scale(dpr, dpr); g.clearRect(0, 0, w, h);
    var cx = w / 2, cy = h / 2, R1 = 100, R0 = 66, R2 = 62, R3 = 38;
    function ring(vals, ra, rb, hatch) {
      var tot = vals.reduce(function (a, b) { return a + b; }, 0), a0 = -Math.PI / 2;
      if (!tot) { g.beginPath(); g.arc(cx, cy, (ra + rb) / 2, 0, 7); g.lineWidth = ra - rb; g.strokeStyle = '#f6e3ea'; g.stroke(); return; }
      vals.forEach(function (v, i) {
        if (!v) return; var a1 = a0 + v / tot * Math.PI * 2;
        g.beginPath(); g.arc(cx, cy, ra, a0, a1); g.arc(cx, cy, rb, a1, a0, true); g.closePath();
        g.fillStyle = C_NIV[i]; g.globalAlpha = hatch ? .65 : 1; g.fill(); g.globalAlpha = 1; g.lineWidth = 2; g.strokeStyle = '#fff'; g.stroke();
        if (v / tot > .05) { var am = (a0 + a1) / 2, rr = (ra + rb) / 2; g.fillStyle = i >= 4 ? '#5c1530' : '#fff'; g.font = 'bold 12px system-ui'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(v, cx + Math.cos(am) * rr, cy + Math.sin(am) * rr); }
        a0 = a1;
      });
    }
    ring(all, R1, R0, false); ring(inn, R2, R3, true);
    g.fillStyle = '#7a1f3d'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.font = 'bold 22px system-ui'; g.fillText(L.length ? fmt1(sum / L.length) : '–', cx, cy - 6);
    g.fillStyle = '#8a6573'; g.font = '10px system-ui'; g.fillText('moy. sur 5', cx, cy + 12);
    
  }
  function drawCharge(cv, L, t) {
    var N = 14, late = [], ex = [], nm = [], cnt = []; for (var i = 0; i < N; i++) { late.push(0); ex.push(0); nm.push(0); cnt.push(0); }
    var cand = [];
    data.ex.forEach(function (x, i) { if (visible(x) && x.evalue) cand.push({ x: x, r: revision(x), ex: modeExam(x), i: i, m: mins(x) }); });
    cand.sort(function (a, b) {
      return ((a.ex ? 0 : 1) * 1e11 + a.r * 1e5 + (a.x.succes || 0) * 1e4 + a.i) - ((b.ex ? 0 : 1) * 1e11 + b.r * 1e5 + (b.x.succes || 0) * 1e4 + b.i);
    });
    var done = {};
    for (var d = 0; d < N; d++) {
      var wd = new Date((t + d) * DAY).getUTCDay(), bud = data.reglages.planning[(wd + 6) % 7];
      bud = typeof bud === 'number' && !isNaN(bud) ? bud : 1e9;
      var cum = 0, fait = d === 0 ? dejaFait() : 0;
      cand.forEach(function (o) {
        if (done[o.i] || o.r >= t + d + 1) return;
        cum += o.m;
        if (bud >= 1e9 || cum <= bud - fait || (cum === o.m && bud > fait)) {
          done[o.i] = 1; cnt[d]++;
          if (o.r < t) late[d] += o.m; else if (o.ex) ex[d] += o.m; else nm[d] += o.m;
        }
      });
    }
    var w = cv.clientWidth || 320, h = 210, dpr = window.devicePixelRatio || 1;
    cv.width = w * dpr; cv.height = h * dpr; cv.style.height = h + 'px';
    var g = cv.getContext('2d'); g.scale(dpr, dpr); g.clearRect(0, 0, w, h);
    var tot = late.map(function (_, i) { return late[i] + ex[i] + nm[i]; }), mx = Math.max.apply(null, tot.concat([60]));
    var step = mx > 600 ? 240 : mx > 240 ? 120 : 60; mx = Math.ceil(mx / step) * step;
    var L0 = 34, B = h - 46, T = 8, bw = (w - L0 - 4) / N;
    g.font = '10px system-ui'; g.fillStyle = '#8a6573'; g.strokeStyle = '#f0dde4'; g.textAlign = 'right';
    for (var v = 0; v <= mx; v += step) { var y = B - (B - T) * v / mx; g.beginPath(); g.moveTo(L0, y); g.lineTo(w, y); g.stroke(); g.fillText(v >= 60 ? (v / 60) + ' h' : v + ' min', L0 - 4, y + 3); }
    g.textAlign = 'center';
    for (var j = 0; j < N; j++) {
      var x0 = L0 + j * bw + bw * 0.14, ww = bw * 0.72, yy = B;
      [[late[j], C_LATE], [ex[j], C_EXAM], [nm[j], C_NORM]].forEach(function (s) {
        if (!s[0]) return; var hh = (B - T) * s[0] / mx; g.fillStyle = s[1]; g.fillRect(x0, yy - hh, ww, hh); yy -= hh;
      });
      var dd = new Date((t + j) * DAY), cx = x0 + ww / 2; g.fillStyle = '#5c1530'; g.font = '9px system-ui';
      g.fillText(j === 0 ? 'auj.' : JS[dd.getUTCDay()], cx, B + 12); g.fillText(String(dd.getUTCDate()), cx, B + 23);
      g.fillStyle = '#8a6573'; g.fillText(cnt[j] + ' ex.', cx, B + 35);
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
    [['Début du mode examen : jours avant l’examen', 'debutExam'], ['Butoire : seuil — un exo fait plus de … jours avant l’examen est « tôt », sinon « tard »', 'seuilButoire'], ['Butoire si fait tôt : ne plus réviser … jours avant l’examen', 'butoireSi'], ['Butoire sinon (fait tard) : ne plus réviser … jours avant l’examen (0 = jusqu’au jour J)', 'butoireSinon'], ['Minutes comptées par exo sans durée', 'minutesDefaut']].forEach(function (a) {
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
      bt.addEventListener('click', function () { addHist(x, i); x.succes = i; x.evalue = todayISO(); save(); $('doneDlg').close(); render(); toast('Prochaine révision : ' + fromNum(revision(x))); });
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
          for (var q = rc[0] + 1; q < rc[0] + 200; q++) { var nm = P[q + ',' + (rc[1] - 1)]; if (nm === undefined) break; var nt = P[q + ',' + (rc[1] + 1)]; out.mats.push({ semestre: sem2, nom: String(nm), examen: toISO(P[q + ',' + rc[1]]), note: typeof nt === 'number' ? nt : null }); ex[sem2 + '|' + nm] = 1; }
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
  var syncBusy = false, syncTimer = null;
  function syncCore(url, silent) {
    if (syncBusy) return; syncBusy = true;
    if (!silent) toast('Synchronisation en cours…');
    var localUpd = Number(localStorage.getItem(KEY + '-modif') || 0);
    fetch(url + (url.indexOf('?') < 0 ? '?' : '&') + 't=' + Date.now()).then(function (r) { return r.json(); }).then(function (remote) {
      var rUpd = Number(remote && remote.updated || 0);
      if (remote && remote.data && rUpd > localUpd) {
        data = fix(remote.data); try { localStorage.setItem(KEY, JSON.stringify(data)); localStorage.setItem(KEY + '-modif', String(rUpd)); } catch (e) { /* ignoré */ }
        render(); toast('Exercices mis à jour depuis ton Drive.');
      } else if (localUpd > rUpd) {
        return fetch(url, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify({ updated: localUpd, data: data }) })
          .then(function (r) { return r.json(); }).then(function () { if (!silent) toast('Exercices envoyés vers ton Drive.'); });
      } else if (!silent) toast('Déjà à jour.');
    }).catch(function () { if (!silent) toast('Synchronisation impossible : vérifie l’adresse et la connexion.'); })
      .then(function () { syncBusy = false; });
  }
  function syncNow(forceAsk) {
    var url = forceAsk ? askSyncUrl() : (syncUrl() || askSyncUrl()); if (!url) return;
    syncCore(url, false);
  }
  function syncAuto() { var u = syncUrl(); if (u && navigator.onLine !== false) syncCore(u, true); }
  function syncSoon() { clearTimeout(syncTimer); syncTimer = setTimeout(syncAuto, 4000); }

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
  syncAuto();
  document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'visible') syncAuto(); });
  window.addEventListener('online', syncAuto);
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(function () { /* hors ligne non dispo */ });
})();
