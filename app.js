(function () {
  'use strict';
  var KEY = 'mes-exercices-v1';
  var DAY = 86400000;
  var THEMES = [['Bordeaux', 0, '#7a1f3d'], ['Bleu', -125, '#1f4d7a'], ['Vert', 175, '#1f7a4d'], ['Violet', -70, '#5a1f7a']];
  function themeDeg() { var n = ''; try { n = localStorage.getItem('mes-exercices-theme') || ''; } catch (e) { /* ignoré */ } var t = THEMES.filter(function (a) { return a[0] === n; })[0] || THEMES[0]; return t; }
  function applyTheme() {
    var t = themeDeg(); document.documentElement.style.filter = t[1] ? 'hue-rotate(' + t[1] + 'deg)' : '';
    var m = document.querySelector('meta[name=theme-color]'); if (m) m.setAttribute('content', t[2]);
  }
  applyTheme();
  var NIV = ['Échec total', 'Beaucoup d’erreurs', 'Compréhension partielle', 'Compréhension correcte', 'Presque parfait', 'Maîtrise totale'];
  var JOURS = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];
  var DEF = { intervalles: [2, 4, 10, 25, 35, 50, 70, 90, 110, 130, 150, 170], minutesDefaut: 5, debutExam: 50, seuilButoire: 15, butoireSi: 5, butoireSinon: 0, planning: [60, 60, 30, 180, 30, 180, 30], semestres: [], ordreSem: 'manuel', semOrdre: [], dashOrdre: [], dashCache: [], pasApres5: 20, oubliMin: 3 };
  var data = { ex: [], mats: [], reglages: JSON.parse(JSON.stringify(DEF)) };
  var view = (function () { try { var v = localStorage.getItem('mes-exercices-onglet'); return ['dash', 'today', 'exos', 'mats', 'set'].indexOf(v) >= 0 ? v : 'today'; } catch (e) { return 'today'; } })(), editingId = null, doingId = null, shown = 120;

  function $(id) { return document.getElementById(id); }
  function el(tag, cls, txt) { var e = document.createElement(tag); if (cls) e.className = cls; if (txt !== undefined) e.textContent = txt; return e; }
  function toast(m) { var t = $('toast'); t.textContent = m; t.className = 'on'; clearTimeout(toast.t); toast.t = setTimeout(function () { t.className = ''; }, 2800); }
  var IC = {
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    cal: '<rect x="4" y="5" width="16" height="15" rx="3"/><path d="M4 10h16M9 3v4M15 3v4"/>',
    flag: '<path d="M5 21V4M5 4h11l-2 4 2 4H5"/>'
  };
  function ico(n) { var i = document.createElement('i'); i.className = 'ic'; i.innerHTML = '<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' + IC[n] + '</svg>'; return i; }
  function pillI(n, txt, cls) { var p = el('span', cls || 'pill'); p.appendChild(ico(n)); p.appendChild(document.createTextNode(txt)); return p; }
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
    if (Array.isArray(d.ex)) d.ex.forEach(function (x) {
      if (x.succes > 5) { var r = runOf(x.id, d.hist); x.p5 = Math.max(0, x.succes - 4 - r.run); x.succes = 5; }
    });
    return { ex: Array.isArray(d.ex) ? d.ex : [], mats: Array.isArray(d.mats) ? d.mats : [], hist: Array.isArray(d.hist) ? d.hist : [], jours: d.jours && typeof d.jours === 'object' ? d.jours : {}, ues: Array.isArray(d.ues) ? d.ues : [], corbeille: Array.isArray(d.corbeille) ? d.corbeille : [], reglages: r };
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
  /* niveau réel : 5 = maîtrise ; 6, 7… = plusieurs 5 d'affilée, déduits de l'historique */
  function runOf(id, hs) {
    var mine = (hs || []).filter(function (h) { return h.id === id; }).sort(function (a, b) { return a.ts - b.ts; }), run = 0, i;
    for (i = mine.length - 1; i >= 0; i--) { if (mine[i].niveau >= 5) run++; else break; }
    return { run: run, all: i < 0 };
  }
  function lvl(x) {
    var s = x.succes || 0; if (s < 5) return s;
    var r = runOf(x.id, data.hist), P = r.all ? (x.p5 || 0) : 0;
    if (!r.run && !P) return 5;
    return Math.min(11, 4 + Math.max(1, P + r.run));
  }
  function interval(n) {
    var R = data.reglages;
    if (n > 5) { var b = R.intervalles[5], p = typeof R.pasApres5 === 'number' ? R.pasApres5 : 20; return (typeof b === 'number' ? b : 0) + (n - 5) * p; }
    var v = R.intervalles[n]; return typeof v === 'number' ? v : 0;
  }
  function nivName(n) { return n <= 5 ? (NIV[n] || '') : 'Maîtrise totale · ' + (n - 4) + ' fois de suite'; }
  function revisionAt(x, I, iv) {
    var R = data.reglages, E = examNum(x.semestre, x.matiere);
    if (E !== null) {
      var dE = E - I;
      if (dE >= 0 && dE <= R.debutExam) {
        var X = Math.max(1, dE > R.seuilButoire ? R.butoireSi : R.butoireSinon); /* au plus tard la veille de l'examen */
        var plafond = dE > X ? dE - X : 1e9;
        return I + Math.min(iv / interval(5) * (dE - X), plafond);
      }
    }
    return I + iv;
  }
  function revision(x) { return revisionAt(x, dnum(x.evalue), interval(lvl(x))); }
  function examAt(x, D) { var E = examNum(x.semestre, x.matiere); if (E === null) return false; var d = E - D; return d >= 0 && d <= data.reglages.debutExam; }
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
      var ka = (a.ex ? 0 : 1) * 1e11 + a.r * 1e5 + lvl(a.x) * 1e4 + a.i;
      var kb = (b.ex ? 0 : 1) * 1e11 + b.r * 1e5 + lvl(b.x) * 1e4 + b.i;
      return ka - kb;
    });
    var budget = budgetDuJour(), fait = dejaFait(), cum = 0;
    list.forEach(function (o) {
      var m = mins(o.x);
      if (o.x.reporte === todayISO()) { o.rep = true; o.in = false; return; } /* reporté par toi : ne prend pas de temps aujourd'hui */
      o.in = (budget >= 1e9) || cum + m <= budget - fait || (cum === 0 && budget > fait);
      if (o.in) cum += m; /* un exo qui ne rentre pas est reporté ; un plus court peut prendre sa place */
    });
    return { list: list, budget: budget, fait: fait };
  }

  /* ---------- filtres semestres ---------- */
  function semestres() {
    var s = []; data.mats.forEach(function (m) { if (s.indexOf(m.semestre) < 0) s.push(m.semestre); });
    var R = data.reglages;
    if (R.ordreSem === 'alpha') return s.sort(function (a, b) { return a.localeCompare(b, 'fr', { numeric: true, sensitivity: 'base' }); });
    var o = R.semOrdre || [];
    return s.map(function (z, i) { return [z, o.indexOf(z) >= 0 ? o.indexOf(z) : 1000 + i]; }).sort(function (a, b) { return a[1] - b[1]; }).map(function (p) { return p[0]; });
  }
  function moveSem(s, dir) {
    var l = semestres(), i = l.indexOf(s), j = i + dir; if (j < 0 || j >= l.length) return;
    var t = l[i]; l[i] = l[j]; l[j] = t; data.reglages.semOrdre = l; data.reglages.ordreSem = 'manuel'; save(); render();
  }
  function renderFilters() {
    var box = $('filters'); box.textContent = ''; if (view === 'set') return;
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
    var lx = lvl(x), nb = el('div', 'niv', String(lx)); nb.style.background = scale(lx); nb.style.color = lx < 3.2 ? '#fff' : '#5c1530'; nb.title = nivName(lx);
    var l = el('div'); l.style.flex = '1'; l.appendChild(el('b', '', x.matiere + (x.intitule ? ' · ' + x.intitule : '')));
    l.appendChild(el('div', 'muted', x.semestre + ' · fait le ' + fromNum(dnum(x.evalue)) + ' · ' + nivName(lx)));
    top.appendChild(nb); top.appendChild(l);
    if (withBtn) {
      var rb = el('button', 'plain rep', o.rep ? 'Remettre' : 'Reporter'); rb.type = 'button';
      rb.addEventListener('click', function () { if (o.rep) { delete x.reporte; toast('Remis dans ta liste.'); } else { x.reporte = todayISO(); toast('Reporté : ton temps va aux autres exos.'); } save(); render(); });
      top.appendChild(rb);
      var b = el('button', 'primary', 'Refait'); b.type = 'button'; b.addEventListener('click', function () { openDone(x.id); }); top.appendChild(b);
    }
    c.appendChild(top);
    var p = el('div'); p.style.marginTop = '6px';
    var late = Math.floor(TODAY() - o.r);
    if (late > 0) p.appendChild(el('span', 'pill late', 'en retard de ' + late + ' j'));
    else p.appendChild(pillI('cal', 'à revoir ' + fromNum(o.r)));
    if (o.ex) p.appendChild(pillI('flag', 'mode examen · J-' + (examNum(x.semestre, x.matiere) - TODAY())));
    p.appendChild(pillI('clock', mins(x) + ' min'));
    c.appendChild(p);
    c.addEventListener('click', function (e) { if (e.target.tagName !== 'BUTTON') openEditor(x.id); });
    return c;
  }
  function renderToday() {
    var box = $('v-today'); box.textContent = '';
    var P = plan(), d = new Date();
    var head = el('div', 'card');
    var tot = 0; P.list.forEach(function (o) { if (o.in) tot += mins(o.x); });
    var jt = d.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }); head.appendChild(el('h2', '', 'Aujourd’hui · ' + jt.charAt(0).toUpperCase() + jt.slice(1)));
    var bud = P.budget >= 1e9 ? 'sans limite' : P.budget + ' min';
    head.appendChild(el('div', 'muted', 'Budget du jour : ' + bud + ' · déjà fait : ' + P.fait + ' min · prévu : ' + tot + ' min'));
    var bar = el('div', 'bar'), fill = el('i'); fill.style.width = (P.budget >= 1e9 ? 0 : Math.min(100, Math.round(P.fait / P.budget * 100))) + '%'; bar.appendChild(fill); head.appendChild(bar);
    box.appendChild(head);
    var inP = P.list.filter(function (o) { return o.in; }), out = P.list.filter(function (o) { return !o.in && !o.rep; }), reps = P.list.filter(function (o) { return o.rep; });
    if (!inP.length) box.appendChild(el('p', 'muted', data.ex.length ? 'Rien à faire aujourd’hui. Bravo !' : 'Aucun exercice. Ajoute-en avec le bouton + (onglet Exos) ou restaure ta sauvegarde (menu ⋮).'));
    inP.forEach(function (o) { box.appendChild(exoCard(o, true)); });
    if (out.length) {
      var det = document.createElement('details'); det.appendChild(el('summary', '', 'Reportés à demain ou après (' + out.length + ')'));
      out.slice(0, 60).forEach(function (o) { det.appendChild(exoCard(o, true)); });
      box.appendChild(det);
    }
    if (reps.length) {
      var dr = document.createElement('details'); dr.appendChild(el('summary', '', 'Reportés par toi aujourd’hui (' + reps.length + ')'));
      reps.forEach(function (o) { dr.appendChild(exoCard(o, true)); }); box.appendChild(dr);
    }
    box.appendChild(histBlock());
  }


  /* ---------- historique de la semaine ---------- */
  function addHist(x, niv) {
    data.hist = data.hist || [];
    var mi = $('doneMin') && parseFloat($('doneMin').value); if (mi > 0 && mi < 1000) x.minutes = Math.round(mi);
    data.hist.push({ id: x.id, ts: Date.now(), jour: todayISO(), avant: { succes: x.succes, evalue: x.evalue || '' }, niveau: niv, m: mins(x) });
  }
  function histBlock() {
    var lim = Date.now() - 7 * DAY; data.corbeille = (data.corbeille || []).filter(function (c) { return c && c.ex && c.ts > lim; });
    var L = (data.hist || []).filter(function (h) { return h.ts > lim; }).map(function (h) { return { ts: h.ts, h: h }; }).concat(data.corbeille.map(function (c) { return { ts: c.ts, c: c }; })).sort(function (a, b) { return b.ts - a.ts; });
    var det = document.createElement('details'); det.appendChild(el('summary', '', 'Historique de la semaine (' + L.length + ')'));
    if (!L.length) { det.appendChild(el('p', 'muted', 'Rien de fait cette semaine.')); return det; }
    L.forEach(function (it) {
      var c = el('div', 'card'), top = el('div', 'row2'), l = el('div'), row = el('div'); row.style.marginTop = '8px';
      var d = new Date(it.ts), jour = JOURS[(d.getDay() + 6) % 7] + ' ' + ('0' + d.getDate()).slice(-2) + '/' + ('0' + (d.getMonth() + 1)).slice(-2);
      if (it.c) {
        var cx = it.c.ex;
        l.appendChild(el('b', '', cx.matiere + (cx.intitule ? ' · ' + cx.intitule : '')));
        l.appendChild(el('div', 'muted', jour + ' · exercice supprimé'));
        var rs = el('button', 'plain', 'Restaurer'); rs.type = 'button';
        rs.addEventListener('click', function () { if (!data.ex.some(function (e) { return e.id === cx.id; })) data.ex.push(cx); data.corbeille = data.corbeille.filter(function (z) { return z !== it.c; }); save(); render(); toast('Exercice restauré.'); });
        row.appendChild(rs);
      } else {
        var h = it.h, x = data.ex.filter(function (e) { return e.id === h.id; })[0]; if (!x) return;
        l.appendChild(el('b', '', x.matiere + (x.intitule ? ' · ' + x.intitule : '')));
        l.appendChild(el('div', 'muted', jour + ' · niveau ' + h.avant.succes + ' → ' + h.niveau));
        var un = el('button', 'plain', 'Annuler'); un.type = 'button';
        un.addEventListener('click', function () { x.succes = h.avant.succes; x.evalue = h.avant.evalue; data.hist = data.hist.filter(function (z) { return z !== h; }); save(); render(); toast('Remis comme avant.'); });
        row.appendChild(un);
      }
      top.appendChild(l); c.appendChild(top); c.appendChild(row); det.appendChild(c);
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
    var od = el('div', 'chips'); od.style.padding = '0 0 10px'; od.appendChild(el('span', 'muted', 'Ordre des semestres :'));
    [['alpha', 'A → Z'], ['manuel', 'Manuel (↑ ↓)']].forEach(function (a) {
      var b = el('button', 'chip', a[1]); b.type = 'button'; b.setAttribute('aria-pressed', data.reglages.ordreSem === a[0] ? 'true' : 'false');
      b.addEventListener('click', function () { if (a[0] === 'manuel' && !(data.reglages.semOrdre || []).length) data.reglages.semOrdre = semestres(); data.reglages.ordreSem = a[0]; save(); render(); });
      od.appendChild(b);
    });
    box.appendChild(od);
    if (data.reglages.ordreSem !== 'alpha' && semestres().length > 1) {
      var ol = el('div', 'dlist');
      var rows = el('div', 'drows'); ol.appendChild(rows);
      semestres().forEach(function (sm) {
        var r = el('div', 'drow'); r.dataset.sem = sm; var h = el('span', 'dh', '⠿'); r.appendChild(h); r.appendChild(el('span', 'dn', sm));
        h.addEventListener('pointerdown', function (e) {
          e.preventDefault(); r.classList.add('drag');
          function mv(ev) {
            var kids = Array.prototype.slice.call(rows.children);
            for (var i = 0; i < kids.length; i++) {
              var k = kids[i]; if (k === r) continue; var b = k.getBoundingClientRect();
              if (ev.clientY > b.top && ev.clientY < b.bottom) { var ri = kids.indexOf(r); if (ri < i) rows.insertBefore(r, k.nextSibling); else rows.insertBefore(r, k); break; }
            }
          }
          function up() {
            window.removeEventListener('pointermove', mv); window.removeEventListener('pointerup', up); window.removeEventListener('pointercancel', up); r.classList.remove('drag');
            data.reglages.semOrdre = Array.prototype.map.call(rows.children, function (k) { return k.dataset.sem; }); data.reglages.ordreSem = 'manuel'; save(); render();
          }
          window.addEventListener('pointermove', mv); window.addEventListener('pointerup', up); window.addEventListener('pointercancel', up);
        });
        rows.appendChild(r);
      });
      box.appendChild(ol);
    }
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
        var us = document.createElement('select'); us.className = 'uesel';
        function fillUE() {
          us.textContent = ''; var o0 = el('option', '', '— UE : aucune —'); o0.value = ''; us.appendChild(o0);
          ueList(s).forEach(function (u) { var o = el('option', '', 'UE : ' + u); o.value = u; us.appendChild(o); });
          var on = el('option', '', '+ Nouvelle UE…'); on.value = '__new'; us.appendChild(on); us.value = m.ue || '';
        }
        fillUE();
        us.addEventListener('change', function () {
          var v = us.value;
          if (v === '__new') { var n = window.prompt('Nom de la nouvelle UE (semestre ' + s + ') :'); if (!n || !n.trim()) { us.value = m.ue || ''; return; } v = n.trim(); }
          m.ue = v || null; save(); render(); toast(v ? 'Rangée dans « ' + v + ' ».' : 'UE retirée.');
        });
        td1.appendChild(us);
        var inp = document.createElement('input'); inp.type = 'date'; inp.value = m.examen || '';
        inp.addEventListener('change', function () { m.examen = inp.value || null; save(); toast('Date enregistrée.'); });
        td2.appendChild(inp);
        var nt = document.createElement('input'); nt.type = 'number'; nt.inputMode = 'decimal'; nt.step = '0.01'; nt.min = 0; nt.max = 20; nt.placeholder = '–'; nt.value = typeof m.note === 'number' ? m.note : '';
        nt.addEventListener('change', function () { m.note = nt.value === '' ? null : +nt.value; save(); toast('Note enregistrée.'); });
        td3.appendChild(nt);
        tr.appendChild(td1); tr.appendChild(td2); tr.appendChild(td3); tb.appendChild(tr);
      });
      var ub = el('div', 'uebox');
      ueList(s).forEach(function (u) {
        var r = el('div', 'uerow'), nb = el('button', 'namebtn', u + ' ✎'); nb.type = 'button';
        nb.addEventListener('click', function () {
          var n = window.prompt('Renommer l’UE « ' + u + ' » (vide = supprimer l’UE, les matières restent) :', u); if (n === null) return; n = n.trim();
          (data.ues || []).forEach(function (z) { if (z.semestre === s && z.nom === u) z.nom = n; }); if (!n) data.ues = data.ues.filter(function (z) { return z.nom; });
          data.mats.forEach(function (m) { if (m.semestre === s && m.ue === u) m.ue = n || null; }); save(); render();
        });
        var def = (data.ues || []).filter(function (z) { return z.semestre === s && z.nom === u; })[0];
        var inp = document.createElement('input'); inp.type = 'number'; inp.inputMode = 'decimal'; inp.step = '0.01'; inp.min = 0; inp.max = 20;
        var auto = (function () { var g = ueGroups(s).filter(function (x) { return x.nom === u; })[0]; return g && !(def && typeof def.moy === 'number') ? g.avg : null; })();
        inp.placeholder = auto !== null ? fmt1(auto) + ' (auto)' : 'moyenne /20'; inp.value = def && typeof def.moy === 'number' ? def.moy : '';
        inp.addEventListener('change', function () { ueDef(s, u).moy = inp.value === '' ? null : +inp.value; save(); render(); });
        r.appendChild(nb); r.appendChild(inp); ub.appendChild(r);
        var mw = el('div', 'uemats');
        data.mats.forEach(function (m) {
          if (m.semestre !== s || m.ue !== u) return;
          var ch = el('button', 'chip', m.nom + (typeof m.note === 'number' ? ' · ' + fmt1(m.note) : '') + ' ✕'); ch.type = 'button';
          ch.addEventListener('click', function () { m.ue = null; save(); render(); });
          mw.appendChild(ch);
        });
        var ad = document.createElement('select'); ad.className = 'uesel'; var o0 = el('option', '', '+ Ajouter une matière'); o0.value = ''; ad.appendChild(o0);
        data.mats.forEach(function (m, mi) { if (m.semestre !== s || m.ue === u) return; var o = el('option', '', m.nom + (m.ue ? ' (dans ' + m.ue + ')' : '')); o.value = String(mi); ad.appendChild(o); });
        ad.addEventListener('change', function () { if (ad.value === '') return; data.mats[+ad.value].ue = u; save(); render(); });
        if (ad.options.length > 1) mw.appendChild(ad);
        ub.appendChild(mw);
      });
      var addUE = el('button', 'plain', '+ Ajouter une UE'); addUE.type = 'button';
      addUE.addEventListener('click', function () { var n = window.prompt('Nom de la nouvelle UE (semestre ' + s + ') :'); if (!n || !n.trim()) return; ueDef(s, n.trim()); save(); render(); });
      ub.appendChild(addUE); det.appendChild(ub);
      det.appendChild(tb);
      var ren = el('button', 'plain', 'Renommer ce semestre'); ren.type = 'button'; ren.style.margin = '8px 8px 0 0';
      ren.addEventListener('click', function () { renameSem(s); });
      det.appendChild(ren);
      if (data.reglages.ordreSem !== 'alpha') {
        var up = el('button', 'plain', '↑ Monter'), dn = el('button', 'plain', '↓ Descendre'); up.type = dn.type = 'button'; up.style.margin = dn.style.margin = '8px 8px 0 0';
        up.addEventListener('click', function () { moveSem(s, -1); }); dn.addEventListener('click', function () { moveSem(s, 1); });
        det.appendChild(up); det.appendChild(dn);
      }
      var add = el('button', 'plain', '+ Ajouter une matière'); add.type = 'button'; add.style.marginTop = '8px';
      add.addEventListener('click', function () {
        var n = window.prompt('Nom de la matière pour ' + s + ' :'); if (!n || !n.trim()) return;
        data.mats.push({ semestre: s, nom: n.trim(), examen: null }); save(); render();
      });
      det.appendChild(add); box.appendChild(det);
    });
    var ns = el('button', 'row plain', '+ Ajouter un semestre'); ns.type = 'button';
    ns.addEventListener('click', function () {
      var n = window.prompt('Nom du semestre (ex. S8 - 2A) :'); if (!n || !n.trim()) return;
      var m = window.prompt('Première matière de ' + n.trim() + ' :'); if (!m || !m.trim()) return;
      data.mats.push({ semestre: n.trim(), nom: m.trim(), examen: null }); save(); render();
    });
    box.appendChild(ns);
  }

  /* ---------- vue : tableau de bord ---------- */
  var C_LATE = '#7a1f3d', C_EXAM = '#f1b3c6', C_NORM = '#e0527f', C_PV = '#838383', C_PVL = '#3f3f3f';
  var C_NIV = ['#7a1f3d', '#a33c5e', '#cc597f', '#e57d9f', '#f0a9c0', '#f8d3e0'];
  var JS = ['dim', 'lun', 'mar', 'mer', 'jeu', 'ven', 'sam'];
  function dcard(title, extra) { var c = el('div', 'dcard' + (extra ? ' ' + extra : '')); if (title) c.appendChild(el('h2', '', title)); return c; }
  function scale(v) {
    var A = [122, 31, 61], B = [224, 103, 143], C = [249, 211, 224], f, p, q;
    v = Math.max(0, Math.min(5, v)); if (v <= 2.5) { f = v / 2.5; p = A; q = B; } else { f = (v - 2.5) / 2.5; p = B; q = C; }
    return 'rgb(' + [0, 1, 2].map(function (i) { return Math.round(p[i] + (q[i] - p[i]) * f); }).join(',') + ')';
  }
  /* niveau minimal pour ne plus avoir à réviser avant l'examen : le plus petit niveau dont l'intervalle couvre les jours restants */
  /* motif vagues rose pâle (clip déjà appliqué) */
  function waves(g, x, y, w, h, col, step, amp, lw) {
    g.strokeStyle = col; g.lineWidth = lw; var per = step * 2;
    for (var yy = y - amp; yy < y + h + amp; yy += step) { g.beginPath(); for (var xx = x - per; xx <= x + w + per; xx += 2) { var yv = yy + Math.sin((xx - x) / per * Math.PI * 2) * amp; if (xx === x - per) g.moveTo(xx, yv); else g.lineTo(xx, yv); } g.stroke(); }
  }
  function needLevel(d) { for (var n = 0; n <= 11; n++) if (interval(n) >= d) return n; return 11; }
  function nivBadge(v, sz, cv) {
    var c = cv === undefined ? v : cv, b = el('div', 'niv' + (sz ? ' ' + sz : ''), fmt1(Math.round(v * 10) / 10)); b.style.background = scale(c); b.style.color = c < 3.2 ? '#fff' : '#5c1530'; return b;
  }
  function fmt1(v) { return (Math.round(v * 100) / 100).toString().replace('.', ','); }
  var dashEdit = false;
  function renderDash() {
    var box = $('v-dash'); box.textContent = ''; var cards = {}, draws = {};
    var t = TODAY(), L = data.ex.filter(function (x) { return visible(x) && x.evalue; });
    var late = 0, due = 0;
    L.forEach(function (x) { var r = revision(x); if (r < t) late++; else if (r < t + 1) due++; });
    var todo = late + due;
    var matsV = data.mats.filter(function (m) { return !data.reglages.semestres.length || data.reglages.semestres.indexOf(m.semestre) >= 0; });
    var fut = matsV.filter(function (m) { return m.examen && dnum(m.examen) >= t; }).sort(function (a, b) { return dnum(a.examen) - dnum(b.examen); });
    var dh = el('div', 'dhead'), hh = el('span', 'hh'); hh.innerHTML = '<svg viewBox="0 0 24 22" width="34" height="31" style="position:absolute;left:0;top:0"><path fill="#f08ab0" d="M12 21.5C5 15.8 1 12.2 1 7.6 1 4.4 3.5 2 6.6 2c2 0 3.9 1 5.4 3C13.5 3 15.4 2 17.4 2 20.5 2 23 4.4 23 7.6c0 4.6-4 8.2-11 13.9z"/></svg><svg viewBox="0 0 24 22" width="22" height="20" style="position:absolute;left:18px;top:16px"><path fill="#7a1f3d" d="M12 21.5C5 15.8 1 12.2 1 7.6 1 4.4 3.5 2 6.6 2c2 0 3.9 1 5.4 3C13.5 3 15.4 2 17.4 2 20.5 2 23 4.4 23 7.6c0 4.6-4 8.2-11 13.9z"/></svg>';
    var tt = el('div', 'dht'); tt.appendChild(el('b', '', 'Mes révisions')); tt.appendChild(el('small', '', 'Méthode des J · suivi de mes exercices'));
    var dd0 = el('span', 'dhd', new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }));
    dh.appendChild(hh); dh.appendChild(tt); dh.appendChild(dd0); box.appendChild(dh);
    var ban = el('div', 'banner');
    ban.textContent = todo + ' exercice' + (todo > 1 ? 's' : '') + ' à réviser aujourd’hui';
    if (fut.length) { var dd = dnum(fut[0].examen) - t; ban.textContent = todo + ' exercice' + (todo > 1 ? 's' : '') + ' à réviser aujourd’hui  ·  Prochain examen : ' + fut[0].nom + ' ' + (dd === 0 ? 'aujourd’hui' : 'dans ' + dd + ' jour' + (dd > 1 ? 's' : '')); }
    box.appendChild(ban);

    var sv = semestres().filter(function (z) { return !data.reglages.semestres.length || data.reglages.semestres.indexOf(z) >= 0; }).map(semAvg).filter(function (v) { return v !== null; });
    var moy = sv.length ? sv.reduce(function (a, b) { return a + b; }, 0) / sv.length : null;
    var k = el('div', 'kpis3');
    [['EXERCICES', L.length, 'enregistrés'], ['À FAIRE AUJOURD’HUI', todo, 'dont ' + late + ' en retard'], ['MOYENNE /20', moy === null ? '–' : fmt1(moy), 'd’après tes relevés']].forEach(function (a, i) {
      var d = el('div', 'kpi3'); d.appendChild(el('small', '', a[0])); d.appendChild(el('b', '', a[1])); d.appendChild(el('span', '', a[2])); d.appendChild(el('u', i === 1 ? 'mid' : '')); k.appendChild(d);
    });
    box.appendChild(k);

    /* moyenne par semestre */
    var c0 = dcard('Moyenne par semestre'), sems = semestres(); /* toujours tous les semestres, sans filtre */
    var cols = el('div', 'cols');
    [0, 5, 10, 15, 20].forEach(function (g) { var gl = el('div', 'gl'); gl.style.bottom = (26 + g * 6) + 'px'; gl.appendChild(el('span', '', String(g))); cols.appendChild(gl); });
    sems.forEach(function (sm) {
      var v = semAvg(sm) || 0;
      var col = el('div', 'col'); col.appendChild(el('span', 'v', v ? fmt1(v) : '–'));
      var bar = el('i'); bar.style.height = Math.round(v * 6) + 'px'; col.appendChild(bar); col.appendChild(el('span', 'l', sm)); cols.appendChild(col);
    });
    c0.appendChild(cols); cards.sem = c0;

    /* moyenne par matière : même nom fusionné, semestres cochés */
    var cm = dcard('Moyenne par matière · semestres cochés'), gm = {};
    L.forEach(function (x) { var k = x.matiere.trim().toLowerCase(); var g = gm[k] = gm[k] || { nom: x.matiere, s: 0, n: 0, sem: {}, nt: [] }; g.s += lvl(x); g.n++; g.sem[x.semestre] = 1; });
    matsV.forEach(function (m) { var g = gm[m.nom.trim().toLowerCase()]; if (g && typeof m.note === 'number') g.nt.push(m.note); });
    var lm = Object.keys(gm).map(function (k) { var g = gm[k]; g.a = g.s / g.n; g.ns = Object.keys(g.sem).length; return g; }).sort(function (a, b) { return b.a - a.a; });
    if (!lm.length) cm.appendChild(el('p', 'muted', 'Aucun exercice dans les semestres cochés.'));
    else {
      var lw = el('div', 'mlist');
      lm.forEach(function (g) {
        var r = el('div', 'mrow'); r.style.borderLeftColor = scale(g.a); var mn = el('span', 'mn', g.nom); if (g.ns > 1) mn.appendChild(el('em', 'chip2', g.ns + ' sem.')); r.appendChild(mn);
        r.appendChild(nivBadge(g.a, 'sm')); lw.appendChild(r);
      });
      cm.appendChild(lw);
    }
    cards.mat = cm;

    /* charge */
    var c1 = dcard('Charge de révision à venir');
    var lg = el('div', 'legend');
    [['En retard', C_LATE], ['Prévu', C_NORM], ['Examen (vagues)', 'hatch'], ['Temps prévu ce jour-là', 'tick']].concat(!data.reglages.prevOff ? [['En retard (prévision)', C_PVL], ['Prévu (prévision)', C_PV], ['Examen (prévision)', 'hatchg']] : []).forEach(function (a) { var sp = el('span'); var i = el('i'); if (a[1] === 'hatch') i.className = 'hat'; else if (a[1] === 'hatchg') i.className = 'hat hg'; else if (a[1] === 'tick') i.className = 'tick'; else i.style.background = a[1]; sp.appendChild(i); sp.appendChild(document.createTextNode(a[0])); lg.appendChild(sp); });
    c1.appendChild(lg);
    {
      var sg = el('div', 'seg'); [[false, 'Sans prévisions'], [true, 'Avec prévisions']].forEach(function (o) {
        var b = el('button', (!data.reglages.prevOff) === o[0] ? 'on' : '', o[1]); b.type = 'button';
        b.addEventListener('click', function () { data.reglages.prevOff = !o[0]; save(); renderDash(); }); sg.appendChild(b); });
      c1.insertBefore(sg, lg);
    }
    var cv = document.createElement('canvas'), cax = document.createElement('canvas'), sc = el('div', 'scrollx'), wr = el('div', 'chw'); sc.appendChild(cv); wr.appendChild(cax); wr.appendChild(sc); c1.appendChild(wr);
    cards.charge = c1; draws.charge = function () { drawCharge(cv, L, t, cax); };

    cards.habit = habitCard();

    /* prochains examens */
    var c3 = dcard('Prochains examens');
    if (!fut.length) c3.appendChild(el('p', 'muted', 'Aucune date d’examen à venir (onglet Matières).'));
    else {
      var tb = el('div', 'exl');
      fut.forEach(function (m) {
        var dn = dnum(m.examen), J = dn - t, Rg = data.reglages, X = Math.max(1, J > Rg.seuilButoire ? Rg.butoireSi : Rg.butoireSinon);
        var need = Math.round(Math.max(0, Math.min(5, 5 * (1 - Math.max(0, J - X) / Math.max(1, Rg.debutExam)))) * 10) / 10;
        var es = L.filter(function (x) { return x.semestre === m.semestre && x.matiere === m.nom; }), av = es.length ? es.reduce(function (a, x) { return a + lvl(x); }, 0) / es.length : null;
        var row = el('div', 'exr'), mid = el('div', 'exm');
        var top = el('div', 'ext'); top.appendChild(el('span', 'chip', m.semestre)); top.appendChild(el('b', 'mn', m.nom)); mid.appendChild(top);
        var trk = el('div', 'trk'), fl = el('i', 'fl'); fl.style.width = Math.min(100, (av || 0) / 5 * 100) + '%'; if (av !== null) fl.style.background = scale(av); trk.appendChild(fl);
        for (var q = 1; q < 5; q++) { var tk = el('b', 'tk'); tk.style.left = (q * 20) + '%'; trk.appendChild(tk); }
        var me = el('u', 'me'); me.style.left = Math.min(100, need / 5 * 100) + '%'; me.title = 'Prévision : niveau à avoir aujourd’hui (' + need + ')'; trk.appendChild(me);
        mid.appendChild(trk); row.appendChild(mid);
        var jd = el('div', 'exj'); jd.appendChild(el('b', 'jj', 'J-' + J)); jd.appendChild(el('span', 'dd', fromNum(dn).slice(0, 6) + fromNum(dn).slice(8))); row.appendChild(jd);
        var nt = el('div', 'exn'); if (av !== null) nt.appendChild(nivBadge(av, 'sm')); row.appendChild(nt);
        tb.appendChild(row);
      });
      var sc = el('div', 'mscroll'); sc.appendChild(tb); c3.appendChild(sc);
    }
    cards.exam = c3;

    /* anneau succès */
    var c2 = dcard('Succès : exos / examens');
    var cv2 = document.createElement('canvas'); c2.appendChild(cv2);
    var lg2 = el('div', 'legend'); [0, 1, 2, 3, 4, 5].forEach(function (i) { var sp = el('span'); var ic = el('i'); ic.style.background = C_NIV[i]; sp.appendChild(ic); sp.appendChild(document.createTextNode(i === 5 ? '5+' : String(i))); lg2.appendChild(sp); });
    c2.appendChild(lg2); cards.donut = c2; draws.donut = function () { drawDonut(cv2, L); };

    var c4 = dcard('Temps de révision par tranche de J');
    var cv4 = document.createElement('canvas'); c4.appendChild(cv4);
    var lg4 = el('div', 'legend'); J_LAB.forEach(function (n, i) { var sp = el('span'); var ic = el('i'); ic.style.background = C_J[i]; sp.appendChild(ic); sp.appendChild(document.createTextNode(n)); lg4.appendChild(sp); });
    c4.appendChild(lg4); cards.jring = c4; draws.jring = function () { drawDonut(cv4, L, true); };

    var c5 = dcard('Courbe de l’oubli');
    var cv5 = document.createElement('canvas'); c5.appendChild(cv5);
    var lg5 = el('div', 'legend'); [['#e0527f55', 'Chaque révision'], ['#7a1f3d', 'Moyenne lissée (100 derniers jours)'], ['#f9d3e0', 'Objectif (4,5 à 5)']].forEach(function (a) { var sp = el('span'); var ic = el('i'); ic.style.background = a[0]; sp.appendChild(ic); sp.appendChild(document.createTextNode(a[1])); lg5.appendChild(sp); });
    var fl5 = el('div', 'seg'); [[0, 'Toutes les révisions'], [3, 'Exos bien connus (note préc. ≥ 3)']].forEach(function (o) {
      var b = el('button', (data.reglages.oubliMin === 0 ? 0 : 3) === o[0] ? 'on' : '', o[1]); b.type = 'button';
      b.addEventListener('click', function () { data.reglages.oubliMin = o[0]; save(); renderDash(); }); fl5.appendChild(b); });
    c5.insertBefore(fl5, cv5);
    c5.appendChild(lg5); cards.oubli = c5; draws.oubli = function () { drawOubli(cv5); }; c5.classList.add('wide');
    cards.charge.classList.add('wide'); cards.habit.classList.add('wide');
    var R = data.reglages, keys = ['sem', 'mat', 'charge', 'habit', 'exam', 'donut', 'jring', 'oubli'];
    var ord = (R.dashOrdre || []).filter(function (k) { return keys.indexOf(k) >= 0; }); keys.forEach(function (k) { if (ord.indexOf(k) < 0) { if (k === 'ue' && ord.indexOf('sem') >= 0) ord.splice(ord.indexOf('sem') + 1, 0, k); else ord.push(k); } });
    var hid = R.dashCache || [];
    var ed = el('button', 'editbtn' + (dashEdit ? ' on' : '')); ed.type = 'button'; ed.setAttribute('aria-label', dashEdit ? 'Terminer' : 'Modifier l’affichage');
    ed.innerHTML = dashEdit ? '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12l5 5 9-10"/></svg>' : '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20h4L19 9a2.1 2.1 0 0 0-3-3L5 17z"/><path d="M14 7l3 3"/></svg>';
    ed.addEventListener('click', function () { dashEdit = !dashEdit; renderDash(); }); box.appendChild(ed);
    var half = 0, lastHalf = null;
    ord.forEach(function (k, i) {
      var isH = hid.indexOf(k) >= 0; if (isH && !dashEdit) return;
      var c = cards[k];
      if (c.classList.contains('wide')) { if (half % 2 === 1 && lastHalf) lastHalf.classList.add('solo'); half = 0; lastHalf = null; } else { half++; lastHalf = c; }
      if (dashEdit) {
        var tb = el('div', 'dtools'); c.classList.toggle('dim', isH);
        function mk(txt, fn, dis) { var b = el('button', 'plain', txt); b.type = 'button'; b.disabled = !!dis; b.addEventListener('click', fn); tb.appendChild(b); }
        mk('↑', function () { if (i > 0) { ord.splice(i, 1); ord.splice(i - 1, 0, k); R.dashOrdre = ord; save(); renderDash(); } }, i === 0);
        mk('↓', function () { if (i < ord.length - 1) { ord.splice(i, 1); ord.splice(i + 1, 0, k); R.dashOrdre = ord; save(); renderDash(); } }, i === ord.length - 1);
        mk(isH ? '👁 Afficher' : '🚫 Masquer', function () { R.dashCache = isH ? hid.filter(function (z) { return z !== k; }) : hid.concat([k]); R.dashOrdre = ord; save(); renderDash(); });
        c.insertBefore(tb, c.firstChild);
      }
      box.appendChild(c);
    });
    if (half % 2 === 1 && lastHalf) lastHalf.classList.add('solo');
    Object.keys(draws).forEach(function (k) { if (cards[k].parentNode === box) draws[k](); });
  }

  function faitsMap() {
    var map = {}, vu = {};
    (data.hist || []).forEach(function (h) {
      var x = data.ex.filter(function (e) { return e.id === h.id; })[0]; vu[h.id] = 1;
      map[h.jour] = (map[h.jour] || 0) + (h.m || (x ? mins(x) : data.reglages.minutesDefaut));
    });
    data.ex.forEach(function (x) { if (!vu[x.id] && x.evalue) map[x.evalue] = (map[x.evalue] || 0) + mins(x); });
    /* la date de la révision précédente (avant de refaire l'exo) compte aussi, si elle n'est pas déjà enregistrée */
    var seen = {}; (data.hist || []).forEach(function (h) { seen[h.id + '|' + h.jour] = 1; }); data.ex.forEach(function (x) { if (x.evalue) seen[x.id + '|' + x.evalue] = 1; });
    (data.hist || []).forEach(function (h) {
      var pe = h.avant && h.avant.evalue; if (!pe || seen[h.id + '|' + pe]) return; seen[h.id + '|' + pe] = 1;
      var x = data.ex.filter(function (e) { return e.id === h.id; })[0];
      map[pe] = (map[pe] || 0) + (h.m || (x ? mins(x) : data.reglages.minutesDefaut));
    });
    return map;
  }
  function dur(m) { return m >= 60 ? Math.floor(m / 60) + ' h' + (m % 60 ? ' ' + ('0' + m % 60).slice(-2) : '') : m + ' min'; }
  /* UE : les matières d'une même UE se moyennent ensemble, puis les UE se moyennent entre elles */
  function ueList(sem) {
    var u = []; (data.ues || []).forEach(function (z) { if (z.semestre === sem && u.indexOf(z.nom) < 0) u.push(z.nom); });
    data.mats.forEach(function (m) { if (m.semestre === sem && m.ue && u.indexOf(m.ue) < 0) u.push(m.ue); });
    return u;
  }
  function ueDef(sem, nom) { var r = (data.ues || []).filter(function (z) { return z.semestre === sem && z.nom === nom; })[0]; if (!r) { r = { semestre: sem, nom: nom, moy: null }; data.ues = data.ues || []; data.ues.push(r); } return r; }
  function mean(a) { return a.length ? a.reduce(function (x, y) { return x + y; }, 0) / a.length : null; }
  function ueGroups(sem) {
    var res = [];
    ueList(sem).forEach(function (u) {
      var def = (data.ues || []).filter(function (z) { return z.semestre === sem && z.nom === u; })[0];
      var ms = data.mats.filter(function (m) { return m.semestre === sem && m.ue === u; }), ns = ms.filter(function (m) { return typeof m.note === 'number'; }).map(function (m) { return m.note; });
      var avg = def && typeof def.moy === 'number' ? def.moy : mean(ns);
      if (avg !== null) res.push({ nom: u, ue: true, notes: ms, avg: avg, sem: sem });
    });
    if (res.length) return res;
    var g = {}, order = [];
    data.mats.forEach(function (m) { if (m.semestre !== sem || typeof m.note !== 'number') return; if (!g[m.nom]) { g[m.nom] = { nom: m.nom, ue: false, notes: [m], avg: m.note, sem: sem }; order.push(m.nom); } });
    return order.map(function (k) { return g[k]; });
  }
  function semAvg(sem) { var l = ueGroups(sem); return l.length ? mean(l.map(function (g) { return g.avg; })) : null; }
  var habitYear = new Date().getFullYear();
  function habitCard() {
    var c = dcard('Régularité · temps de révision par jour'), t = TODAY(), Yc = new Date(t * DAY).getUTCFullYear();
    var FM = faitsMap(), minY = Yc - 1;
    Object.keys(FM).forEach(function (k) { var y = +k.slice(0, 4); if (y && y < minY) minY = y; });
    var j1 = Date.UTC(minY, 0, 1) / DAY, j31 = Date.UTC(Yc + 1, 11, 31) / DAY, wd1 = (new Date(j1 * DAY).getUTCDay() + 6) % 7, start = j1 - wd1, W = Math.ceil((j31 - start + 1) / 7), CW = 17;
    var mois = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
    var nav = el('div', 'row2'); nav.style.marginBottom = '8px';
    var cur = el('b', 'hcur', ''), bt = el('button', 'plain', 'Aujourd’hui'); bt.type = 'button';
    nav.appendChild(cur); nav.appendChild(bt); c.appendChild(nav);
    var cols = ['#f6e9ee', '#f9d3e0', '#f0a9c0', '#e0678f', '#a33c5e', '#7a1f3d'];
    var ST = [[249, 211, 224], [224, 103, 143], [122, 31, 61], [0, 0, 0]], SV = [0, 120, 300, 1440];
    function colFor(v) {
      if (v <= 0) return cols[0]; v = Math.min(1440, v); var i = 0; while (i < 2 && v > SV[i + 1]) i++;
      var a = ST[i], b = ST[i + 1], k = (v - SV[i]) / (SV[i + 1] - SV[i]);
      return 'rgb(' + [0, 1, 2].map(function (j) { return Math.round(a[j] + (b[j] - a[j]) * k); }).join(',') + ')';
    }
    var wrap = el('div', 'habit'), lab = el('div', 'hl');
    ['L', 'M', 'M', 'J', 'V', 'S', 'D'].forEach(function (z) { lab.appendChild(el('span', '', z)); }); wrap.appendChild(lab);
    var sc = el('div', 'scrollx'), grid = el('div', 'hg'); grid.style.gridTemplateColumns = 'repeat(' + W + ',' + CW + 'px)';
    var lastKey = '', todayCell = null;
    for (var w = 0; w < W; w++) {
      var d0 = new Date((start + w * 7 + 3) * DAY), key = d0.getUTCFullYear() * 12 + d0.getUTCMonth();
      if (key !== lastKey) { lastKey = key; var m = d0.getUTCMonth(); var ml = el('span', 'hm', m === 0 ? 'janv ' + d0.getUTCFullYear() : mois[m].slice(0, 4) + (mois[m].length > 4 ? '.' : '')); if (m === 0) ml.style.fontWeight = '800'; ml.style.gridColumn = (w + 1) + ' / span 3'; ml.style.gridRow = 1; grid.appendChild(ml); }
    }
    for (var w2 = 0; w2 < W; w2++) for (var r = 0; r < 7; r++) {
      var dn2 = start + w2 * 7 + r, cell = el('i', 'hc'); cell.style.gridColumn = (w2 + 1); cell.style.gridRow = (r + 2);
      if (dn2 < j1 || dn2 > j31) cell.style.visibility = 'hidden'; else {
        var vv = FM[new Date(dn2 * DAY).toISOString().slice(0, 10)] || 0;
        cell.style.background = dn2 > t ? '#faf3f6' : colFor(vv); if (dn2 === t) { cell.style.outline = '2px solid #7a1f3d'; todayCell = cell; }
        (function (n, v2) { cell.addEventListener('click', function () { toast(fromNum(n) + ' : ' + (v2 ? dur(v2) : 'rien de fait')); }); })(dn2, vv);
      }
      grid.appendChild(cell);
    }
    sc.appendChild(grid); wrap.appendChild(sc); c.appendChild(wrap);
    function upd() { var wi = Math.max(0, Math.min(W - 1, Math.floor((sc.scrollLeft + sc.clientWidth - 4) / (CW + 3)))), dd = new Date((start + wi * 7 + 3) * DAY); cur.textContent = mois[dd.getUTCMonth()] + ' ' + dd.getUTCFullYear(); }
    function toToday(smooth) { if (todayCell) sc.scrollTo({ left: Math.max(0, todayCell.offsetLeft + CW + 2 - sc.clientWidth), behavior: smooth ? 'smooth' : 'auto' }); }
    sc.addEventListener('scroll', upd); bt.addEventListener('click', function () { toToday(true); });
    setTimeout(function () { if (window._hk != null) sc.scrollLeft = window._hk; else toToday(false); upd(); }, 0);
    var lg = el('div', 'legend hleg'), z0 = el('span'), zi = el('i'); zi.style.background = cols[0]; z0.appendChild(zi); z0.appendChild(document.createTextNode('0')); lg.appendChild(z0);
    var gb = el('span', 'gbar'); gb.appendChild(el('em', '', '1 min')); var gs = el('i', 'gstrip'); gs.style.background = 'linear-gradient(90deg,' + [1, 120, 300, 1440].map(colFor).join(',') + ')'; gb.appendChild(gs); gb.appendChild(el('em', '', '24 h')); lg.appendChild(gb);
    c.appendChild(lg); return c;
  }
  function tfmt(m) { m = Math.round(m); return m < 60 ? m + ' min' : (Math.round(m / 6) / 10).toString().replace('.', ',') + ' h'; }
  var J_LAB = ['En retard', 'J0', 'J1-3', 'J4-10', 'J11-25', 'J26-50', 'J50+'], C_J = ['#7a1f3d', '#9a3458', '#b84a70', '#d2658b', '#e684a6', '#f2a9c0', '#f8d3e0'];
  function jIdx(x) { var d = revision(x) - TODAY(); return d < 0 ? 0 : d === 0 ? 1 : d <= 3 ? 2 : d <= 10 ? 3 : d <= 25 ? 4 : d <= 50 ? 5 : 6; }
  function drawDonut(cv, L, J) {
    var NB = J ? 7 : 6, COL = J ? C_J : C_NIV, all = [], inn = [], sum = 0; for (var zz = 0; zz < NB; zz++) { all.push(0); inn.push(0); }
    L.forEach(function (x) { var n = J ? jIdx(x) : Math.min(5, x.succes || 0), wt = J ? mins(x) : 1; all[n] += wt; if (modeExam(x)) inn[n] += wt; sum += J ? wt : n; });
    var w = cv.clientWidth || 320, h = Math.round(Math.min(Math.max(230, w * 0.8), 480)), dpr = window.devicePixelRatio || 1;
    cv.width = w * dpr; cv.height = h * dpr; cv.style.height = h + 'px';
    var g = cv.getContext('2d'); g.scale(dpr, dpr); g.clearRect(0, 0, w, h);
    var cx = w / 2, cy = h / 2, R1 = h / 2 - 8, K = R1 / 100, R0 = R1 * .66, R2 = R1 * .62, R3 = R1 * .38;
    function ring(vals, ra, rb, hatch) {
      var tot = vals.reduce(function (a, b) { return a + b; }, 0), a0 = -Math.PI / 2;
      if (!tot) { g.beginPath(); g.arc(cx, cy, (ra + rb) / 2, 0, 7); g.lineWidth = ra - rb; g.strokeStyle = '#f6e3ea'; g.stroke(); return; }
      vals.forEach(function (v, i) {
        if (!v) return; var a1 = a0 + v / tot * Math.PI * 2;
        g.beginPath(); g.arc(cx, cy, ra, a0, a1); g.arc(cx, cy, rb, a1, a0, true); g.closePath();
        g.fillStyle = COL[i]; g.fill();
        if (hatch) { g.save(); g.clip(); waves(g, cx - ra, cy - ra, ra * 2, ra * 2, 'rgba(249,211,224,.9)', 7 * K / 1.2, 1.8 * K / 1.2, 1.2); g.restore(); }
        g.lineWidth = 2; g.strokeStyle = '#fff'; g.beginPath(); g.arc(cx, cy, ra, a0, a1); g.arc(cx, cy, rb, a1, a0, true); g.closePath(); g.stroke();
        if (v / tot > (J && rb < R0 * .9 ? .09 : .05)) { var am = (a0 + a1) / 2, rr = (ra + rb) / 2; g.fillStyle = i >= (J ? 5 : 4) ? '#5c1530' : '#fff'; g.font = 'bold ' + Math.round((J && rb < R0 * .9 ? 9 : 12) * K) + 'px system-ui'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(J ? tfmt(v).replace(' ', '') : v, cx + Math.cos(am) * rr, cy + Math.sin(am) * rr); }
        a0 = a1;
      });
    }
    ring(all, R1, R0, false); ring(inn, R2, R3, true);
    g.fillStyle = '#7a1f3d'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.font = 'bold ' + Math.round(22 * K) + 'px system-ui'; g.fillText(J ? tfmt(sum) : (L.length ? fmt1(sum / L.length) : '–'), cx, cy - 6 * K);
    g.fillStyle = '#8a6573'; g.font = Math.round(10 * K) + 'px system-ui'; g.fillText(J ? 'à réviser' : 'moy. sur 5', cx, cy + 12 * K);
    
  }
  /* courbe de l'oubli : note obtenue à chaque révision selon le nombre de jours écoulés depuis la précédente */
  function oubliPts() {
    var P = [], lim = TODAY() - 100; (data.hist || []).forEach(function (h) {
      if (!h.avant || !h.avant.evalue || !h.jour || dnum(h.jour) < lim || (h.avant.succes || 0) < (data.reglages.oubliMin === 0 ? 0 : 3)) return; var g = dnum(h.jour) - dnum(h.avant.evalue);
      if (g >= 0 && g <= 100 && typeof h.niveau === 'number') P.push({ g: g, n: Math.min(5, h.niveau) });
    }); return P;
  }
  function drawOubli(cv) {
    var P = oubliPts(), w = cv.clientWidth || 320, h = Math.round(Math.min(Math.max(220, w * 0.55), 340)), dpr = window.devicePixelRatio || 1;
    cv.width = w * dpr; cv.height = h * dpr; cv.style.height = h + 'px';
    var g = cv.getContext('2d'); g.scale(dpr, dpr); g.clearRect(0, 0, w, h);
    var L0 = 30, R0 = w - 10, T = 14, B = h - 26;
    function X(d) { return L0 + (R0 - L0) * d / 100; } function Y(v) { return B - (B - T) * v / 5; }
    g.font = '10px system-ui'; g.textAlign = 'right'; g.fillStyle = '#8a6573'; g.strokeStyle = '#f0dde4'; g.lineWidth = 1;
    for (var v = 0; v <= 5; v++) { g.beginPath(); g.moveTo(L0, Y(v)); g.lineTo(R0, Y(v)); g.stroke(); g.fillText(v, L0 - 5, Y(v) + 3); }
    g.textAlign = 'center'; [0, 10, 25, 50, 75, 100].forEach(function (d) { g.fillText(d + ' j', X(d), B + 15); });
    g.fillStyle = 'rgba(249,211,224,.55)'; g.fillRect(L0, Y(5), R0 - L0, Y(4.5) - Y(5));
    /* J idéaux */
    var iv = data.reglages.intervalles.slice(0, 6); g.setLineDash([3, 3]); g.strokeStyle = '#e0a3b8'; iv.forEach(function (d) { if (d <= 100) { g.beginPath(); g.moveTo(X(d), T); g.lineTo(X(d), B); g.stroke(); g.fillStyle = '#b55a7c'; g.fillText('J' + d, X(d), T - 3); } }); g.setLineDash([]);
    if (!P.length) { g.fillStyle = '#8a6573'; g.font = '13px system-ui'; g.textAlign = 'center'; g.fillText('Pas encore de mesure', w / 2, (T + B) / 2); return; }
    P.forEach(function (p) { g.fillStyle = 'rgba(224,82,127,.28)'; g.beginPath(); g.arc(X(p.g), Y(p.n), 3, 0, 7); g.fill(); });
    var lastBx = -99;
    iv.forEach(function (d) {
      if (d > 100) return; var tol = Math.max(1, Math.round(d * 0.2)), q = P.filter(function (p) { return Math.abs(p.g - d) <= tol; });
      if (!q.length) return; var m = q.reduce(function (a, p) { return a + p.n; }, 0) / q.length, bx = Math.min(R0 - 16, Math.max(L0 + 16, X(d))), by = B - 12; if (bx - lastBx < 34) by -= 22; lastBx = bx;
      g.fillStyle = scale(m); g.beginPath(); if (g.roundRect) g.roundRect(bx - 16, by - 9, 32, 18, 9); else g.rect(bx - 16, by - 9, 32, 18); g.fill();
      g.fillStyle = m < 3.2 ? '#fff' : '#5c1530'; g.font = 'bold 11px system-ui'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(fmt1(Math.round(m * 10) / 10), bx, by); g.textBaseline = 'alphabetic';
    });
    /* moyenne lissée : chaque jour de 0 à 100 = moyenne pondérée des révisions voisines (noyau gaussien) */
    var pts = [], sg = 7;
    for (var d = 0; d <= 100; d += 1) {
      var sw = 0, sv = 0; P.forEach(function (p) { var z = (p.g - d) / sg, wgt = Math.exp(-z * z / 2); sw += wgt; sv += wgt * p.n; });
      if (sw >= 1.2) pts.push({ x: d, y: sv / sw });
    }
    if (pts.length > 1) {
      g.beginPath(); pts.forEach(function (p, i) { if (i) g.lineTo(X(p.x), Y(p.y)); else g.moveTo(X(p.x), Y(p.y)); });
      g.lineTo(X(pts[pts.length - 1].x), B); g.lineTo(X(pts[0].x), B); g.closePath(); g.fillStyle = 'rgba(122,31,61,.08)'; g.fill();
      g.strokeStyle = '#7a1f3d'; g.lineWidth = 3; g.lineJoin = 'round'; g.lineCap = 'round'; g.beginPath(); pts.forEach(function (p, i) { if (i) g.lineTo(X(p.x), Y(p.y)); else g.moveTo(X(p.x), Y(p.y)); }); g.stroke();
    }
  }
  /* note attendue (0-5) après `gap` jours, d'après la courbe de l'oubli lissée ; null si pas assez de données */
  function retentionFn() {
    var P = oubliPts(); if (P.length < 30) return null;
    return function (gap) {
      var sw = 0, sv = 0; P.forEach(function (p) { var z = (p.g - gap) / 7, wg = Math.exp(-z * z / 2); sw += wg; sv += wg * p.n; });
      return sw >= 1.2 ? sv / sw : null;
    };
  }
  function drawCharge(cv, L, t, ax) {
    var N = 42, late = [], lateEx = [], ex = [], nm = [], pv = [], pvL = [], pvE = [], pvLE = [], cnt = []; for (var i = 0; i < N; i++) { late.push(0); lateEx.push(0); ex.push(0); nm.push(0); pv.push(0); pvL.push(0); pvE.push(0); pvLE.push(0); cnt.push(0); }
    var RETREAL = data.reglages.prevOff ? null : retentionFn(), RET = data.reglages.prevOff ? null : (RETREAL || function () { return 5; }), vc = 0;
    var cand = [];
    data.ex.forEach(function (x, i) { if (visible(x) && x.evalue) cand.push({ x: x, r: revision(x), ex: modeExam(x), i: i, m: mins(x) }); });
    function lvO(o) { return o.v ? o.L : lvl(o.x); }
    function srt() { cand.sort(function (a, b) { return ((a.ex ? 0 : 1) * 1e11 + a.r * 1e5 + lvO(a) * 1e4 + (a.v ? 5e3 : 0) + (a.i + '' === a.i ? 0 : a.i)) - ((b.ex ? 0 : 1) * 1e11 + b.r * 1e5 + lvO(b) * 1e4 + (b.v ? 5e3 : 0) + (b.i + '' === b.i ? 0 : b.i)); }); }
    srt();
    var done = {};
    for (var d = 0; d < N; d++) {
      var wd = new Date((t + d) * DAY).getUTCDay(), bud = data.reglages.planning[(wd + 6) % 7];
      bud = typeof bud === 'number' && !isNaN(bud) ? bud : 1e9;
      var cum = 0, fait = d === 0 ? dejaFait() : 0; if (RET && d > 0) srt();
      cand.forEach(function (o) {
        if (done[o.i] || o.r >= t + d + 1) return;
        if (d === 0 && o.x && o.x.reporte === todayISO()) return;
        if (bud >= 1e9 || cum + o.m <= bud - fait || (cum === 0 && bud > fait)) {
          cum += o.m;
          done[o.i] = 1; if (!o.v) cnt[d]++;
          if (RET) {
            var ox = o.v ? o.x : o.x, gp = t + d - (o.v ? o.ev : dnum(o.x.evalue)), nt = gp >= 0 ? RET(gp) : null;
            if (nt !== null) {
              var pl = o.v ? o.L : lvl(o.x), nl = Math.min(5, Math.round(nt)); if (!RETREAL) nl = pl + 1; else if (nl >= 5 && pl >= 5) nl = pl + 1;
              var r2 = Math.max(revisionAt(ox, t + d, interval(nl)), t + d + 1); if (r2 < t + N) cand.push({ v: true, x: ox, L: nl, ev: t + d, r: r2, ex: examAt(ox, t + d), i: 'v' + (vc++), m: o.m });
            }
          }
          if (o.v) { if (o.r < t + d) { if (o.ex) pvLE[d] += o.m; else pvL[d] += o.m; } else if (o.ex) pvE[d] += o.m; else pv[d] += o.m; } else if (o.r < t + d) { if (o.ex) lateEx[d] += o.m; else late[d] += o.m; } else if (o.ex) ex[d] += o.m; else nm[d] += o.m;
        }
      });
    }
    var w = 4 + N * 40 + 4, h = 210, dpr = window.devicePixelRatio || 1;
    cv.width = w * dpr; cv.height = h * dpr; cv.style.height = h + 'px'; cv.style.width = w + 'px';
    var g = cv.getContext('2d'); g.scale(dpr, dpr); g.clearRect(0, 0, w, h);
    var tot = late.map(function (_, i) { return late[i] + lateEx[i] + ex[i] + nm[i] + pv[i] + pvL[i] + pvE[i] + pvLE[i]; }), mx = Math.max.apply(null, tot.concat([60]));
    var step = mx > 600 ? 240 : mx > 240 ? 120 : 60; mx = Math.ceil(mx / step) * step;
    var L0 = 4, B = h - 46, T = 8, bw = (w - L0 - 4) / N;
    function rr(x, y, w2, h2, r) { g.beginPath(); if (g.roundRect) g.roundRect(x, y, w2, h2, r); else g.rect(x, y, w2, h2); }
    /* fond des colonnes : aujourd'hui en rose pâle, week-ends très léger */
    for (var j0 = 0; j0 < N; j0++) {
      var wd0 = new Date((t + j0) * DAY).getUTCDay(), bx = L0 + j0 * bw + 1;
      if (j0 === 0) { g.fillStyle = '#fde6ee'; rr(bx, T - 2, bw - 2, B - T + 44, 8); g.fill(); }
      else if (wd0 === 0 || wd0 === 6) { g.fillStyle = '#fdf3f6'; rr(bx, T - 2, bw - 2, B - T + 44, 8); g.fill(); }
    }
    g.font = '10px system-ui'; g.fillStyle = '#a58593'; g.strokeStyle = '#f1dde5'; g.textAlign = 'right'; g.lineWidth = 1; g.setLineDash([2, 4]);
    var ga = null; if (ax) { ax.width = 34 * dpr; ax.height = h * dpr; ax.style.width = '34px'; ax.style.height = h + 'px'; ga = ax.getContext('2d'); ga.scale(dpr, dpr); ga.clearRect(0, 0, 34, h); ga.font = '10px system-ui'; ga.fillStyle = '#a58593'; ga.textAlign = 'right'; }
    for (var v = 0; v <= mx; v += step) { var y = B - (B - T) * v / mx; g.beginPath(); g.moveTo(L0, y); g.lineTo(w, y); g.stroke(); if (ax) { ga.fillText(v >= 60 ? (v / 60) + ' h' : v + ' min', 30, y + 3); } }
    g.setLineDash([]); g.textAlign = 'center';
    for (var j = 0; j < N; j++) {
      var x0 = L0 + j * bw + bw * 0.16, ww = bw * 0.68, yy = B, th = (B - T) * tot[j] / mx;
      if (th > 0) {
        g.save(); rr(x0, B - th, ww, th + 6, Math.min(6, ww / 2)); g.clip();
        [[late[j], C_LATE, 0], [lateEx[j], C_LATE, 1], [nm[j], C_NORM, 0], [ex[j], C_NORM, 1], [pvL[j], C_PVL, 0], [pvLE[j], C_PVL, 2], [pvE[j], C_PV, 2], [pv[j], C_PV, 0]].forEach(function (s) {
          if (!s[0]) return; var hh = (B - T) * s[0] / mx; g.fillStyle = s[1]; g.fillRect(x0, yy - hh, ww, hh);
          if (s[2]) { g.save(); g.beginPath(); g.rect(x0, yy - hh, ww, hh); g.clip(); waves(g, x0, yy - hh, ww, hh, s[2] === 2 ? '#e1e1e1' : '#f9d3e0', 5, 1.6, 1.2); g.restore(); }
          g.fillStyle = 'rgba(255,255,255,.7)'; g.fillRect(x0, yy - hh, ww, 1);
          yy -= hh;
        });
        g.restore();
      }
      var bj = data.reglages.planning[(new Date((t + j) * DAY).getUTCDay() + 6) % 7];
      if (typeof bj === 'number' && !isNaN(bj) && bj <= mx) { var by2 = B - (B - T) * bj / mx; g.strokeStyle = 'rgba(92,21,48,.55)'; g.lineWidth = 2; g.beginPath(); g.moveTo(x0 - 3, by2); g.lineTo(x0 + ww + 3, by2); g.stroke(); }
      var dd = new Date((t + j) * DAY), cx = L0 + j * bw + bw / 2; g.textAlign = 'center';
      g.fillStyle = j === 0 ? '#7a1f3d' : '#a58593'; g.font = (j === 0 ? 'bold ' : '') + '8px system-ui'; g.fillText((j === 0 ? 'AUJ.' : JS[dd.getUTCDay()]).toUpperCase(), cx, B + 12);
      g.fillStyle = '#5c1530'; g.font = 'bold 10px system-ui'; g.fillText(String(dd.getUTCDate()), cx, B + 24);
      g.fillStyle = '#b79aa7'; g.font = '8px system-ui'; g.fillText(cnt[j] + ' ex.', cx, B + 35);
    }
  }

  /* ---------- vue : réglages ---------- */
  function numInput(val, cb, w) {
    var i = document.createElement('input'); i.type = 'number'; i.inputMode = 'numeric'; i.value = val === null || val === undefined || isNaN(val) ? '' : val;
    if (w) i.style.width = w; i.addEventListener('change', function () { cb(i.value === '' ? null : +i.value); save(); toast('Réglage enregistré.'); }); return i;
  }
  var SET_IC = {
    cal: '<rect x="3" y="4" width="18" height="17" rx="2"/><path d="M3 9h18M8 2v4M16 2v4"/>',
    flag: '<path d="M5 21V4M5 4h12l-2 4 2 4H5"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>'
  };
  function setCard(title, ic) {
    var c = el('div', 'scard'), h = el('div', 'sh'), ico = el('span', 'sico'); ico.innerHTML = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">' + SET_IC[ic] + '</svg>';
    h.appendChild(ico); h.appendChild(el('h2', '', title)); c.appendChild(h); return c;
  }
  function setRow(card, label, val, cb, unit, badge) {
    var r = el('label', 'srow'), l = el('span', 'sl');
    if (badge !== undefined) { var bd = el('i', 'sbadge', String(badge)); bd.style.background = scale(badge); bd.style.color = badge < 3.2 ? '#fff' : '#5c1530'; l.appendChild(bd); }
    l.appendChild(el('span', '', label)); r.appendChild(l);
    var f = el('span', 'sf'); f.appendChild(numInput(val, cb)); f.appendChild(el('em', '', unit)); r.appendChild(f); card.appendChild(r);
  }
  function renderSet() {
    var box = $('v-set'); box.textContent = ''; var R = data.reglages;
    var c1 = setCard('Intervalles de révision', 'cal');
    for (var n = 0; n < 6; n++) (function (n) {
      setRow(c1, NIV[n] + ' : prochaine révision dans', R.intervalles[n], function (v) { R.intervalles[n] = v === null ? 0 : v; }, 'jours', n);
    })(n);
    setRow(c1, 'Après un 5 : chaque 5 de plus d’affilée (note 6 = 2 fois 5 de suite, note 7 = 3 fois…) repousse la révision de', R.pasApres5, function (v) { R.pasApres5 = v === null ? 0 : v; }, 'jours');
    box.appendChild(c1);

    var cT = setCard('Thème', 'cal'), sw = el('div', 'seg'), cur = themeDeg();
    THEMES.forEach(function (t) {
      var b = el('button', cur[0] === t[0] ? 'on' : '', t[0]); b.type = 'button';
      var dot = el('i', 'tdot'); dot.style.filter = 'hue-rotate(' + (t[1] - cur[1]) + 'deg)'; b.insertBefore(dot, b.firstChild);
      b.addEventListener('click', function () { try { localStorage.setItem('mes-exercices-theme', t[0]); } catch (e) { /* ignoré */ } applyTheme(); render(); });
      sw.appendChild(b);
    });
    cT.appendChild(sw); box.appendChild(cT);

    var c2 = setCard('Mode examen', 'flag');
    [['Début du mode examen : jours avant l’examen', 'debutExam', 'jours'], ['Butoire : seuil — un exo fait plus de … jours avant l’examen est « tôt », sinon « tard »', 'seuilButoire', 'jours'], ['Butoire si fait tôt : ne plus réviser … jours avant l’examen', 'butoireSi', 'jours'], ['Butoire sinon (fait tard) : ne plus réviser … jours avant l’examen (0 ou 1 = jusqu’à la veille de l’examen)', 'butoireSinon', 'jours'], ['Minutes comptées par exo sans durée', 'minutesDefaut', 'min']].forEach(function (a) {
      setRow(c2, a[0], R[a[1]], function (v) { R[a[1]] = v === null ? 0 : v; }, a[2]);
    });
    box.appendChild(c2);

    var c3 = setCard('Planning de la semaine (minutes)', 'clock'), wk = el('div', 'week');
    JOURS.forEach(function (j, i) {
      var d = el('label', 'wday'); d.appendChild(el('b', '', j)); d.appendChild(numInput(R.planning[i], function (v) { R.planning[i] = v; })); d.appendChild(el('em', '', 'min')); wk.appendChild(d);
    });
    c3.appendChild(wk); box.appendChild(c3);
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
    if (!data.mats.length) { toast('Ajoute d’abord une matière (onglet Matières).'); return; }
    editingId = id; var x = id ? data.ex.filter(function (e) { return e.id === id; })[0] : null;
    $('editorTitle').textContent = x ? 'Modifier l’exercice' : 'Nouvel exercice';
    $('fSucces').textContent = ''; NIV.forEach(function (n, i) { var o = el('option', '', i + ' · ' + n); o.value = i; $('fSucces').appendChild(o); });
    fillSem(x ? x.semestre : (data.reglages.semestres[0] || null)); if (x) fillMat(x.matiere);
    $('fTitre').value = x ? x.intitule || '' : ''; $('fSucces').value = x ? x.succes : 3;
    $('fDate').value = x ? x.evalue : todayISO(); $('fMin').value = x && x.minutes ? x.minutes : ''; $('fNote').value = x && x.note ? x.note : '';
    $('delBtn').hidden = !x; $('editor').showModal();
  }
  function saveEditor(ev) {
    ev.preventDefault();
    var o = { intitule: $('fTitre').value.trim(), succes: +$('fSucces').value, semestre: $('fSem').value, matiere: $('fMat').value, minutes: $('fMin').value ? +$('fMin').value : null, evalue: $('fDate').value, note: $('fNote').value.trim() };
    if (!o.matiere || !o.evalue) { toast('Choisis une matière et une date.'); return; }
    if (editingId) { data.ex.forEach(function (x) { if (x.id === editingId) { if (x.succes !== o.succes) x.p5 = 0; Object.assign(x, o); } }); }
    else { o.id = newId(); data.ex.push(o); }
    save(); $('editor').close(); render(); toast('Exercice enregistré.');
  }
  function openDone(id) {
    doingId = id; var x = data.ex.filter(function (e) { return e.id === id; })[0]; if (!x) return;
    $('doneTitle').textContent = x.matiere + (x.intitule ? ' · ' + x.intitule : '');
    $('doneTxt').textContent = ''; $('doneMin').value = mins(x);
    var b = $('doneBtns'); b.textContent = '';
    NIV.forEach(function (n, i) {
      var bt = el('button', '', String(i)); bt.type = 'button'; bt.appendChild(el('small', '', n));
      bt.addEventListener('click', function () { addHist(x, i); x.succes = i; if (i < 5) x.p5 = 0; x.evalue = todayISO(); save(); $('doneDlg').close(); render(); toast('Prochaine révision : ' + fromNum(revision(x))); });
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
      out.ex.push({ id: newId() + rr, intitule: ti !== undefined && ti !== null ? String(ti) : '', succes: Math.max(0, Math.min(5, Math.round(suc))), p5: Math.round(suc) >= 5 ? Math.min(7, Math.round(suc) - 4) : 0, semestre: String(sem), matiere: String(mat), minutes: typeof mn === 'number' && mn > 0 ? mn : null, evalue: ev });
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
    out.ues = [];
    var un = keys.filter(function (k) { var n = norm(k); return n === 'ue' || n === 'ues'; })[0];
    if (un) {
      var U = sh[un], hh = {}, hrow = 0;
      for (var ur = 1; ur <= 10 && !hrow; ur++) { hh = {}; for (var uc = 1; uc <= 10; uc++) { var uv = U[ur + ',' + uc]; if (typeof uv === 'string') hh[norm(uv)] = uc; } if (hh['semestre'] && hh['ue']) hrow = ur; }
      if (hrow) for (var u2 = hrow + 1; u2 < hrow + 500; u2++) {
        var us = U[u2 + ',' + hh['semestre']], un2 = U[u2 + ',' + hh['ue']], um = U[u2 + ',' + (hh['moyenne /20'] || hh['moyenne'])];
        if (!us || !un2) { if (u2 > hrow + 60 && !us && !un2) break; continue; }
        out.ues.push({ semestre: String(us), nom: String(un2), moy: typeof um === 'number' ? um : null });
      }
    }
    Object.keys(seen).forEach(function (k) { if (!ex[k]) out.mats.push({ semestre: seen[k][0], nom: seen[k][1], examen: null }); });
    return out;
  }
  /* ---------- anciennes versions : on garde les 10 dernières ---------- */
  var VKEY = 'mes-exercices-versions', VMAX = 10;
  function versions() { try { var v = JSON.parse(localStorage.getItem(VKEY) || '[]'); return Array.isArray(v) ? v : []; } catch (e) { return []; } }
  function addVersion(label) {
    if (!data || !data.ex || !data.ex.length) return;
    var v = versions(), js = JSON.stringify(data);
    if (v.length && JSON.stringify(v[0].data) === js) return;
    v.unshift({ ts: Date.now(), label: label, data: JSON.parse(js) }); v = v.slice(0, VMAX);
    while (v.length) { try { localStorage.setItem(VKEY, JSON.stringify(v)); break; } catch (e) { v.pop(); } }
    versLabel();
  }
  function versLabel() { var b = $('versBtn'); if (b) b.textContent = 'Restaurer une ancienne sauvegarde (' + versions().length + ')'; }
  function fmtTs(t) { var d = new Date(t); return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' }) + ' à ' + d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }); }
  function openVersions() {
    var box = $('versList'); box.textContent = ''; var v = versions();
    if (!v.length) box.appendChild(el('p', 'muted', 'Pas encore d’ancienne version. Elles se créent avant chaque import, chaque restauration, chaque mise à jour depuis le Drive, et une fois par jour.'));
    v.forEach(function (o) {
      var c = el('div', 'card'), t = el('div'); t.appendChild(el('b', '', fmtTs(o.ts))); t.appendChild(el('div', 'muted', o.label + ' · ' + o.data.ex.length + ' exercices'));
      var r = el('button', 'plain', 'Revenir à cette version'); r.type = 'button'; r.style.marginTop = '8px';
      r.addEventListener('click', function () { addVersion('Avant retour en arrière'); data = fix(JSON.parse(JSON.stringify(o.data))); save(); $('versDlg').close(); render(); toast('Version du ' + fmtTs(o.ts) + ' rétablie.'); });
      c.appendChild(t); c.appendChild(r); box.appendChild(c);
    });
    $('menu').close(); $('versDlg').showModal();
  }
  function importSheetFile(f) {
    var isCsv = /\.csv$/i.test(f.name), r = new FileReader();
    r.onerror = function () { toast('Impossible de lire ce fichier.'); };
    r.onload = function () {
      var p = isCsv ? Promise.resolve(parseCsv(new TextDecoder().decode(r.result))) : readXlsx(r.result);
      p.then(importSheets).then(function (out) {
        if (!out.ex.length) { toast('Aucun exercice trouvé : il faut les colonnes Succès, Semestre, Matière et Evalué le.'); return; }
        if (data.ex.length && !window.confirm('Remplacer les ' + data.ex.length + ' exercices actuels par les ' + out.ex.length + ' du tableur ?')) return;
        addVersion('Avant import Excel'); data = fix(out); save(); view = 'today'; render(); toast(out.ex.length + ' exercices importés. (Menu ⋮ : Anciennes versions pour revenir en arrière)');
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
    r.onload = function () { try { var nd = fix(JSON.parse(r.result)); addVersion('Avant restauration'); data = nd; save(); render(); toast('Sauvegarde restaurée (' + data.ex.length + ' exercices). (Menu ⋮ : Anciennes versions pour revenir en arrière)'); } catch (e) { toast('Ce fichier n’est pas une sauvegarde valide.'); } };
    r.readAsText(f);
  }
  var SYNC_KEY = 'mes-exercices-synchro-adresse';
  function syncUrl() { try { return localStorage.getItem(SYNC_KEY) || ''; } catch (e) { return ''; } }
  function askSyncUrl() {
    var u = window.prompt('Colle ici l’adresse de ton application web Apps Script (elle finit par /exec) :', syncUrl()); if (u === null) return '';
    u = u.trim(); try { localStorage.setItem(SYNC_KEY, u); } catch (e) { /* ignoré */ } return u;
  }
  var syncBusy = false, syncTimer = null;
  /* fusion de deux sauvegardes : on garde tout ce qui existe d'un côté ou de l'autre */
  function mergeData(A, B, aNewer) {
    var base = JSON.parse(JSON.stringify(aNewer ? A : B)), oth = JSON.parse(JSON.stringify(aNewer ? B : A));
    var ex = {}; (base.ex || []).forEach(function (x) { ex[x.id] = x; });
    (oth.ex || []).forEach(function (x) {
      var y = ex[x.id]; if (!y) { base.ex.push(x); return; }
      if ((x.evalue || '') > (y.evalue || '')) { var k = base.ex.indexOf(y); base.ex[k] = x; }
    });
    var seen = {}; base.hist = base.hist || []; base.hist.forEach(function (h) { seen[h.id + '|' + h.ts] = 1; });
    (oth.hist || []).forEach(function (h) { if (!seen[h.id + '|' + h.ts]) { seen[h.id + '|' + h.ts] = 1; base.hist.push(h); } });
    base.hist.sort(function (a, b) { return a.ts - b.ts; });
    var cs = {}; base.corbeille = base.corbeille || []; base.corbeille.forEach(function (c) { cs[c.ex.id + '|' + c.ts] = 1; });
    (oth.corbeille || []).forEach(function (c) { if (c && c.ex && !cs[c.ex.id + '|' + c.ts]) { cs[c.ex.id + '|' + c.ts] = 1; base.corbeille.push(c); } });
    base.ex = (base.ex || []).filter(function (x) { return !base.corbeille.some(function (c) { return c.ex.id === x.id; }); });
    var mm = {}; (base.mats || []).forEach(function (m) { mm[m.semestre + '|' + m.nom] = m; });
    (oth.mats || []).forEach(function (m) { var y = mm[m.semestre + '|' + m.nom]; if (!y) { base.mats.push(m); return; } Object.keys(m).forEach(function (k) { if ((y[k] === undefined || y[k] === '' || y[k] === null) && m[k] !== undefined) y[k] = m[k]; }); });
    var uu = {}; base.ues = base.ues || []; base.ues.forEach(function (u) { uu[u.semestre + '|' + u.nom] = 1; });
    (oth.ues || []).forEach(function (u) { if (!uu[u.semestre + '|' + u.nom]) base.ues.push(u); });
    return base;
  }
  function syncLabel() {
    var b = $('syncBtn'); if (!b) return; var t = 0; try { t = Number(localStorage.getItem(KEY + '-syncts') || 0); } catch (e) { /* ignoré */ }
    b.textContent = 'Synchroniser avec mon Drive';
    var sm = el('small', '', t ? 'Dernière sauvegarde : ' + new Date(t).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' }) + ' à ' + new Date(t).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) : 'Pas encore de sauvegarde'); sm.style.display = 'block'; sm.style.fontWeight = '400'; sm.style.fontSize = '.66rem'; sm.style.opacity = '.75'; sm.style.marginTop = '2px'; b.appendChild(sm);
  }
  function syncCore(url, silent) {
    if (syncBusy) return; syncBusy = true;
    if (!silent) toast('Synchronisation en cours…');
    var localUpd = Number(localStorage.getItem(KEY + '-modif') || 0);
    fetch(url + (url.indexOf('?') < 0 ? '?' : '&') + 't=' + Date.now()).then(function (r) { if (!r.ok) throw new Error('http' + r.status); return r.text(); }).then(function (txt) { var remote; try { remote = JSON.parse(txt); } catch (e) { throw new Error('pasjson'); } return remote; }).then(function (remote) {
      var rUpd = Number(remote && remote.updated || 0), lastSync = Number(localStorage.getItem(KEY + '-sync') || 0);
      function post(upd) { return fetch(url, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify({ updated: upd, data: data }) }).then(function (r) { return r.json(); }).then(function () { try { localStorage.setItem(KEY + '-sync', String(upd)); } catch (e) { /* ignoré */ } }); }
      if (remote && remote.data && rUpd > lastSync && localUpd > lastSync && rUpd !== localUpd) {
        addVersion('Avant fusion avec le Drive'); var now = Date.now(); data = fix(mergeData(data, remote.data, localUpd >= rUpd));
        try { localStorage.setItem(KEY, JSON.stringify(data)); localStorage.setItem(KEY + '-modif', String(now)); } catch (e) { /* ignoré */ }
        render(); return post(now).then(function () { toast('Fusionné avec ton Drive : rien n’a été perdu.'); });
      } else if (remote && remote.data && rUpd > localUpd) {
        addVersion('Avant mise à jour depuis le Drive'); data = fix(remote.data); try { localStorage.setItem(KEY, JSON.stringify(data)); localStorage.setItem(KEY + '-modif', String(rUpd)); localStorage.setItem(KEY + '-sync', String(rUpd)); } catch (e) { /* ignoré */ }
        render(); toast('Exercices mis à jour depuis ton Drive.');
      } else if (localUpd > rUpd) {
        return post(localUpd).then(function () { if (!silent) toast('Exercices envoyés vers ton Drive.'); });
      } else { try { localStorage.setItem(KEY + '-sync', String(localUpd)); } catch (e) { /* ignoré */ } if (!silent) toast('Déjà à jour.'); }
    }).then(function () { try { localStorage.setItem(KEY + '-syncts', String(Date.now())); } catch (e) { /* ignoré */ } syncLabel(); }).catch(function (e) { if (!silent) toast(e && e.message === 'pasjson' ? 'L’adresse répond mais pas comme prévu : dans Apps Script, « Qui a accès » doit être « Tout le monde », et l’adresse finir par /exec.' : e && /^http/.test(e.message || '') ? 'Adresse refusée (' + e.message.slice(4) + ') : vérifie qu’elle finit par /exec.' : 'Pas de réponse : vérifie la connexion et l’adresse /exec.'); })
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
    renderFilters(); document.body.classList.toggle('wide', view === 'dash' || view === 'set');
    ['today', 'exos', 'mats', 'dash', 'set'].forEach(function (v) { $('v-' + v).hidden = v !== view; });
    document.querySelectorAll('#tabs button').forEach(function (b) { b.setAttribute('aria-pressed', b.dataset.view === view ? 'true' : 'false'); });
    $('addBtn').hidden = view !== 'exos';
    if (view === 'today') renderToday(); else if (view === 'exos') renderExos(); else if (view === 'mats') renderMats(); else if (view === 'dash') renderDash(); else renderSet();
  }

  /* garde la position de défilement (page, listes, graphiques, grille) quand on change un filtre ou un affichage */
  ['renderToday', 'renderExos', 'renderMats', 'renderDash', 'renderSet'].forEach(function (nm) {
    var orig = eval(nm);
    var wrapped = function () {
      var y = window._top ? 0 : window.scrollY; window._top = 0; var sel = '.scrollx, .mlist, .mscroll', els = Array.prototype.slice.call(document.querySelectorAll(sel)), pos = els.map(function (e) { return [e.scrollLeft, e.scrollTop]; });
      var hab = document.querySelector('.habit .scrollx'); window._hk = hab ? hab.scrollLeft : null;
      var r = orig.apply(this, arguments);
      var els2 = document.querySelectorAll(sel); if (els2.length === els.length) Array.prototype.forEach.call(els2, function (e, i) { e.scrollLeft = pos[i][0]; e.scrollTop = pos[i][1]; });
      window.scrollTo(0, y); var tries = 0, touched = false, stop = function () { touched = true; };
      window.addEventListener('touchstart', stop, { once: true, passive: true }); window.addEventListener('wheel', stop, { once: true, passive: true });
      var iv = setInterval(function () { tries++; window._hk = null; if (!touched && Math.abs(window.scrollY - y) > 2) window.scrollTo(0, y); if (touched || tries > 12) clearInterval(iv); }, 40);
      return r;
    };
    if (nm === 'renderToday') renderToday = wrapped; else if (nm === 'renderExos') renderExos = wrapped; else if (nm === 'renderMats') renderMats = wrapped; else if (nm === 'renderDash') renderDash = wrapped; else renderSet = wrapped;
  });

  load();
  document.querySelectorAll('#tabs button').forEach(function (b) { b.addEventListener('click', function () { try { if (navigator.vibrate) navigator.vibrate(8); } catch (e) { /* sans vibration */ } view = b.dataset.view; try { localStorage.setItem('mes-exercices-onglet', view); } catch (e) { /* tant pis */ } shown = 120; window._top = 1; render(); window.scrollTo(0, 0); }); });
  $('addBtn').addEventListener('click', function () { openEditor(null); });
  $('search').addEventListener('input', function () { shown = 120; renderExos(); });
  $('menuBtn').addEventListener('click', function () { $('ver').textContent = 'Version 122'; syncLabel(); $('menu').showModal(); });
  $('closeMenu').addEventListener('click', function () { $('menu').close(); });
  $('syncBtn').addEventListener('click', function () { $('menu').close(); syncNow(false); });
  $('syncUrlBtn').addEventListener('click', function () { $('menu').close(); syncNow(true); });
  $('exportBtn').addEventListener('click', function () { $('menu').close(); exportFile(); });
  $('versBtn').addEventListener('click', openVersions);
  $('versFile').addEventListener('click', function () { $('versDlg').close(); $('sheetInput').click(); });
  $('versClose').addEventListener('click', function () { $('versDlg').close(); });
  $('menuBtn').addEventListener('click', versLabel);
  (function () { var v = versions(); if (!v.length || new Date(v[0].ts).toDateString() !== new Date().toDateString()) addVersion('Automatique (début de journée)'); })();
  /* bouton Retour d'Android : ferme la fenêtre ouverte, puis revient à À faire, au lieu de quitter l'appli */
  try {
    history.pushState({ a: 1 }, '');
    window.addEventListener('popstate', function () {
      var open = document.querySelector('dialog[open]');
      if (open) { open.close(); history.pushState({ a: 1 }, ''); return; }
      if (view !== 'today') { view = 'today'; try { localStorage.setItem('mes-exercices-onglet', view); } catch (e) { /* tant pis */ } window._top = 1; render(); window.scrollTo(0, 0); history.pushState({ a: 1 }, ''); }
    });
  } catch (e) { /* ignoré */ }
  $('importSheet').addEventListener('click', function () { $('sheetInput').click(); });
  $('sheetInput').addEventListener('change', function (e) { var f = e.target.files[0]; if (f) { $('menu').close(); if (/\.json$/i.test(f.name)) importBackup(f); else importSheetFile(f); } e.target.value = ''; });
  $('form').addEventListener('submit', saveEditor);
  $('fSem').addEventListener('change', function () { fillMat(); });
  $('cancelBtn').addEventListener('click', function () { $('editor').close(); });
  $('delBtn').addEventListener('click', function () { var gone = data.ex.filter(function (x) { return x.id === editingId; })[0]; if (gone) { data.corbeille = data.corbeille || []; data.corbeille.push({ ts: Date.now(), ex: gone }); } data.ex = data.ex.filter(function (x) { return x.id !== editingId; }); save(); $('editor').close(); render(); toast('Exercice supprimé.'); });
  $('doneCancel').addEventListener('click', function () { $('doneDlg').close(); });
  window.addEventListener('resize', function () { if (view === 'dash') renderDash(); });
  render();
  syncAuto();
  document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'visible') syncAuto(); });
  window.addEventListener('online', syncAuto);
  if ('serviceWorker' in navigator) {
    var hadSW = !!navigator.serviceWorker.controller;
    navigator.serviceWorker.register('sw.js').catch(function () { /* hors ligne non dispo */ });
    navigator.serviceWorker.addEventListener('controllerchange', function () { if (hadSW) location.reload(); });
  }
})();
