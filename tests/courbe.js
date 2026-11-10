// Tests déterministes de la courbe de l'oubli (page ouverte avec ?test). Lancer : python3 -m http.server 8765, puis node tests/courbe.js
const { chromium } = require('playwright');
const iso = d => { const x = new Date(); x.setDate(x.getDate() + d); return x.getFullYear() + '-' + String(x.getMonth() + 1).padStart(2, '0') + '-' + String(x.getDate()).padStart(2, '0'); };
let fails = 0; const ok = (c, m) => { console.log((c ? 'OK  ' : 'FAIL') + ' ' + m); if (!c) fails++; };
const H = (id, ago, g, a, n, ts) => ({ id, ts: ts || 0, jour: iso(-ago), avant: { succes: a, evalue: iso(-ago - g) }, niveau: n, m: 5 });
async function page(b, d) {
  const p = await b.newPage(); await p.addInitScript(s => { localStorage.clear(); localStorage.setItem('mes-exercices-v1', s); sessionStorage.setItem('mes-exercices-sess', '1'); }, JSON.stringify(d));
  await p.goto('http://localhost:8765/?test'); await p.waitForFunction(() => window.__t); return p;
}
(async () => {
  const b = await chromium.launch();
  // 1. tolérances réellement appliquées et classement
  const hs = []; [0, 1, 2, 3, 4, 5].forEach(a => { const I = [2, 4, 10, 25, 35, 50][a], t = Math.max(1, Math.round(I * 0.2)); [[I, 'rose'], [I + t, 'rose'], [I - t, 'rose'], [I + t + 1, 'retard'], [Math.max(0, I - t - 1), 'avance']].forEach(([g, k], i) => hs.push(Object.assign(H('t' + a + i, 5, g, a, 3), { k }))); });
  let p = await page(b, { ex: [], mats: [], hist: hs, reglages: {} });
  const P = await p.evaluate(() => __t.oubliAll());
  [0, 1, 2, 3, 4, 5].forEach(a => { const I = [2, 4, 10, 25, 35, 50][a], t = Math.max(1, Math.round(I * 0.2)); const got = P.filter(x => x.a === a)[0]; ok(got && got.tol === t, `J${I} : tolérance attendue ±${t} j, obtenue ±${got && got.tol}`); });
  const cls = hs.map((h, i) => { const x = P.find(q => q.a === Math.min(11, h.avant.succes) && q.g === (new Date(h.jour) - new Date(h.avant.evalue)) / 864e5 && q.__u === undefined); return x; });
  ok(P.filter(x => x.pink).length === 18 && P.filter(x => x.late).length === 6, `classement : 18 roses / 6 en retard attendus, obtenus ${P.filter(x => x.pink).length} / ${P.filter(x => x.late).length}`);
  await p.close();
  // 2. décroissance au niveau 2 (J10) avec des retards mesurés
  const h2 = []; for (let i = 0; i < 6; i++) h2.push(H('p' + i, 3 + i, 10, 2, 3)); for (let i = 0; i < 3; i++) { h2.push(H('l' + i, 3 + i, 25, 2, 2)); h2.push(H('m' + i, 3 + i, 60, 2, 1)); }
  p = await page(b, { ex: [], mats: [], hist: h2, reglages: {} });
  const L = [0, 1, 20, 100, 220, 300, 500], v = await p.evaluate(L => L.map(l => __t.curveAt(2, 10 + l)), L), e = await p.evaluate(L => L.map(l => __t.effAt(2, l)), L);
  console.log('     courbe niveau 2 à J10 + retard ' + L.map((l, i) => l + ' j → ' + v[i].toFixed(3)).join(' ; '));
  console.log('     note effective (niveau 2) ' + L.map((l, i) => l + ' j → ' + e[i]).join(' ; '));
  ok(v.every((x, i) => x >= 0 && x <= 5 && (i === 0 || x <= v[i - 1] + 1e-9)), 'courbe : bornée dans [0 ; 5] et jamais croissante avec le retard');
  ok(v[5] < v[4] && v[6] < v[5], 'pas de plateau à 220 j : 300 j et 500 j plus bas que 220 j');
  ok(e[0] === 2 && e.every((x, i) => i === 0 || x <= e[i - 1]), 'note effective : 2 sans retard, jamais en hausse avec le retard');
  const xs = await p.evaluate(() => [__t.expectNote(2, 10), Math.round(__t.expectNote(2, 10))]);
  ok(Number.isInteger(xs[1]) && Math.abs(xs[1] - xs[0]) <= 0.5, `prévision : valeur continue ${xs[0].toFixed(3)} → note simulée ${xs[1]} (arrondi validé par Pauline)`);
  await p.close();
  // 3. aucune donnée
  p = await page(b, { ex: [], mats: [], hist: [], reglages: {} });
  const z = await p.evaluate(() => [__t.curveAt(3, 25), __t.curveAt(3, 500), __t.effAt(3, 100)]);
  ok(z.every(x => x >= 0 && x <= 5), `sans données : valeurs finies dans [0 ; 5] (${z.map(x => +x.toFixed(2)).join(', ')} ; pas de baisse mesurée → note effective inchangée)`);
  await p.close();
  // 4. niveaux 5, 6, 7, 8+ et série interrompue par un 4 ; plusieurs révisions le même jour
  const seq = async (notes, succ) => { const hh = notes.map((n, i) => ({ id: 'x', ts: i + 1, jour: iso(-notes.length + i), avant: { succes: 0, evalue: iso(-notes.length + i - 1) }, niveau: n, m: 5 })); const q = await page(b, { ex: [{ id: 'x', semestre: 'S', matiere: 'A', succes: succ, evalue: iso(-1) }], mats: [{ semestre: 'S', nom: 'A' }], hist: hh, reglages: {} }); const r = await q.evaluate(() => __t.lvl(__t.data().ex[0])); await q.close(); return r; };
  for (const [n, s, w, txt] of [[[5], 5, 5, '5'], [[5, 5], 5, 6, '5,5'], [[5, 5, 5], 5, 7, '5,5,5'], [[5, 5, 5, 5, 5], 5, 9, '5×5'], [[5, 5, 4], 4, 4, '5,5,4'], [[5, 5, 4, 5], 5, 5, '5,5,4,5']]) { const r = await seq(n, s); ok(r === w, `niveau réel après ${txt} : attendu ${w}, obtenu ${r}`); }
  const same = [{ id: 'y', ts: 1, jour: iso(0), avant: { succes: 3, evalue: iso(-10) }, niveau: 5, m: 5 }, { id: 'y', ts: 2, jour: iso(0), avant: { succes: 5, evalue: iso(0) }, niveau: 5, m: 5 }];
  p = await page(b, { ex: [{ id: 'y', semestre: 'S', matiere: 'A', succes: 5, evalue: iso(0) }], mats: [{ semestre: 'S', nom: 'A' }], hist: same, reglages: {} });
  ok(await p.evaluate(() => __t.lvl(__t.data().ex[0])) === 6, 'deux 5 le même jour : niveau 6 (les deux révisions comptent)');
  await p.close(); await b.close(); console.log(fails ? fails + ' échec(s)' : 'tout est bon'); process.exit(fails ? 1 : 0);
})();
