/* Probal Track — service worker · cachea la app para abrir y usar SIN conexión.
   Los datos (visitas/rutas) los maneja Firestore con su propia persistencia offline:
   se guardan en el teléfono y se suben solos al reconectar. Este SW solo guarda la
   "cáscara" de la app (HTML + scripts + ícono) para que abra sin internet. */
var CACHE = "probaltrack-v1";
var PRECACHE = [
  "./", "./index.html", "./manifest.json", "./icon.svg?v=2",
  "https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js",
  "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth-compat.js",
  "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore-compat.js",
  "https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js"
];

self.addEventListener("install", function(e){
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE).then(function(c){
    return Promise.all(PRECACHE.map(function(u){ return c.add(u).catch(function(){}); }));
  }));
});

self.addEventListener("activate", function(e){
  e.waitUntil(caches.keys().then(function(keys){
    return Promise.all(keys.map(function(k){ return k===CACHE ? null : caches.delete(k); }));
  }).then(function(){ return self.clients.claim(); }));
});

self.addEventListener("fetch", function(e){
  var req = e.request;
  if(req.method !== "GET") return;                 // escrituras (Firestore) van por su canal
  var url;
  try{ url = new URL(req.url); }catch(_){ return; }
  // Firebase / Google APIs: SIEMPRE a la red (Firebase maneja su propio offline/sync)
  if(/googleapis\.com|firebaseio\.com|firebaseinstallations|firebaselogging|google-analytics|gstatic\.com\/firebase_|\/__\//.test(url.hostname + url.pathname)) return;

  // Documento HTML (abrir la app): red primero (para traer la versión nueva); si no hay red, uso el cache
  if(req.mode === "navigate" || (req.headers.get("accept")||"").indexOf("text/html") !== -1){
    e.respondWith(
      fetch(req).then(function(resp){
        try{ var copy = resp.clone(); caches.open(CACHE).then(function(c){ c.put("./index.html", copy); }); }catch(_){}
        return resp;
      }).catch(function(){
        return caches.match(req).then(function(r){ return r || caches.match("./index.html").then(function(r2){ return r2 || caches.match("./"); }); });
      })
    );
    return;
  }

  // Resto (scripts del CDN, ícono, manifest, etc.): cache primero, y actualizo en segundo plano
  e.respondWith(
    caches.match(req).then(function(cached){
      var net = fetch(req).then(function(resp){
        if(resp && (resp.ok || resp.type === "opaque")){ try{ var copy = resp.clone(); caches.open(CACHE).then(function(c){ c.put(req, copy); }); }catch(_){} }
        return resp;
      }).catch(function(){ return cached; });
      return cached || net;
    })
  );
});
