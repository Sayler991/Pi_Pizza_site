/* Pi Pizza & Burger — contenu en direct (Supabase pipizza.site_content → content.json → HTML statique),
   commande en ligne (panier, tiroir, envoi Supabase place_order + WhatsApp), animations. Script classique. */
(function () {
  'use strict';
  var C = window.BK_CONFIG || {}, sb = null, DATA = null;
  try { if (window.supabase && C.SUPABASE_URL) sb = window.supabase.createClient(C.SUPABASE_URL, C.SUPABASE_ANON_KEY, { db: { schema: C.SCHEMA || 'pipizza' }, auth: { persistSession: false } }); } catch (e) { sb = null; }
  var $ = function (s, r) { return (r || document).querySelector(s); }, $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var RM = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var root = document.documentElement;
  function esc(t) { return String(t == null ? '' : t).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function rich(t) { return esc(t).replace(/\*([^*]+)\*/g, '<em>$1</em>'); }
  function get(o, p) { return p.split('.').reduce(function (a, k) { return a == null ? a : a[k]; }, o); }
  function fmt(n) { return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, '\u202f') + ' ' + ((DATA && DATA.menu && DATA.menu.currency) || 'DA'); }
  function plural(n, w) { return n + ' ' + w + (n > 1 ? 's' : ''); }
  function store(k, v) { try { if (v === undefined) return JSON.parse(localStorage.getItem(k) || 'null'); localStorage.setItem(k, JSON.stringify(v)); } catch (e) { return null; } }
  function say(t) { var s = $('#sr'); s.textContent = ''; setTimeout(function () { s.textContent = t; }, 30); }

  /* ---------- données ---------- */
  function photo(key, size) {
    var p = DATA && DATA.photos && DATA.photos[key];
    if (p && p.src) return { src: p.src, srcset: '', alt: p.alt || '' };
    return { src: 'assets/img/' + key + '-' + (size || 800) + '.webp', srcset: 'assets/img/' + key + '-480.webp 480w, assets/img/' + key + '-800.webp 800w', alt: (p && p.alt) || '' };
  }
  function items() { var out = []; ((DATA && DATA.menu && DATA.menu.categories) || []).forEach(function (c) { (c.items || []).forEach(function (it) { out.push(it); }); }); return out; }
  function item(id) { return items().filter(function (x) { return x.id === id; })[0]; }
  function priced(it) { return !!it && /^\d{1,6}$/.test(String(it.price || '')); }
  function orderable(it) { return !!it && it.available !== false; }
  function fmtP(it) { return priced(it) ? fmt(it.price) : 'Prix à venir'; }
  function fmtL(line) { return line == null ? 'prix à venir' : fmt(line); }
  function fmtT(t) { return t.pending ? (t.s ? fmt(t.s) + ' + à confirmer' : 'À confirmer') : fmt(t.s); }
  function branches() { return ((DATA && DATA.branches) || []); }
  function branch(k) { return branches().filter(function (b) { return b.key === k; })[0]; }
  function mainBranch() { return branch(get(DATA, 'business.main_branch')) || branches()[0] || {}; }
  function waNum(b) { var d = String(b.phone_intl || b.phone || '').replace(/[^0-9]/g, ''); if (d.charAt(0) === '0') d = '213' + d.slice(1); return d; }
  function tel(b) { return 'tel:' + String(b.phone_intl || b.phone || '').replace(/[^0-9+]/g, ''); }

  /* ---------- rendu ---------- */
  function renderBinds() {
    $$('[data-bind]').forEach(function (e) { var k = e.getAttribute('data-bind'), v = k === 'main_phone' ? mainBranch().phone : get(DATA, k); if (v != null && v !== '') e.textContent = v; });
    $$('[data-bind-rich]').forEach(function (e) { var v = get(DATA, e.getAttribute('data-bind-rich')); if (v) e.innerHTML = rich(v); });
    $$('[data-bind-href="tel"]').forEach(function (e) { e.href = tel(mainBranch()); });
    $$('img[data-photo]').forEach(function (img) { var k = img.getAttribute('data-photo'), p = DATA.photos && DATA.photos[k]; if (p && p.src) { img.removeAttribute('srcset'); img.src = p.src; } if (p && p.alt) img.alt = p.alt; });
    if (DATA.menu && DATA.menu.note) $('#menu-note').textContent = DATA.menu.note;
    if (DATA.reviews && DATA.reviews.source) $('#reviews-src').textContent = DATA.reviews.source;
    var ig = get(DATA, 'business.instagram'); if (ig && ig.length) $('#foot-ig').innerHTML = ig.map(function (x) { return '<a href="' + esc(x.url) + '" rel="noopener" target="_blank">' + esc(x.handle) + '</a>'; }).join('<br>');
    var o = DATA.ordering || {}, cb = $('#closed-banner');
    cb.hidden = o.open !== false; cb.textContent = o.closed_text || 'Commande en ligne fermée : appelez-nous.';
    splitTitle();
  }
  var ACTIVE = 'all';
  function renderTabs() {
    var cats = (DATA.menu && DATA.menu.categories) || [], t = $('#menu-tabs');
    t.innerHTML = '';
    [{ key: 'all', title: 'Tout' }].concat(cats).forEach(function (c) {
      var b = document.createElement('button'); b.type = 'button'; b.className = 'tab'; b.setAttribute('role', 'tab'); b.textContent = c.title;
      b.setAttribute('aria-selected', String(c.key === ACTIVE));
      b.onclick = function () { ACTIVE = c.key; renderTabs(); renderMenu(); }; t.appendChild(b);
    });
  }
  function renderMenu() {
    var g = $('#menu-grid'), cats = (DATA.menu && DATA.menu.categories) || [], html = '', i = 0, open = (DATA.ordering || {}).open !== false;
    cats.forEach(function (c) {
      if (ACTIVE !== 'all' && c.key !== ACTIVE) return;
      var vis = (c.items || []).filter(function (it) { return it.name && it.available !== false; });
      if (!vis.length) return;
      html += '<div class="cat"><h3>' + esc(c.title) + '</h3>' + (c.desc ? '<p>' + esc(c.desc) + '</p>' : '') + '</div>';
      vis.forEach(function (it) {
        var p = photo(it.photo || 'hero'), q = qty(it.id), ok = orderable(it), custom = !!(DATA.photos && DATA.photos[it.photo] && DATA.photos[it.photo].src);
        html += '<article class="item' + (q ? ' has' : '') + '" data-id="' + esc(it.id) + '" style="--i:' + (i++) + '">' +
          '<div class="pic"><img loading="lazy" src="' + esc(p.src) + '"' + (p.srcset ? ' srcset="' + p.srcset + '" sizes="(max-width:640px) 50vw, 320px"' : '') + ' alt="' + esc(p.alt) + '" width="800" height="600">' +
          (it.tag ? '<span class="tag">' + esc(it.tag) + '</span>' : '') + (custom ? '' : '<span class="cap">Illustration</span>') + '</div>' +
          '<div class="body"><h4>' + esc(it.name) + '</h4>' + (it.desc ? '<p class="desc">' + esc(it.desc) + '</p>' : '<p class="desc"></p>') +
          '<div class="row"><span class="price' + (priced(it) ? '' : ' tbd') + '">' + fmtP(it) + '</span>' + (open && ok ? stepperHtml(it, q) : '<a class="btn btn-line" href="' + tel(mainBranch()) + '">Appeler</a>') + '</div></div></article>';
      });
    });
    g.innerHTML = html || '<p class="mut">La carte arrive bientôt.</p>';
  }
  function stepperHtml(it, q) {
    return '<div class="stepper' + (q ? '' : ' zero') + '" data-id="' + esc(it.id) + '"><button class="minus" type="button" aria-label="Retirer un ' + esc(it.name) + '">−</button>' +
      '<span class="q" aria-live="polite">' + q + '</span><button class="plus" type="button" aria-label="Ajouter un ' + esc(it.name) + '">+<span class="lbl" aria-hidden="true">Ajouter</span></button></div>';
  }
  function renderReviews() {
    var r = (DATA.reviews && DATA.reviews.items) || [];
    $('#reviews').innerHTML = r.map(function (x, i) { return '<blockquote class="review reveal" style="transition-delay:' + i * 120 + 'ms"><p>« ' + esc(x.text) + ' »</p><footer><b>' + esc(x.author) + '</b> · ' + esc(x.when) + ' · Google</footer></blockquote>'; }).join('');
  }
  function renderBranches() {
    $('#branches').innerHTML = branches().map(function (b, i) {
      return '<article class="branch reveal' + (b.main ? ' main' : '') + '" style="transition-delay:' + i * 100 + 'ms">' + (b.main ? '<span class="badge-main">Boutique principale</span>' : '') +
        '<h3>' + esc(b.name) + '</h3><p>' + esc(b.address || b.city || '') + '</p><a class="ph-n" href="' + tel(b) + '">' + esc(b.phone) + '</a><p>🕘 ' + esc(b.hours || get(DATA, 'hours.text') || '') + '</p>' +
        '<div class="acts"><a class="btn btn-hot" href="' + tel(b) + '">Appeler</a><a class="btn btn-wa" href="https://wa.me/' + waNum(b) + '" target="_blank" rel="noopener">WhatsApp</a>' +
        (b.maps_url ? '<a class="btn btn-line" href="' + esc(b.maps_url) + '" target="_blank" rel="noopener">Itinéraire</a>' : '') + '</div></article>';
    }).join('');
  }
  function renderAll() { renderBinds(); renderTabs(); renderMenu(); renderReviews(); renderBranches(); syncCart(); observe(); }

  /* ---------- panier ---------- */
  var CART = store('pp_cart') || {}; // { id: { qty, note } }
  function qty(id) { return (CART[id] && CART[id].qty) || 0; }
  function clean() { Object.keys(CART).forEach(function (id) { if (!orderable(item(id)) || !(CART[id].qty > 0)) delete CART[id]; }); }
  function totals() { var n = 0, s = 0, pending = false; Object.keys(CART).forEach(function (id) { var it = item(id); if (!orderable(it)) return; n += CART[id].qty; if (priced(it)) s += CART[id].qty * parseInt(it.price, 10); else pending = true; }); return { n: n, s: s, pending: pending }; }
  function setQty(id, q, from) {
    var it = item(id); if (!orderable(it)) return;
    var before = qty(id); q = Math.max(0, Math.min(20, q));
    if (q === before) { if (q === 20) say('20 maximum par article.'); return; }
    if (q) CART[id] = { qty: q, note: (CART[id] && CART[id].note) || '' }; else delete CART[id];
    store('pp_cart', CART);
    if (q > before && from) fly(from, it);
    say(it.name + ' : ' + q + ' dans le panier.');
    syncCart(true);
  }
  function syncCart(bump) {
    clean(); var t = totals();
    $$('[data-count]').forEach(function (e) { e.textContent = t.n; if (bump) { e.classList.remove('bump'); void e.offsetWidth; e.classList.add('bump'); } });
    $$('.stepper[data-id]').forEach(function (s) {
      var q = qty(s.getAttribute('data-id')), qe = $('.q', s);
      if (qe.textContent !== String(q)) { qe.textContent = q; qe.classList.remove('pop'); void qe.offsetWidth; qe.classList.add('pop'); }
      s.classList.toggle('zero', !q); var card = s.closest('.item'); if (card) card.classList.toggle('has', !!q);
    });
    var fab = $('#fab'); fab.hidden = !t.n || !$('#drawer').hidden;
    if (bump && t.n) { fab.classList.remove('bump'); void fab.offsetWidth; fab.classList.add('bump'); }
    $('#fab-items').textContent = plural(t.n, 'article'); $('#fab-total').textContent = fmtT(t);
    $('#dr-count').textContent = plural(t.n, 'article'); $('#dr-sum').textContent = fmtT(t);
    renderMini(t, bump);
    if (STEP === 'cart') { $('#dr-next').disabled = !t.n || (DATA.ordering || {}).open === false; renderLines(); }
  }
  function renderMini(t, bump) {
    var ids = Object.keys(CART);
    $('#mini-lines').innerHTML = ids.map(function (id) { var it = item(id); return '<li><span class="mq">' + CART[id].qty + '×</span><span>' + esc(it.name) + '</span><span class="ml">' + fmtL(priced(it) ? CART[id].qty * parseInt(it.price, 10) : null) + '</span></li>'; }).join('');
    $('#mini-empty').hidden = !!ids.length; $('#mini-count').textContent = plural(t.n, 'article');
    var s = $('#mini-sum'); s.textContent = fmtT(t); if (bump) { s.classList.remove('bump'); void s.offsetWidth; s.classList.add('bump'); }
    $('#mini-go').disabled = !t.n || (DATA.ordering || {}).open === false;
  }
  $('#mini-go').addEventListener('click', function () { STEP = 'info'; openCart(); });
  function fly(btn, it) {
    if (RM) return;
    var mini = $('#mini'), target = mini && mini.offsetParent && mini.getBoundingClientRect().top < innerHeight ? $('#mini-sum') : (!$('#fab').hidden && $('#fab').offsetParent) ? $('#fab .fab-ic') : $('.nav-cart'); if (!target) return;
    var a = btn.getBoundingClientRect(), b = target.getBoundingClientRect(), d = document.createElement('span');
    d.className = 'flyer'; d.style.backgroundImage = 'url("' + photo(it.photo).src + '")'; $('#fly').appendChild(d);
    var x0 = a.left + a.width / 2 - 22, y0 = a.top + a.height / 2 - 22, x1 = b.left + b.width / 2 - 22, y1 = b.top + b.height / 2 - 22;
    var an = d.animate([
      { transform: 'translate(' + x0 + 'px,' + y0 + 'px) scale(.6)', opacity: 1 },
      { transform: 'translate(' + (x0 + (x1 - x0) * .5) + 'px,' + (Math.min(y0, y1) - 120) + 'px) scale(1.15)', opacity: 1, offset: .5 },
      { transform: 'translate(' + x1 + 'px,' + y1 + 'px) scale(.3)', opacity: .4 }], { duration: 650, easing: 'cubic-bezier(.5,0,.6,1)' });
    an.onfinish = function () { d.remove(); };
  }
  document.addEventListener('click', function (e) {
    var b = e.target.closest && e.target.closest('.stepper button'); if (!b) return;
    var id = b.parentNode.getAttribute('data-id'); setQty(id, qty(id) + (b.classList.contains('plus') ? 1 : -1), b.classList.contains('plus') ? b : null);
  });

  /* ---------- tiroir ---------- */
  var STEP = 'cart', LAST = null;
  function openCart() {
    var w = $('#drawer'); w.classList.remove('closing'); w.hidden = false; document.body.style.overflow = 'hidden';
    if (STEP === 'done') step('cart'); else step(STEP); $('#fab').hidden = true; setTimeout(function () { $('.dr-x').focus(); }, 50);
  }
  function closeCart() {
    var w = $('#drawer'); if (w.hidden) return;
    var fin = function () { w.hidden = true; w.classList.remove('closing'); document.body.style.overflow = ''; if (STEP === 'done') step('cart'); syncCart(); };
    if (RM) return fin(); w.classList.add('closing'); setTimeout(fin, 280);
  }
  $$('[data-open-cart]').forEach(function (b) { b.addEventListener('click', openCart); });
  document.addEventListener('click', function (e) { if (e.target.closest && e.target.closest('[data-close-cart]')) closeCart(); });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeCart(); });
  $('#dr-back').onclick = function () { step('cart'); };

  function renderLines() {
    var ul = $('#lines'), ids = Object.keys(CART);
    $('#empty').hidden = !!ids.length;
    var have = $$('li', ul).map(function (l) { return l.getAttribute('data-id'); }).join(',');
    if (have === ids.join(',')) return; // évite de casser la saisie des remarques
    ul.innerHTML = ids.map(function (id) {
      var it = item(id); return '<li class="line" data-id="' + esc(id) + '"><img src="' + esc(photo(it.photo, 480).src) + '" alt=""><b>' + esc(it.name) + '</b>' + stepperHtml(it, CART[id].qty) +
        '<span class="lp">' + fmtP(it) + '</span><input type="text" maxlength="120" placeholder="Sans oignon, bien cuit… (facultatif)" aria-label="Remarque pour ' + esc(it.name) + '" value="' + esc(CART[id].note || '') + '"></li>';
    }).join('');
    $$('input', ul).forEach(function (inp) { inp.oninput = function () { var id = inp.parentNode.getAttribute('data-id'); if (CART[id]) { CART[id].note = inp.value; store('pp_cart', CART); } }; });
  }
  function renderBranchChoice() {
    var saved = store('pp_info') || {}, cur = saved.branch && branch(saved.branch) ? saved.branch : mainBranch().key;
    $('#f-branch').innerHTML = branches().filter(function (b) { return b.orders !== false; }).map(function (b) {
      return '<label><input type="radio" name="branch" value="' + esc(b.key) + '"' + (b.key === cur ? ' checked' : '') + '><span>' + esc(b.city || b.name) + '<small>' + esc(b.phone) + '</small></span></label>';
    }).join('');
    var o = DATA.ordering || {}; $('#mode-liv').hidden = o.delivery === false;
    if (o.delivery === false) $('#f-mode input[value=emporter]').checked = true; else if (saved.mode) { var r = $('#f-mode input[value="' + saved.mode + '"]'); if (r) r.checked = true; }
    $('#f-name').value = $('#f-name').value || saved.name || ''; $('#f-phone').value = $('#f-phone').value || saved.phone || ''; $('#f-addr').value = $('#f-addr').value || saved.address || '';
    modeUI();
  }
  function modeUI() {
    var liv = ($('#f-mode input:checked') || {}).value === 'livraison', o = DATA.ordering || {};
    $('#addr-wrap').hidden = !liv; $('#mode-note').textContent = liv ? (o.delivery_note || '') : (o.pickup_note || '');
  }
  $('#f-mode').addEventListener('change', modeUI);
  function step(s) {
    STEP = s;
    $('#step-cart').hidden = s !== 'cart'; $('#step-info').hidden = s !== 'info'; $('#step-done').hidden = s !== 'done';
    $('#dr-back').hidden = s !== 'info'; $('#dr-foot').hidden = s === 'done';
    $('#dr-title').textContent = { cart: 'Votre panier', info: 'Vos coordonnées', done: 'Commande envoyée' }[s];
    var nx = $('#dr-next');
    if (s === 'cart') { nx.textContent = 'Continuer →'; renderLines(); var t = totals(); nx.disabled = !t.n || (DATA.ordering || {}).open === false; }
    if (s === 'info') { nx.textContent = 'Valider la commande'; nx.disabled = false; renderBranchChoice(); $('#f-err').hidden = true; setTimeout(function () { var f = !$('#f-name').value ? $('#f-name') : !$('#f-phone').value ? $('#f-phone') : null; if (f) f.focus(); }, 60); }
    $('.dr-body').scrollTop = 0;
  }
  $('#dr-next').onclick = function () { if (STEP === 'cart') step('info'); else if (STEP === 'info') submit(); };
  $('#step-info').addEventListener('submit', function (e) { e.preventDefault(); submit(); });

  function normPhone(p) { return String(p || '').replace(/[\s.\-()]/g, ''); }
  function validPhone(p) { return /^(?:\+213|00213|0)[2-7]\d{7,8}$/.test(normPhone(p)); }
  function err(msg, field) { var e = $('#f-err'); e.textContent = msg; e.hidden = false; $$('#step-info .bad').forEach(function (x) { x.classList.remove('bad'); }); if (field) { field.classList.add('bad'); field.focus(); } }
  function payload() {
    return {
      branch: ($('#f-branch input:checked') || {}).value, mode: ($('#f-mode input:checked') || {}).value || 'emporter',
      name: $('#f-name').value.trim(), phone: $('#f-phone').value.trim(), address: $('#f-addr').value.trim(), note: $('#f-note').value.trim(), hp: $('#f-hp').value,
      items: Object.keys(CART).map(function (id) { return { id: id, qty: CART[id].qty, note: (CART[id].note || '').trim() }; })
    };
  }
  var SENDING = false;
  function submit() {
    if (SENDING) return;
    var p = payload();
    if (!p.items.length) return step('cart');
    if (!p.branch) return err('Choisissez une boutique.');
    if (p.name.length < 2) return err('Indiquez votre nom.', $('#f-name'));
    if (!validPhone(p.phone)) return err('Numéro de téléphone invalide (ex. 0559 12 34 56).', $('#f-phone'));
    if (p.mode === 'livraison' && p.address.length < 5) return err('Indiquez l’adresse de livraison.', $('#f-addr'));
    store('pp_info', { branch: p.branch, mode: p.mode, name: p.name, phone: p.phone, address: p.address });
    var nx = $('#dr-next'); SENDING = true; nx.disabled = true; nx.textContent = 'Envoi…';
    var done = function (res, offline) { SENDING = false; nx.disabled = false; nx.textContent = 'Valider la commande'; confirmScreen(p, res, offline); };
    if (!sb) return done(null, true);
    sb.rpc('place_order', { p: p }).then(function (r) {
      if (r.error) {
        SENDING = false; nx.disabled = false; nx.textContent = 'Valider la commande';
        var m = r.error.message || ''; if (!/^[A-ZÀ-Ý]/.test(m) || /fetch|network/i.test(m)) return done(null, true);
        return err(m);
      }
      done(r.data, false);
    }, function () { done(null, true); });
  }
  function waText(p, res) {
    var b = branch(p.branch) || {}, lines = [];
    lines.push('Bonjour ' + (b.name || 'Pi Pizza & Burger') + ', je souhaite commander' + (res ? ' (commande n° ' + res.id + ' du site)' : '') + ' :');
    (res ? res.items : p.items.map(function (x) { var it = item(x.id); return { name: it.name, qty: x.qty, line: priced(it) ? x.qty * parseInt(it.price, 10) : null, note: x.note }; })).forEach(function (x) {
      lines.push('• ' + x.qty + ' × ' + x.name + ' — ' + fmtL(x.line) + (x.note ? ' (' + x.note + ')' : ''));
    });
    lines.push('Total : ' + (res ? fmtT({ s: res.total, pending: res.pending }) : fmtT(totals())));
    lines.push(p.mode === 'livraison' ? 'Livraison : ' + p.address : 'À emporter');
    lines.push('Nom : ' + p.name + ' — Tél : ' + p.phone);
    if (p.note) lines.push('Remarque : ' + p.note);
    return lines.join('\n');
  }
  function confirmScreen(p, res, offline) {
    var b = branch(p.branch) || {}, wa = 'https://wa.me/' + waNum(b) + '?text=' + encodeURIComponent(waText(p, res));
    var list = res ? res.items : [];
    $('#step-done').innerHTML = offline ?
      '<div class="done"><h3>Connexion impossible</h3><p class="mut">La commande n’a pas pu être enregistrée en ligne. Envoyez-la directement à la boutique :</p>' +
      '<a class="btn btn-wa btn-lg btn-block" id="wa-send" href="' + esc(wa) + '" target="_blank" rel="noopener">Envoyer par WhatsApp</a><a class="btn btn-line btn-lg btn-block" href="' + tel(b) + '">Appeler ' + esc(b.phone) + '</a></div>' :
      '<div class="done"><div class="check"><svg viewBox="0 0 52 52" fill="none"><path d="M14 27l8 8 16-18" stroke="#fff" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/></svg></div>' +
      '<p class="mut">Merci ' + esc(p.name.split(' ')[0]) + ', votre commande est enregistrée</p><p class="num" id="order-num">N° ' + esc(res.id) + '</p>' +
      '<p>' + esc(res.branch_name || b.name) + ' vous appelle au <b>' + esc(p.phone) + '</b> pour confirmer.</p>' +
      '<div class="recap"><b>' + (p.mode === 'livraison' ? '🛵 Livraison' : '🥡 À emporter') + '</b><ul>' + list.map(function (x) { return '<li>' + x.qty + ' × ' + esc(x.name) + ' — ' + fmtL(x.line) + (x.note ? ' <i>(' + esc(x.note) + ')</i>' : '') + '</li>'; }).join('') +
      '</ul><b>Total : ' + fmtT({ s: res.total, pending: res.pending }) + '</b><br><small class="mut">' + (res.pending ? 'Prix pas encore publiés : la pizzeria vous donne le total au téléphone.' : 'Total indicatif, confirmé par la pizzeria.') + '</small></div>' +
      '<a class="btn btn-wa btn-lg btn-block" id="wa-send" href="' + esc(wa) + '" target="_blank" rel="noopener">Envoyer aussi sur WhatsApp</a>' +
      '<a class="btn btn-line btn-lg btn-block" href="' + tel(b) + '">Appeler ' + esc(b.phone) + '</a>' +
      '<button class="btn btn-hot btn-lg btn-block" type="button" data-close-cart>Terminer</button></div>';
    if (!offline) { CART = {}; store('pp_cart', CART); $('#f-note').value = ''; syncCart(); }
    LAST = res; step('done'); say(offline ? 'Envoi impossible.' : 'Commande numéro ' + res.id + ' enregistrée.');
  }

  /* ---------- animations ---------- */
  function splitTitle() {
    var h = $('.hero-title'); if (!h || h.getAttribute('data-split') === h.innerHTML) return;
    var i = 0;
    function walk(node) {
      Array.prototype.slice.call(node.childNodes).forEach(function (n) {
        if (n.nodeType === 3) {
          var frag = document.createDocumentFragment();
          n.textContent.split(/(\s+)/).forEach(function (w) {
            if (!w) return; if (/^\s+$/.test(w)) return frag.appendChild(document.createTextNode(' '));
            var o = document.createElement('span'); o.className = 'w'; var s = document.createElement('span'); s.textContent = w; s.style.transitionDelay = (i++ * 90) + 'ms'; o.appendChild(s); frag.appendChild(o);
          });
          n.parentNode.replaceChild(frag, n);
        } else if (n.nodeType === 1) walk(n);
      });
    }
    walk(h); h.setAttribute('data-split', h.innerHTML);
  }
  var io = null;
  function observe() {
    if (RM || !('IntersectionObserver' in window)) { $$('.reveal').forEach(function (e) { e.classList.add('in'); }); return; }
    io = io || new IntersectionObserver(function (es) { es.forEach(function (e) { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } }); }, { rootMargin: '0px 0px -8% 0px', threshold: .08 });
    $$('.reveal:not(.in)').forEach(function (e) { io.observe(e); });
  }
  var tick = false;
  function onScroll() {
    if (tick) return; tick = true;
    requestAnimationFrame(function () {
      var y = window.scrollY, h = document.documentElement.scrollHeight - innerHeight;
      $('#nav').classList.toggle('solid', y > 30);
      $('#progress').style.transform = 'scaleX(' + (h > 0 ? y / h : 0) + ')';
      if (!RM) { var f = $('.hero-frame img'); if (f && y < innerHeight) f.style.translate = '0 ' + (y * .08) + 'px'; }
      tick = false;
    });
  }
  window.addEventListener('scroll', onScroll, { passive: true });
  var tr = $('#marquee'); tr.innerHTML += tr.innerHTML;

  /* ---------- démarrage ---------- */
  function start(d, src) { DATA = d; root.setAttribute('data-live', src); renderAll(); onScroll(); requestAnimationFrame(function () { root.classList.add('ready'); }); }
  function fallback() {
    return fetch('content.json', { cache: 'no-cache' }).then(function (r) { if (!r.ok) throw 0; return r.json(); }).then(function (d) { start(d, 'json'); })
      .catch(function () { root.classList.add('ready'); root.setAttribute('data-live', 'static'); observe(); });
  }
  if (sb) {
    var to = setTimeout(function () { to = null; fallback(); }, 6000);
    sb.from('site_content').select('data').eq('id', 1).maybeSingle().then(function (r) {
      if (!to) { if (r.data && r.data.data) start(r.data.data, 'supabase'); return; }
      clearTimeout(to);
      if (r.error || !r.data || !r.data.data) fallback(); else start(r.data.data, 'supabase');
    }, function () { if (to) { clearTimeout(to); fallback(); } });
  } else fallback();
  window.BK = { cart: function () { return CART; }, data: function () { return DATA; } };
})();
