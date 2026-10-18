/* Tableau de bord Pi Pizza & Burger — Supabase schéma « pipizza » :
   commandes (statuts), clients, stats, contenu, carte & prix, boutiques & horaires, photos, historique.
   Compte gérant = table public.owners (fonction public.is_owner()). */
(function () {
  'use strict';
  var C = window.BK_CONFIG || {};
  var sb = (window.supabase && C.SUPABASE_URL) ? window.supabase.createClient(C.SUPABASE_URL, C.SUPABASE_ANON_KEY, { db: { schema: C.SCHEMA || 'pipizza' } }) : null;
  window.BK_SB = sb;
  var BUCKET = 'images', STATUSES = ['nouvelle', 'en préparation', 'prête', 'livrée', 'annulée'];
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var CONTENT = null, DIRTY = false, TAB = 'orders';
  function slug(s) { return String(s).normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/^en /, '').replace(/[^a-z]/g, ''); }
  function money(n) { return String(n || 0).replace(/\B(?=(\d{3})+(?!\d))/g, '\u202f') + ' DA'; }

  function h(tag, attrs) {
    var e = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (k) {
      var v = attrs[k]; if (v == null || v === false) return;
      if (k === 'text') e.textContent = v; else if (k.slice(0, 2) === 'on') e.addEventListener(k.slice(2), v); else if (k === 'value') e.value = v; else e.setAttribute(k, v === true ? '' : v);
    });
    for (var i = 2; i < arguments.length; i++) { var c = arguments[i]; if (c == null) continue; (Array.isArray(c) ? c : [c]).forEach(function (x) { if (x != null) e.appendChild(typeof x === 'string' ? document.createTextNode(x) : x); }); }
    return e;
  }
  function toast(t, err) { var x = h('div', { class: 'toast' + (err ? ' err' : ''), text: t }); $('#toasts').appendChild(x); setTimeout(function () { x.remove(); }, err ? 7000 : 3500); }
  function dt(s) { return new Date(s).toLocaleString('fr-FR', { timeZone: 'Africa/Algiers', dateStyle: 'short', timeStyle: 'short' }); }
  function telA(p) { return h('a', { href: 'tel:' + String(p || '').replace(/[^0-9+]/g, ''), text: p || '' }); }
  function field(label, obj, key, opt) {
    opt = opt || {};
    var inp = opt.type === 'textarea' ? h('textarea', { rows: opt.rows || 2 }) : h('input', { type: opt.type || 'text', placeholder: opt.ph || null, inputmode: opt.inputmode || null });
    if (opt.type === 'checkbox') { inp.checked = obj[key] !== false; inp.onchange = function () { obj[key] = inp.checked; DIRTY = true; }; return h('label', { class: 'row switch' }, inp, label); }
    inp.value = obj[key] == null ? '' : obj[key];
    inp.oninput = function () { obj[key] = inp.value; DIRTY = true; };
    return h('label', { class: 'f' }, h('span', { text: label }), inp, opt.hint ? h('small', { class: 'mut', text: opt.hint }) : null);
  }

  /* ---------- connexion ---------- */
  function showLogin(msg) {
    $('#boot').hidden = true; $('#app').hidden = true; $('#login').hidden = false;
    if (msg) { $('#login-err').textContent = msg; $('#login-err').hidden = false; }
  }
  $('#login-form').addEventListener('submit', function (e) {
    e.preventDefault(); $('#login-err').hidden = true; $('#login-btn').disabled = true;
    sb.auth.signInWithPassword({ email: $('#login-email').value.trim(), password: $('#login-pw').value }).then(function (r) {
      $('#login-btn').disabled = false;
      if (r.error) showLogin('Connexion refusée : ' + (r.error.message === 'Invalid login credentials' ? 'e-mail ou mot de passe incorrect.' : r.error.message));
    });
  });
  function checkOwner(session) {
    return sb.schema('public').from('owners').select('user_id').eq('user_id', session.user.id).maybeSingle().then(function (r) { return !!(r.data); });
  }

  /* ---------- squelette ---------- */
  var TABS = [['orders', '🧾 Commandes'], ['clients', '👥 Clients'], ['stats', '📊 Stats'], ['contenu', '✏️ Contenu'], ['carte', '🌯 Carte & prix'], ['boutiques', '🕘 Boutiques & horaires'], ['photos', '🖼️ Photos'], ['historique', '↺ Historique']];
  function shell(session) {
    var app = $('#app'); app.innerHTML = '';
    var side = h('nav', { class: 'side' });
    TABS.forEach(function (t) { side.appendChild(h('button', { type: 'button', 'data-tab': t[0], text: t[1], onclick: function () { go(t[0]); } })); });
    app.appendChild(h('header', { class: 'top' },
      h('div', { class: 'brand' }, h('img', { src: '../assets/logo.svg', alt: '' }), h('b', { text: 'Pi Pizza & Burger — gérant' })),
      h('span', { id: 'status', text: session.user.email }),
      h('a', { class: 'btn btn-line btn-sm', href: '../', target: '_blank', text: 'Voir le site' }),
      h('button', { class: 'btn btn-line btn-sm', type: 'button', text: 'Déconnexion', onclick: function () { sb.auth.signOut(); } })));
    app.appendChild(h('div', { class: 'layout' }, side, h('main', { id: 'main' })));
    $('#boot').hidden = true; $('#login').hidden = true; app.hidden = false;
    go((location.hash || '#orders').slice(1));
  }
  function go(tab) {
    if (DIRTY && !confirm('Modifications non enregistrées : les abandonner ?')) return;
    DIRTY = false; if (!TABS.some(function (t) { return t[0] === tab; })) tab = 'orders'; TAB = tab;
    history.replaceState(null, '', '#' + tab);
    document.querySelectorAll('.side button').forEach(function (b) { b.classList.toggle('on', b.getAttribute('data-tab') === tab); });
    var m = $('#main'); m.innerHTML = '';
    ({ orders: viewOrders, clients: viewClients, stats: viewStats, contenu: viewContent, carte: viewMenu, boutiques: viewBranches, photos: viewPhotos, historique: viewHistory })[tab](m);
  }
  window.BK_GO = function (t) { go(t); };

  /* ---------- commandes ---------- */
  function viewOrders(m) {
    var filt = h('select', { 'aria-label': 'Filtre' }, h('option', { value: 'actives', text: 'À traiter (nouvelle, en préparation, prête)' }), h('option', { value: 'today', text: 'Aujourd’hui' }), h('option', { value: '', text: 'Toutes' }), STATUSES.map(function (s) { return h('option', { value: s, text: s }); }));
    var bf = h('select', { 'aria-label': 'Boutique' }, h('option', { value: '', text: 'Toutes les boutiques' }));
    sb.from('site_content').select('data').eq('id', 1).single().then(function (r) { ((r.data && r.data.data.branches) || []).forEach(function (b) { bf.appendChild(h('option', { value: b.key, text: b.city || b.name })); }); });
    var list = h('div');
    m.appendChild(h('h2', { text: '🧾 Commandes' }));
    m.appendChild(h('div', { class: 'crm-bar' }, filt, bf, h('button', { class: 'btn btn-line btn-sm', type: 'button', text: '↻ Actualiser', onclick: load })));
    m.appendChild(list); filt.onchange = load; bf.onchange = load;
    function load() {
      var q = sb.from('orders').select('*').order('created_at', { ascending: false }).limit(300);
      if (filt.value === 'actives') q = q.in('status', ['nouvelle', 'en préparation', 'prête']);
      else if (filt.value === 'today') q = q.gte('created_at', new Date(new Date().toLocaleDateString('en-CA', { timeZone: 'Africa/Algiers' }) + 'T00:00:00+01:00').toISOString());
      else if (filt.value) q = q.eq('status', filt.value);
      if (bf.value) q = q.eq('branch', bf.value);
      q.then(function (r) {
        if (r.error) return toast(r.error.message, true);
        list.innerHTML = '';
        if (!r.data.length) list.appendChild(h('p', { class: 'mut', text: 'Aucune commande.' }));
        r.data.forEach(function (o) {
          var badge = h('span', { class: 'st st-' + slug(o.status), text: o.status });
          var card;
          var sel = h('select', { 'aria-label': 'Statut de la commande ' + o.id }, STATUSES.map(function (s) { return h('option', { value: s, text: s }); })); sel.value = o.status;
          sel.onchange = function () {
            var v = sel.value;
            sb.from('orders').update({ status: v }).eq('id', o.id).select('id').single().then(function (r2) {
              if (r2.error) { toast(r2.error.message, true); sel.value = o.status; } else { o.status = v; badge.className = 'st st-' + slug(v); badge.textContent = v; card.className = 'card order s-' + slug(v); toast('N° ' + o.id + ' : ' + v); }
            });
          };
          var wa = String(o.phone).replace(/[^0-9]/g, '').replace(/^0/, '213');
          card = h('section', { class: 'card order s-' + slug(o.status), 'data-id': o.id },
            h('div', null,
              h('b', { text: 'N° ' + o.id + ' — ' + o.name }), ' ', badge, ' · ', telA(o.phone), ' · ', h('a', { href: 'https://wa.me/' + wa, target: '_blank', rel: 'noopener', text: 'WhatsApp' }),
              h('p', { class: 'sm', text: '🏪 ' + (o.branch_name || o.branch) + ' · ' + (o.mode === 'livraison' ? '🛵 Livraison' : '🥡 À emporter') + (o.via_whatsapp ? ' · via WhatsApp' : '') + ' · reçue le ' + dt(o.created_at) }),
              o.address ? h('p', { text: '📍 ' + o.address }) : null,
              h('ul', null, (o.items || []).map(function (x) { return h('li', { text: x.qty + ' × ' + x.name + ' — ' + (x.line == null ? 'prix à venir' : money(x.line)) + (x.note ? ' (' + x.note + ')' : '') }); })),
              o.note ? h('p', { text: '💬 ' + o.note }) : null),
            h('div', { style: 'text-align:right' }, h('div', { class: 'tot', text: money(o.total) + (o.price_pending ? ' + à confirmer' : '') }), h('div', { class: 'sm', text: o.item_count + ' article(s)' }), sel));
          list.appendChild(card);
        });
      });
    }
    load();
  }

  /* ---------- clients ---------- */
  function viewClients(m) {
    m.appendChild(h('h2', { text: 'Clients' }));
    var s = h('input', { type: 'search', placeholder: 'Rechercher un nom ou un téléphone' }), box = h('div');
    m.appendChild(h('div', { class: 'crm-bar' }, s)); m.appendChild(box);
    sb.from('customers').select('id,name,phone,address,notes,created_at,orders(status,total,created_at)').order('created_at', { ascending: false }).limit(1000).then(function (r) {
      if (r.error) return toast(r.error.message, true);
      function draw() {
        var q = s.value.toLowerCase(); box.innerHTML = '';
        r.data.filter(function (c) { return !q || (c.name + ' ' + c.phone).toLowerCase().indexOf(q) >= 0; }).forEach(function (c) {
          var n = 0, sum = 0, last = null; (c.orders || []).forEach(function (x) { if (x.status !== 'annulée') { n++; sum += x.total; } if (!last || x.created_at > last) last = x.created_at; });
          var ta = h('textarea', { rows: 2, placeholder: 'Notes privées (habitudes, sauce préférée…)' }); ta.value = c.notes || '';
          box.appendChild(h('section', { class: 'card' }, h('b', { text: c.name }), ' · ', telA(c.phone),
            c.address ? h('p', { class: 'sm', text: '📍 ' + c.address }) : null,
            h('p', { class: 'mut', text: n + ' commande(s) · ' + money(sum) + (last ? ' · dernière le ' + dt(last) : '') + ' · client depuis ' + dt(c.created_at) }),
            ta, h('button', { class: 'btn btn-line btn-sm', type: 'button', text: 'Enregistrer la note', style: 'margin-top:.4rem', onclick: function () {
              sb.from('customers').update({ notes: ta.value.trim() || null }).eq('id', c.id).select('id').single().then(function (r2) { toast(r2.error ? r2.error.message : 'Note enregistrée', !!r2.error); });
            } })));
        });
        if (!box.childNodes.length) box.appendChild(h('p', { class: 'mut', text: 'Aucun client.' }));
      }
      s.oninput = draw; draw();
    });
  }

  /* ---------- stats ---------- */
  function viewStats(m) {
    m.appendChild(h('h2', { text: 'Statistiques (30 derniers jours)' }));
    var since = new Date(Date.now() - 30 * 864e5).toISOString().slice(0, 10);
    Promise.all([
      sb.from('orders_daily').select('*').gte('day', since).order('day', { ascending: false }),
      sb.from('orders').select('items,branch_name,status').gte('created_at', since).neq('status', 'annulée').limit(5000)
    ]).then(function (rs) {
      var r = rs[0]; if (r.error) return toast(r.error.message, true);
      var t = { total: 0, valid: 0, revenue: 0, deliveries: 0, cancelled: 0 };
      r.data.forEach(function (d) { Object.keys(t).forEach(function (k) { t[k] += Number(d[k]) || 0; }); });
      m.appendChild(h('div', { class: 'kpis' }, [['Commandes', t.total], ['Valides', t.valid], ['Chiffre (indicatif)', money(t.revenue)], ['Panier moyen', money(t.valid ? Math.round(t.revenue / t.valid) : 0)], ['Livraisons', t.deliveries], ['Annulées', t.cancelled]].map(function (k) { return h('div', { class: 'kpi' }, h('b', { text: String(k[1]) }), k[0]); })));
      var max = Math.max.apply(null, [1].concat(r.data.map(function (d) { return +d.total; })));
      m.appendChild(h('div', { class: 'bars', title: 'Commandes par jour' }, r.data.slice().reverse().map(function (d) { return h('i', { style: 'height:' + Math.round(+d.total / max * 100) + '%', title: d.day + ' : ' + d.total }); })));
      var top = {}, br = {}; ((rs[1].data) || []).forEach(function (o) { br[o.branch_name] = (br[o.branch_name] || 0) + 1; (o.items || []).forEach(function (x) { top[x.name] = (top[x.name] || 0) + x.qty; }); });
      var sorted = Object.keys(top).sort(function (a, b) { return top[b] - top[a]; });
      m.appendChild(h('div', { class: 'grid2' },
        h('section', { class: 'card' }, h('h3', { text: 'Articles les plus vendus' }), sorted.length ? h('table', null, sorted.map(function (k) { return h('tr', null, h('td', { text: k }), h('td', { text: String(top[k]) })); })) : h('p', { class: 'mut', text: 'Pas encore de données.' })),
        h('section', { class: 'card' }, h('h3', { text: 'Par boutique' }), Object.keys(br).length ? h('table', null, Object.keys(br).map(function (k) { return h('tr', null, h('td', { text: k }), h('td', { text: String(br[k]) })); })) : h('p', { class: 'mut', text: 'Pas encore de données.' }))));
      m.appendChild(h('table', { style: 'margin-top:1rem' }, h('tr', null, ['Jour', 'Commandes', 'Valides', 'Chiffre', 'Livraisons', 'Annulées'].map(function (x) { return h('th', { text: x }); })),
        r.data.map(function (d) { return h('tr', null, [d.day, d.total, d.valid, money(d.revenue), d.deliveries, d.cancelled].map(function (x) { return h('td', { text: String(x) }); })); })));
    });
  }

  /* ---------- contenu ---------- */
  function loadContent() { return sb.from('site_content').select('data').eq('id', 1).single().then(function (r) { if (r.error) throw r.error; CONTENT = r.data.data; return CONTENT; }); }
  function save(after) {
    var err = null, ids = {};
    ((CONTENT.menu || {}).categories || []).forEach(function (c) { (c.items || []).forEach(function (it) {
      it.name = String(it.name || '').trim(); it.price = String(it.price == null ? '' : it.price).replace(/\s|DA/gi, '');
      if (!it.name) err = 'Un article de la carte n’a pas de nom.';
      if (it.price && !/^\d{1,6}$/.test(it.price)) err = 'Prix invalide pour « ' + it.name + ' » : chiffres uniquement (ou vide = prix à venir).';
      if (!it.id) it.id = it.name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || ('article-' + Date.now());
      if (ids[it.id]) it.id += '-' + Math.random().toString(36).slice(2, 5); ids[it.id] = 1;
    }); });
    (CONTENT.branches || []).forEach(function (b) { if (!b.key || !b.name) err = 'Chaque boutique doit avoir un nom.'; });
    if (err) return toast(err, true);
    sb.from('site_content').update({ data: CONTENT }).eq('id', 1).select('data').single().then(function (r) {
      if (r.error) return toast('Échec : ' + r.error.message, true);
      CONTENT = r.data.data; DIRTY = false; toast('Enregistré — le site est à jour.'); if (typeof after === 'function') after();
    });
  }
  function saveBar() { return h('div', { class: 'savebar' }, h('button', { class: 'btn btn-line', type: 'button', text: 'Annuler', onclick: function () { DIRTY = false; go(TAB); } }), h('button', { class: 'btn btn-solid', type: 'button', id: 'save', text: 'Enregistrer', onclick: function () { save(); } })); }
  function withContent(m, title, fn) { m.appendChild(h('h2', { text: title })); loadContent().then(function (d) { fn(d); m.appendChild(saveBar()); }).catch(function (e) { toast(e.message, true); }); }

  function viewContent(m) {
    withContent(m, 'Contenu', function (d) {
      var O = d.ordering = d.ordering || {}, HE = d.hero = d.hero || {}, AB = d.about = d.about || {}, B = d.business = d.business || {};
      m.appendChild(h('section', { class: 'card' }, h('h3', { text: 'Commande en ligne' }),
        field('Commande en ligne ouverte (décochez pour la fermer : le site affiche le message ci-dessous)', O, 'open', { type: 'checkbox' }),
        field('Message si fermé', O, 'closed_text', { type: 'textarea' }),
        field('Livraison proposée', O, 'delivery', { type: 'checkbox' }),
        field('Texte sous « Livraison »', O, 'delivery_note', { type: 'textarea' }),
        field('Texte sous « À emporter »', O, 'pickup_note', { type: 'textarea' })));
      m.appendChild(h('section', { class: 'card' }, h('h3', { text: 'Haut de page' }),
        field('Petit titre', HE, 'kicker'), field('Titre', HE, 'title', { hint: '*texte* = surligné en rouge' }), field('Sous-titre', HE, 'tagline', { type: 'textarea' })));
      m.appendChild(h('section', { class: 'card' }, h('h3', { text: 'La maison' }),
        field('Titre', AB, 'title', { hint: '*texte* = en jaune' }), field('Texte', AB, 'text', { type: 'textarea', rows: 3 }), field('Citation', AB, 'quote', { type: 'textarea' })));
      var R = d.reviews = d.reviews || { items: [] }, rbox = h('div');
      function drawR() {
        rbox.innerHTML = '';
        (R.items || []).forEach(function (x, i) { rbox.appendChild(h('div', { class: 'item' }, h('div', { class: 'grid2' }, field('Auteur', x, 'author'), field('Date', x, 'when')), field('Avis (copié mot pour mot)', x, 'text', { type: 'textarea' }),
          h('button', { class: 'btn btn-danger btn-sm', type: 'button', text: 'Supprimer', onclick: function () { R.items.splice(i, 1); DIRTY = true; drawR(); } }))); });
        rbox.appendChild(h('button', { class: 'btn btn-line btn-sm', type: 'button', text: '+ Ajouter un avis réel', onclick: function () { R.items.push({ author: '', when: '', text: '' }); DIRTY = true; drawR(); } }));
      }
      drawR();
      m.appendChild(h('section', { class: 'card' }, h('h3', { text: 'Avis clients' }), field('Source affichée', R, 'source'), rbox));
      var IG = B.instagram = B.instagram || [];
      m.appendChild(h('section', { class: 'card' }, h('h3', { text: 'Instagram' }), IG.map(function (x) { return h('div', { class: 'grid2' }, field('Compte', x, 'handle'), field('Lien', x, 'url')); })));
    });
  }

  function viewMenu(m) {
    withContent(m, 'Carte & prix', function (d) {
      var M = d.menu = d.menu || { categories: [] };
      var photoKeys = Object.keys(d.photos || {});
      m.appendChild(h('section', { class: 'card' }, h('p', { class: 'sm', text: 'Prix en chiffres (ex. 450). Prix vide = « prix à venir » (article visible mais non commandable). Décochez « disponible » pour masquer un article. Les commandes sont recalculées côté serveur avec ces prix.' }),
        field('Note sous la carte', M, 'note', { type: 'textarea' }), field('Monnaie', M, 'currency')));
      (M.categories || []).forEach(function (c, ci) {
        c.items = c.items || [];
        var sec = h('section', { class: 'card' }), list = h('div');
        sec.appendChild(h('h3', { text: c.title || 'Catégorie' })); sec.appendChild(h('div', { class: 'grid2' }, field('Nom de la catégorie', c, 'title'), field('Description', c, 'desc')));
        sec.appendChild(list);
        function draw() {
          list.innerHTML = '';
          c.items.forEach(function (it, i) {
            var ph = h('select', { 'aria-label': 'Photo' }, photoKeys.map(function (k) { return h('option', { value: k, text: (d.photos[k].label || k) }); })); ph.value = it.photo || ''; ph.onchange = function () { it.photo = ph.value; DIRTY = true; };
            list.appendChild(h('div', { class: 'item' }, h('div', { class: 'grid3' }, field('Article', it, 'name'), field('Détail', it, 'desc'), field('Prix (DA)', it, 'price', { ph: 'ex. 450', inputmode: 'numeric' })),
              h('div', { class: 'row' }, field('Disponible', it, 'available', { type: 'checkbox' }), field('Étiquette', it, 'tag', { ph: 'ex. Le classique' }), h('label', { class: 'f' }, h('span', { text: 'Photo' }), ph),
                h('button', { class: 'btn btn-line btn-sm', type: 'button', text: '↑', disabled: i === 0, onclick: function () { c.items.splice(i - 1, 0, c.items.splice(i, 1)[0]); DIRTY = true; draw(); } }),
                h('button', { class: 'btn btn-danger btn-sm', type: 'button', text: 'Supprimer', onclick: function () { if (confirm('Supprimer « ' + it.name + ' » ?')) { c.items.splice(i, 1); DIRTY = true; draw(); } } }))));
          });
          list.appendChild(h('button', { class: 'btn btn-line btn-sm', type: 'button', text: '+ Ajouter un article', onclick: function () { c.items.push({ id: '', name: '', desc: '', price: '', photo: photoKeys[0] || '', available: true }); DIRTY = true; draw(); } }));
        }
        draw(); m.appendChild(sec);
      });
      m.appendChild(h('button', { class: 'btn btn-line btn-sm', type: 'button', text: '+ Ajouter une catégorie', onclick: function () { M.categories.push({ key: 'cat-' + Date.now(), title: 'Nouvelle catégorie', desc: '', items: [] }); save(function () { go('carte'); }); } }));
    });
  }

  function viewBranches(m) {
    withContent(m, 'Boutiques & horaires', function (d) {
      var HR = d.hours = d.hours || {};
      m.appendChild(h('section', { class: 'card' }, h('h3', { text: 'Horaires (texte général)' }), field('Texte affiché', HR, 'text', { ph: 'Horaires à confirmer, appelez-nous.' }), field('Précision', HR, 'note')));
      (d.branches || []).forEach(function (b) {
        m.appendChild(h('section', { class: 'card' }, h('h3', { text: b.name }),
          h('div', { class: 'grid2' }, field('Nom', b, 'name'), field('Ville (bouton de choix)', b, 'city')),
          field('Adresse', b, 'address'),
          h('div', { class: 'grid2' }, field('Téléphone affiché', b, 'phone'), field('Téléphone international (appel + WhatsApp)', b, 'phone_intl', { hint: 'ex. +213559858031' })),
          field('Horaires de cette boutique', b, 'hours', { ph: 'ex. tous les jours 11:00–00:00' }), field('Lien Google Maps', b, 'maps_url'),
          field('Accepte les commandes en ligne', b, 'orders', { type: 'checkbox' })));
      });
    });
  }

  function viewPhotos(m) {
    withContent(m, 'Photos', function (d) {
      d.photos = d.photos || {};
      var ph = h('section', { class: 'card' }, h('p', { class: 'mut', text: 'JPG, PNG ou WebP, 6 Mo max. La nouvelle photo remplace l’originale partout sur le site après « Enregistrer » (la mention « Illustration » disparaît pour vos propres photos).' }));
      Object.keys(d.photos).forEach(function (k) {
        var p = d.photos[k], orig = '../assets/img/' + k + '-800.webp', img = h('img', { class: 'thumb', alt: '', src: p.src || orig });
        var f = h('input', { type: 'file', accept: 'image/jpeg,image/png,image/webp' }); f.style.width = 'auto';
        f.onchange = function () {
          var file = f.files[0]; if (!file) return; if (file.size > 6291456) return toast('Image trop lourde (6 Mo max).', true);
          var ext = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' }[file.type]; if (!ext) return toast('Format non accepté.', true);
          var name = 'up-pipizza_' + k.replace(/[^a-z0-9]/g, '') + '-' + Math.random().toString(36).slice(2, 8).replace(/[^a-z0-9]/g, 'x') + '-' + Date.now() + '.' + ext;
          sb.storage.from(BUCKET).upload(name, file, { contentType: file.type, cacheControl: '31536000', upsert: false }).then(function (r) {
            if (r.error) return toast(r.error.message, true);
            p.src = sb.storage.from(BUCKET).getPublicUrl(name).data.publicUrl; img.src = p.src; DIRTY = true; toast('Photo envoyée — cliquez sur Enregistrer.');
          });
        };
        ph.appendChild(h('div', { class: 'item row' }, img, h('div', { style: 'flex:1;min-width:220px' }, h('b', { text: p.label || k }), h('div', null, f), field('Texte alternatif', p, 'alt'),
          p.src ? h('button', { class: 'btn btn-line btn-sm', type: 'button', text: 'Revenir à la photo d’origine', onclick: function () { p.src = ''; DIRTY = true; img.src = orig; } }) : null)));
      });
      m.appendChild(ph);
    });
  }

  function viewHistory(m) {
    m.appendChild(h('h2', { text: 'Historique' })); m.appendChild(h('p', { class: 'mut', text: 'Les 50 dernières versions du contenu (textes, carte, prix, boutiques, photos). Restaurer remplace le contenu actuel, qui est lui-même archivé.' }));
    sb.from('site_content_history').select('id,saved_at').order('id', { ascending: false }).limit(50).then(function (r) {
      if (r.error) return toast(r.error.message, true);
      if (!r.data.length) m.appendChild(h('p', { class: 'mut', text: 'Aucune version précédente.' }));
      r.data.forEach(function (v) {
        m.appendChild(h('div', { class: 'card row', style: 'justify-content:space-between' }, h('span', { text: 'Version du ' + dt(v.saved_at) }),
          h('button', { class: 'btn btn-line btn-sm', type: 'button', text: 'Restaurer', onclick: function () {
            if (!confirm('Restaurer cette version ?')) return;
            sb.from('site_content_history').select('data').eq('id', v.id).single().then(function (r1) {
              if (r1.error) return toast(r1.error.message, true);
              sb.from('site_content').update({ data: r1.data.data }).eq('id', 1).select('id').single().then(function (r2) { if (r2.error) return toast(r2.error.message, true); toast('Version restaurée.'); go('historique'); });
            });
          } })));
      });
    });
  }

  /* ---------- démarrage ---------- */
  if (!sb) { $('#boot').textContent = 'Configuration Supabase manquante (config.js).'; return; }
  var current;
  sb.auth.onAuthStateChange(function (ev, session) {
    var uid = session && session.user && session.user.id;
    if (uid === current) return; current = uid;
    if (!session) return showLogin();
    setTimeout(function () {
      checkOwner(session).then(function (ok) {
        if (!ok) { sb.auth.signOut(); return showLogin('Ce compte n’est pas autorisé (réservé au gérant).'); }
        shell(session);
      });
    }, 0);
  });
  window.addEventListener('beforeunload', function (e) { if (DIRTY) { e.preventDefault(); e.returnValue = ''; } });
})();
