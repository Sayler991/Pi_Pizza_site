// E2E Best Kebab : node e2e.js BASE OUTDIR — 1440 + 390 ; commandes « TEST E2E » réelles (à supprimer ensuite)
const p = require('/workspace/pipizza_tools/node_modules/puppeteer-core');
const BASE = (process.argv[2] || 'https://sayler991.github.io/Pi_Pizza_site/').replace(/\/?$/, '/');
const OUT = (process.argv[3] || '/workspace/pipizza_shots/').replace(/\/?$/, '/');
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  const b = await p.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'], headless: 'new' });
  const R = {};
  for (const [W, H, tag] of [[1440, 900, 'desktop'], [375, 812, 'mobile']]) {
    const res = R[tag] = { errs: [], bad: [] };
    const pg = await b.newPage();
    pg.on('pageerror', e => res.errs.push(e.message)); pg.on('console', m => { if (m.type() === 'error') res.errs.push(m.text()); });
    pg.on('response', r => { if (r.status() >= 400) res.bad.push(r.status() + ' ' + r.url()); });
    await pg.setViewport({ width: W, height: H, isMobile: W < 600, hasTouch: W < 600 });
    const resp = await pg.goto(BASE + '?e2e=' + Date.now(), { waitUntil: 'networkidle2' }); res.status = resp.status();
    await pg.evaluate(() => localStorage.clear());
    await pg.waitForFunction(() => document.documentElement.dataset.live === 'supabase', { timeout: 20000 }); res.live = 'supabase';
    await sleep(1800);
    res.items = await pg.$$eval('.item', e => e.length);
    res.titleWords = await pg.$$eval('.hero-title .w', e => e.length);
    await pg.screenshot({ path: OUT + tag + '_1_hero.png' });
    for (const [id, n] of [['carte', 2], ['maison', 4], ['avis', 5], ['boutiques', 6]]) { await pg.evaluate(id => document.getElementById(id).scrollIntoView(), id); await sleep(1300); await pg.screenshot({ path: OUT + tag + '_' + n + '_' + id + '.png' }); }
    res.overlaps = await pg.evaluate(() => { const els=[...document.querySelectorAll('.nav .brand, .nav-call, .nav-cart, .hero-title, .lead, .cta .btn, .chips li, .item .price, .item .stepper, .item h4')].filter(e=>e.offsetParent); const o=[]; for(let i=0;i<els.length;i++)for(let j=i+1;j<els.length;j++){ if(els[i].contains(els[j])||els[j].contains(els[i]))continue; const a=els[i].getBoundingClientRect(),b=els[j].getBoundingClientRect(); if(a.width&&b.width&&a.left<b.right-1&&b.left<a.right-1&&a.top<b.bottom-1&&b.top<a.bottom-1)o.push(els[i].className+'|'+els[j].className);} return o; });
    res.hscroll = await pg.evaluate(() => document.documentElement.scrollWidth - innerWidth);
    res.reveals = await pg.evaluate(() => document.querySelectorAll('.reveal.in').length + '/' + document.querySelectorAll('.reveal').length);
    // ajout au panier
    await pg.evaluate(() => document.getElementById('carte').scrollIntoView()); await sleep(600);
    const plus = id => pg.evaluate(id => document.querySelector('.stepper[data-id="' + id + '"] .plus').click(), id);
    await plus('pizza'); await sleep(250); await plus('pizza'); await sleep(250); await plus('burger'); await sleep(250); await plus('burger'); await sleep(250);
    await pg.evaluate(() => document.querySelector('.stepper[data-id="burger"] .minus').click()); await sleep(700);
    res.count = await pg.$eval('[data-count]', e => e.textContent);
    await pg.evaluate(() => document.querySelector('.item[data-id="pizza"]').scrollIntoView({ block: 'center' })); await sleep(500);
    await pg.screenshot({ path: OUT + tag + '_3_cart_live.png' });
    if (W > 1000) {
      res.total = await pg.$eval('#mini-sum', e => e.textContent);
      await pg.click('#mini-go');
    } else {
      res.fabVisible = await pg.$eval('#fab', e => !e.hidden && getComputedStyle(e).display !== 'none');
      res.total = await pg.$eval('#fab-total', e => e.textContent);
      await pg.click('#fab'); await sleep(700);
      await pg.type('.line[data-id="pizza"] input', 'margherita, bien cuite');
      await pg.screenshot({ path: OUT + tag + '_7_drawer_cart.png' });
      await pg.click('#dr-next');
    }
    await sleep(700);
    await pg.type('#f-name', 'TEST E2E ' + tag);
    await pg.type('#f-phone', W > 1000 ? '0661 00 14 40' : '0661 00 03 90');
    if (W < 1000) { await pg.evaluate(() => document.querySelector('#f-mode input[value="livraison"]').click()); await sleep(200); await pg.type('#f-addr', 'Adresse de test E2E'); }
    // validation : téléphone vide -> erreur
    await pg.screenshot({ path: OUT + tag + '_8_checkout.png' });
    await pg.click('#dr-next');
    await pg.waitForSelector('#order-num', { timeout: 20000 }); await sleep(1200);
    res.orderNum = await pg.$eval('#order-num', e => e.textContent);
    res.recap = await pg.$eval('.recap', e => e.innerText.replace(/\s+/g, ' '));
    res.wa = decodeURIComponent(await pg.$eval('#wa-send', e => e.href)).slice(0, 140);
    res.cartAfter = await pg.$eval('[data-count]', e => e.textContent);
    await pg.screenshot({ path: OUT + tag + '_9_confirmation.png' });
    await pg.close();
  }
  // réduction des animations
  const rm = await b.newPage(); await rm.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]); await rm.setViewport({ width: 1440, height: 900 });
  await rm.goto(BASE, { waitUntil: 'networkidle2' }); await sleep(1500);
  R.reducedMotion = await rm.evaluate(() => ({ hiddenReveals: [...document.querySelectorAll('.reveal')].filter(e => getComputedStyle(e).opacity !== '1').length, marquee: getComputedStyle(document.getElementById('marquee')).animationName }));
  // admin : mauvais mot de passe
  const ad = await b.newPage(); const aerr = []; ad.on('pageerror', e => aerr.push(e.message));
  await ad.setViewport({ width: 1440, height: 900 });
  const ar = await ad.goto(BASE + 'admin/', { waitUntil: 'networkidle2' }); await ad.waitForSelector('#login-form', { visible: true, timeout: 15000 });
  await ad.type('#login-email', 'benduy0@gmail.com'); await ad.type('#login-pw', 'mauvais-mot-de-passe-e2e');
  await ad.click('#login-btn'); await ad.waitForSelector('#login-err:not([hidden])', { timeout: 15000 });
  R.admin = { status: ar.status(), error: await ad.$eval('#login-err', e => e.textContent), appHidden: await ad.$eval('#app', e => e.hidden), pageErrors: aerr };
  await ad.screenshot({ path: OUT + 'admin_login_refuse.png' });
  for (const u of ['robots.txt', 'sitemap.xml', 'content.json', 'site.webmanifest', 'assets/og-image.jpg']) { const r = await ad.goto(BASE + u); R[u] = r.status(); }
  console.log(JSON.stringify(R, null, 1));
  await b.close();
})().catch(e => { console.error(e); process.exit(1); });
