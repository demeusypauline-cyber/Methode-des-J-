(function () {
  'use strict';
  var KEY = 'mes-exercices-v1';
  var DAY = 86400000;
  var THEMES = [['Bordeaux', 0, '#ad1457'], ['Bleu', -125, '#1f4d7a'], ['Vert', 175, '#1f7a4d'], ['Violet', -70, '#5a1f7a']];
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
  var view = (function () { try { if (!sessionStorage.getItem('mes-exercices-sess')) { sessionStorage.setItem('mes-exercices-sess', '1'); return 'dash'; } } catch (e) { /* ignoré */ } try { var v = localStorage.getItem('mes-exercices-onglet'); return ['dash', 'today', 'exos', 'mats', 'set'].indexOf(v) >= 0 ? v : 'today'; } catch (e) { return 'today'; } })(), editingId = null, doingId = null, shown = 120;

  function $(id) { return document.getElementById(id); }
  function el(tag, cls, txt) { var e = document.createElement(tag); if (cls) e.className = cls; if (txt !== undefined) e.textContent = txt; return e; }
  function toast(m, undo) {
    var t = $('toast'); t.textContent = m;
    if (undo) { var b = el('button', 'tundo', 'Annuler'); b.type = 'button'; b.addEventListener('click', function () { t.className = ''; undo(); }); t.appendChild(b); }
    t.className = 'on' + (undo ? ' act' : ''); clearTimeout(toast.t); toast.t = setTimeout(function () { t.className = ''; }, undo ? 6000 : 2800);
  }
  /* fenêtre maison à la place de prompt/confirm : o = { t: titre, p: texte, v: valeur (champ affiché si défini), ok, danger } */
  function ask(o, cb) {
    var i = $('askI'); $('askT').textContent = o.t || ''; $('askP').textContent = o.p || ''; $('askP').hidden = !o.p;
    i.hidden = o.v === undefined; i.value = o.v || ''; i.placeholder = o.ph || ''; $('askOk').textContent = o.ok || 'OK'; $('askOk').className = o.danger ? 'danger' : 'primary';
    ask.cb = cb; $('askDlg').showModal(); if (!i.hidden) setTimeout(function () { i.focus(); i.select(); }, 50);
  }
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
    var hasH = {}; (Array.isArray(d.hist) ? d.hist : []).forEach(function (h) { hasH[h.id] = 1; });
    if (Array.isArray(d.ex)) { if (!Array.isArray(d.hist)) d.hist = []; /* révisions importées : on fige leur durée dans l'historique */
      d.ex.forEach(function (x) { if (x.evalue && !x.ajoute && !hasH[x.id]) { d.hist.push({ id: x.id, ts: dnum(x.evalue) * DAY, jour: x.evalue, avant: { succes: x.succes || 0, evalue: '' }, niveau: x.succes || 0, m: x.minutes > 0 ? +x.minutes : r.minutesDefaut, fige: 1 }); hasH[x.id] = 1; } }); }
    (function () { var cnt = {}; d.hist.sort(function (a, b) { return a.ts - b.ts; }).forEach(function (h) { if (!h.jour) return; var k = h.id + '|' + h.jour, n = cnt[k] || 0; cnt[k] = n + 1; h.ts = dnum(h.jour) * DAY + n; }); d.ex.forEach(function (x) { if (x.cree) x.cree = Math.floor(x.cree / DAY) * DAY; }); })();
    (function () { var by = {}; d.hist.sort(function (a, b) { return a.ts - b.ts; }).forEach(function (h) { (by[h.id] = by[h.id] || []).push(h); });
      Object.keys(by).forEach(function (id) { var run = 0; by[id].forEach(function (h) { if (h.avant && (h.avant.succes || 0) >= 5) h.avant.succes = run <= 1 ? 5 : 4 + run; run = h.niveau >= 5 ? run + 1 : 0; }); }); })();
    return { ex: Array.isArray(d.ex) ? d.ex : [], mats: Array.isArray(d.mats) ? d.mats : [], hist: Array.isArray(d.hist) ? d.hist : [], jours: d.jours && typeof d.jours === 'object' ? d.jours : {}, ues: Array.isArray(d.ues) ? d.ues : [], corbeille: Array.isArray(d.corbeille) ? d.corbeille : [], chronos: d.chronos && typeof d.chronos === 'object' ? d.chronos : {}, renoms: Array.isArray(d.renoms) ? d.renoms : [], matsSuppr: Array.isArray(d.matsSuppr) ? d.matsSuppr : [], reglages: r };
  }
  function load() { try { var raw = localStorage.getItem(KEY); if (raw) data = fix(JSON.parse(raw)); } catch (e) { /* départ à vide */ } }
  function save() {
    resetCaches(); try { localStorage.setItem(KEY, JSON.stringify(data)); localStorage.setItem(KEY + '-modif', String(Date.now())); syncSoon(); return true; }
    catch (e) { toast('Impossible d’enregistrer (stockage plein ou bloqué).'); return false; }
  }

  /* ---------- tes règles de révision (reprises de ton Excel) ---------- */
  /* caches remis à zéro à chaque enregistrement et à chaque affichage */
  var EXC = null, LVC = null;
  function resetCaches() { EXC = null; LVC = null; DEFC = null; }
  function examNum(sem, mat) {
    if (!EXC) { EXC = {}; data.mats.forEach(function (m) { var k = m.semestre + '|' + m.nom; if (!(k in EXC)) EXC[k] = m.examen ? dnum(m.examen) : null; }); }
    var k = sem + '|' + mat; return k in EXC ? EXC[k] : null;
  }
  /* niveau réel : 5 = maîtrise ; 6, 7… = plusieurs 5 d'affilée, déduits de l'historique */
  function runOf(id, hs) {
    var mine = (hs || []).filter(function (h) { return h.id === id; }).sort(function (a, b) { return a.ts - b.ts; }), run = 0, i;
    for (i = mine.length - 1; i >= 0; i--) { if (mine[i].niveau >= 5) run++; else break; }
    return { run: run, all: i < 0 };
  }
  function lvl(x) {
    var s = x.succes || 0; if (s < 5) return s;
    LVC = LVC || {}; var ck = x.id + '|' + s + '|' + (x.p5 || 0) + '|' + (data.hist || []).length; if (ck in LVC) return LVC[ck];
    return (LVC[ck] = lvlRaw(x, s));
  }
  function lvlRaw(x, s) {
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
  function revisionAt(x, I, iv, asOf) { return Math.floor(revisionRaw(x, I, iv, asOf) + 1e-9); } /* toujours un jour entier, arrondi à l'inférieur */
  /* asOf : jour où l'on regarde ; une fois l'examen passé, l'exo revient aux intervalles normaux */
  function revisionRaw(x, I, iv, asOf) {
    var R = data.reglages, E = examNum(x.semestre, x.matiere);
    if (E !== null && !(asOf !== undefined && E < asOf)) {
      var dE = E - I;
      if (dE >= 0 && dE <= R.debutExam) {
        if (iv >= interval(5) && I + iv > E) return I + iv; /* niveau 5 ou plus : sa révision normale tombe après l'examen, donc hors mode examen */
        var X = Math.max(1, dE > R.seuilButoire ? R.butoireSi : R.butoireSinon); /* au plus tard la veille de l'examen */
        var plafond = dE > X ? dE - X : 1e9;
        return I + Math.min(iv / interval(5) * (dE - X), plafond);
      }
    }
    return I + iv;
  }
  /* jamais le jour même : au plus tôt le lendemain de la dernière révision */
  function revision(x) { if (x.ajoute) return TODAY(); var I = dnum(x.evalue); return Math.max(revisionAt(x, I, interval(lvl(x)), TODAY()), I + 1); }
  /* niveau réel qu'aurait l'exo s'il recevait la note n aujourd'hui (même calcul que lvl, sur un historique simulé) */
  function lvlIf(x, n) {
    var h = data.hist = data.hist || [], s = x.succes, p = x.p5, a = x.ajoute; h.push({ id: x.id, ts: 1e18, niveau: n }); x.succes = n; if (n < 5) x.p5 = 0; delete x.ajoute;
    var r; try { r = lvl(x); } finally { h.pop(); x.succes = s; x.p5 = p; if (a) x.ajoute = a; LVC = null; }
    return r;
  }
  /* date de la prochaine révision si l'exo recevait la note n aujourd'hui */
  function revisionIf(x, n) { var t = TODAY(); return Math.max(revisionAt(x, t, interval(lvlIf(x, n)), t), t + 1); }
  function prio(x) { return x.ajoute ? 3 : lvl(x); }
  function examAt(x, D) { var E = examNum(x.semestre, x.matiere); if (E === null) return false; var d = E - D; return d >= 0 && d <= data.reglages.debutExam; }
  function modeExam(x) {
    var E = examNum(x.semestre, x.matiere); if (E === null) return false;
    var d = E - TODAY(); return d >= 0 && d <= data.reglages.debutExam;
  }
  function mins(x) { return x.minutes > 0 ? +x.minutes : data.reglages.minutesDefaut; }
  function matOk(nom) { var m = data.reglages.matieres; return !m || !m.length || m.indexOf(norm(nom).trim()) >= 0; }
  function visible(x) { var s = data.reglages.semestres; return (!s.length || s.indexOf(x.semestre) >= 0) && matOk(x.matiere); }
  function budgetDuJour() {
    var d = new Date(), v = data.reglages.planning[(d.getDay() + 6) % 7];
    return typeof v === 'number' && !isNaN(v) ? v : 1e9;
  }
  /* sans limite : aujourd'hui on ne peut pas dépasser les heures restantes jusqu'à demain, arrondies à l'heure supérieure */
  function minutesRestantes() { var n = new Date(), m = (24 * 60) - (n.getHours() * 60 + n.getMinutes()); return Math.max(60, Math.ceil(m / 60) * 60); }
  /* temps déjà fait aujourd'hui : chaque séance du jour de l'historique, avec sa durée réelle ; anciennes données sans séance : durée de l'exo */
  function dejaFait() {
    var t = todayISO(), s = 0, vu = {}, byId = {}; data.ex.forEach(function (x) { byId[x.id] = x; });
    (data.hist || []).forEach(function (h) { var x = byId[h.id]; if (h.jour !== t || !x || !visible(x)) return; vu[h.id] = 1; s += h.m > 0 ? h.m : mins(x); });
    data.ex.forEach(function (x) { if (x.evalue === t && visible(x) && !x.ajoute && !vu[x.id]) s += mins(x); });
    return s;
  }
  /* retard d'une matière sur l'objectif du jour (même repère que la barre des cartes d'examen) : plus il est grand, plus la matière est prioritaire */
  var DEFC = null, SIMD = null; /* SIMD : jour simulé par la prévision de charge (sinon aujourd'hui) */
  function exDef(x) {
    var D = SIMD === null ? TODAY() : SIMD;
    DEFC = DEFC || {}; var k = x.semestre + '|' + x.matiere + '|' + D; if (k in DEFC) return DEFC[k];
    var E = examNum(x.semestre, x.matiere), v = 0;
    if (E !== null) {
      var R = data.reglages, J = E - D, X = Math.max(1, J > R.seuilButoire ? R.butoireSi : R.butoireSinon), need = Math.max(0, Math.min(5, 5 * (1 - Math.max(0, J - X) / Math.max(1, R.debutExam))));
      var es = data.ex.filter(function (z) { return z.semestre === x.semestre && z.matiere === x.matiere && z.evalue && !z.ajoute; });
      v = need - (es.length ? mean(es.map(effLvl)) : 0);
    }
    return (DEFC[k] = v);
  }
  function cmpPrio(a, b) {
    if (!!a.ex !== !!b.ex) return a.ex ? -1 : 1;
    var la = a.v ? a.L : prio(a.x), lb = b.v ? b.L : prio(b.x);
    if (a.ex) { var da = exDef(a.x), db = exDef(b.x); if (Math.abs(da - db) > 1e-9) return db - da; if (la !== lb) return la - lb; if (Math.abs(a.r - b.r) >= 0.1) return a.r - b.r; }
    else { if (Math.abs(a.r - b.r) >= 0.1) return a.r - b.r; if (la !== lb) return la - lb; }
    if (!!a.v !== !!b.v) return a.v ? 1 : -1;
    return (a.i + '' === a.i ? 0 : a.i) - (b.i + '' === b.i ? 0 : b.i);
  }
  function plan() {
    var t = TODAY(), list = [];
    data.ex.forEach(function (x, i) {
      if (!visible(x) || !x.evalue) return;
      if (examNum(x.semestre, x.matiere) === t) return; /* jour de l'examen : rien à réviser dans cette matière */
      var r = revision(x);
      if (r < t + 1) list.push({ x: x, r: r, ex: modeExam(x), i: i });
    });
    list.sort(cmpPrio);
    var budget = budgetDuJour(), fait = dejaFait(), cum = 0, eff = budget, ef = fait; if (budget >= 1e9) { eff = minutesRestantes(); ef = 0; }
    list.forEach(function (o) {
      var m = mins(o.x);
      if (o.x.reporte === todayISO()) { o.rep = true; o.in = false; return; } /* reporté par toi : ne prend pas de temps aujourd'hui */
      o.in = cum + m <= eff - ef || (cum === 0 && eff > ef);
      if (o.in) cum += m; /* un exo qui ne rentre pas est reporté ; un plus court peut prendre sa place */
    });
    if (budget < 1e9) { /* budget de demain dépassé : on avance à aujourd'hui ce qui est prévu demain, s'il reste de la place */
      var bT = data.reglages.planning[(new Date().getDay() + 1 + 6) % 7];
      if (typeof bT === 'number' && !isNaN(bT) && bT > 0) {
        var q = list.filter(function (o) { return !o.in && !o.rep; }), early = [];
        data.ex.forEach(function (x, i) { if (!visible(x) || !x.evalue) return; var r = revision(x); if (r >= t + 1 && r < t + 2) { var o = { x: x, r: r, ex: modeExam(x), i: i }; q.push(o); early.push(o); } });
        q.sort(cmpPrio);
        var cT = 0, ovf = []; q.forEach(function (o) { var m = mins(o.x); if (cT + m <= bT || cT === 0) cT += m; else ovf.push(o); });
        ovf.forEach(function (o) { var m = mins(o.x); if (early.indexOf(o) >= 0 && cum + m <= eff - ef) { o.in = true; o.early = true; cum += m; list.push(o); } });
      }
    }
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
  /* matières proposées : celles des semestres cochés (ou de tous), fusionnées par nom */
  function matChoices() {
    var ss = data.reglages.semestres, seen = {}, out = [];
    data.mats.forEach(function (m) { if (ss.length && ss.indexOf(m.semestre) < 0) return; var k = norm(m.nom).trim(); if (!seen[k]) { seen[k] = 1; out.push({ k: k, nom: m.nom }); } });
    return out.sort(function (a, b) { return a.nom.localeCompare(b.nom, 'fr', { sensitivity: 'base' }); });
  }
  function matClean() { var ok = matChoices().map(function (m) { return m.k; }); data.reglages.matieres = (data.reglages.matieres || []).filter(function (k) { return ok.indexOf(k) >= 0; }); }
  function renderFilters() {
    matClean();
    if (view !== 'dash') Array.prototype.slice.call(document.querySelectorAll('.hbtns .editbtn, header .hh')).forEach(function (n) { n.remove(); });
    var box = $('filtBox'); box.textContent = ''; var fb = $('filtBtn'), all = semestres();
    if (view === 'set') { fb.hidden = true; return; }
    var hasMat = matChoices().length > 1; fb.hidden = (view === 'set' || (all.length < 2 && !hasMat)); fb.querySelector('.fdot').hidden = !(data.reglages.semestres.length || (data.reglages.matieres || []).length); fb.classList.toggle('on', !fb.querySelector('.fdot').hidden);
    var mbox = $('filtMat'); mbox.textContent = ''; $('filtMatT').hidden = !hasMat;
    if (hasMat) matChoices().forEach(function (m) {
      var b = el('button', 'chip', m.nom); b.type = 'button'; b.setAttribute('aria-pressed', (data.reglages.matieres || []).indexOf(m.k) >= 0 ? 'true' : 'false');
      b.addEventListener('click', function () { var a = data.reglages.matieres = data.reglages.matieres || [], k = a.indexOf(m.k); if (k >= 0) a.splice(k, 1); else a.push(m.k); save(); render(); });
      mbox.appendChild(b);
    });
    all.forEach(function (s) {
      var b = el('button', 'chip', s); b.type = 'button';
      b.setAttribute('aria-pressed', data.reglages.semestres.indexOf(s) >= 0 ? 'true' : 'false');
      b.addEventListener('click', function () {
        var a = data.reglages.semestres, k = a.indexOf(s);
        if (k >= 0) a.splice(k, 1); else a.push(s);
        matClean(); save(); render();
      });
      box.appendChild(b);
    });
  }

  /* ---------- vue : à faire aujourd'hui ---------- */
  /* ---------- chronomètre par exercice ---------- */
  var CHK = 'mes-exercices-chrono';
  /* les chronos font partie des données : ils suivent donc la synchronisation entre appareils */
  function chMigrer() { try { var o = JSON.parse(localStorage.getItem(CHK) || 'null'); if (o && typeof o === 'object') { data.chronos = data.chronos || {}; Object.keys(o).forEach(function (id) { if (!data.chronos[id]) data.chronos[id] = { acc: o[id].acc || 0, start: o[id].start || null, t: Date.now() }; }); localStorage.removeItem(CHK); save(); } } catch (e) { /* ignoré */ } }
  function chGetAll() { var r = {}, st = data.chronos || {}; Object.keys(st).forEach(function (id) { var c = st[id]; if (c && !c.gone) r[id] = { acc: c.acc || 0, start: c.start || null }; }); return r; }
  function chSetAll(o) {
    data.chronos = data.chronos || {}; var st = data.chronos, now = Date.now();
    Object.keys(o).forEach(function (id) { var c = st[id], n = o[id]; if (!c || c.gone || (c.acc || 0) !== (n.acc || 0) || (c.start || null) !== (n.start || null)) st[id] = { acc: n.acc || 0, start: n.start || null, t: now }; });
    Object.keys(st).forEach(function (id) { if (!st[id].gone && !o[id]) st[id] = { gone: 1, t: now }; });
    save();
  }
  function chMs(c) { return c ? (c.acc || 0) + (c.start ? Date.now() - c.start : 0) : 0; }
  function chFmt(ms) { var t = Math.floor(ms / 1000), h = Math.floor(t / 3600), m = Math.floor(t % 3600 / 60), sec = t % 60; return (h ? h + ':' + ('0' + m).slice(-2) : ('0' + m).slice(-2)) + ':' + ('0' + sec).slice(-2); }
  var CHI = { watch: '<circle cx="12" cy="13.5" r="7.5"/><path d="M12 9.5v4l2.5 1.5M9.5 3h5M12 3v3M18.2 6.8l1.2-1.2"/>', pause: '<path d="M9 6v12M15 6v12"/>', play: '<path d="M8 5.5v13l10-6.5Z"/>', x: '<path d="M7 7l10 10M17 7L7 17"/>', check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>', skip: '<path d="M5 12h12M13 7l5 5-5 5"/>', back: '<path d="M19 12H7M11 7l-5 5 5 5"/>' };
  function chSvg(n, sz) { var i = document.createElement('i'); i.className = 'chi'; i.innerHTML = '<svg viewBox="0 0 24 24" width="' + sz + '" height="' + sz + '" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' + CHI[n] + '</svg>'; return i; }
  function chShow(id, ms) { var x = data.ex.filter(function (e) { return e.id === id; })[0], left = (x ? mins(x) : 0) * 60000 - ms; return left >= 0 ? { t: chFmt(left), over: false } : { t: '+' + chFmt(-left), over: true }; }
  function chronoEl(id) {
    var box = el('div', 'chrono'), all = chGetAll(), c = all[id];
    function redo() { var n = chronoEl(id); box.replaceWith(n); }
    if (!c) {
      var b = el('button', 'chgo'); b.type = 'button'; b.appendChild(chSvg('watch', 14)); b.appendChild(document.createTextNode(chShow(id, 0).t)); b.title = 'Minuteur';
      b.addEventListener('click', function (e) { e.stopPropagation(); var a = chGetAll(); a[id] = { acc: 0, start: Date.now() }; chSetAll(a); redo(); });
      box.appendChild(b); return box;
    }
    var sh = chShow(id, chMs(c)); box.className = 'chrono on' + (c.start ? ' run' : '') + (sh.over ? ' over' : '');
    var t = el('span', 'chtime', sh.t); t.dataset.chid = id; box.appendChild(chSvg('watch', 14)); box.appendChild(t);
    var pb = el('button', 'chpp'); pb.type = 'button'; pb.title = c.start ? 'Pause' : 'Reprendre'; pb.appendChild(chSvg(c.start ? 'pause' : 'play', 12));
    pb.addEventListener('click', function (e) { e.stopPropagation(); var a = chGetAll(), k = a[id]; if (!k) return; if (k.start) { k.acc = chMs(k); k.start = null; } else k.start = Date.now(); chSetAll(a); redo(); });
    var xb = el('button', 'chx'); xb.type = 'button'; xb.title = 'Remettre à zéro'; xb.appendChild(chSvg('x', 10));
    xb.addEventListener('click', function (e) { e.stopPropagation(); var a = chGetAll(), c0 = a[id]; delete a[id]; chSetAll(a); redo();
      toast('Minuteur remis à zéro.', function () { var b = chGetAll(); if (b[id]) return; b[id] = c0; chSetAll(b); render(); }); });
    box.appendChild(pb); box.appendChild(xb); return box;
  }
  setInterval(function () { var all = chGetAll(); document.querySelectorAll('.chtime').forEach(function (n) { var c = all[n.dataset.chid]; if (c && c.start) { var sh = chShow(n.dataset.chid, chMs(c)); n.textContent = sh.t; if (n.parentNode) n.parentNode.classList.toggle('over', sh.over); } }); }, 1000);

  function exoCard(o, withBtn) {
    var x = o.x, c = el('div', 'card' + (o.ex ? ' exam' : ''));
    var top = el('div', 'row2');
    var lx = lvl(x), ef = x.ajoute ? lx : effLvl(x), nb = el('div', 'niv', x.ajoute ? 'A' : fmt1(ef)); nb.style.background = scale(ef); nb.style.color = ef < 3 ? '#fff' : '#5c1530'; nb.title = x.ajoute ? 'Ajouté : pas encore de note' : 'Note effective (avec le retard) · ' + nivName(lx);
    var l = el('div'); l.style.flex = '1'; l.appendChild(el('b', '', x.matiere + (x.intitule ? ' · ' + x.intitule : '')));
    l.appendChild(el('div', 'muted', x.semestre + ' · fait le ' + fromNum(dnum(x.evalue))));
    if (x.ajoute) { nb.style.background = '#cfcfd6'; nb.style.color = '#4a3a42'; }
    top.appendChild(nb); top.appendChild(l);
    c.appendChild(top);
    var p = el('div'); p.style.marginTop = '6px';
    var late = Math.floor(TODAY() - o.r);
    if (!x.ajoute) { var sq = el('span', 'nsq', String(lx)); sq.style.background = scale(lx); sq.style.color = lx < 3 ? '#fff' : '#5c1530'; sq.title = 'Note inscrite'; p.appendChild(sq); }
    if (late > 0) p.appendChild(el('span', 'pill late', 'retard ' + late + ' j'));
    else p.appendChild(pillI('cal', 'à revoir ' + fromNum(o.r)));
    if (o.ex) p.appendChild(pillI('flag', 'J-' + (examNum(x.semestre, x.matiere) - TODAY())));
    c.appendChild(p);
    if (withBtn) {
      var acts = el('div', 'acts');
      var rb = el('button', 'abtn soft'); rb.type = 'button'; rb.className = 'abtn soft ico'; rb.title = o.rep ? 'Remettre' : 'Reporter'; rb.setAttribute('aria-label', rb.title); rb.appendChild(chSvg(o.rep ? 'back' : 'skip', 17));
      rb.addEventListener('click', function () { var r0 = x.reporte, r1; if (o.rep) delete x.reporte; else x.reporte = todayISO(); r1 = x.reporte; save(); render();
        toast(o.rep ? 'Remis dans ta liste.' : 'Reporté : ton temps va aux autres exos.', function () { if (x.reporte !== r1) return; if (r0) x.reporte = r0; else delete x.reporte; save(); render(); }); });
      var b = el('button', 'abtn main'); b.type = 'button'; b.appendChild(chSvg('check', 18)); b.title = 'Refait'; b.setAttribute('aria-label', 'Refait'); b.addEventListener('click', function () { openDone(x.id); });
      if (withBtn !== 'lite') acts.appendChild(rb); acts.appendChild(b); acts.appendChild(chronoEl(x.id)); c.appendChild(acts);
    }
    c.addEventListener('click', function (e) { if (!e.target.closest('button')) openEditor(x.id); });
    return c;
  }
  function renderToday() {
    var box = $('v-today'); box.textContent = '';
    var P = plan(), d = new Date();
    var head = el('div', 'card');
    var tot = 0; P.list.forEach(function (o) { if (o.in) tot += mins(o.x); });
    var jt = d.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }); head.appendChild(el('h2', '', 'Aujourd’hui'));
    var bud = P.budget >= 1e9 ? 'sans limite (max ' + (minutesRestantes() / 60) + ' h jusqu’à demain)' : P.budget + ' min';
    function hm(m) { m = Math.round(m); return Math.floor(m / 60) + 'h' + ('0' + (m % 60)).slice(-2); }
    var hr = minutesRestantes() / 60;
    head.appendChild(el('div', 'muted', (P.budget >= 1e9 ? 'Il reste ' + hr + ' heure' + (hr > 1 ? 's' : '') : 'Budget du jour : ' + hm(P.budget)) + ' · déjà fait : ' + hm(P.fait) + ' · prévu : ' + hm(tot)));
    var bar = el('div', 'bar'), fill = el('i'); fill.style.width = (P.budget >= 1e9 ? 0 : Math.min(100, Math.round(P.fait / P.budget * 100))) + '%'; bar.appendChild(fill); head.appendChild(bar);
    box.appendChild(head);
    var inP = P.list.filter(function (o) { return o.in; }), out = P.list.filter(function (o) { return !o.in && !o.rep; }), reps = P.list.filter(function (o) { return o.rep; });
    if (!data.ex.length && !data.mats.length) box.appendChild(welcomeCard());
    else if (!inP.length) box.appendChild(el('p', 'muted', data.ex.length ? 'Rien à faire aujourd’hui. Bravo !' : 'Aucun exercice. Ajoute-en avec le bouton + (onglet Exos).'));
    inP.forEach(function (o) { box.appendChild(exoCard(o, true)); });
    if (out.length) {
      var det = keepOpen(document.createElement('details'), 'horsbudget'); det.appendChild(el('summary', '', 'Reportés à demain ou après (' + out.length + ')'));
      out.slice(0, 60).forEach(function (o) { det.appendChild(exoCard(o, true)); });
      box.appendChild(det);
    }
    if (reps.length) {
      var dr = keepOpen(document.createElement('details'), 'reportes'); dr.appendChild(el('summary', '', 'Reportés par toi aujourd’hui (' + reps.length + ')'));
      reps.forEach(function (o) { dr.appendChild(exoCard(o, true)); }); box.appendChild(dr);
    }
    box.appendChild(histBlock());
  }


  /* ---------- historique de la semaine ---------- */
  function addHist(x, niv) {
    data.hist = data.hist || [];
    var prev = {}; PREVK.forEach(function (k) { if (k in x) prev[k] = x[k]; });
    var mi = $('doneMin') && parseFloat($('doneMin').value); if (mi > 0 && mi < 1000) x.minutes = Math.round(mi);
    var nSame = data.hist.filter(function (h) { return h.id === x.id && h.jour === todayISO(); }).length;
    var h = { id: x.id, ts: dnum(todayISO()) * DAY + nSame, jour: todayISO(), avant: { succes: x.ajoute ? 0 : lvl(x), evalue: x.ajoute ? '' : (x.evalue || '') }, niveau: niv, m: mins(x), prev: prev };
    data.hist.push(h); delete x.ajoute; return h;
  }
  /* annulation possible seulement sur la dernière ligne d'un exo, jamais sur une ligne figée (import), et si l'exo n'a pas changé depuis */
  var PREVK = ['succes', 'p5', 'evalue', 'minutes', 'ajoute', 'reporte'];
  function canUndo(h) {
    if (!h || h.fige) return false; var x = data.ex.filter(function (e) { return e.id === h.id; })[0]; if (!x) return false;
    var last = (data.hist || []).filter(function (z) { return z.id === h.id; }).sort(function (a, b) { return a.ts - b.ts; }).pop();
    if (last !== h) return false;
    if (h.apres) return PREVK.every(function (k) { return JSON.stringify(x[k]) === JSON.stringify(h.apres[k]); }); /* rien n'a changé depuis la note */
    return x.evalue === h.jour && (x.succes || 0) === Math.min(5, h.niveau) && !x.ajoute;
  }
  function undoHist(h) {
    var x = data.ex.filter(function (e) { return e.id === h.id; })[0], p = h.prev;
    if (p) PREVK.forEach(function (k) { if (k in p) x[k] = p[k]; else delete x[k]; });
    else { x.succes = Math.min(5, h.avant.succes); if (h.avant.evalue) x.evalue = h.avant.evalue; else x.ajoute = true; } /* ancienne ligne sans état complet : on garde la date */
    data.hist = data.hist.filter(function (z) { return z !== h; });
    var c = (data.chronos || {})[h.id]; /* minuteur d'avant la note, seulement s'il n'a pas été touché depuis (relancé ou remis à zéro) */
    if (h.chrono && (!c || c.t === h.chronoT)) { var a = chGetAll(); a[h.id] = h.chrono; chSetAll(a); }
  }
  function histBlock() {
    var lim = Date.now() - 7 * DAY; data.corbeille = (data.corbeille || []).filter(function (c) { return c && c.ex && c.ts > lim; });
    var L = (data.hist || []).filter(function (h) { return h.ts > lim; }).map(function (h) { return { ts: h.ts, h: h }; }).concat(data.corbeille.map(function (c) { return { ts: c.ts, c: c }; })).sort(function (a, b) { return b.ts - a.ts; });
    var det = keepOpen(document.createElement('details'), 'historique'); det.className = 'hist'; det.appendChild(el('summary', '', 'Historique de la semaine (' + L.length + ')'));
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
        if (canUndo(h)) { var un = el('button', 'plain', 'Annuler'); un.type = 'button';
          un.addEventListener('click', function () { if (!canUndo(h)) return; undoHist(h); save(); render(); toast('Remis comme avant.'); });
          row.appendChild(un); }
      }
      top.appendChild(l); c.appendChild(top); c.appendChild(row); det.appendChild(c);
    });
    return det;
  }

  /* ---------- vue : tous les exercices ---------- */
  function creaTs(x) { if (x.cree) return x.cree; var m = 1e18; (data.hist || []).forEach(function (h) { if (h.id === x.id && h.ts < m) m = h.ts; }); return m < 1e18 ? m : (x.evalue ? dnum(x.evalue) * DAY : 0); }
  function renderExos() {
    var box = $('exoList'); box.textContent = '';
    var q = norm($('search').value), t = TODAY(), tri = data.reglages.exoTri === 'cree' ? 'cree' : 'rev';
    var sgT = el('div', 'seg'); [['rev', 'Par date de révision'], ['cree', 'Par date de création']].forEach(function (o) { var bt = el('button', tri === o[0] ? 'on' : '', o[1]); bt.type = 'button'; bt.addEventListener('click', function () { data.reglages.exoTri = o[0]; save(); renderExos(); }); sgT.appendChild(bt); }); box.appendChild(sgT);
    var l = data.ex.filter(function (x) { return visible(x) && (!q || norm(x.matiere + ' ' + x.intitule + ' ' + x.semestre).indexOf(q) >= 0); })
      .map(function (x) { return { x: x, r: x.evalue ? revision(x) : 1e9, ex: modeExam(x) }; })
      .sort(function (a, b) { return tri === 'cree' ? creaTs(b.x) - creaTs(a.x) : a.r - b.r; });
    box.appendChild(el('p', 'muted', l.length + ' exercice(s)'));
    l.slice(0, shown).forEach(function (o) { box.appendChild(exoCard(o, 'lite')); });
    if (l.length > shown) { var m = el('button', 'row plain', 'Afficher plus'); m.addEventListener('click', function () { shown += 120; renderExos(); }); box.appendChild(m); }
  }


  /* applique un renommage à toutes les données (exos, corbeille, matières, UE) ; aussi utilisé à la fusion avec le Drive */
  function applyRen(D, r) {
    var exs = (D.ex || []).concat((D.corbeille || []).map(function (c) { return c.ex; }));
    if (r.k === 'sem') {
      (D.mats || []).forEach(function (m) { if (m.semestre === r.de) m.semestre = r.a; }); exs.forEach(function (x) { if (x.semestre === r.de) x.semestre = r.a; });
      (D.ues || []).forEach(function (u) { if (u.semestre === r.de) u.semestre = r.a; });
      if (D.reglages) ['semestres', 'semOrdre'].forEach(function (k) { if (Array.isArray(D.reglages[k])) D.reglages[k] = D.reglages[k].map(function (z) { return z === r.de ? r.a : z; }).filter(function (z, i, a) { return a.indexOf(z) === i; }); });
    } else {
      (D.mats || []).forEach(function (m) { if (m.semestre === r.s && m.nom === r.de) m.nom = r.a; }); exs.forEach(function (x) { if (x.semestre === r.s && x.matiere === r.de) x.matiere = r.a; });
      var f = D.reglages && D.reglages.matieres, ka = norm(r.a).trim(); if (Array.isArray(f) && f.indexOf(norm(r.de).trim()) >= 0 && f.indexOf(ka) < 0) f.push(ka); /* le filtre suit le renommage */
    }
  }
  function doRen(r) { applyRen(data, r); data.renoms = data.renoms || []; r.t = Date.now(); data.renoms.push(r); }
  function renameSem(old) {
    ask({ t: 'Renommer le semestre', v: old, ok: 'Renommer' }, function (n) {
      n = n.trim(); if (!n || n === old) return;
      function go() { doRen({ k: 'sem', de: old, a: n }); save(); render(); toast('Semestre renommé.'); }
      if (semestres().indexOf(n) >= 0) ask({ t: '« ' + n + ' » existe déjà', p: 'Les deux semestres vont être regroupés.', ok: 'Regrouper' }, go); else go();
    });
  }
  function matTaken(sem, n, self) { return data.mats.some(function (z) { return z !== self && z.semestre === sem && norm(z.nom).trim() === norm(n).trim(); }); }
  function renameMat(m) {
    ask({ t: 'Renommer la matière', v: m.nom, ok: 'Renommer' }, function (n) {
      n = n.trim(); if (!n || n === m.nom) return;
      if (matTaken(m.semestre, n, m)) { toast('« ' + n + ' » existe déjà dans ' + m.semestre + '.'); return; }
      if (examSel && examSel.semestre === m.semestre && examSel.nom === m.nom) examSel.nom = n;
      doRen({ k: 'mat', s: m.semestre, de: m.nom, a: n }); save(); render(); toast('Matière renommée.');
    });
  }
  /* suppression seulement si aucun exercice (actif ou en corbeille) ; le semestre disparaît avec sa dernière matière */
  function deleteMat(m) {
    var n = data.ex.concat((data.corbeille || []).map(function (c) { return c.ex; })).filter(function (x) { return x.semestre === m.semestre && x.matiere === m.nom; }).length;
    if (n) { toast('Impossible : ' + n + ' exercice' + (n > 1 ? 's sont rattachés' : ' est rattaché') + ' à « ' + m.nom + ' » (corbeille comprise).'); return; }
    var lost = []; if (m.examen) lost.push('examen le ' + fromNum(dnum(m.examen))); if (typeof m.note === 'number') lost.push('note ' + m.note + '/20'); if (m.ue) lost.push('UE « ' + m.ue + ' »');
    ask({ t: 'Supprimer « ' + m.nom + ' » ?', p: lost.length ? 'Seront perdus : ' + lost.join(', ') + '.' : 'Aucun exercice ni examen.', ok: 'Supprimer', danger: true }, function () {
      data.mats = data.mats.filter(function (z) { return z !== m; }); data.matsSuppr = data.matsSuppr || []; data.matsSuppr.push({ k: m.semestre + '|' + m.nom, t: Date.now() });
      if (semestres().indexOf(m.semestre) < 0) ['semestres', 'semOrdre'].forEach(function (k) { data.reglages[k] = (data.reglages[k] || []).filter(function (z) { return z !== m.semestre; }); });
      save(); render(); toast('Matière supprimée.');
    });
  }
  function addMat(s, n) { data.mats.push({ semestre: s, nom: n, examen: null, cree: Date.now() }); }

  /* ---------- vue : examens ---------- */
  /* replis qui restent ouverts ou fermés d'une fois sur l'autre */
  var OPEN = (function () { try { return JSON.parse(localStorage.getItem('mes-exercices-replis') || '{}') || {}; } catch (e) { return {}; } })();
  function keepOpen(det, k, def) {
    det.open = k in OPEN ? !!OPEN[k] : !!def;
    det.addEventListener('toggle', function () { OPEN[k] = det.open; try { localStorage.setItem('mes-exercices-replis', JSON.stringify(OPEN)); } catch (e) { /* ignoré */ } });
    return det;
  }
  function newSem() {
    ask({ t: 'Nouveau semestre', v: '', ph: 'ex. S8 - 2A', ok: 'Suivant' }, function (n) {
      n = n.trim(); if (!n) return;
      ask({ t: 'Première matière de ' + n, v: '', ok: 'Créer' }, function (m) { m = m.trim(); if (!m) return; if (matTaken(n, m)) { toast('« ' + m + ' » existe déjà.'); return; } addMat(n, m); save(); view = 'mats'; render(); });
    });
  }
  function plainBtn(txt, fn, cls) { var b = el('button', cls || 'plain', txt); b.type = 'button'; b.addEventListener('click', fn); return b; }
  function renderMats() {
    var box = $('v-mats'); box.textContent = '';
    if (semestres().length > 1) {
      var od = keepOpen(document.createElement('details'), 'ordre', false); od.className = 'mord'; od.appendChild(el('summary', '', 'Ordre des semestres'));
      var ch = el('div', 'chips');
      [['alpha', 'A → Z'], ['manuel', 'Manuel']].forEach(function (a) {
        var b = el('button', 'chip', a[1]); b.type = 'button'; b.setAttribute('aria-pressed', data.reglages.ordreSem === a[0] ? 'true' : 'false');
        b.addEventListener('click', function () { if (a[0] === 'manuel' && !(data.reglages.semOrdre || []).length) data.reglages.semOrdre = semestres(); data.reglages.ordreSem = a[0]; save(); render(); });
        ch.appendChild(b);
      });
      od.appendChild(ch);
      if (data.reglages.ordreSem !== 'alpha') {
        var rows = el('div', 'drows');
        semestres().forEach(function (sm) {
          var r = el('div', 'drow'); r.dataset.sem = sm; var h = el('span', 'dh', '⠿'); r.appendChild(h); r.appendChild(el('span', 'dn', sm));
          h.addEventListener('pointerdown', function (e) {
            e.preventDefault(); r.classList.add('drag');
            function mv(ev) {
              var kids = Array.prototype.slice.call(rows.children);
              for (var i = 0; i < kids.length; i++) { var k = kids[i]; if (k === r) continue; var bb = k.getBoundingClientRect(); if (ev.clientY > bb.top && ev.clientY < bb.bottom) { if (kids.indexOf(r) < i) rows.insertBefore(r, k.nextSibling); else rows.insertBefore(r, k); break; } }
            }
            function up() {
              window.removeEventListener('pointermove', mv); window.removeEventListener('pointerup', up); window.removeEventListener('pointercancel', up); r.classList.remove('drag');
              data.reglages.semOrdre = Array.prototype.map.call(rows.children, function (k) { return k.dataset.sem; }); data.reglages.ordreSem = 'manuel'; save(); render();
            }
            window.addEventListener('pointermove', mv); window.addEventListener('pointerup', up); window.addEventListener('pointercancel', up);
          });
          rows.appendChild(r);
        });
        var dl = el('div', 'dlist'); dl.appendChild(rows); od.appendChild(dl);
      }
      box.appendChild(od);
    }
    if (!data.mats.length) box.appendChild(welcomeCard());
    semestres().forEach(function (s) {
      var det = keepOpen(document.createElement('details'), 'sem:' + s, true); det.className = 'msem'; det.appendChild(el('summary', '', s));
      data.mats.forEach(function (m) {
        if (m.semestre !== s) return;
        var c = el('div', 'mcard'), hd = el('div', 'mch');
        hd.appendChild(plainBtn(m.nom + ' ✎', function () { renameMat(m); }, 'namebtn'));
        var del = plainBtn('', function () { deleteMat(m); }, 'mdel'); del.setAttribute('aria-label', 'Supprimer la matière'); del.title = 'Supprimer'; del.appendChild(chSvg('x', 16)); hd.appendChild(del);
        c.appendChild(hd);
        var g = el('div', 'mgrid'), l1 = el('label', '', 'Examen'), l2 = el('label', '', 'Note /20');
        var inp = document.createElement('input'); inp.type = 'date'; inp.value = m.examen || '';
        inp.addEventListener('change', function () { m.examen = inp.value || null; save(); toast('Date enregistrée.'); });
        var nt = document.createElement('input'); nt.type = 'number'; nt.inputMode = 'decimal'; nt.step = '0.01'; nt.min = 0; nt.max = 20; nt.placeholder = '–'; nt.value = typeof m.note === 'number' ? m.note : '';
        nt.addEventListener('change', function () { m.note = nt.value === '' ? null : +nt.value; save(); toast('Note enregistrée.'); });
        l1.appendChild(inp); l2.appendChild(nt); g.appendChild(l1); g.appendChild(l2); c.appendChild(g);
        var us = document.createElement('select'); us.className = 'uesel';
        var o0 = el('option', '', 'UE : aucune'); o0.value = ''; us.appendChild(o0);
        ueList(s).forEach(function (u) { var o = el('option', '', 'UE : ' + u); o.value = u; us.appendChild(o); });
        var on = el('option', '', '+ Nouvelle UE…'); on.value = '__new'; us.appendChild(on); us.value = m.ue || '';
        us.addEventListener('change', function () {
          var v = us.value;
          function set(v) { m.ue = v || null; save(); render(); toast(v ? 'Rangée dans « ' + v + ' ».' : 'UE retirée.'); }
          if (v === '__new') { us.value = m.ue || ''; ask({ t: 'Nouvelle UE (' + s + ')', v: '', ok: 'Créer' }, function (n) { if (n.trim()) set(n.trim()); }); return; }
          set(v);
        });
        c.appendChild(us); det.appendChild(c);
      });
      var ub = el('div', 'uebox');
      ueList(s).forEach(function (u) {
        var r = el('div', 'uerow');
        r.appendChild(plainBtn(u + ' ✎', function () {
          ask({ t: 'Renommer l’UE', p: 'Vide = supprimer l’UE (les matières restent).', v: u, ok: 'OK' }, function (n) { n = n.trim();
            (data.ues || []).forEach(function (z) { if (z.semestre === s && z.nom === u) z.nom = n; }); if (!n) data.ues = data.ues.filter(function (z) { return z.nom; });
            data.mats.forEach(function (m) { if (m.semestre === s && m.ue === u) m.ue = n || null; }); save(); render(); });
        }, 'namebtn'));
        var def = (data.ues || []).filter(function (z) { return z.semestre === s && z.nom === u; })[0];
        var inp = document.createElement('input'); inp.type = 'number'; inp.inputMode = 'decimal'; inp.step = '0.01'; inp.min = 0; inp.max = 20;
        var auto = (function () { var g = ueGroups(s).filter(function (x) { return x.nom === u; })[0]; return g && !(def && typeof def.moy === 'number') ? g.avg : null; })();
        inp.placeholder = auto !== null ? fmt1(auto) + ' (auto)' : 'moyenne /20'; inp.value = def && typeof def.moy === 'number' ? def.moy : '';
        inp.addEventListener('change', function () { ueDef(s, u).moy = inp.value === '' ? null : +inp.value; save(); render(); });
        r.appendChild(inp); ub.appendChild(r);
        var mw = el('div', 'uemats');
        data.mats.forEach(function (m) {
          if (m.semestre !== s || m.ue !== u) return;
          var chp = el('button', 'chip', m.nom + (typeof m.note === 'number' ? ' · ' + fmt1(m.note) : '') + ' ✕'); chp.type = 'button';
          chp.addEventListener('click', function () { m.ue = null; save(); render(); }); mw.appendChild(chp);
        });
        ub.appendChild(mw);
      });
      ub.appendChild(plainBtn('+ Ajouter une UE', function () { ask({ t: 'Nouvelle UE (' + s + ')', v: '', ok: 'Créer' }, function (n) { if (!n.trim()) return; ueDef(s, n.trim()); save(); render(); }); }));
      det.appendChild(ub);
      var acts = el('div', 'macts');
      acts.appendChild(plainBtn('+ Ajouter une matière', function () { ask({ t: 'Nouvelle matière (' + s + ')', v: '', ok: 'Ajouter' }, function (n) { n = n.trim(); if (!n) return; if (matTaken(s, n)) { toast('« ' + n + ' » existe déjà.'); return; } addMat(s, n); save(); render(); }); }));
      acts.appendChild(plainBtn('Renommer le semestre', function () { renameSem(s); }));
      if (data.reglages.ordreSem !== 'alpha') { acts.appendChild(plainBtn('↑', function () { moveSem(s, -1); })); acts.appendChild(plainBtn('↓', function () { moveSem(s, 1); })); }
      det.appendChild(acts); box.appendChild(det);
    });
    box.appendChild(plainBtn('+ Ajouter un semestre', newSem, 'row plain'));
  }
  /* premier lancement : trois actions, sans parcours imposé */
  function welcomeCard() {
    var c = el('div', 'card welcome'); c.appendChild(el('h2', '', 'Bienvenue'));
    c.appendChild(el('p', 'muted', 'Pour commencer, crée une matière ou récupère tes exercices.'));
    c.appendChild(plainBtn('Créer une matière', newSem, 'row primary'));
    c.appendChild(plainBtn('Importer un fichier (Excel, CSV, .json)', function () { $('sheetInput').click(); }, 'row plain'));
    c.appendChild(plainBtn('Récupérer mes données du Drive', function () { syncNow(false); }, 'row plain'));
    return c;
  }

  /* ---------- vue : tableau de bord ---------- */
  var C_LATE = '#ad1457', C_EXAM = '#f1b3c6', C_NORM = '#f8538b', C_PV = '#838383', C_PVL = '#3f3f3f';
  var C_NIV = [0, 1, 2, 3, 4, 5].map(function (v) { return scale(v); });
  var JS = ['dim', 'lun', 'mar', 'mer', 'jeu', 'ven', 'sam'];
  function dcard(title, extra) { var c = el('div', 'dcard' + (extra ? ' ' + extra : '')); if (title) c.appendChild(el('h2', '', title)); return c; }
  function scale(v) {
    var A = [173, 20, 87], B = [248, 83, 139], C = [249, 211, 224], f, p, q;
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
    var c = cv === undefined ? v : cv, b = el('div', 'niv' + (sz ? ' ' + sz : ''), fmt1(Math.round(v * 10) / 10)); b.style.background = scale(c); b.style.color = c < 3 ? '#fff' : '#5c1530'; return b;
  }
  function fmt1(v) { return (Math.round(v * 100) / 100).toString().replace('.', ','); }
  function addQ(card, lg) { var qb = el('button', 'qbtn', '?'); qb.type = 'button'; qb.title = 'Afficher la légende'; qb.setAttribute('aria-label', 'Légende'); qb.addEventListener('click', function () { lg.hidden = !lg.hidden; qb.className = 'qbtn' + (lg.hidden ? '' : ' on'); }); card.querySelector('h2').appendChild(qb); }
  var dashEdit = false, ANIM = 1, animTok = 0, lastSig = null, semPrev = {};
  function renderDash() {
    DEC = null; DEFC = null;
    var box = $('v-dash'); box.textContent = ''; var cards = {}, draws = {};
    if (!data.ex.length && !data.mats.length) { box.appendChild(welcomeCard()); return; }
    var t = TODAY(), L = data.ex.filter(function (x) { return visible(x) && x.evalue; });
    var late = 0, due = 0;
    L.forEach(function (x) { var r = revision(x); if (r < t) late++; else if (r < t + 1) due++; });
    var todo = plan().list.filter(function (o) { return o.in; }).length; /* même calcul que « À faire » */
    var matsV = data.mats.filter(function (m) { return (!data.reglages.semestres.length || data.reglages.semestres.indexOf(m.semestre) >= 0) && matOk(m.nom); });
    var fut = matsV.filter(function (m) { return m.examen && dnum(m.examen) >= t; }).sort(function (a, b) { return dnum(a.examen) - dnum(b.examen); });
    var dh = el('div', 'dhead'), hh = el('span', 'hh'); hh.innerHTML = '<svg viewBox="0 0 24 22" width="34" height="31" style="position:absolute;left:0;top:0"><path fill="#f08ab0" d="M12 21.5C5 15.8 1 12.2 1 7.6 1 4.4 3.5 2 6.6 2c2 0 3.9 1 5.4 3C13.5 3 15.4 2 17.4 2 20.5 2 23 4.4 23 7.6c0 4.6-4 8.2-11 13.9z"/></svg><svg viewBox="0 0 24 22" width="22" height="20" style="position:absolute;left:18px;top:16px"><path fill="#ad1457" d="M12 21.5C5 15.8 1 12.2 1 7.6 1 4.4 3.5 2 6.6 2c2 0 3.9 1 5.4 3C13.5 3 15.4 2 17.4 2 20.5 2 23 4.4 23 7.6c0 4.6-4 8.2-11 13.9z"/></svg>';
    var tt = el('div', 'dht'); tt.appendChild(el('b', '', 'Mes révisions')); tt.appendChild(el('small', '', 'Méthode des J · suivi de mes exercices'));
    var dtxt = new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }); var dd0 = el('span', 'dhd', dtxt.charAt(0).toUpperCase() + dtxt.slice(1));
    var hdr = document.querySelector('header'); Array.prototype.slice.call(hdr.querySelectorAll('.hh')).forEach(function (n) { n.remove(); }); hdr.insertBefore(hh, hdr.firstChild); dh.appendChild(dd0); box.appendChild(dh);
    function fitDate() { dd0.style.fontSize = ''; var sz = parseFloat(getComputedStyle(dd0).fontSize), g = 0; while (dd0.scrollWidth > dd0.clientWidth + 1 && sz > 14 && g++ < 60) { sz -= 1; dd0.style.fontSize = sz + 'px'; } }
    setTimeout(fitDate, 0); if (document.fonts && document.fonts.ready) document.fonts.ready.then(fitDate); window.onresize = fitDate;
    var ban = el('div', 'banner');
    ban.textContent = todo + ' exercice' + (todo > 1 ? 's' : '') + ' à réviser aujourd’hui';
    if (fut.length) { var dd = dnum(fut[0].examen) - t; ban.textContent = todo + ' exercice' + (todo > 1 ? 's' : '') + ' à réviser aujourd’hui  ·  Prochain examen : ' + fut[0].nom + ' ' + (dd === 0 ? 'aujourd’hui' : 'dans ' + dd + ' jour' + (dd > 1 ? 's' : '')); }
    /* bandeau retiré */

    var sv = semestres().filter(function (z) { return !data.reglages.semestres.length || data.reglages.semestres.indexOf(z) >= 0; }).map(semMoy).filter(function (v) { return v !== null; });
    var moy = sv.length ? sv.reduce(function (a, b) { return a + b; }, 0) / sv.length : null;
    var k = el('div', 'kpis3');
    [['EXERCICES', L.length, 'enregistrés'], ['AUJOURD’HUI', todo, ''], ['MOYENNE /20', moy === null ? '–' : fmt1(moy), '']].forEach(function (a, i) {
      var d = el('div', 'kpi3'); d.appendChild(el('small', '', a[0])); d.appendChild(el('b', '', a[1])); if (a[2]) d.appendChild(el('span', '', a[2])); d.appendChild(el('u', i === 1 ? 'mid' : '')); k.appendChild(d);
    });
    box.appendChild(k);

    /* moyenne par semestre */
    var selM = data.reglages.matieres || [], selNames = matChoices().filter(function (m) { return selM.indexOf(m.k) >= 0; }).map(function (m) { return m.nom; });
    var c0 = dcard(selNames.length ? 'Moyenne de ' + selNames.join(', ') + ' par semestre' : 'Moyenne par semestre'), sems = semestres();
    function semV(sm) { if (!selNames.length) return semAvg(sm); var ns = data.mats.filter(function (m) { return m.semestre === sm && matOk(m.nom) && typeof m.note === 'number'; }).map(function (m) { return m.note; }); return mean(ns); } /* toujours tous les semestres, sans filtre */
    var cols = el('div', 'cols');
    [0, 5, 10, 15, 20].forEach(function (g) { var gl = el('div', 'gl'); gl.style.bottom = (26 + g * 6) + 'px'; gl.appendChild(el('span', '', String(g))); cols.appendChild(gl); });
    sems.forEach(function (sm) {
      var v = semV(sm) || 0;
      var col = el('div', 'col'); col.appendChild(el('span', 'v', v ? fmt1(v) : '–'));
      var bar = el('i'); var hNew = Math.round(v * 6), hOld = semPrev[sm] === undefined ? hNew : semPrev[sm]; bar.style.height = hOld + 'px'; if (hOld !== hNew) { bar.style.transition = 'height 1s ease'; (function (b, h) { setTimeout(function () { b.style.height = h + 'px'; }, 30); })(bar, hNew); } semPrev[sm] = hNew; col.appendChild(bar); col.appendChild(el('span', 'l', sm)); cols.appendChild(col);
    });
    c0.appendChild(cols); cards.sem = c0;

    /* moyenne par matière : même nom fusionné, semestres cochés */
    var cm = dcard('Moyenne par matière · semestres cochés'), gm = {};
    L.filter(function (x) { return !x.ajoute; }).forEach(function (x) { var k = x.matiere.trim().toLowerCase(); var g = gm[k] = gm[k] || { nom: x.matiere, s: 0, n: 0, sem: {}, nt: [] }; g.s += effLvl(x); g.n++; g.sem[x.semestre] = 1; });
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
    [['En retard', C_LATE], ['Prévu', C_NORM], ['Examen (vagues)', 'hatch']].concat(!data.reglages.prevOff ? [['En retard (prévision)', C_PVL], ['Prévu (prévision)', C_PV], ['Examen (prévision)', 'hatchg']] : []).forEach(function (a) { var sp = el('span'); var i = el('i'); if (a[1] === 'hatch') i.className = 'hat'; else if (a[1] === 'hatchg') i.className = 'hat hg'; else if (a[1] === 'tick') i.className = 'tick'; else i.style.background = a[1]; sp.appendChild(i); sp.appendChild(document.createTextNode(a[0])); lg.appendChild(sp); });
    c1.appendChild(lg);
    {
      var sg = el('div', 'seg'); [[false, 'Sans prévisions'], [true, 'Avec prévisions']].forEach(function (o) {
        var b = el('button', (!data.reglages.prevOff) === o[0] ? 'on' : '', o[1]); b.type = 'button';
        b.addEventListener('click', function () { data.reglages.prevOff = !o[0]; save(); renderDash(); }); sg.appendChild(b); });
      c1.insertBefore(sg, lg);
    }
    lg.hidden = true;
    {
      var qb = el('button', 'qbtn', '?'); qb.type = 'button'; qb.title = 'Afficher la légende'; qb.setAttribute('aria-label', 'Légende');
      qb.addEventListener('click', function () { lg.hidden = !lg.hidden; qb.className = 'qbtn' + (lg.hidden ? '' : ' on'); });
      c1.querySelector('h2').appendChild(qb);
    }
    var cv = document.createElement('canvas'), cax = document.createElement('canvas'), sc = el('div', 'scrollx'), wr = el('div', 'chw'); sc.appendChild(cv); wr.appendChild(cax); wr.appendChild(sc); c1.appendChild(wr);
    {
      var cu = el('p', 'catchup'), r0 = drawCharge(null, L, t, null, 0, true);
      function dayTxt(n) { return fromNum(t + n).slice(0, 5); }
      function catchTxt(r) { if (r.lastLate < 0) return null; if (r.lastLate >= r.N - 1) return 'dans plus de 6 semaines'; var n = r.lastLate + 1; return n === 1 ? 'demain' : 'dans ' + n + ' jours'; }
      var c0t = catchTxt(r0);
      if (c0t === null) cu.textContent = 'Tu es à jour : aucun retard prévu.';
      else {
        cu.textContent = 'À ce rythme, tu es à jour ' + c0t + '.';
      }
      var sgE = c1.querySelector('.seg'), rowE = el('div', 'chrow'); c1.insertBefore(rowE, sgE); rowE.appendChild(sgE); rowE.appendChild(cu);
    }
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
        var es = L.filter(function (x) { return !x.ajoute && x.semestre === m.semestre && x.matiere === m.nom; }), av = es.length ? es.reduce(function (a, x) { return a + effLvl(x); }, 0) / es.length : null;
        var row = el('div', 'exr'), mid = el('div', 'exm'); row.style.cursor = 'pointer'; row.addEventListener('click', function () { openExam(m); });
        var top = el('div', 'ext'); top.appendChild(el('span', 'chip', m.semestre)); top.appendChild(el('b', 'mn', m.nom)); mid.appendChild(top);
        var trk = el('div', 'trk'), fl = el('i', 'fl'); fl.style.width = Math.min(100, (av || 0) / 5 * 100) + '%'; if (av !== null) fl.style.background = scale(av); trk.appendChild(fl);
        for (var q = 1; q < 5; q++) { var tk = el('b', 'tk'); tk.style.left = (q * 20) + '%'; trk.appendChild(tk); }
        var me = el('u', 'me'); me.style.left = Math.min(100, need / 5 * 100) + '%'; me.title = 'Prévision : niveau à avoir aujourd’hui (' + need + ')'; trk.appendChild(me);
        var trw = el('div', 'trw'); trw.appendChild(trk);  mid.appendChild(trw); row.appendChild(mid);
        var jd = el('div', 'exj'); jd.appendChild(el('b', 'jj', 'J-' + J)); jd.appendChild(el('span', 'dd', fromNum(dn).slice(0, 6) + fromNum(dn).slice(8))); row.appendChild(jd);
        var nt = el('div', 'exn'); if (av !== null) { var fin = 0; es.forEach(function (x) { var pr = occPred(x, dn - 1); fin += Math.min(5, pr.length ? pr[pr.length - 1].n : lvl(x)); }); fin /= es.length; nt.appendChild(nivBadge(Math.round(av * 10) / 10, 'sm')); nt.appendChild(el('span', 'parr', '→')); nt.appendChild(nivBadge(Math.round(fin * 10) / 10, 'sm')); } row.appendChild(nt);
        tb.appendChild(row);
      });
      var sc = el('div', 'mscroll'); sc.appendChild(tb); c3.appendChild(sc);
    }
    cards.exam = c3;

    /* anneau succès */
    var c2 = dcard('Succès : exos / examens');
    var cv2 = document.createElement('canvas'); c2.appendChild(cv2);
    var lg2 = el('div', 'legend'); [0, 1, 2, 3, 4, 5].forEach(function (i) { var sp = el('span'); var ic = el('i'); ic.style.background = C_NIV[i]; sp.appendChild(ic); sp.appendChild(document.createTextNode(i === 5 ? '5+' : String(i))); lg2.appendChild(sp); }); (function () { var sp = el('span'), ic = el('i'); ic.style.background = '#cfcfd6'; sp.appendChild(ic); sp.appendChild(document.createTextNode('Ajouté')); lg2.appendChild(sp); })();
    lg2.hidden = true; c2.appendChild(lg2); addQ(c2, lg2); c2.classList.add('ctr'); cards.donut = c2; draws.donut = function () { drawDonut(cv2, L); };

    var c4 = dcard('Temps de révision par tranche de J');
    var cv4 = document.createElement('canvas'); c4.appendChild(cv4);
    var lg4 = el('div', 'legend'); J_LAB.forEach(function (n, i) { var sp = el('span'); var ic = el('i'); ic.style.background = C_J[i]; sp.appendChild(ic); sp.appendChild(document.createTextNode(n)); lg4.appendChild(sp); }); (function () { var sp = el('span'), ic = el('i'); ic.style.background = '#cfcfd6'; sp.appendChild(ic); sp.appendChild(document.createTextNode('Ajouté')); lg4.appendChild(sp); })();
    lg4.hidden = true; c4.appendChild(lg4); addQ(c4, lg4); c4.classList.add('ctr'); cards.jring = c4; draws.jring = function () { drawDonut(cv4, L, true); };

    var c5 = dcard('Courbe de l’oubli');
    var cv5 = document.createElement('canvas'); c5.appendChild(cv5);
    var lg5 = el('div', 'legend'); [['#e0527f', 'Rose : révision à ±20 % du J prévu (compte dans la courbe)'], ['#9a9a9f', 'Gris : en retard ou trop en avance (ne compte pas)'], ['#ad1457', 'Courbe rose : moyenne de tes points'], ['#e8a3bd', 'Pointillés : estimation, pas assez de points'], ['#f9d3e0', 'Objectif (4,5 à 5)']].forEach(function (a) { var sp = el('span'); var ic = el('i'); ic.style.background = a[0]; sp.appendChild(ic); sp.appendChild(document.createTextNode(a[1])); lg5.appendChild(sp); });
    var fl5 = el('div', 'seg'); [[-1, 'Tous'], [0, '0'], [1, '1'], [2, '2'], [3, '3'], [4, '4'], [5, '5'], [6, '6+']].forEach(function (o) {
      var cur = typeof data.reglages.oubliNiv === 'number' ? data.reglages.oubliNiv : -1;
      var b = el('button', cur === o[0] ? 'on' : '', o[1]); b.type = 'button'; if (o[0] >= 0) b.title = 'Niveau d’avant la révision : ' + o[0];
      b.addEventListener('click', function () { data.reglages.oubliNiv = o[0]; save(); renderDash(); }); fl5.appendChild(b); });
    c5.insertBefore(fl5, cv5);
    lg5.hidden = true; c5.appendChild(lg5); addQ(c5, lg5); c5.classList.add('ctr'); cards.oubli = c5; draws.oubli = function () { drawOubli(cv5); }; c5.classList.add('wide');
    cards.charge.classList.add('wide'); cards.habit.classList.add('wide');
    var R = data.reglages, keys = ['sem', 'mat', 'charge', 'habit', 'exam', 'donut', 'jring', 'oubli'];
    var ord = (R.dashOrdre || []).filter(function (k) { return keys.indexOf(k) >= 0; }); keys.forEach(function (k) { if (ord.indexOf(k) < 0) { if (k === 'ue' && ord.indexOf('sem') >= 0) ord.splice(ord.indexOf('sem') + 1, 0, k); else ord.push(k); } });
    var hid = R.dashCache || [];
    R.dashLarge = R.dashLarge || {}; keys.forEach(function (k) { if (R.dashLarge[k] !== undefined) cards[k].classList.toggle('wide', !!R.dashLarge[k]); });
    var ed = el('button', 'editbtn' + (dashEdit ? ' on' : '')); ed.type = 'button'; ed.setAttribute('aria-label', dashEdit ? 'Terminer' : 'Modifier l’affichage');
    ed.innerHTML = dashEdit ? '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12l5 5 9-10"/></svg>' : '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20h4L19 9a2.1 2.1 0 0 0-3-3L5 17z"/><path d="M14 7l3 3"/></svg>';
    ed.addEventListener('click', function () { dashEdit = !dashEdit; renderDash(); }); Array.prototype.slice.call(document.querySelectorAll('.hbtns .editbtn')).forEach(function (n) { n.remove(); }); $('filtBtn').parentNode.insertBefore(ed, $('menuBtn'));
    box.classList.toggle('c1', R.dashCols !== 2);
    if (dashEdit && window.innerWidth >= 760) { var sg = el('div', 'seg colseg'); [[1, '1 colonne'], [2, '2 colonnes']].forEach(function (o) { var bb = el('button', (R.dashCols === 2 ? 2 : 1) === o[0] ? 'on' : '', o[1]); bb.type = 'button'; bb.addEventListener('click', function () { R.dashCols = o[0]; save(); renderDash(); }); sg.appendChild(bb); }); dh.appendChild(sg); }
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
        if (window.innerWidth >= 760 && R.dashCols === 2) mk(c.classList.contains('wide') ? '▫ Réduire' : '↔ Agrandir', function () { R.dashLarge[k] = !c.classList.contains('wide'); save(); renderDash(); });
        mk(isH ? '👁 Afficher' : '🚫 Masquer', function () { R.dashCache = isH ? hid.filter(function (z) { return z !== k; }) : hid.concat([k]); R.dashOrdre = ord; save(); renderDash(); });
        c.insertBefore(tb, c.firstChild);
      }
      box.appendChild(c);
    });
    if (half % 2 === 1 && lastHalf) lastHalf.classList.add('solo');
    function drawAll() { Object.keys(draws).forEach(function (k) { if (cards[k].parentNode === box) draws[k](); }); }
    var sig = 0; try { var js = JSON.stringify(data.ex); for (var q = 0; q < js.length; q++) sig = (sig * 31 + js.charCodeAt(q)) | 0; } catch (e) { /* ignoré */ }
    var changed = lastSig !== null && sig !== lastSig; lastSig = sig; var tok = ++animTok;
    if (!changed) { ANIM = 1; drawAll(); return; }
    var t0 = performance.now();
    (function frame(now) {
      if (tok !== animTok) return;
      var p = Math.min(1, ((now || performance.now()) - t0) / 1000); ANIM = 1 - Math.pow(1 - p, 3);
      drawAll(); if (p < 1) requestAnimationFrame(frame); else ANIM = 1;
    })(t0);
  }

  function faitsMap() {
    var map = {}, vu = {};
    (data.hist || []).forEach(function (h) {
      var x = data.ex.filter(function (e) { return e.id === h.id; })[0]; vu[h.id] = 1;
      map[h.jour] = (map[h.jour] || 0) + (h.m || (x ? mins(x) : data.reglages.minutesDefaut));
    });
    data.ex.forEach(function (x) { if (!vu[x.id] && x.evalue && !x.ajoute) map[x.evalue] = (map[x.evalue] || 0) + mins(x); });
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
    var g = {}, order = [], withUE = res.length; /* matières sans UE : comptées chacune comme un groupe (choix de Pauline) */
    data.mats.forEach(function (m) { if (m.semestre !== sem || typeof m.note !== 'number' || (withUE && m.ue && ueList(sem).indexOf(m.ue) >= 0)) return; if (!g[m.nom]) { g[m.nom] = { nom: m.nom, ue: false, notes: [m], avg: m.note, sem: sem }; order.push(m.nom); } });
    return res.concat(order.map(function (k) { return g[k]; }));
  }
  function semMoy(sm) { if (!(data.reglages.matieres || []).length) return semAvg(sm); return mean(data.mats.filter(function (m) { return m.semestre === sm && matOk(m.nom) && typeof m.note === 'number'; }).map(function (m) { return m.note; })); }
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
    var stk = streak(FM); nav.appendChild(cur); if (stk > 0) { var fl = el('span', 'flame', '🔥 ' + stk); fl.title = stk + ' jour' + (stk > 1 ? 's' : '') + ' de suite avec au moins une révision'; nav.appendChild(fl); } nav.appendChild(bt); c.appendChild(nav);
    var cols = ['#f6e9ee', '#f9d3e0', '#f0a9c0', '#f8538b', '#a33c5e', '#ad1457'];
    var ST = [[249, 211, 224], [248, 83, 139], [173, 20, 87], [0, 0, 0]], SV = [0, 120, 300, 1440];
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
        cell.style.background = dn2 > t ? '#faf3f6' : colFor(vv); if (dn2 === t) { cell.style.outline = '2px solid #ad1457'; todayCell = cell; }
        (function (n, v2) { cell.addEventListener('click', function () { toast(fromNum(n) + ' : ' + (v2 ? dur(v2) : 'rien de fait')); }); })(dn2, vv);
      }
      grid.appendChild(cell);
    }
    sc.appendChild(grid); wrap.appendChild(sc); c.appendChild(wrap);
    function upd() { var wi = Math.max(0, Math.min(W - 1, Math.floor((sc.scrollLeft + sc.clientWidth - 4) / (CW + 3)))), dd = new Date((start + wi * 7 + 3) * DAY); cur.textContent = mois[dd.getUTCMonth()] + ' ' + dd.getUTCFullYear(); }
    function toToday(smooth) { if (todayCell) sc.scrollTo({ left: Math.max(0, todayCell.offsetLeft + CW + 2 - sc.clientWidth), behavior: smooth ? 'smooth' : 'auto' }); }
    sc.addEventListener('scroll', upd); bt.addEventListener('click', function () { toToday(true); });
    setTimeout(function () { if (window._hk != null) sc.scrollLeft = window._hk; else toToday(false); upd(); }, 0); setTimeout(function () { if (window._hk == null && !sc.dataset.touched) { toToday(false); upd(); } }, 120); sc.addEventListener('touchstart', function () { sc.dataset.touched = '1'; }, { passive: true });
    var lg = el('div', 'legend hleg'), z0 = el('span'), zi = el('i'); zi.style.background = cols[0]; z0.appendChild(zi); z0.appendChild(document.createTextNode('0')); lg.appendChild(z0);
    var gb = el('span', 'gbar'); gb.appendChild(el('em', '', '1 min')); var gs = el('i', 'gstrip'); gs.style.background = 'linear-gradient(90deg,' + [1, 120, 300, 1440].map(colFor).join(',') + ')'; gb.appendChild(gs); gb.appendChild(el('em', '', '24 h')); lg.appendChild(gb);
    c.appendChild(lg); return c;
  }
  function tfmt(m) { m = Math.round(m); return m < 60 ? m + ' min' : (Math.round(m / 6) / 10).toString().replace('.', ',') + ' h'; }
  var J_LAB = ['En retard', 'J0', 'J1-3', 'J4-10', 'J11-25', 'J26-50', 'J50+'], C_J = [0, 1, 2, 3, 4, 5, 6].map(function (i) { return scale(i * 5 / 6); });
  function jIdx(x) { var d = revision(x) - TODAY(); return d < 0 ? 0 : d === 0 ? 1 : d <= 3 ? 2 : d <= 10 ? 3 : d <= 25 ? 4 : d <= 50 ? 5 : 6; }
  function drawDonut(cv, L, J) {
    var NB = J ? 8 : 7, COL = (J ? C_J : C_NIV).concat(['#cfcfd6']), all = [], inn = [], sum = 0; for (var zz = 0; zz < NB; zz++) { all.push(0); inn.push(0); }
    L.forEach(function (x) { var n = x.ajoute ? NB - 1 : J ? jIdx(x) : Math.min(5, x.succes || 0), wt = J ? mins(x) : 1; all[n] += wt; if (modeExam(x)) inn[n] += wt; sum += J ? wt : (x.ajoute ? 0 : n); });
    var w = cv.clientWidth || 320, h = Math.round(Math.min(Math.max(230, w * (w > 600 ? 0.5 : 0.8)), 400)), dpr = window.devicePixelRatio || 1;
    cv.width = w * dpr; cv.height = h * dpr; cv.style.height = h + 'px';
    var g = cv.getContext('2d'); g.scale(dpr, dpr); g.clearRect(0, 0, w, h);
    var cx = w / 2, cy = h / 2, R1 = h / 2 - 8, K = R1 / 100, R0 = R1 * .66, R2 = R1 * .62, R3 = R1 * .38;
    function ring(vals, ra, rb, hatch) {
      var tot = vals.reduce(function (a, b) { return a + b; }, 0), a0 = -Math.PI / 2;
      if (!tot) { g.beginPath(); g.arc(cx, cy, (ra + rb) / 2, 0, 7); g.lineWidth = ra - rb; g.strokeStyle = '#f6e3ea'; g.stroke(); return; }
      vals.forEach(function (v, i) {
        if (!v) return; var a1 = a0 + v / tot * Math.PI * 2 * ANIM;
        g.beginPath(); g.arc(cx, cy, ra, a0, a1); g.arc(cx, cy, rb, a1, a0, true); g.closePath();
        g.fillStyle = COL[i]; g.fill();
        if (hatch) { g.save(); g.clip(); waves(g, cx - ra, cy - ra, ra * 2, ra * 2, 'rgba(249,211,224,.9)', 7 * K / 1.2, 1.8 * K / 1.2, 1.2); g.restore(); }
        g.lineWidth = 2; g.strokeStyle = '#fff'; g.beginPath(); g.arc(cx, cy, ra, a0, a1); g.arc(cx, cy, rb, a1, a0, true); g.closePath(); g.stroke();
        if (v / tot > (J && rb < R0 * .9 ? .09 : .05)) { var am = (a0 + a1) / 2, rr = (ra + rb) / 2; g.fillStyle = i >= (J ? 5 : 4) ? '#5c1530' : '#fff'; g.font = 'bold ' + Math.round((J && rb < R0 * .9 ? 9 : 12) * K) + 'px Poppins, system-ui'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(J ? tfmt(v).replace(' ', '') : v, cx + Math.cos(am) * rr, cy + Math.sin(am) * rr); }
        a0 = a1;
      });
    }
    ring(all, R1, R0, false); ring(inn, R2, R3, true);
    g.fillStyle = '#ad1457'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.font = 'bold ' + Math.round(22 * K) + 'px Poppins, system-ui'; g.fillText(J ? tfmt(sum) : (L.length ? fmt1(sum / Math.max(1, L.filter(function (x) { return !x.ajoute; }).length)) : '–'), cx, cy - 6 * K);
    g.fillStyle = '#8a6573'; g.font = Math.round(10 * K) + 'px Poppins, system-ui'; g.fillText(J ? 'à réviser' : 'moy. sur 5', cx, cy + 12 * K);
    
  }
  /* courbe de l'oubli : note obtenue à chaque révision selon le nombre de jours écoulés depuis la précédente */
  /* ---------- courbe de l'oubli : points, baisse due au retard ---------- */
  var DEC = null, MINPTS = 5;
  function pinkCol(a, al) { var c = scale(Math.min(5, a) * 0.8 + 0.2), m = /(\d+),(\d+),(\d+)/.exec(c); return 'rgba(' + m[1] + ',' + m[2] + ',' + m[3] + ',' + al + ')'; }
  function greyCol(a, al) { var f = Math.min(5, a) / 5, v = Math.round(70 + 135 * f); return 'rgba(' + v + ',' + v + ',' + (v + 5) + ',' + al + ')'; }
  function oubliAll() {
    var P = [], lim = TODAY() - 100; (data.hist || []).forEach(function (h) {
      if (!h.avant || !h.avant.evalue || !h.jour || dnum(h.jour) < lim || typeof h.niveau !== 'number') return;
      var g = dnum(h.jour) - dnum(h.avant.evalue), a = Math.min(11, h.avant.succes || 0);
      if (g < 0 || g > 200) return;
      var I = interval(a), tol = Math.max(1, Math.round(I * 0.2)), rel = g - I;
      if (a <= 5 && g > 100) return;
      if (a > 5 && g <= interval(5)) { a = 5; I = interval(5); tol = Math.max(1, Math.round(I * 0.2)); rel = g - I; }
      P.push({ g: g, n: Math.min(5, h.niveau), a: a, I: I, tol: tol, rel: rel, pink: Math.abs(rel) <= tol, late: rel > tol });
    }); return P;
  }
  /* modèle : note attendue = a0 · e^(−(retard)/τ) ; τ ajusté sur les points en retard. Niveaux 0 à 5 : chacun le sien ; indice 6 = tous les niveaux au-dessus de 5, comptés depuis le jour prévu */
  function fitDecay(Q, a, gOf, I) {
    if (Q.length < MINPTS) return null;
    var pk = Q.filter(function (p) { return p.pink; }), lt = Q.filter(function (p) { return p.rel >= -p.tol; }), a0 = Math.max(0.3, pk.length >= 2 ? mean(pk.map(function (p) { return p.n; })) : Math.min(5, a + 1)), tau = Infinity;
    if (lt.length >= 3) {
      var best = 1e18; for (var T = 2; T <= 600; T = Math.ceil(T * 1.12)) {
        var e = 0; lt.forEach(function (p) { var d = p.n - a0 * Math.exp(-(gOf(p) - I) / T); e += d * d; });
        if (e < best) { best = e; tau = T; }
      }
    }
    return { a: a, a0: a0, I: I, tau: tau, n: Q.length, late: lt.length };
  }
  function decay() {
    if (DEC) return DEC;
    var P = oubliAll(), lv = [];
    for (var a = 0; a <= 5; a++) lv.push(fitDecay(P.filter(function (p) { return p.a === a; }), a, function (p) { return p.g; }, interval(a)));
    lv.push(fitDecay(P.filter(function (p) { return p.a > 5; }), 6, function (p) { return p.rel; }, 0));
    DEC = { lv: lv, P: P }; return DEC;
  }
  function decayAt(m, gap) { if (gap <= m.I || !isFinite(m.tau)) return m.a0; return m.a0 * Math.exp(-(gap - m.I) / m.tau); }
  function lateDays(x) { var d = Math.floor(TODAY() - revision(x)); return d > 0 ? d : 0; }
  /* niveau effectif (peut avoir une virgule) : le niveau affiché baisse avec le retard, d'après la courbe de décroissance */
  /* LA courbe d'un niveau (celle affichée) : moyenne lissée de tous ses points, qui glisse vers l'estimation là où les points manquent.
     sel 0 à 5 : d = jours écoulés depuis la révision précédente ; sel 6 (« 6+ ») : d = jours depuis la date prévue */
  /* régression isotone : la courbe ne remonte jamais avec le temps (blocs fusionnés en moyenne pondérée) */
  function pava(v, w) {
    var bl = []; v.forEach(function (x, i) { bl.push({ s: x * w[i], w: w[i], n: 1 }); while (bl.length > 1 && bl[bl.length - 2].s / bl[bl.length - 2].w < bl[bl.length - 1].s / bl[bl.length - 1].w) { var q = bl.pop(), p = bl[bl.length - 1]; p.s += q.s; p.w += q.w; p.n += q.n; } });
    var out = []; bl.forEach(function (b) { for (var k = 0; k < b.n; k++) out.push(b.s / b.w); }); return out;
  }
  function curveArr(sel) {
    var D = decay(); D.ca = D.ca || {}; if (D.ca[sel]) return D.ca[sel];
    var big = sel === 6, lo = big ? -150 : 0, hi = 220, v = [], w = [];
    var MD = D.lv[sel] || (big ? { a: 6, a0: 5, I: 0, tau: Infinity } : { a: sel, a0: Math.min(5, sel + 1), I: interval(sel), tau: Infinity });
    var Q = D.P.filter(function (p) { return big ? p.a > 5 : p.a === sel; });
    for (var d = lo; d <= hi; d++) {
      var sw = 0, sv = 0; Q.forEach(function (p) { var z = ((big ? p.rel : p.g) - d) / 7, wt = Math.exp(-z * z / 2); sw += wt; sv += wt * p.n; });
      var ev = Math.min(5, big ? decayAt(MD, Math.max(0, d)) : modelNote(MD, d)), k = Math.min(1, sw / 3);
      v.push(Math.max(0, Math.min(5, sw > 0 ? k * (sv / sw) + (1 - k) * ev : ev))); w.push(Math.max(0.05, sw));
    }
    return (D.ca[sel] = { lo: lo, hi: hi, v: pava(v, w) });
  }
  function curveAt(sel, d) { var A = curveArr(sel); d = Math.max(A.lo, Math.min(A.hi, Math.round(d))); return A.v[d - A.lo]; }
  /* niveau effectif : le niveau affiché × la baisse lue sur la courbe entre la date prévue et aujourd'hui */
  function effLvl(x) {
    var L = lvl(x); if (data.reglages.baisseOff) return L;
    var late = lateDays(x); if (!late) return L;
    var b = Math.min(5, L), base = L > 5 ? curveAt(6, 0) : curveAt(L, interval(L)), now = L > 5 ? curveAt(6, late) : curveAt(L, interval(L) + late);
    var r = base > 0 ? Math.min(1, now / base) : 1;
    return Math.round((b * r + (L - b)) * 10) / 10;
  }
  function drawOubli(cv) {
    var D = decay(), PA = D.P, sel = data.reglages.oubliNiv; sel = typeof sel === 'number' ? sel : -1;
    var big = sel === 6, xmin = 0, xmax = 100;
    if (big) { xmin = -20; PA.forEach(function (p) { if (p.a > 5 && p.rel < xmin) xmin = p.rel; }); xmin = Math.floor(xmin / 10) * 10; }
    function gx(p) { return big ? p.rel : p.g; }
    var P = (sel >= 0 ? PA.filter(function (p) { return big ? p.a > 5 : p.a === sel; }) : PA).filter(function (p) { return gx(p) >= xmin && gx(p) <= xmax; }), PK = P.filter(function (p) { return p.pink; });
    var w = cv.clientWidth || 320, h = Math.round(Math.min(Math.max(220, w * 0.55), 340)), dpr = window.devicePixelRatio || 1;
    cv.width = w * dpr; cv.height = h * dpr; cv.style.height = h + 'px';
    var g = cv.getContext('2d'); g.scale(dpr, dpr); g.clearRect(0, 0, w, h); g.globalAlpha = ANIM;
    var L0 = 30, R0 = w - 10, T = 14, B = h - 26;
    function X(d) { return L0 + (R0 - L0) * (d - xmin) / (xmax - xmin); } function Y(v) { return B - (B - T) * v / 5; }
    g.font = '10px Poppins, system-ui'; g.textAlign = 'right'; g.fillStyle = '#8a6573'; g.strokeStyle = '#f0dde4'; g.lineWidth = 1;
    for (var v = 0; v <= 5; v++) { g.beginPath(); g.moveTo(L0, Y(v)); g.lineTo(R0, Y(v)); g.stroke(); g.fillText(v, L0 - 5, Y(v) + 3); }
    g.textAlign = 'center'; (big ? [xmin].concat(xmin <= -40 ? [] : []).concat([0, 25, 50, 75, 100]) : [0, 10, 25, 50, 75, 100]).forEach(function (d) { g.fillText(big ? (d === 0 ? 'J0' : (d > 0 ? '+' : '') + d + ' j') : d + ' j', X(d), B + 15); });
    g.fillStyle = 'rgba(249,211,224,.55)'; g.fillRect(L0, Y(5), R0 - L0, Y(4.5) - Y(5));
    var iv = big ? [0] : sel >= 0 ? [interval(sel)] : data.reglages.intervalles.slice(0, 6);
    g.setLineDash([3, 3]); g.strokeStyle = '#e0a3b8'; iv.forEach(function (d) { if (d <= xmax) { g.beginPath(); g.moveTo(X(d), T); g.lineTo(X(d), B); g.stroke(); g.fillStyle = '#b55a7c'; g.fillText(big ? 'prévu' : 'J' + d, X(d), T - 3); } }); g.setLineDash([]);
    var MODEL = sel >= 0 ? (big ? 6 : sel) : -1;
    if (!P.length && MODEL < 0) return;
    P.filter(function (p) { return !p.pink; }).forEach(function (p) { g.fillStyle = greyCol(Math.min(5, p.a), .6); g.beginPath(); g.arc(X(gx(p)), Y(p.n), 3, 0, 7); g.fill(); });
    PK.forEach(function (p) { g.fillStyle = pinkCol(Math.min(5, p.a), .6); g.beginPath(); g.arc(X(gx(p)), Y(p.n), 3.4, 0, 7); g.fill(); });
    var lastBx = -99;
    iv.forEach(function (d) {
      if (d > xmax) return; var q = PK.filter(function (p) { return big ? true : p.I === d; });
      if (!q.length) return; var m = q.reduce(function (a, p) { return a + p.n; }, 0) / q.length, few = q.length < 3, bx = Math.min(R0 - 16, Math.max(L0 + 16, X(d))), by = B - 12; if (bx - lastBx < 34) by -= 22; lastBx = bx;
      g.fillStyle = few ? '#e4dde0' : scale(m); g.beginPath(); if (g.roundRect) g.roundRect(bx - 16, by - 9, 32, 18, 9); else g.rect(bx - 16, by - 9, 32, 18); g.fill();
      g.fillStyle = few ? '#8a7a80' : (m < 3 ? '#fff' : '#5c1530'); g.font = 'bold 11px Poppins, system-ui'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(fmt1(Math.round(m * 10) / 10), bx, by); g.textBaseline = 'alphabetic';
    });
    /* courbe : rose là où assez de tes points l'appuient, grise là où elle est estimée (pas assez de points) */
    var pts = [], sg = 7, MD = MODEL >= 0 ? (D.lv[MODEL] || (big ? { a: 6, a0: 5, I: 0, tau: Infinity } : { a: sel, a0: Math.min(5, sel + 1), I: interval(sel), tau: Infinity })) : null;
    for (var d = xmin; d <= xmax; d += 1) {
      var sw = 0, sv = 0; (sel >= 0 ? P : PK).forEach(function (p) { var z = (gx(p) - d) / sg, wgt = Math.exp(-z * z / 2); sw += wgt; sv += wgt * p.n; });
      var k = Math.min(1, sw / 3), inf = sw >= 0.5; /* trait plein dès qu'un point (à une semaine environ) influence la courbe */
      if (MD) pts.push({ x: d, y: curveAt(MODEL, d), pink: inf });
      else if (inf) pts.push({ x: d, y: sv / sw, pink: true });
    }
    if (MODEL < 0 && pts.length > 1) { var mono = pava(pts.map(function (p) { return p.y; }), pts.map(function () { return 1; })); pts.forEach(function (p, i) { p.y = mono[i]; }); }
    if (pts.length > 1) {
      var runs = [], cur = [pts[0]]; for (var i = 1; i < pts.length; i++) { if (pts[i].pink !== pts[i - 1].pink || pts[i].x - pts[i - 1].x > 1) { cur.push(pts[i]); runs.push(cur); cur = [pts[i]]; } else cur.push(pts[i]); } runs.push(cur);
      runs.forEach(function (run) {
        if (run.length < 2) return; var pk = run[0].pink;
        g.beginPath(); run.forEach(function (p, i) { if (i) g.lineTo(X(p.x), Y(p.y)); else g.moveTo(X(p.x), Y(p.y)); });
        g.lineTo(X(run[run.length - 1].x), B); g.lineTo(X(run[0].x), B); g.closePath(); var topY = B; run.forEach(function (p) { topY = Math.min(topY, Y(p.y)); }); var gr = g.createLinearGradient(0, topY, 0, B), k = pk ? 1 : .55; gr.addColorStop(0, 'rgba(248,83,139,' + (.5 * k) + ')'); gr.addColorStop(.6, 'rgba(248,83,139,' + (.16 * k) + ')'); gr.addColorStop(1, 'rgba(248,83,139,0)'); g.fillStyle = gr; g.fill();
        g.strokeStyle = '#ad1457'; g.lineWidth = 3; g.lineJoin = 'round'; g.lineCap = 'round'; g.setLineDash(pk ? [] : [7, 6]); g.beginPath(); run.forEach(function (p, i) { if (i) g.lineTo(X(p.x), Y(p.y)); else g.moveTo(X(p.x), Y(p.y)); }); g.stroke(); g.setLineDash([]);
      });
    }
  }
  /* note attendue après `gap` jours pour un exo de niveau `pl` ; null si pas assez de données pour ce niveau */
  function modelNote(m, gap) {
    if (gap >= m.I) return decayAt(m, gap);
    var early = decay().P.filter(function (p) { return p.a === m.a && p.rel < -p.tol; });
    if (early.length >= MINPTS) { var sw = 0, sv = 0, sg = Math.max(1.5, m.I * 0.2); early.forEach(function (p) { var z = (p.g - gap) / sg, w = Math.exp(-z * z / 2); sw += w; sv += w * p.n; }); if (sw >= 0.8) return Math.max(m.a0, sv / sw); }
    return 5 - (5 - m.a0) * Math.sqrt(Math.max(0, gap) / Math.max(1, m.I));
  }
  function expectNote(pl, gap) { return pl > 5 ? curveAt(6, gap - interval(pl)) : curveAt(pl, gap); }
  function drawCharge(cv, L, t, ax, extra, noDraw, opt) {
    opt = opt || {}; var N = opt.N || 42, LOG = [], late = [], lateEx = [], ex = [], nm = [], pv = [], pvL = [], pvE = [], pvLE = [], cnt = []; for (var i = 0; i < N; i++) { late.push(0); lateEx.push(0); ex.push(0); nm.push(0); pv.push(0); pvL.push(0); pvE.push(0); pvLE.push(0); cnt.push(0); }
    var RET = !data.reglages.prevOff || !!opt.all, vc = 0;
    var cand = [];
    data.ex.forEach(function (x, i) { if ((opt.all || visible(x)) && x.evalue) cand.push({ x: x, r: revision(x), ex: modeExam(x), i: i, m: mins(x) }); });
    function lvO(o) { return o.v ? o.L : prio(o.x); }
    function srt() { cand.sort(cmpPrio); }
    srt();
    var done = {};
    for (var d = 0; d < N; d++) {
      var wd = new Date((t + d) * DAY).getUTCDay(), bud = data.reglages.planning[(wd + 6) % 7];
      bud = typeof bud === 'number' && !isNaN(bud) ? bud : 1e9; if (extra && bud < 1e9 && bud > 0) bud += extra;
      var cum = 0, fait = d === 0 ? dejaFait() : 0; SIMD = t + d;
      if (d > 0) { cand.forEach(function (o) { o.ex = examAt(o.x, t + d); }); srt(); } /* mode examen et priorité recalculés au jour simulé */
      var effB = bud, effF = fait; if (bud >= 1e9) { effB = d === 0 ? minutesRestantes() : 1440; effF = d === 0 ? 0 : fait; }
      var take = function (o) {
        cum += o.m;
        done[o.i] = 1; cnt[d]++;
        if (RET) {
          var ox = o.x, gp = t + d - (o.v ? o.ev : dnum(o.x.evalue));
          if (gp >= 0) {
            var pl = o.v ? o.L : lvl(o.x), nt = expectNote(pl, gp), nl = nt === null ? pl + 1 : Math.min(5, Math.round(nt)); if (nt !== null && nl >= 5 && pl >= 5) nl = pl + 1;
            LOG.push({ id: ox.id, d: t + d, n: nl, m: o.m }); var r2 = Math.max(revisionAt(ox, t + d, interval(nl), t + d), t + d + 1), lb = lastBeforeExam(ox, t + d);
            if (lb) r2 = Math.max(t + d + interval(nl), examNum(ox.semestre, ox.matiere) + 1); /* dernière révision d'avant examen : la suivante reprend le rythme normal après l'examen */
            if (r2 < t + N) cand.push({ v: true, x: ox, L: nl, ev: t + d, r: r2, ex: lb ? false : examAt(ox, t + d), i: 'v' + (vc++), m: o.m });
          }
        }
        if (o.v) { if (o.r < t + d) { if (o.ex) pvLE[d] += o.m; else pvL[d] += o.m; } else if (o.ex) pvE[d] += o.m; else pv[d] += o.m; } else if (o.r < t + d) { if (o.ex) lateEx[d] += o.m; else late[d] += o.m; } else if (o.ex) ex[d] += o.m; else nm[d] += o.m;
      };
      cand.forEach(function (o) {
        if (done[o.i] || o.r >= t + d + 1) return;
        if (d === 0 && o.x && o.x.reporte === todayISO()) return;
        if (examNum(o.x.semestre, o.x.matiere) === t + d) return; /* jour de l'examen : rien dans cette matière, comme dans plan() */
        if (effB >= 1e9 || cum + o.m <= effB - effF || (cum === 0 && effB > effF)) take(o);
      });
      /* budget de demain dépassé : on avance d'abord à aujourd'hui (la veille) ce qui y est prévu, s'il reste de la place */
      if (bud < 1e9 && d < N - 1) {
        var bT = data.reglages.planning[(wd + 1 + 6) % 7];
        if (typeof bT === 'number' && !isNaN(bT) && bT > 0) {
          srt(); var qT = cand.filter(function (o) { return !done[o.i] && o.r < t + d + 2; }), cT = 0, ovf = [];
          qT.forEach(function (o) { if (cT + o.m <= bT || (cT === 0)) cT += o.m; else ovf.push(o); });
          ovf.forEach(function (o) { if (o.r >= t + d + 1 && cum + o.m <= effB - effF) take(o); });
        }
      }
    }
    SIMD = null;
    var lastLate = -1; for (var q0 = 0; q0 < N; q0++) if (late[q0] + lateEx[q0] + pvL[q0] + pvLE[q0] > 0) lastLate = q0;
    var res = { lastLate: lastLate, N: N, log: LOG }; if (noDraw) return res;
    var w = 4 + N * 40 + 4, h = 210, dpr = window.devicePixelRatio || 1;
    cv.width = w * dpr; cv.height = h * dpr; cv.style.height = h + 'px'; cv.style.width = w + 'px';
    var g = cv.getContext('2d'); g.scale(dpr, dpr); g.clearRect(0, 0, w, h);
    var tot = late.map(function (_, i) { return late[i] + lateEx[i] + ex[i] + nm[i] + pv[i] + pvL[i] + pvE[i] + pvLE[i]; }), mx = Math.max.apply(null, tot.concat([60]));
    var step = 60; [60, 120, 240, 360, 480, 720, 1440].some(function (c) { step = c; return mx / c <= 6; }); mx = Math.ceil(mx / step) * step;
    var L0 = 4, B = h - 46, T = 8, bw = (w - L0 - 4) / N;
    function rr(x, y, w2, h2, r) { g.beginPath(); if (g.roundRect) g.roundRect(x, y, w2, h2, r); else g.rect(x, y, w2, h2); }
    /* fond des colonnes : aujourd'hui en rose pâle, week-ends très léger */
    for (var j0 = 0; j0 < N; j0++) {
      var wd0 = new Date((t + j0) * DAY).getUTCDay(), bx = L0 + j0 * bw + 1;
      if (j0 === 0) { g.fillStyle = '#fde6ee'; rr(bx, T - 2, bw - 2, B - T + 44, 8); g.fill(); }
      else if (wd0 === 0 || wd0 === 6) { g.fillStyle = '#fdf3f6'; rr(bx, T - 2, bw - 2, B - T + 44, 8); g.fill(); }
    }
    g.font = '10px Poppins, system-ui'; g.fillStyle = '#a58593'; g.strokeStyle = '#f1dde5'; g.textAlign = 'right'; g.lineWidth = 1; g.setLineDash([2, 4]);
    var ga = null; if (ax) { ax.width = 34 * dpr; ax.height = h * dpr; ax.style.width = '34px'; ax.style.height = h + 'px'; ga = ax.getContext('2d'); ga.scale(dpr, dpr); ga.clearRect(0, 0, 34, h); ga.font = '10px Poppins, system-ui'; ga.fillStyle = '#a58593'; ga.textAlign = 'right'; }
    for (var v = 0; v <= mx; v += step) { var y = B - (B - T) * v / mx; if (ax) { ga.fillText(v >= 60 ? (v / 60) + ' h' : v + ' min', 30, y + 3); } }
    g.setLineDash([]); g.textAlign = 'center';
    for (var j = 0; j < N; j++) {
      var x0 = L0 + j * bw + bw * 0.16, ww = bw * 0.68, yy = B, th = (B - T) * tot[j] / mx * ANIM;
      if (th > 0) {
        g.save(); rr(x0, B - th, ww, th + 6, Math.min(6, ww / 2)); g.clip();
        [[late[j], C_LATE, 0], [lateEx[j], C_LATE, 1], [nm[j], C_NORM, 0], [ex[j], C_NORM, 1], [pvL[j], C_PVL, 0], [pvLE[j], C_PVL, 2], [pvE[j], C_PV, 2], [pv[j], C_PV, 0]].forEach(function (s) {
          if (!s[0]) return; var hh = (B - T) * s[0] / mx * ANIM; g.fillStyle = s[1]; g.fillRect(x0, yy - hh, ww, hh);
          if (s[2]) { g.save(); g.beginPath(); g.rect(x0, yy - hh, ww, hh); g.clip(); waves(g, x0, yy - hh, ww, hh, s[2] === 2 ? '#e1e1e1' : '#f9d3e0', 5, 1.6, 1.2); g.restore(); }
          g.fillStyle = 'rgba(255,255,255,.7)'; g.fillRect(x0, yy - hh, ww, 1);
          yy -= hh;
        });
        g.restore();
      }
      var dd = new Date((t + j) * DAY), cx = L0 + j * bw + bw / 2; g.textAlign = 'center';
      g.fillStyle = j === 0 ? '#ad1457' : '#a58593'; g.font = (j === 0 ? 'bold ' : '') + '8px Poppins, system-ui'; g.fillText((j === 0 ? 'AUJ.' : JS[dd.getUTCDay()]).toUpperCase(), cx, B + 12);
      g.fillStyle = '#5c1530'; g.font = 'bold 10px Poppins, system-ui'; g.fillText(String(dd.getUTCDate()), cx, B + 24);
      g.fillStyle = '#b79aa7'; g.font = '8px Poppins, system-ui'; g.fillText(cnt[j] + ' ex.', cx, B + 35);
    }
    return res;
  }

  /* ---------- vue : réglages ---------- */
  function numInput(val, cb, w) {
    var i = document.createElement('input'); i.type = 'number'; i.inputMode = 'numeric'; i.value = val === null || val === undefined || isNaN(val) ? '' : val;
    i.min = 0; if (w) i.style.width = w; i.addEventListener('change', function () { var v = i.value === '' ? null : Math.max(0, Math.round(+i.value)); if (v !== null && isNaN(v)) v = null; if (v !== null) i.value = v; cb(v); save(); toast('Réglage enregistré.'); }); return i;
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
    if (badge !== undefined) { var bd = el('i', 'sbadge', String(badge)); bd.style.background = scale(badge); bd.style.color = badge < 3 ? '#fff' : '#5c1530'; l.appendChild(bd); }
    l.appendChild(el('span', '', label)); r.appendChild(l);
    var f = el('span', 'sf'); f.appendChild(numInput(val, cb)); f.appendChild(el('em', '', unit)); r.appendChild(f); card.appendChild(r);
  }
  var setTab = null;
  function switchRow(card, label, get, set, sub) {
    var r = el('div', 'srow'), l = el('span', 'sl'); l.style.flexDirection = 'column'; l.style.alignItems = 'flex-start'; l.appendChild(el('span', '', label)); if (sub) { var sm = el('small', 'muted', sub); sm.style.display = 'block'; l.appendChild(sm); } r.appendChild(l);
    var b = el('button', 'sw' + (get() ? ' on' : '')); b.type = 'button'; b.setAttribute('role', 'switch'); b.setAttribute('aria-checked', get() ? 'true' : 'false'); b.appendChild(el('i'));
    b.addEventListener('click', function () { set(!get()); save(); renderSet(); }); r.appendChild(b); card.appendChild(r);
  }
  function rulesCard() {
    var R = data.reglages, c = el('div', 'scard rules'), iv = R.intervalles.slice(0, 6).map(function (v, i) { return i + ' → ' + v + ' j'; }).join(' · ');
    function sec(t, lines) { var d = el('div', 'rsec'); d.appendChild(el('h3', '', t)); lines.forEach(function (l) { d.appendChild(el('p', '', l)); }); c.appendChild(d); }
    var bud = R.planning.map(function (v, i) { return JOURS[i] + ' ' + (typeof v === 'number' && !isNaN(v) ? v + ' min' : 'sans limite'); }).join(' · ');
    c.appendChild(el('h2', 'rtitle', 'Toutes les règles de l’appli'));
    sec('Niveaux et intervalles', ['Quand tu refais un exercice (✓) tu lui donnes un niveau de 0 à 5. La prochaine révision tombe après : ' + iv + '.', 'Après un 5, chaque 5 de plus d’affilée repousse la révision de ' + R.pasApres5 + ' j de plus (niveaux 6, 7…).']);
    sec('Mode examen', ['À moins de ' + R.debutExam + ' j d’un examen, les révisions de la matière sont compressées pour que tout soit vu avant l’examen : fait plus de ' + R.seuilButoire + ' j avant, on s’arrête ' + R.butoireSi + ' j avant ; sinon ' + (R.butoireSinon > 1 ? R.butoireSinon + ' j' : 'la veille') + ' avant.', 'Le mode est jugé à la date de chaque révision : une révision qui tombe après l’examen redevient normale. Aucune révision n’est prévue le jour de l’examen, ni après une révision déjà faite dans la période finale. Un exo au niveau 5 ou plus dont la révision normale tombe après l’examen n’est pas compressé : il reste hors mode examen et n’est pas reproposé avant.', 'Les exos en mode examen passent avant les autres. Entre matières, la plus en retard sur l’objectif du jour (le repère de la barre des cartes d’examen moins ta moyenne) passe d’abord ; dans une matière, les niveaux les plus bas, puis la date de révision.']);
    sec('Budget du jour et priorités', ['Budget par jour : ' + bud + '.', 'Les exos hors mode examen sont classés par date de révision la plus ancienne, puis niveau le plus bas. Ceux qui ne rentrent pas dans le budget attendent (un plus court peut passer devant).', 'Si le budget de demain est dépassé, ce qui y est prévu est d’abord avancé à aujourd’hui quand il reste de la place, avant d’être repoussé.', 'Sans limite : aujourd’hui, le temps affiché ne dépasse pas les heures qu’il reste jusqu’à demain, arrondies à l’heure du dessus (« Il reste X h ») ; les autres jours sans limite comptent au plus 24 h.']);
    sec('Précisions (version 179)', ['Une révision n’est jamais prévue le jour même : au plus tôt le lendemain.', 'Une fois l’examen passé, l’exo revient aux intervalles normaux ; après la dernière révision d’avant examen, la suivante reprend le rythme normal.', 'Le jour de l’examen, les exos de la matière ne sont pas proposés.', '« Annuler » (dans le message qui suit une note, une suppression, un report ou une remise à zéro du minuteur, ou dans l’historique) remet l’exo exactement comme avant. Seule la dernière note d’un exo s’annule, et seulement s’il n’a pas changé depuis.', 'Une matière ne se supprime que si aucun exercice n’y est rattaché (corbeille comprise). Un semestre disparaît avec sa dernière matière.']);
    sec('Reporter', ['La flèche écarte un exo d’aujourd’hui : il ne prend plus de temps dans ton budget, mais sa date de révision ne change pas. Il revient demain.']);
    sec('Note effective (retard)', ['Un exo en retard perd de sa valeur : sa note affichée ne change pas, mais sa note effective baisse (elle peut avoir une virgule). Elle sert dans « Moyenne par matière » et dans les examens.', 'Elle vaut le niveau multiplié par la baisse lue sur la courbe de l’oubli de ce niveau, entre la date prévue et aujourd’hui. C’est exactement la courbe affichée (filtre du niveau).', 'Cette règle est ' + (R.baisseOff ? 'désactivée' : 'activée') + ' (réglage dans Niveaux).']);
    sec('Courbe de l’oubli', ['Chaque révision est un point, placé au nombre de jours réellement écoulés depuis la précédente. Rose : faite à ±20 % du J prévu pour son niveau (au moins 1 j). Gris : en retard ou trop en avance. Seuls les roses comptent dans la moyenne lissée ; les gris servent à mesurer la baisse due au retard.', 'La courbe est pleine là où assez de tes points l’appuient, en pointillés là où elle est estimée faute de données (à la date prévue d’un niveau, la note attendue est ce niveau + 1). Elle ne remonte jamais avec le temps : une bosse de tes points est lissée en moyenne avec le creux qui suit.', 'Le filtre « 6+ » regroupe les niveaux au-dessus de 5, comptés depuis leur date prévue ; un 6 ou plus refait avant 50 j va dans le filtre 5, à son vrai nombre de jours.']);
    sec('Prévisions de charge', ['Chaque exo prévu est rejoué dans le futur : à la date prévue il est supposé refait, et sa note prévue est lue sur la courbe de l’oubli de son niveau (celle affichée), au nombre de jours écoulés depuis la révision précédente.', 'La date de rattrapage est le dernier jour où il reste du retard dans les prévisions.']);
    sec('Exercices « Ajouté »', ['Un exo ajouté sans note n’écrit rien dans l’historique. Sa révision est toujours aujourd’hui, avec la priorité la plus basse (comme un 3 prévu). Il est gris dans les anneaux et ne compte pas dans les moyennes. Sa première révision lui donne sa vraie note.']);
    sec('Minuteur et série', ['Le minuteur décompte le temps prévu de l’exo : vert tant que tu es dans les temps, rouge au-delà (« +3:12 ») sans s’arrêter. Le temps total est repris quand tu valides.', 'La flamme 🔥 compte les jours de suite avec au moins une révision.']);
    sec('Filtres', ['Les filtres de semestres et de matières s’appliquent à tous les onglets. Une matière présente dans plusieurs semestres ne compte qu’une fois.']);
    return c;
  }
  function renderSet() {
    var box = $('v-set'); box.textContent = ''; var R = data.reglages;
    var SI = { planning: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>', niveaux: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>', apparence: '<circle cx="12" cy="12" r="9"/><path d="M12 3a9 9 0 0 0 0 18z"/>', donnees: '<ellipse cx="12" cy="6" rx="8" ry="3"/><path d="M4 6v12c0 1.7 3.6 3 8 3s8-1.3 8-3V6M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3"/>', regles: '<path d="M6 3h9l4 4v14H6zM14 3v5h5M9 13h7M9 17h7"/>' };
    var SEC = [['planning', 'Planning', 'Mode examen, budget par jour, durée par défaut'], ['niveaux', 'Niveaux', 'Intervalles et baisse due au retard'], ['apparence', 'Apparence', 'Thème et tableau de bord'], ['donnees', 'Données', 'Synchronisation, import, export, sauvegardes'], ['regles', 'Règles', 'Toutes les règles de l’appli']];
    if (!setTab) {
      var lst = el('div', 'scard');
      SEC.forEach(function (o) { var b = el('button', 'drow'); b.type = 'button'; var ic = el('span', 'dic'); ic.innerHTML = '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' + SI[o[0]] + '</svg>'; b.appendChild(ic); var tx = el('span', 'dtx'); tx.appendChild(el('b', '', o[1])); tx.appendChild(el('small', '', o[2])); b.appendChild(tx); b.appendChild(el('span', 'dch', '›')); b.addEventListener('click', function () { setTab = o[0]; renderSet(); window.scrollTo(0, 0); }); lst.appendChild(b); });
      box.appendChild(lst); return;
    }
    var hd = el('div', 'sethead'), bk = el('button', 'xbtn'); bk.type = 'button'; bk.setAttribute('aria-label', 'Retour'); bk.innerHTML = '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 12H5M11 6l-6 6 6 6"/></svg>'; bk.addEventListener('click', function () { setTab = null; renderSet(); });
    hd.appendChild(bk); hd.appendChild(el('h2', '', SEC.filter(function (o) { return o[0] === setTab; })[0][1])); box.appendChild(hd);
    if (setTab === 'planning') {
    var c2 = setCard('Mode examen', 'flag');
    [['Début du mode examen : jours avant l’examen', 'debutExam', 'jours'], ['Butoire : seuil — un exo fait plus de … jours avant l’examen est « tôt », sinon « tard »', 'seuilButoire', 'jours'], ['Butoire si fait tôt : ne plus réviser … jours avant l’examen', 'butoireSi', 'jours'], ['Butoire sinon (fait tard) : ne plus réviser … jours avant l’examen (0 ou 1 = jusqu’à la veille de l’examen)', 'butoireSinon', 'jours']].forEach(function (a) {
      setRow(c2, a[0], R[a[1]], function (v) { R[a[1]] = v === null ? 0 : v; }, a[2]);
    });
      box.appendChild(c2);
      var c3 = setCard('Planning de la semaine (minutes)', 'clock'), wk = el('div', 'week');
      JOURS.forEach(function (j, i) {
        var d = el('label', 'wday'); d.appendChild(el('b', '', j)); d.appendChild(numInput(R.planning[i], function (v) { R.planning[i] = v; })); d.appendChild(el('em', '', 'min')); wk.appendChild(d);
      });
      c3.appendChild(wk); c3.appendChild(el('p', 'muted', 'Case vide = sans limite ce jour-là.')); box.appendChild(c3);
      var c4 = setCard('Temps par défaut', 'clock'); setRow(c4, 'Durée d’un exercice sans durée indiquée', R.minutesDefaut, function (v) { R.minutesDefaut = v === null || v < 1 ? 5 : v; }, 'min'); box.appendChild(c4);
    } else if (setTab === 'niveaux') {
      var c1 = setCard('Intervalles de révision', 'cal');
      for (var n = 0; n < 6; n++) (function (n) {
        setRow(c1, NIV[n] + ' : prochaine révision dans', R.intervalles[n], function (v) { R.intervalles[n] = v === null ? 0 : v; }, 'jours', n);
      })(n);
      setRow(c1, 'Après un 5 : chaque 5 de plus d’affilée (note 6 = 2 fois 5 de suite, note 7 = 3 fois…) repousse la révision de', R.pasApres5, function (v) { R.pasApres5 = v === null ? 0 : v; }, 'jours');
      box.appendChild(c1);
      var cb = setCard('Baisse due au retard', 'flag');
      switchRow(cb, 'Faire baisser la note d’un exo en retard', function () { return !R.baisseOff; }, function (v) { R.baisseOff = !v; }, 'La note affichée ne change pas ; la note effective baisse d’après ta courbe de l’oubli.');
      var D = decay(); D.lv.forEach(function (m, a) {
        var r = el('div', 'srow'); var l = el('span', 'sl'); var bd = el('i', 'sbadge', a === 6 ? '6+' : String(a)); bd.style.background = scale(Math.min(5, a)); bd.style.color = a < 3 ? '#fff' : '#5c1530'; l.appendChild(bd);
        var bs = a === 6 ? curveAt(6, 0) : curveAt(a, interval(a)), wk = a === 6 ? curveAt(6, 7) : curveAt(a, interval(a) + 7), pc = bs > 0 ? Math.max(0, Math.round((1 - wk / bs) * 100)) : 0, nP = D.P.filter(function (p) { return a === 6 ? p.a > 5 : p.a === a; }).length;
        l.appendChild(el('span', '', nP + ' révision' + (nP > 1 ? 's' : '') + ' · perd environ ' + pc + ' % la première semaine de retard' + (nP < MINPTS ? ' (surtout estimé)' : ''))); r.appendChild(l); cb.appendChild(r);
      });
      box.appendChild(cb);
    } else if (setTab === 'apparence') {
    var cT = setCard('Thème', 'cal'), sw = el('div', 'seg'), cur = themeDeg();
    THEMES.forEach(function (t) {
      var b = el('button', cur[0] === t[0] ? 'on' : '', t[0]); b.type = 'button';
      var dot = el('i', 'tdot'); dot.style.filter = 'hue-rotate(' + (t[1] - cur[1]) + 'deg)'; b.insertBefore(dot, b.firstChild);
      b.addEventListener('click', function () { try { localStorage.setItem('mes-exercices-theme', t[0]); } catch (e) { /* ignoré */ } applyTheme(); render(); });
      sw.appendChild(b);
    });
    cT.appendChild(sw); box.appendChild(cT);
      var cc = setCard('Tableau de bord', 'cal'), sg2 = el('div', 'seg'); [[1, '1 colonne'], [2, '2 colonnes']].forEach(function (o) { var bb = el('button', (R.dashCols === 2 ? 2 : 1) === o[0] ? 'on' : '', o[1]); bb.type = 'button'; bb.addEventListener('click', function () { R.dashCols = o[0]; save(); renderSet(); }); sg2.appendChild(bb); }); cc.appendChild(sg2); cc.appendChild(el('p', 'muted', 'Sur grand écran. L’ordre et l’affichage des cartes se règlent avec le crayon du tableau de bord.')); box.appendChild(cc);
    } else if (setTab === 'donnees') {
      var cd = el('div', 'scard'), ts = 0; try { ts = Number(localStorage.getItem(KEY + '-syncts') || 0); } catch (e) { /* ignoré */ }
      var IC2 = { sync: '<path d="M4 12a8 8 0 0 1 14-5.3L20 9M20 4v5h-5M20 12a8 8 0 0 1-14 5.3L4 15M4 20v-5h5"/>', imp: '<path d="M12 4v11M7 11l5 5 5-5M5 20h14"/>', exp: '<path d="M12 16V5M7 9l5-5 5 5M5 20h14"/>', his: '<path d="M4 12a8 8 0 1 0 3-6.2M4 4v5h5M12 8v4l3 2"/>', url: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>' };
      [['Synchronisation Drive', ts ? 'Dernière sauvegarde : ' + new Date(ts).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' }) + ' à ' + new Date(ts).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) : 'Pas encore de sauvegarde', 'syncBtn', 'sync'], ['Adresse de synchronisation', 'Changer le lien Apps Script', 'syncUrlBtn', 'url'], ['Importer un fichier', 'Excel, CSV ou sauvegarde .json', 'importSheet', 'imp'], ['Exporter mes données', 'Fichier .json', 'exportBtn', 'exp'], ['Restaurer une sauvegarde', 'Revenir à une ancienne version', 'versBtn', 'his']].forEach(function (o) {
        var b = el('button', 'drow'); b.type = 'button'; var ic = el('span', 'dic'); ic.innerHTML = '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' + IC2[o[3]] + '</svg>'; b.appendChild(ic);
        var tx = el('span', 'dtx'); tx.appendChild(el('b', '', o[0])); tx.appendChild(el('small', '', o[1])); b.appendChild(tx); b.appendChild(el('span', 'dch', '›'));
        b.addEventListener('click', function () { $(o[2]).click(); setTimeout(renderSet, 1500); }); cd.appendChild(b);
      });
      box.appendChild(cd);
    } else box.appendChild(rulesCard());
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
  /* ---------- flèche du temps : occurrences faites (roses) et prévues (grises) ---------- */
  function occDone(x) { return (data.hist || []).filter(function (h) { return h.id === x.id && h.jour && typeof h.niveau === 'number'; }).sort(function (a, b) { return a.ts - b.ts; }).map(function (h) { return { d: dnum(h.jour), n: h.niveau, m: h.m }; }); }
  /* vrai si une révision faite à la date d est déjà la dernière avant l'examen (butoire atteinte) */
  function lastBeforeExam(x, d) { var E = examNum(x.semestre, x.matiere), R = data.reglages; if (E === null || E < d || E - d > R.debutExam) return false; var X = Math.max(1, (E - d) > R.seuilButoire ? R.butoireSi : R.butoireSinon); return E - d <= X; }
  function occPred(x, end) {
    var out = [], lv = lvl(x), ev = x.ajoute ? TODAY() : dnum(x.evalue), d = Math.max(Math.floor(revision(x) + 1e-9), TODAY()), E0 = examNum(x.semestre, x.matiere);
    while (d <= end && out.length < 60) {
      if (E0 !== null && d === E0) { d = E0 + 1; continue; }
      var gp = d - ev, nt = expectNote(lv, gp), nl = nt === null ? lv + 1 : Math.min(5, Math.round(nt)); if (nt !== null && nl >= 5 && lv >= 5) nl = lv + 1;
      out.push({ d: d, n: nl, m: mins(x) }); if (lastBeforeExam(x, d)) { d = Math.max(d + interval(nl), E0 + 1); lv = nl; ev = out[out.length - 1].d; continue; } /* après la dernière révision d'avant examen : rythme normal */
      var r2 = Math.max(Math.floor(revisionAt(x, d, interval(nl), d) + 1e-9), d + 1); lv = nl; ev = d; d = r2;
    }
    return out;
  }
  /* rows : [{ name, x, done:[{d,n,m}], pred:[{d,n}] }] ; start/end : jours ; opt : { ppd, noNames, examDay, days, ten } */
  function buildTL(rows, start, end, opt) {
    opt = opt || {}; var ppd = opt.ppd || 12, W = Math.max(60, Math.ceil((end - start + 1) * ppd)), NW = opt.noNames ? 0 : 98, t = TODAY();
    var sc = el('div', 'tl' + (opt.ten ? ' ten' : '')), inn = el('div', 'tlin'); inn.style.width = (NW + W) + 'px';
    function px(d) { return Math.round((d - start + 0.5) * ppd); }
    var ax = el('div', 'tlax'), corner = el('div', 'tlc'); corner.style.width = NW + 'px'; if (NW) ax.appendChild(corner);
    var line = el('div', 'tlline'); line.style.width = W + 'px';
    if (opt.days) {
      for (var d = start; d <= end; d++) { var m = el('span', 'tlm day'), dt = new Date(d * DAY); m.style.left = px(d) + 'px'; m.textContent = String(dt.getUTCDate()); if (dt.getUTCDate() === 1 || d === start) { var mb = el('b', '', ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'][dt.getUTCMonth()]); m.insertBefore(mb, m.firstChild); } if (d === t) m.style.fontWeight = '800'; line.appendChild(m); }
    } else {
      var step = ppd >= 10 ? 7 : 14, d0 = start + ((8 - new Date(start * DAY).getUTCDay()) % 7);
      for (var d2 = d0; d2 <= end; d2 += step) { var m2 = el('span', 'tlm', fromNum(d2).slice(0, 5)); m2.style.left = px(d2) + 'px'; line.appendChild(m2); }
    }
    var ah = el('i', 'tlarrow'); line.appendChild(ah); ax.appendChild(line); inn.appendChild(ax);
    rows.forEach(function (r, i) {
      var row = el('div', 'tlr' + (i % 2 ? ' alt' : ''));
      if (NW) { var nm = el('div', 'tln', r.name); nm.title = r.name; if (r.x) nm.addEventListener('click', function () { openEditor(r.x.id); }); row.appendChild(nm); }
      var ar = el('div', 'tla'); ar.style.width = W + 'px';
      var all = [];
      r.pred.forEach(function (o) { if (o.d < start || o.d > end) return; all.push(o.d); var k = el('i', 'tk pred'); k.style.left = px(o.d) + 'px'; if (typeof o.n === 'number') k.appendChild(el('em', '', fmt1(o.n))); ar.appendChild(k); });
      r.done.forEach(function (o) { if (o.d < start || o.d > end) return; all.push(o.d); var k = el('i', 'tk done'); k.style.left = px(o.d) + 'px'; k.style.background = pinkCol(o.n, 1); k.appendChild(el('em', '', String(o.n))); ar.appendChild(k); });
      all.sort(function (a, b) { return a - b; }); for (var q = 1; q < all.length; q++) { var gp = Math.round(all[q] - all[q - 1]); if (gp * ppd >= 26) { var gl = el('span', 'tlgap', gp + ' j'); gl.style.left = ((px(all[q]) + px(all[q - 1])) / 2) + 'px'; ar.appendChild(gl); } }
      row.appendChild(ar); inn.appendChild(row);
    });
    var tl = el('i', 'tlnow'); tl.style.left = (NW + px(t)) + 'px'; inn.appendChild(tl);
    if (opt.examDay) { var ef = el('i', 'tlexam'); ef.style.left = (NW + px(opt.examDay)) + 'px'; ef.title = 'Examen'; inn.appendChild(ef); }
    sc.appendChild(inn);
    setTimeout(function () { sc.scrollLeft = Math.max(0, NW + px(t) - sc.clientWidth / 2 - NW / 2); }, 0);
    return sc;
  }
  /* ---------- vue détaillée d'un examen ---------- */
  var examSel = null, examFrom = 'exam', examRep = true;
  function openExam(m) { examSel = { semestre: m.semestre, nom: m.nom }; renderExamView(); var d = $('examDlg'); if (!d.open) d.showModal(); }
  function renderExamView() {
    var m = data.mats.filter(function (z) { return z.semestre === examSel.semestre && z.nom === examSel.nom; })[0], b = $('examBody'), keep = b.querySelector('.tl'), kl = keep ? keep.scrollLeft : null, kt = keep ? keep.scrollTop : null;
    b.textContent = ''; if (!m || !m.examen) { b.appendChild(el('p', 'muted', 'Pas de date d’examen pour cette matière.')); return; }
    var t = TODAY(), E = dnum(m.examen), J = E - t, R = data.reglages;
    var es = data.ex.filter(function (x) { return x.semestre === m.semestre && x.matiere === m.nom && x.evalue; });
    $('examTitle').textContent = m.nom;
    var hd = el('div', 'exh'); hd.appendChild(el('span', 'chip', m.semestre)); hd.appendChild(el('b', '', 'Examen le ' + fromNum(E))); hd.appendChild(el('span', 'jbig', J > 0 ? 'J-' + J : J === 0 ? 'Aujourd’hui' : 'Passé')); b.appendChild(hd);
    var from = examFrom === 'all' ? -1e9 : E - R.debutExam, log = [];
    if (examRep && J >= 0) log = drawCharge(null, [], t, null, 0, true, { N: Math.max(42, Math.min(250, J + 2)), all: true }).log;
    var rows = es.map(function (x, i) { return { name: x.intitule || 'Exo ' + (i + 1), x: x, done: occDone(x), pred: examRep ? log.filter(function (o) { return o.id === x.id && o.d < E; }) : occPred(x, E - 1) }; });
    var fait = 0, prevu = 0; rows.forEach(function (r) { r.done.forEach(function (o) { if (o.d >= from) fait += o.m || mins(r.x); }); r.pred.forEach(function () { prevu += mins(r.x); }); });
    var tot = fait + prevu, st = el('div', 'exst'), br = el('div', 'exbr'), lf = el('div');
    lf.appendChild(el('div', 'exsl', 'Temps fait : ' + dur(Math.round(fait)) + ' sur ' + dur(Math.round(tot)) + ' prévus'));
    var bar = el('div', 'exbar'), fi = el('i'); fi.style.width = (tot ? Math.min(100, fait / tot * 100) : 0) + '%'; bar.appendChild(fi); lf.appendChild(bar);
    var ok = es.filter(function (x) { return !x.ajoute && revision(x) > E - 1; }).length;
    lf.appendChild(el('div', 'exsl', ok + ' exercice' + (ok > 1 ? 's' : '') + ' à jour pour l’examen · ' + (es.length - ok) + ' à revoir')); br.appendChild(lf);
    var rc = document.createElement('canvas'); br.appendChild(rc); st.appendChild(br); b.appendChild(st);
    (function () { var cnt = [0, 0, 0, 0, 0, 0]; es.forEach(function (x) { if (!x.ajoute) cnt[Math.min(5, lvl(x))]++; }); var n = cnt.reduce(function (a, c) { return a + c; }, 0), dpr = window.devicePixelRatio || 1, S = 84; rc.width = S * dpr; rc.height = S * dpr; var g = rc.getContext('2d'); g.scale(dpr, dpr); var cx = S / 2, R1 = S / 2 - 3, R0 = R1 * .6, a0 = -Math.PI / 2;
      if (!n) { g.beginPath(); g.arc(cx, cx, (R1 + R0) / 2, 0, 7); g.lineWidth = R1 - R0; g.strokeStyle = '#f6e3ea'; g.stroke(); } else cnt.forEach(function (c, i) { if (!c) return; var a1 = a0 + c / n * Math.PI * 2; g.beginPath(); g.arc(cx, cx, R1, a0, a1); g.arc(cx, cx, R0, a1, a0, true); g.closePath(); g.fillStyle = scale(i); g.fill(); g.lineWidth = 1.5; g.strokeStyle = '#fff'; g.stroke(); a0 = a1; });
      g.fillStyle = '#ad1457'; g.font = 'bold 15px Poppins, system-ui'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(String(n), cx, cx); })();
    var ctl = el('div', 'exctl'), sg = el('div', 'seg'); [['exam', 'Depuis le mode examen'], ['all', 'Tout']].forEach(function (o) { var bt = el('button', examFrom === o[0] ? 'on' : '', o[1]); bt.type = 'button'; bt.addEventListener('click', function () { examFrom = o[0]; renderExamView(); }); sg.appendChild(bt); }); ctl.appendChild(sg);
    var sg2 = el('div', 'seg'); [[true, 'Avec répartition'], [false, 'Sans répartition']].forEach(function (o) { var bt = el('button', examRep === o[0] ? 'on' : '', o[1]); bt.type = 'button'; bt.title = o[0] ? 'Suit ton budget par jour et les autres matières' : 'Chaque exo est prévu seul, à sa date idéale'; bt.addEventListener('click', function () { examRep = o[0]; renderExamView(); }); sg2.appendChild(bt); }); ctl.appendChild(sg2); b.appendChild(ctl);
    var first = E - R.debutExam; if (examFrom === 'all') rows.forEach(function (r) { r.done.forEach(function (o) { first = Math.min(first, o.d); }); }); first = Math.min(first, t - 3);
    if (rows.length) {
      var tl = buildTL(rows, first - 1, E + 2, { ppd: 12, examDay: E, ten: true }); b.appendChild(tl);
      if (kl !== null) setTimeout(function () { tl.scrollLeft = kl; tl.scrollTop = kt; }, 1);
    } else b.appendChild(el('p', 'muted', 'Aucun exercice pour cette matière.'));
    b.appendChild(el('h3', 'exlt', 'Exercices de la matière'));
    es.map(function (x) { return { x: x, r: revision(x), ex: modeExam(x) }; }).sort(function (a, c) { return a.r - c.r || prio(a.x) - prio(c.x); }).forEach(function (o) { b.appendChild(exoCard(o, 'lite')); });
  }
  /* ---------- fenêtre d'un exercice : flèche, retard, note effective ---------- */
  function editorInfo(x) {
    var box = $('edInfo'); box.textContent = ''; box.hidden = !x; if (!x) return;
    var t = TODAY(), E = examNum(x.semestre, x.matiere), end = t + 60, done = occDone(x), pred = occPred(x, end), first = done.length ? done[0].d : (x.evalue ? dnum(x.evalue) : t - 3), tl = buildTL([{ name: '', x: x, done: done, pred: pred }], Math.min(first, t) - 1, end, { ppd: 26, noNames: true, days: true, examDay: E !== null && E >= t && E <= end ? E : 0 });
    box.appendChild(tl);
    var late = lateDays(x), lx = lvl(x), ef = effLvl(x), p = el('p', 'edsent');
    if (x.ajoute) p.textContent = 'Ajouté : pas encore de note. À réviser dès aujourd’hui, avec la priorité la plus basse.';
    else if (late <= 0) p.textContent = 'L’exercice est à l’heure · note effective ' + fmt1(ef) + '.';
    else if (ef !== lx) p.textContent = 'L’exercice a ' + late + ' j de retard et une note effective de ' + fmt1(ef) + '.';
    else p.textContent = 'L’exercice a ' + late + ' j de retard' + (data.reglages.baisseOff ? ' (baisse de note désactivée).' : ' (pas assez de données pour estimer une baisse de sa note).');
    box.appendChild(p);
  }
  /* série de jours consécutifs avec au moins une révision */
  function streak(FM) { var t = TODAY(), n = 0, d = t; function k(z) { return FM[new Date(z * DAY).toISOString().slice(0, 10)] > 0; } if (!k(d)) d--; while (k(d)) { n++; d--; } return n; }
  function openEditor(id) {
    if (!data.mats.length) { toast('Ajoute d’abord une matière (onglet Matières).'); return; }
    editingId = id; var x = id ? data.ex.filter(function (e) { return e.id === id; })[0] : null;
    $('editorTitle').textContent = x ? 'Modifier l’exercice' : 'Nouvel exercice';
    $('fSucces').textContent = ''; if (!x || x.ajoute) { var oa = el('option', '', 'Ajouté · pas encore de note'); oa.value = 'a'; $('fSucces').appendChild(oa); } NIV.forEach(function (n, i) { var o = el('option', '', i + ' · ' + n); o.value = i; $('fSucces').appendChild(o); });
    var last = x ? null : data.ex.slice().sort(function (a, b) { return creaTs(b) - creaTs(a); })[0]; /* nouvel exo : semestre et matière du dernier créé */
    fillSem(x ? x.semestre : last ? last.semestre : (data.reglages.semestres[0] || null)); if (x) fillMat(x.matiere); else if (last && $('fSem').value === last.semestre) fillMat(last.matiere);
    $('fTitre').value = x ? x.intitule || '' : ''; $('fSucces').value = x ? (x.ajoute ? 'a' : x.succes) : 3;
    $('fDate').value = x ? x.evalue : todayISO(); $('fMin').value = x && x.minutes ? x.minutes : ''; $('fNote').value = x && x.note ? x.note : '';
    $('delBtn').hidden = !x; editorInfo(x); $('editor').showModal();
  }
  function saveEditor(ev) {
    ev.preventDefault();
    var aj = $('fSucces').value === 'a', o = { intitule: $('fTitre').value.trim(), succes: aj ? 0 : +$('fSucces').value, ajoute: aj || undefined, semestre: $('fSem').value, matiere: $('fMat').value, minutes: $('fMin').value ? +$('fMin').value : null, evalue: $('fDate').value, note: $('fNote').value.trim() };
    if (!o.matiere || !o.evalue) { toast('Choisis une matière et une date.'); return; }
    if (editingId) { data.ex.forEach(function (x) { if (x.id === editingId) { if (x.succes !== o.succes) x.p5 = 0; Object.assign(x, o); if (!aj) delete x.ajoute; } }); }
    else { o.id = newId(); o.cree = dnum(todayISO()) * DAY; data.ex.push(o); }
    save(); $('editor').close(); render(); toast('Exercice enregistré.');
  }
  function openDone(id) {
    doingId = id; var x = data.ex.filter(function (e) { return e.id === id; })[0]; if (!x) return;
    $('doneTitle').textContent = x.matiere + (x.intitule ? ' · ' + x.intitule : '');
    $('doneTxt').textContent = ''; $('doneMin').value = mins(x); var chk = chGetAll()[id]; if (chk && chMs(chk) >= 30000) { $('doneMin').value = Math.max(1, Math.round(chMs(chk) / 60000)); $('doneTxt').textContent = 'Temps repris de ton minuteur : ' + chFmt(chMs(chk)) + '.'; }
    var b = $('doneBtns'); b.textContent = '';
    NIV.forEach(function (n, i) {
      var bt = el('button', '', String(i)); bt.type = 'button'; bt.appendChild(el('small', '', n)); var dj = revisionIf(x, i) - TODAY(); bt.appendChild(el('em', 'nxt', dj === 1 ? 'demain' : 'dans ' + dj + ' j'));
      bt.addEventListener('click', function () {
        var ca = chGetAll(), ch0 = ca[x.id]; delete ca[x.id]; chSetAll(ca); var h = addHist(x, i); if (ch0) { h.chrono = ch0; h.chronoT = (data.chronos[x.id] || {}).t; } x.succes = i; if (i < 5) x.p5 = 0; x.evalue = todayISO(); h.apres = {}; PREVK.forEach(function (k) { if (k in x) h.apres[k] = x[k]; }); save(); $('doneDlg').close(); render();
        toast('Prochaine révision : ' + fromNum(revision(x)), function () { if (!canUndo(h)) { toast('L’exo a changé depuis : annulation impossible.'); return; } undoHist(h); save(); render(); toast('Note annulée.'); });
      });
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
    if (syncUrl()) { var h0 = el('h3', '', 'Sur cet appareil'); h0.style.cssText = 'margin:4px 0 6px;color:var(--bord);font-size:.95rem'; box.appendChild(h0); }
    if (!v.length) box.appendChild(el('p', 'muted', 'Pas encore d’ancienne version. Elles se créent avant chaque import, chaque restauration, chaque mise à jour depuis le Drive, et une fois par jour.'));
    v.forEach(function (o) {
      var c = el('div', 'card'), t = el('div'); t.appendChild(el('b', '', fmtTs(o.ts))); t.appendChild(el('div', 'muted', o.label + ' · ' + o.data.ex.length + ' exercices'));
      var r = el('button', 'plain', 'Revenir à cette version'); r.type = 'button'; r.style.marginTop = '8px';
      r.addEventListener('click', function () { addVersion('Avant retour en arrière'); data = fix(JSON.parse(JSON.stringify(o.data))); save(); $('versDlg').close(); render(); toast('Version du ' + fmtTs(o.ts) + ' rétablie.'); });
      c.appendChild(t); c.appendChild(r); box.appendChild(c);
    });
    var u = syncUrl();
    if (u) {
      var h = el('h3', '', 'Sur ton Drive'); h.style.cssText = 'margin:14px 0 6px;color:var(--bord);font-size:.95rem'; box.appendChild(h);
      var st = el('p', 'muted', 'Chargement…'); box.appendChild(st);
      fetch(u + (u.indexOf('?') < 0 ? '?' : '&') + 'liste=1&t=' + Date.now()).then(function (r) { return r.json(); }).then(function (l) {
        if (!Array.isArray(l)) throw new Error('x');
        if (!l.length) { st.textContent = 'Aucune sauvegarde sur le Drive pour l’instant (la première se crée à la prochaine synchronisation).'; return; }
        st.remove();
        l.forEach(function (o) {
          var c = el('div', 'card'), t = el('div'); t.appendChild(el('b', '', fmtTs(o.ts))); t.appendChild(el('div', 'muted', 'Sauvegarde du Drive'));
          var r = el('button', 'plain', 'Revenir à cette version'); r.type = 'button'; r.style.marginTop = '8px';
          r.addEventListener('click', function () {
            r.textContent = 'Chargement…';
            fetch(u + (u.indexOf('?') < 0 ? '?' : '&') + 'version=' + encodeURIComponent(o.id) + '&t=' + Date.now()).then(function (x) { return x.json(); }).then(function (j) {
              if (!j || !j.data) throw new Error('x');
              addVersion('Avant retour à une version du Drive'); data = fix(j.data); save(); $('versDlg').close(); render(); toast('Version du Drive du ' + fmtTs(o.ts) + ' rétablie.');
            }).catch(function () { r.textContent = 'Revenir à cette version'; toast('Impossible de charger cette version.'); });
          });
          c.appendChild(t); c.appendChild(r); box.appendChild(c);
        });
      }).catch(function () { st.textContent = 'Pas de réponse du Drive. Si tu viens de changer le script, vérifie qu’il est bien en version 2 (voir les étapes).'; });
    }
    $('menu').close(); $('versDlg').showModal();
  }
  function importSheetFile(f) {
    var isCsv = /\.csv$/i.test(f.name), r = new FileReader();
    r.onerror = function () { toast('Impossible de lire ce fichier.'); };
    r.onload = function () {
      var p = isCsv ? Promise.resolve(parseCsv(new TextDecoder().decode(r.result))) : readXlsx(r.result);
      p.then(importSheets).then(function (out) {
        if (!out.ex.length) { toast('Aucun exercice trouvé : il faut les colonnes Succès, Semestre, Matière et Evalué le.'); return; }
        function go() { addVersion('Avant import Excel'); data = fix(out); save(); view = 'today'; render(); toast(out.ex.length + ' exercices importés. (Menu ⋮ : Anciennes versions pour revenir en arrière)'); }
        if (data.ex.length) ask({ t: 'Remplacer tes exercices ?', p: 'Les ' + data.ex.length + ' exercices actuels seront remplacés par les ' + out.ex.length + ' du tableur (une sauvegarde est faite avant).', ok: 'Remplacer', danger: true }, go); else go();
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
  function askSyncUrl(cb) {
    ask({ t: 'Adresse de synchronisation', p: 'Colle l’adresse de ton application web Apps Script (elle finit par /exec).', v: syncUrl(), ok: 'Enregistrer' }, function (u) {
      u = u.trim(); try { localStorage.setItem(SYNC_KEY, u); } catch (e) { /* ignoré */ } if (u) cb(u);
    });
  }
  var syncBusy = false, syncTimer = null;
  /* fusion de deux sauvegardes : on garde tout ce qui existe d'un côté ou de l'autre */
  function mergeData(A, B, aNewer) {
    var base = JSON.parse(JSON.stringify(aNewer ? A : B)), oth = JSON.parse(JSON.stringify(aNewer ? B : A));
    var rk = {}, ren = (base.renoms || []).concat(oth.renoms || []).filter(function (r) { var k = JSON.stringify(r); if (rk[k]) return false; rk[k] = 1; return true; }).sort(function (a, b) { return (a.t || 0) - (b.t || 0); });
    ren.forEach(function (r) { applyRen(base, r); applyRen(oth, r); }); base.renoms = ren;
    var gk = {}; base.matsSuppr = (base.matsSuppr || []).concat(oth.matsSuppr || []).filter(function (g) { var k = g.k + '|' + g.t; if (gk[k]) return false; gk[k] = 1; return true; });
    var ex = {}; (base.ex || []).forEach(function (x) { ex[x.id] = x; });
    (oth.ex || []).forEach(function (x) {
      var y = ex[x.id]; if (!y) { base.ex.push(x); return; }
      if ((x.evalue || '') > (y.evalue || '')) { var k = base.ex.indexOf(y); base.ex[k] = x; }
    });
    function hk(h) { return h.id + '|' + h.jour + '|' + h.niveau + '|' + (h.avant && h.avant.evalue); }
    var seen = {}; base.hist = base.hist || []; base.hist.forEach(function (h) { seen[hk(h)] = 1; });
    (oth.hist || []).forEach(function (h) { if (!seen[hk(h)]) { seen[hk(h)] = 1; base.hist.push(h); } });
    base.hist.sort(function (a, b) { return a.ts - b.ts; });
    var cs = {}; base.corbeille = base.corbeille || []; base.corbeille.forEach(function (c) { cs[c.ex.id + '|' + c.ts] = 1; });
    (oth.corbeille || []).forEach(function (c) { if (c && c.ex && !cs[c.ex.id + '|' + c.ts]) { cs[c.ex.id + '|' + c.ts] = 1; base.corbeille.push(c); } });
    base.ex = (base.ex || []).filter(function (x) { return !base.corbeille.some(function (c) { return c.ex.id === x.id; }); });
    var mm = {}; (base.mats || []).forEach(function (m) { mm[m.semestre + '|' + m.nom] = m; });
    (oth.mats || []).forEach(function (m) { var y = mm[m.semestre + '|' + m.nom]; if (!y) { base.mats.push(m); return; } Object.keys(m).forEach(function (k) { if ((y[k] === undefined || y[k] === '' || y[k] === null) && m[k] !== undefined) y[k] = m[k]; }); });
    var uu = {}; base.ues = base.ues || []; base.ues.forEach(function (u) { uu[u.semestre + '|' + u.nom] = 1; });
    (oth.ues || []).forEach(function (u) { if (!uu[u.semestre + '|' + u.nom]) base.ues.push(u); });
    var used = {}; base.ex.concat(base.corbeille.map(function (c) { return c.ex; })).forEach(function (x) { used[x.semestre + '|' + x.matiere] = 1; }); var seenM = {};
    base.mats = base.mats.filter(function (m) { var k = m.semestre + '|' + m.nom; if (seenM[k]) return false; seenM[k] = 1; return used[k] || !base.matsSuppr.some(function (g) { return g.k === k && g.t > (m.cree || 0); }); });
    base.chronos = base.chronos || {}; var och = oth.chronos || {}; Object.keys(och).forEach(function (id) { var y = base.chronos[id]; if (!y || (och[id].t || 0) > (y.t || 0)) base.chronos[id] = och[id]; });
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
    var url = syncUrl(); if (forceAsk || !url) { askSyncUrl(function (u) { syncCore(u, false); }); return; }
    syncCore(url, false);
  }
  function syncAuto() { var u = syncUrl(); if (u && navigator.onLine !== false) syncCore(u, true); }
  function syncSoon() { clearTimeout(syncTimer); syncTimer = setTimeout(syncAuto, 4000); }

  /* ---------- affichage ---------- */
  function render() {
    DEC = null; resetCaches();
    renderFilters(); document.body.classList.toggle('wide', view === 'dash' || view === 'set');
    ['today', 'exos', 'mats', 'dash', 'set'].forEach(function (v) { $('v-' + v).hidden = v !== view; });
    document.querySelectorAll('#tabs button').forEach(function (b) { b.setAttribute('aria-pressed', b.dataset.view === view ? 'true' : 'false'); });
    $('addBtn').hidden = view !== 'exos';
    if ($('examDlg').open) renderExamView();
    if (view === 'today') renderToday(); else if (view === 'exos') renderExos(); else if (view === 'mats') renderMats(); else if (view === 'dash') renderDash(); else renderSet();
  }

  /* garde la position de défilement (page, listes, graphiques, grille) quand on change un filtre ou un affichage */
  ['renderToday', 'renderExos', 'renderMats', 'renderDash', 'renderSet'].forEach(function (nm) {
    var orig = eval(nm);
    var wrapped = function () {
      var y = window._top ? 0 : window.scrollY; window._top = 0; var sel = '.scrollx, .mlist, .mscroll', els = Array.prototype.slice.call(document.querySelectorAll(sel)), pos = els.map(function (e) { return [e.scrollLeft, e.scrollTop]; });
      var hab = document.querySelector('.habit .scrollx'); window._hk = hab && hab.scrollLeft > 0 && !window._hkOff ? hab.scrollLeft : null; window._hkOff = 0;
      var r = orig.apply(this, arguments);
      var els2 = document.querySelectorAll(sel); if (els2.length === els.length) Array.prototype.forEach.call(els2, function (e, i) { e.scrollLeft = pos[i][0]; e.scrollTop = pos[i][1]; });
      window.scrollTo(0, y); var tries = 0, touched = false, stop = function () { touched = true; };
      window.addEventListener('touchstart', stop, { once: true, passive: true }); window.addEventListener('wheel', stop, { once: true, passive: true });
      var iv = setInterval(function () { tries++; window._hk = null; if (!touched && Math.abs(window.scrollY - y) > 2) window.scrollTo(0, y); if (touched || tries > 12) clearInterval(iv); }, 40);
      return r;
    };
    if (nm === 'renderToday') renderToday = wrapped; else if (nm === 'renderExos') renderExos = wrapped; else if (nm === 'renderMats') renderMats = wrapped; else if (nm === 'renderDash') renderDash = wrapped; else renderSet = wrapped;
  });

  load(); chMigrer();
  document.querySelectorAll('#tabs button').forEach(function (b) { b.addEventListener('click', function () { window._hkOff = 1; try { if (navigator.vibrate) navigator.vibrate(8); } catch (e) { /* sans vibration */ } view = b.dataset.view; try { localStorage.setItem('mes-exercices-onglet', view); } catch (e) { /* tant pis */ } shown = 120; window._top = 1; render(); window.scrollTo(0, 0); }); });
  $('addBtn').addEventListener('click', function () { openEditor(null); });
  $('search').addEventListener('input', function () { shown = 120; renderExos(); });
  $('filtBtn').addEventListener('click', function () { $('filtDlg').showModal(); });
  $('examBack').addEventListener('click', function () { $('examDlg').close(); });
  $('closeFilt').addEventListener('click', function () { $('filtDlg').close(); });
  $('filtAll').addEventListener('click', function () { data.reglages.semestres = []; data.reglages.matieres = []; save(); render(); });
  $('menuBtn').addEventListener('click', function () { $('ver').textContent = 'Version 180'; syncLabel(); $('menu').showModal(); });
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
      if (view === 'set' && setTab) { setTab = null; render(); window.scrollTo(0, 0); history.pushState({ a: 1 }, ''); return; }
      if (view !== 'today') { view = 'today'; try { localStorage.setItem('mes-exercices-onglet', view); } catch (e) { /* tant pis */ } window._top = 1; render(); window.scrollTo(0, 0); history.pushState({ a: 1 }, ''); }
    });
  } catch (e) { /* ignoré */ }
  $('importSheet').addEventListener('click', function () { $('sheetInput').click(); });
  $('sheetInput').addEventListener('change', function (e) { var f = e.target.files[0]; if (f) { $('menu').close(); if (/\.json$/i.test(f.name)) importBackup(f); else importSheetFile(f); } e.target.value = ''; });
  $('form').addEventListener('submit', saveEditor);
  $('fSem').addEventListener('change', function () { fillMat(); });
  $('cancelBtn').addEventListener('click', function () { $('editor').close(); });
  $('delBtn').addEventListener('click', function () {
    var gone = data.ex.filter(function (x) { return x.id === editingId; })[0], c = null; if (gone) { data.corbeille = data.corbeille || []; c = { ts: Date.now(), ex: gone }; data.corbeille.push(c); }
    data.ex = data.ex.filter(function (x) { return x.id !== editingId; }); save(); $('editor').close(); render();
    toast('Exercice supprimé.', c && function () { if (data.corbeille.indexOf(c) < 0 || data.ex.some(function (e) { return e.id === gone.id; })) return; data.corbeille = data.corbeille.filter(function (z) { return z !== c; }); data.ex.push(gone); save(); render(); toast('Exercice restauré.'); });
  });
  $('doneCancel').addEventListener('click', function () { $('doneDlg').close(); });
  var lastW = window.innerWidth; window.addEventListener('resize', function () { if (window.innerWidth === lastW) return; lastW = window.innerWidth; if (view === 'dash') renderDash(); });
  $('askForm').addEventListener('submit', function (e) { e.preventDefault(); var cb = ask.cb, v = $('askI').hidden ? true : $('askI').value; ask.cb = null; $('askDlg').close(); if (cb) cb(v); });
  $('askNo').addEventListener('click', function () { ask.cb = null; $('askDlg').close(); });
  render();
  try { if (document.fonts && document.fonts.load) Promise.all([document.fonts.load('400 12px Poppins'), document.fonts.load('700 12px Poppins')]).then(function () { if (view === 'dash') renderDash(); }); } catch (e) { /* ignoré */ }
  syncAuto();
  document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'visible') syncAuto(); });
  window.addEventListener('online', syncAuto);
  if ('serviceWorker' in navigator) {
    var hadSW = !!navigator.serviceWorker.controller;
    navigator.serviceWorker.register('sw.js').catch(function () { /* hors ligne non dispo */ });
    navigator.serviceWorker.addEventListener('controllerchange', function () { if (hadSW) location.reload(); });
  }
})();
