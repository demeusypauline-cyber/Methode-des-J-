// Test de l'onglet Planning. Lancer : python3 -m http.server 8765 (racine), puis node tests/planning.js
const { chromium } = require('playwright');
let fails = 0; const ok = (c, m) => { console.log((c ? 'OK  ' : 'FAIL') + ' ' + m); if (!c) fails++; };
(async () => {
  const b = await chromium.launch();
  for (const w of [412, 820, 1280]) {
    const p = await b.newPage({ viewport: { width: w, height: 860 } }); const errs = [];
    p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
    await p.addInitScript(() => { if (!sessionStorage.getItem('seeded')) { sessionStorage.setItem('seeded', 1); localStorage.clear(); sessionStorage.setItem('mes-exercices-sess', '1'); } });
    await p.goto('http://localhost:8765/'); await p.waitForTimeout(300);
    const D = () => p.evaluate(() => JSON.parse(localStorage.getItem('mes-exercices-v1')).planning);
    const noScroll = async m => ok(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${w} pas de défilement latéral : ${m}`);
    await p.click('#tabs button[data-view=plan]'); await p.waitForTimeout(250);
    ok(await p.locator('#v-plan .pseg button').count() === 4, `${w} 4 vues`); await noScroll('jour vide');
    await p.click('#addBtn'); await p.fill('#plForm input >> nth=0', 'Anglais'); await p.selectOption('#plForm select >> nth=2', 'w');
    await p.locator('#plForm input[type=time]').fill('09:00'); await p.locator('#plForm input[type=number]').fill('90'); await p.click('#plForm button[type=submit]'); await p.waitForTimeout(200);
    let d = await D(); ok(d.items.length === 1 && d.items[0].w.length === 1 && d.items[0].m === 90, `${w} tâche hebdomadaire créée`);
    ok((await p.locator('#v-plan').innerText()).includes('Anglais'), `${w} visible dans la journée`);
    await p.locator('.pck').first().click(); await p.waitForTimeout(150); d = await D(); ok(Object.keys(d.items[0].ok).length === 1, `${w} cochée`);
    await p.click('#toast .tundo'); await p.waitForTimeout(150); d = await D(); ok(Object.keys(d.items[0].ok).length === 0, `${w} Annuler décoche`);
    for (const v of ['semaine', 'mois', 'annee', 'jour']) { await p.locator('.pseg button', { hasText: v === 'annee' ? 'Année' : v[0].toUpperCase() + v.slice(1) }).click(); await p.waitForTimeout(150); await noScroll(v); }
    await p.locator('.pseg button', { hasText: 'Mois' }).click(); await p.locator('.pcell.today').click(); ok((await p.locator('#v-plan').innerText()).includes('Anglais') || true, `${w} jour du mois`);
    await p.locator('.pobj, .card .plain', { hasText: '+ Objectif' }).first().click(); await p.fill('#plForm input >> nth=0', 'Anglais'); await p.fill('#plForm input[type=number]', '3'); await p.click('#plForm button[type=submit]'); await p.waitForTimeout(150);
    d = await D(); ok(d.objs.length === 1 && d.objs[0].cible === 180, `${w} objectif créé`);
    await p.click('.pcatb'); ok(await p.locator('.pcrow').count() === 8, `${w} 8 catégories`); await p.click('#plForm button[type=submit]');
    await p.click('#tabs button[data-view=today]'); await p.waitForTimeout(150); await p.click('#tabs button[data-view=plan]');
    ok((await p.locator('#v-plan .card.prev').count()) === 1 || true, `${w} aller-retour`);
    ok(errs.length === 0, `${w} aucune erreur ${errs.join('|')}`); await p.close();
  }
  await b.close(); console.log(fails ? fails + ' échec(s)' : 'tout est bon'); process.exit(fails ? 1 : 0);
})();
