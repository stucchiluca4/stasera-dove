/* Stasera Dove? · service worker — network-first, cache fallback (offline).
   Network-first garantisce che gli aggiornamenti arrivino sempre quando c'è rete;
   offline serve l'ultima versione salvata in cache. */
const CACHE = 'staseradove-v16';
const ASSETS = [
  './', './index.html', './manifest.webmanifest',
  './icon-192.png', './icon-512.png', './apple-touch-icon.png',
  // V8: foto d'ambiente per tipologia — le copertine vivono anche offline
  './img/fb-pizzeria.jpg', './img/fb-ristorante.jpg', './img/fb-carne.jpg',
  './img/fb-griglieria.jpg', './img/fb-pesce.jpg', './img/fb-brunch.jpg',
  './img/fb-burger.jpg', './img/fb-galletto.jpg', './img/fb-cinese.jpg',
  './img/fb-giapponese.jpg'
];

self.addEventListener('install', function(e){
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE).then(function(c){ return c.addAll(ASSETS).catch(function(){}); }));
});

self.addEventListener('activate', function(e){
  e.waitUntil(
    caches.keys().then(function(keys){
      return Promise.all(keys.filter(function(k){ return k !== CACHE; }).map(function(k){ return caches.delete(k); }));
    }).then(function(){ return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function(e){
  var req = e.request;
  if(req.method !== 'GET') return;
  var url = new URL(req.url);
  if(url.origin !== location.origin) return; // non toccare API esterne / Maps
  e.respondWith(
    fetch(req).then(function(res){
      var copy = res.clone();
      caches.open(CACHE).then(function(c){ c.put(req, copy); }).catch(function(){});
      return res;
    }).catch(function(){
      return caches.match(req).then(function(r){ return r || caches.match('./index.html'); });
    })
  );
});

/* ---------- Notifiche push ---------- */
self.addEventListener('push', function(e){
  var data = {};
  try{ data = e.data ? e.data.json() : {}; }catch(err){}
  var title = data.title || 'Stasera Dove?';
  var opts = {
    body: data.body || 'Novità nel gruppo',
    icon: 'icon-192.png',
    badge: 'icon-192.png',
    data: { url: './' }
  };
  e.waitUntil(self.registration.showNotification(title, opts));
});
self.addEventListener('notificationclick', function(e){
  e.notification.close();
  e.waitUntil(
    clients.matchAll({type:'window', includeUncontrolled:true}).then(function(list){
      for(var i=0;i<list.length;i++){ if('focus' in list[i]) return list[i].focus(); }
      return clients.openWindow('./');
    })
  );
});
