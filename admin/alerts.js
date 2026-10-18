/* Pi Pizza & Burger — alertes « nouvelle commande ».
   Supabase Realtime (INSERT sur pipizza.orders) + relève de secours toutes les 30 s.
   Son WebAudio, bannière rouge, pastille sur l'onglet Commandes, titre de l'onglet, notification du navigateur.
   Dépend de window.BK_SB (créé par admin.js). */
(function () {
  'use strict';
  var sb = window.BK_SB; if (!sb) return;
  var BASE_TITLE = document.title, unread = 0, maxId = null, seen = {}, chan = null, pollT = null, ac = null, running = false;
  function el(tag, cls, txt) { var e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; }
  function money(n) { return String(n || 0).replace(/\B(?=(\d{3})+(?!\d))/g, '\u202f') + ' DA'; }
  function audio() { try { ac = ac || new (window.AudioContext || window.webkitAudioContext)(); if (ac.state === 'suspended') ac.resume(); } catch (e) {} return ac; }
  function beep() {
    var a = audio(); if (!a) return;
    [0, 0.18, 0.36, 0.7, 0.88, 1.06].forEach(function (t, i) {
      var o = a.createOscillator(), g = a.createGain(), s = a.currentTime + t;
      o.type = 'triangle'; o.frequency.value = [880, 1175, 1568][i % 3];
      g.gain.setValueAtTime(0.0001, s); g.gain.exponentialRampToValueAtTime(0.4, s + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, s + 0.16);
      o.connect(g).connect(a.destination); o.start(s); o.stop(s + 0.18);
    });
  }
  document.addEventListener('pointerdown', audio, { once: true });
  function badge() {
    var b = document.querySelector('.side button[data-tab="orders"]');
    if (b) {
      b.style.position = 'relative'; var x = b.querySelector('.al-badge');
      if (!unread) { if (x) x.remove(); } else { if (!x) { x = el('span', 'al-badge'); b.appendChild(x); } x.textContent = unread > 99 ? '99+' : String(unread); x.setAttribute('aria-label', unread + ' non lue(s)'); }
    }
    document.title = unread ? '(' + unread + ') 🔔 Nouvelle commande — ' + BASE_TITLE : BASE_TITLE;
  }
  function clearCurrent() { if (unread && (location.hash || '#orders') === '#orders' && document.visibilityState === 'visible' && document.hasFocus()) { unread = 0; badge(); } }
  window.addEventListener('hashchange', clearCurrent); document.addEventListener('visibilitychange', clearCurrent); window.addEventListener('focus', clearCurrent);
  document.addEventListener('click', function (e) { var b = e.target.closest && e.target.closest('.side button[data-tab="orders"]'); if (b) setTimeout(function () { unread = 0; badge(); }, 0); });
  function open() { var t = document.querySelector('.side button[data-tab="orders"]'); if (t) t.click(); }
  function desc(o) { return (o.name || 'Client') + ' — ' + (o.branch_name || o.branch || '') + ' · ' + (o.mode === 'livraison' ? 'livraison' : 'à emporter') + ' · ' + money(o.total); }
  function banner(o) {
    var box = document.getElementById('al-stack');
    if (!box) { box = el('div', 'al-stack'); box.id = 'al-stack'; box.setAttribute('role', 'alert'); document.body.appendChild(box); }
    var b = el('div', 'al-banner');
    b.appendChild(el('b', null, '🔔 Nouvelle commande n° ' + o.id)); b.appendChild(el('span', null, desc(o)));
    var v = el('button', 'btn btn-solid btn-sm', 'Voir'); v.type = 'button'; v.onclick = function () { open(); b.remove(); };
    var x = el('button', 'al-x', '✕'); x.type = 'button'; x.setAttribute('aria-label', 'Fermer'); x.onclick = function () { b.remove(); };
    b.appendChild(v); b.appendChild(x); box.appendChild(b);
    setTimeout(function () { b.remove(); }, 90000);
  }
  function notify(o) {
    if (!('Notification' in window) || Notification.permission !== 'granted') return;
    try { var n = new Notification('Pi Pizza & Burger — nouvelle commande n° ' + o.id, { body: desc(o), tag: 'pipizza-' + o.id, icon: '../icon-192.png', requireInteraction: true }); n.onclick = function () { window.focus(); open(); n.close(); }; } catch (e) {}
  }
  function permButton() {
    var top = document.querySelector('header.top'); if (!top || top.querySelector('.al-perm')) return;
    var need = ('Notification' in window) && Notification.permission === 'default';
    var b = el('button', 'btn btn-line btn-sm al-perm', '🔔'); b.type = 'button';
    b.appendChild(el('span', 'al-lbl', need ? ' Activer les alertes' : ' Tester le son')); b.setAttribute('aria-label', need ? 'Activer les alertes' : 'Tester le son');
    b.onclick = function () { audio(); beep(); if (need) Notification.requestPermission().then(function () { b.remove(); }); else b.remove(); };
    top.insertBefore(b, top.querySelector('#status'));
  }
  function handle(o) {
    if (!o || seen[o.id]) return; seen[o.id] = 1;
    if (maxId != null && o.id <= maxId && !o._rt) return;
    if (o.id > (maxId || 0)) maxId = o.id;
    unread++; badge(); clearCurrent(); beep(); banner(o); notify(o);
    if ((location.hash || '#orders') === '#orders') { var r = document.querySelector('.crm-bar .btn-line'); if (r && /Actualiser/.test(r.textContent)) r.click(); }
    document.dispatchEvent(new CustomEvent('bk:new-order', { detail: o }));
  }
  function poll() {
    if (maxId == null) return;
    sb.from('orders').select('id,name,branch,branch_name,mode,total').gt('id', maxId).order('id').limit(20).then(function (r) { if (!r.error) (r.data || []).forEach(handle); });
  }
  function start() {
    if (running) return; running = true;
    sb.from('orders').select('id').order('id', { ascending: false }).limit(1).then(function (r) {
      if (r.error) { running = false; return; }
      maxId = r.data && r.data[0] ? r.data[0].id : 0;
      chan = sb.channel('pipizza-orders')
        .on('postgres_changes', { event: 'INSERT', schema: 'pipizza', table: 'orders' }, function (p) { var o = p.new; o._rt = 1; handle(o); })
        .subscribe(function (st) { document.documentElement.setAttribute('data-realtime', st); });
      pollT = setInterval(poll, 30000);
      var t = setInterval(function () { if (document.querySelector('header.top')) { permButton(); badge(); clearInterval(t); } }, 300);
    });
  }
  function stop() { running = false; if (chan) sb.removeChannel(chan); chan = null; clearInterval(pollT); }
  sb.auth.onAuthStateChange(function (ev, session) {
    if (session && session.access_token && sb.realtime && sb.realtime.setAuth) sb.realtime.setAuth(session.access_token);
    if (session) setTimeout(start, 0); else stop();
  });
  window.BK_ALERTS = { test: function () { handle({ id: (maxId || 0) + 1000 + Math.floor(Math.random() * 1000), name: 'Test', branch_name: 'Pi Pizza & Burger', mode: 'emporter', total: 900 }); } };
})();
