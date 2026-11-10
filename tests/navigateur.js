// Tests en navigateur simulé (Playwright). Lancer depuis la racine : python3 -m http.server 8765, puis node tests/navigateur.js /tmp
const { chromium } = require('playwright');
const iso = d => { const x = new Date(); x.setDate(x.getDate() + d); return x.getFullYear() + '-' + String(x.getMonth() + 1).padStart(2, '0') + '-' + String(x.getDate()).padStart(2, '0'); };
const seed = {
  mats: [{ semestre: 'S7', nom: 'Chimie organique avec un nom vraiment très long', examen: iso(10), note: 14, ue: 'UE1' }, { semestre: 'S7', nom: 'Physique', examen: iso(0) }, { semestre: 'S8', nom: 'Vide' }, { semestre: 'S8', nom: 'Maths', examen: iso(-3) }],
  ues: [{ semestre: 'S7', nom: 'UE1' }],
  ex: [
    { id: 'a1', semestre: 'S7', matiere: 'Chimie organique avec un nom vraiment très long', intitule: 'Ex 1', succes: 2, evalue: iso(-5), cree: 0 },
    { id: 'a2', semestre: 'S7', matiere: 'Chimie organique avec un nom vraiment très long', intitule: 'Ex 2', succes: 4, evalue: iso(-1) },
    { id: 'a3', semestre: 'S7', matiere: 'Physique', intitule: 'P1', succes: 1, evalue: iso(-4) },
    { id: 'a4', semestre: 'S8', matiere: 'Maths', intitule: 'M1', succes: 3, evalue: iso(-20) },
    { id: 'a5', semestre: 'S7', matiere: 'Chimie organique avec un nom vraiment très long', intitule: 'Nouveau', succes: 0, ajoute: true, evalue: iso(0) }],
  hist: [], reglages: { semOrdre: ['S8', 'S7'], ordreSem: 'manuel' }
};
let fails = 0; const ok = (c, m) => { console.log((c ? 'OK  ' : 'FAIL') + ' ' + m); if (!c) fails++; };
(async () => {
  const b = await chromium.launch();
  for (const w of [412, 820, 1280]) {
    const p = await b.newPage({ viewport: { width: w, height: 860 } }); const errs = [];
    p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
    await p.addInitScript(s => { if (!sessionStorage.getItem('seeded')) { sessionStorage.setItem('seeded', 1); localStorage.clear(); localStorage.setItem('mes-exercices-v1', s); sessionStorage.setItem('mes-exercices-sess', '1'); localStorage.setItem('mes-exercices-onglet', 'today'); } }, JSON.stringify(seed));
    await p.goto('http://localhost:8765/'); await p.waitForTimeout(400);
    const D = () => p.evaluate(() => JSON.parse(localStorage.getItem('mes-exercices-v1')));
    for (const v of ['dash', 'today', 'exos', 'mats', 'set']) { await p.click(`#tabs button[data-view=${v}]`); await p.waitForTimeout(250); const sw = await p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth); ok(sw <= 0, `${w}px ${v} : pas de défilement de côté (${sw})`); }
    await p.click('#tabs button[data-view=today]'); await p.waitForTimeout(200);
    const today = await p.locator('#v-today').innerText();
    ok(!today.includes('P1'), `${w} exo de la matière dont l'examen est aujourd'hui exclu`);
    // note puis Annuler
    const before = await D();
    await p.locator('#v-today .abtn.main').first().click(); await p.waitForTimeout(150);
    const nx = await p.locator('#doneBtns em.nxt').allInnerTexts(); ok(nx.length === 6 && !nx.includes('dans 0 j'), `${w} délais sous les notes : ${nx.join(', ')}`);
    await p.locator('#doneBtns button').nth(3).click(); await p.waitForTimeout(150);
    let d1 = await D(); ok(d1.hist.length === before.hist.length + 1 || d1.hist.length > before.hist.length, `${w} note enregistrée`);
    await p.click('#toast .tundo'); await p.waitForTimeout(150);
    let d2 = await D(); ok(JSON.stringify(d2.ex) === JSON.stringify(before.ex) && d2.hist.filter(h => !h.fige).length === 0, `${w} Annuler après note : données identiques`);
    // première note d'un exo « ajouté » puis Annuler via l'historique
    await p.click('#tabs button[data-view=exos]'); await p.locator('#exoList .card', { hasText: 'Nouveau' }).click(); await p.waitForTimeout(100); await p.click('#cancelBtn');
    await p.click('#tabs button[data-view=today]'); await p.waitForTimeout(100);
    await p.locator('#v-today .card', { hasText: 'Nouveau' }).locator('.abtn.main').click(); await p.locator('#doneBtns button').nth(5).click(); await p.waitForTimeout(150);
    await p.evaluate(() => { const d = document.querySelector('details.hist'); d.open = true; });
    await p.locator('details.hist button', { hasText: 'Annuler' }).first().click(); await p.waitForTimeout(150);
    let d3 = await D(); const n3 = d3.ex.find(x => x.id === 'a5'); ok(n3 && n3.ajoute && n3.evalue === iso(0), `${w} Annuler la 1re note d'un exo ajouté garde sa date`);
    // report puis Annuler
    await p.locator('#v-today .abtn.soft').first().click(); await p.waitForTimeout(100); await p.click('#toast .tundo'); await p.waitForTimeout(100);
    ok((await D()).ex.every(x => !x.reporte), `${w} report annulé`);
    // suppression d'exo puis Annuler
    await p.click('#tabs button[data-view=exos]'); await p.locator('#exoList .card', { hasText: 'M1' }).click(); await p.waitForTimeout(100); await p.click('#delBtn'); await p.waitForTimeout(100);
    ok(!(await D()).ex.find(x => x.id === 'a4'), `${w} exo supprimé`); await p.click('#toast .tundo'); await p.waitForTimeout(100);
    let d4 = await D(); ok(d4.ex.find(x => x.id === 'a4') && !d4.corbeille.length, `${w} suppression annulée`);
    // Maths : examen passé il y a 3 j, fait il y a 20 j au niveau 3 → intervalles normaux (25 j) → à revoir dans 5 j
    const m1 = await p.locator('#exoList .card', { hasText: 'M1' }).innerText(); ok(m1.includes(new Date(Date.now() + 5 * 864e5).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' })), `${w} après l'examen : rythme normal (${m1.replace(/\n/g, ' ')})`);
    // matières
    await p.click('#tabs button[data-view=mats]'); await p.waitForTimeout(150);
    const det = p.locator('details.msem', { hasText: 'S8' }); await det.locator('.madd').click(); await p.fill('#askI', 'maths'); await p.click('#askOk'); await p.waitForTimeout(100);
    ok((await D()).mats.filter(m => m.semestre === 'S8' && /maths/i.test(m.nom)).length === 1, `${w} doublon refusé`);
    await det.locator('.mrow2', { hasText: 'Maths' }).locator('.mmenu summary').click(); await det.locator('.mrow2', { hasText: 'Maths' }).locator('.mopt.danger').click(); await p.waitForTimeout(100);
    ok(!(await p.locator('#askDlg').evaluate(d => d.open)) && (await D()).mats.some(m => m.nom === 'Maths'), `${w} suppression refusée si exercices`);
    await det.locator('.mrow2', { hasText: 'Vide' }).locator('.mmenu summary').click(); await det.locator('.mrow2', { hasText: 'Vide' }).locator('.mopt.danger').click(); await p.waitForTimeout(100); await p.click('#askOk'); await p.waitForTimeout(100);
    ok(!(await D()).mats.some(m => m.nom === 'Vide'), `${w} matière vide supprimée`);
    await p.locator('details.msem', { hasText: 'S8' }).locator('button', { hasText: 'Renommer le semestre' }).click(); await p.fill('#askI', 'S8 bis'); await p.click('#askOk'); await p.waitForTimeout(100);
    let d5 = await D(); ok(d5.reglages.semOrdre[0] === 'S8 bis' && d5.ex.find(x => x.id === 'a4').semestre === 'S8 bis', `${w} renommage du semestre : ordre et exos suivis`);

    // audit 1 : note puis modification de la durée → annulation refusée
    await p.click('#tabs button[data-view=today]'); await p.waitForTimeout(100);
    await p.locator('#v-today .card', { hasText: 'Ex 1' }).locator('.abtn.main').click(); await p.locator('#doneBtns button').nth(4).click(); await p.waitForTimeout(100);
    await p.click('#tabs button[data-view=exos]'); await p.locator('#exoList .card', { hasText: 'Ex 1' }).click(); await p.fill('#fMin', '17'); await p.click('#form button[type=submit]'); await p.waitForTimeout(100);
    await p.click('#tabs button[data-view=today]'); await p.waitForTimeout(100); await p.evaluate(() => { document.querySelector('details.hist').open = true; });
    const hrow = p.locator('details.hist .card', { hasText: 'Ex 1' }).first();
    ok(await hrow.locator('button', { hasText: 'Annuler' }).count() === 0 && (await D()).ex.find(x => x.id === 'a1').minutes === 17, `${w} annulation refusée après changement de durée`);
    // audit 2 : filtre sur deux matières, renommage de l'une → les deux restent sélectionnées
    await p.evaluate(() => { const d = JSON.parse(localStorage.getItem('mes-exercices-v1')); d.reglages.matieres = ['physique', 'maths']; localStorage.setItem('mes-exercices-v1', JSON.stringify(d)); }); await p.reload(); await p.waitForTimeout(300);
    await p.click('#tabs button[data-view=mats]'); await p.locator('.mrow2', { hasText: 'Physique' }).locator('.mmenu summary').click(); await p.locator('.mrow2', { hasText: 'Physique' }).locator('.mopt').first().click(); await p.fill('#askI', 'Physique II'); await p.click('#askOk'); await p.waitForTimeout(100);
    const fm = (await D()).reglages.matieres; ok(fm.includes('physique ii') && fm.includes('maths'), `${w} filtre conservé après renommage (${fm})`);
    await p.evaluate(() => { const d = JSON.parse(localStorage.getItem('mes-exercices-v1')); d.reglages.matieres = []; localStorage.setItem('mes-exercices-v1', JSON.stringify(d)); }); await p.reload(); await p.waitForTimeout(300);

    // audit tour 11 : minuteur lancé, note, Annuler depuis l'historique → minuteur rétabli
    await p.click('#tabs button[data-view=today]'); await p.waitForTimeout(100);
    const cP = p.locator('#v-today .card', { hasText: 'Nouveau' }).first(); await cP.locator('.chgo').click(); await p.waitForTimeout(1200);
    await cP.locator('.abtn.main').click(); await p.locator('#doneBtns button').nth(2).click(); await p.waitForTimeout(100);
    await p.evaluate(() => { document.querySelector('details.hist').open = true; });
    await p.locator('details.hist .card', { hasText: 'Nouveau' }).first().locator('button', { hasText: 'Annuler' }).click(); await p.waitForTimeout(100);
    const dc = await D(); ok(dc.chronos.a5 && !dc.chronos.a5.gone && dc.chronos.a5.start, `${w} minuteur rétabli après annulation depuis l'historique`);

    // tour 13 : minuteur, note, nouveau minuteur remis à zéro, Annuler → l'ancien ne revient pas
    const cQ = p.locator('#v-today .card', { hasText: 'Nouveau' }).first(); await cQ.locator('.abtn.main').click(); await p.locator('#doneBtns button').nth(2).click(); await p.waitForTimeout(100);
    /* nouveau minuteur lancé puis remis à zéro : même trace que l'appli (gone + date) */ await p.evaluate(() => { const d = JSON.parse(localStorage.getItem('mes-exercices-v1')); d.chronos.a5 = { gone: 1, t: Date.now() + 5 }; localStorage.setItem('mes-exercices-v1', JSON.stringify(d)); });
    await p.reload(); await p.waitForTimeout(300); await p.evaluate(() => { document.querySelector('details.hist').open = true; });
    await p.locator('details.hist .card', { hasText: 'Nouveau' }).first().locator('button', { hasText: 'Annuler' }).click(); await p.waitForTimeout(100);
    const de = await D(); ok(!de.chronos.a5 || de.chronos.a5.gone, `${w} minuteur remis à zéro après la note : pas réapparu`);
    // bouton Retour
    await p.click('#tabs button[data-view=set]'); await p.locator('#v-set .drow').first().click(); await p.waitForTimeout(100); await p.goBack(); await p.waitForTimeout(200);
    ok(await p.locator('#v-set .drow').count() >= 5, `${w} Retour : rubrique → liste des réglages`);
    // rechargement
    await p.reload(); await p.waitForTimeout(300); ok((await D()).ex.length === 5, `${w} rechargement : données intactes`);
    if (false) for (const v of []) { await p.click(`#tabs button[data-view=${v}]`); await p.waitForTimeout(300); await p.screenshot({ path: process.argv[2] + '/s-' + v + '.png', fullPage: true }); }
    ok(!errs.length, `${w} aucune erreur console ${errs.join(' | ')}`);
    await p.close();
  }

  // v180
  {
    const p = await b.newPage({ viewport: { width: 412, height: 860 } }); const errs = []; p.on('pageerror', e => errs.push(e.message));
    const sd = { mats: [{ semestre: 'S1', nom: 'A', note: 14, ue: 'U' }, { semestre: 'S1', nom: 'B', note: 10 }], ues: [{ semestre: 'S1', nom: 'U' }],
      ex: [{ id: 'e1', semestre: 'S1', matiere: 'A', intitule: 'X', succes: 1, evalue: iso(-3), minutes: 5 }, { id: 'e2', semestre: 'S1', matiere: 'B', intitule: 'Y', succes: 0, evalue: iso(-3) }], hist: [], reglages: {} };
    await p.addInitScript(s => { if (!sessionStorage.getItem('seeded')) { sessionStorage.setItem('seeded', 1); localStorage.clear(); localStorage.setItem('mes-exercices-v1', s); sessionStorage.setItem('mes-exercices-sess', '1'); localStorage.setItem('mes-exercices-onglet', 'dash'); } }, JSON.stringify(sd));
    await p.goto('http://localhost:8765/'); await p.waitForTimeout(400);
    const kpi = async () => (await p.locator('.kpi3 b').allInnerTexts());
    let k = await kpi(); ok(k[2] === '12', `v180 D : matière sans UE comptée dans la moyenne (${k[2]})`);
    await p.click('#tabs button[data-view=today]'); await p.waitForTimeout(200); const nToday = await p.locator('#v-today > .card').count() - 1;
    await p.click('#tabs button[data-view=dash]'); await p.waitForTimeout(200); k = await kpi(); ok(+k[1] === nToday, `v180 B : KPI Aujourd'hui = liste À faire (${k[1]} / ${nToday})`);
    await p.click('#tabs button[data-view=exos]'); await p.waitForTimeout(200);
    for (const m of ['7', '9']) { await p.locator('#exoList .card', { hasText: 'X' }).locator('.abtn.main').click(); await p.fill('#doneMin', m); await p.locator('#doneBtns button').nth(2).click(); await p.waitForTimeout(150); }
    await p.click('#tabs button[data-view=today]'); await p.waitForTimeout(200);
    ok((await p.locator('#v-today .card').first().innerText()).includes('déjà fait : 0h16'), 'v180 A : deux séances le même jour comptées (7 + 9 min)');
    await p.evaluate(() => { const d = JSON.parse(localStorage.getItem('mes-exercices-v1')); d.reglages.matieres = ['b']; localStorage.setItem('mes-exercices-v1', JSON.stringify(d)); localStorage.setItem('mes-exercices-onglet', 'dash'); }); await p.reload(); await p.waitForTimeout(400);
    k = await kpi(); ok(k[2] === '10', `v180 E : moyenne /20 suit le filtre de matières (${k[2]})`);
    await p.click('#tabs button[data-view=set]'); await p.locator('#v-set .drow').first().click(); await p.locator('.wday input').first().fill('-30'); await p.locator('.wday input').first().dispatchEvent('change'); await p.waitForTimeout(100);
    ok((await p.evaluate(() => JSON.parse(localStorage.getItem('mes-exercices-v1')).reglages.planning[0])) === 0, 'v180 : réglage négatif ramené à 0');
    await p.locator('.wday input').first().fill('2000'); await p.locator('.wday input').first().dispatchEvent('change'); await p.waitForTimeout(100);
    ok((await p.evaluate(() => JSON.parse(localStorage.getItem('mes-exercices-v1')).reglages.planning[0])) === 1440, 'v180 : budget d’un jour limité à 24 h');
    await p.locator('.srow input').first().fill('80'); await p.locator('.srow input').first().dispatchEvent('change'); await p.waitForTimeout(150);
    ok((await p.evaluate(() => JSON.parse(localStorage.getItem('mes-exercices-v1')).reglages.debutExam)) === 50 && (await p.locator('#toast').innerText()).includes('intervalle d’un 5'), 'v180 : mode examen limité à l’intervalle d’un 5, avec explication');
    ok(!errs.length, 'v180 aucune erreur ' + errs.join(' | ')); await p.close();
  }

  // règle de Pauline : niveau 5 en mode examen → révision compressée (ici à E-5), sauf si elle tomberait le jour de l'examen ou après
  {
    const p = await b.newPage({ viewport: { width: 412, height: 860 } });
    const sd = { mats: [{ semestre: 'S1', nom: 'A', examen: iso(30) }], ex: [{ id: 'f1', semestre: 'S1', matiere: 'A', intitule: 'Z', succes: 5, evalue: iso(-10) }], hist: [{ id: 'f1', ts: 0, jour: iso(-10), avant: { succes: 4, evalue: iso(-20) }, niveau: 5, m: 5 }], reglages: {} };
    await p.addInitScript(s => { if (!sessionStorage.getItem('seeded')) { sessionStorage.setItem('seeded', 1); localStorage.clear(); localStorage.setItem('mes-exercices-v1', s); sessionStorage.setItem('mes-exercices-sess', '1'); localStorage.setItem('mes-exercices-onglet', 'exos'); } }, JSON.stringify(sd));
    await p.goto('http://localhost:8765/'); await p.waitForTimeout(400);
    const tx = await p.locator('#exoList .card').first().innerText(), want = new Date(Date.now() + 25 * 864e5).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
    ok(tx.includes(want), `niveau 5 en mode examen : revu à J-5 de l'examen (${want})`); await p.close();
  }

  // niveau 6 : révision compressée après l'examen → révision normale gardée ; égalité exacte avec le jour de l'examen → idem
  for (const c of [
    { nom: 'niveau 6, compressée à I+49 > examen I+40 → normale I+70', ev: -5, ex: 35, pas: 20, want: 65 },
    { nom: 'niveau 6 (pas 50 j), compressée pile le jour de l’examen → normale I+100', ev: -1, ex: 1, pas: 50, want: 99 }]) {
    const p = await b.newPage({ viewport: { width: 412, height: 860 } });
    const sd = { mats: [{ semestre: 'S1', nom: 'A', examen: iso(c.ex) }], ex: [{ id: 'g1', semestre: 'S1', matiere: 'A', intitule: 'Z', succes: 5, evalue: iso(c.ev) }],
      hist: [{ id: 'g1', ts: 1, jour: iso(c.ev - 50), avant: { succes: 4, evalue: iso(c.ev - 60) }, niveau: 5, m: 5 }, { id: 'g1', ts: 2, jour: iso(c.ev), avant: { succes: 5, evalue: iso(c.ev - 50) }, niveau: 5, m: 5 }], reglages: { pasApres5: c.pas } };
    await p.addInitScript(s => { if (!sessionStorage.getItem('seeded')) { sessionStorage.setItem('seeded', 1); localStorage.clear(); localStorage.setItem('mes-exercices-v1', s); sessionStorage.setItem('mes-exercices-sess', '1'); localStorage.setItem('mes-exercices-onglet', 'exos'); } }, JSON.stringify(sd));
    await p.goto('http://localhost:8765/'); await p.waitForTimeout(400);
    const tx = await p.locator('#exoList .card').first().innerText(), want = new Date(Date.now() + c.want * 864e5).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
    ok(tx.includes(want) && tx.startsWith('6'), `${c.nom} (${want})`); await p.close();
  }

  // lot de simplification (tour 27)
  {
    const p = await b.newPage({ viewport: { width: 412, height: 860 } });
    const ex = []; for (let i = 0; i < 4; i++) ex.push({ id: 'h' + i, semestre: 'S', matiere: 'A', intitule: 'H' + i, succes: 1, evalue: iso(-10), minutes: 30 });
    const sd = { mats: [{ semestre: 'S', nom: 'A' }], ex, hist: [{ id: 'h0', ts: 0, jour: iso(0), avant: { succes: 1, evalue: iso(-12) }, niveau: 1, m: 60 }], reglages: { planning: [60, 60, 60, 60, 60, 60, 60] } };
    await p.addInitScript(s => { if (!sessionStorage.getItem('seeded')) { sessionStorage.setItem('seeded', 1); localStorage.clear(); localStorage.setItem('mes-exercices-v1', s); sessionStorage.setItem('mes-exercices-sess', '1'); localStorage.setItem('mes-exercices-onglet', 'today'); } }, JSON.stringify(sd));
    await p.goto('http://localhost:8765/'); await p.waitForTimeout(400);
    ok((await p.locator('#v-today > p.muted').innerText()).includes('budget du jour est déjà rempli'), 'À faire : budget rempli, pas de « Bravo »');
    await p.click('#menuBtn'); ok(!(await p.locator('#importSheet').isVisible()) && !(await p.locator('#exportBtn').isVisible()) && await p.locator('#syncBtn').isVisible(), 'menu : synchro seule, plus de doublons');
    await p.click('#dataBtn'); await p.waitForTimeout(200); ok((await p.locator('#v-set').innerText()).includes('Exporter mes données'), 'menu → Réglages › Données');
    await p.click('#tabs button[data-view=dash]'); await p.waitForTimeout(300);
    const nb = await p.locator('#v-dash > .dcard').count(); await p.click('.dana'); await p.waitForTimeout(300);
    ok(nb === 2 && await p.locator('#v-dash > .dcard').count() > 2, `tableau de bord : 2 cartes en haut, analyse repliable (${nb})`);
    await p.close();
  }
  // premier lancement
  const p = await b.newPage({ viewport: { width: 412, height: 860 } }); await p.goto('http://localhost:8765/'); await p.evaluate(() => localStorage.clear()); await p.reload(); await p.waitForTimeout(300);
  ok(await p.locator('.welcome').count() === 1, 'premier lancement : carte d’accueil');
  await b.close(); console.log(fails ? fails + ' échec(s)' : 'tout est bon'); process.exit(fails ? 1 : 0);
})();
