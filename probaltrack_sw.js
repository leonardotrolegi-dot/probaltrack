/* Probal Track — service worker · cachea SOLO la app (para abrir sin conexión).
   Regla de oro: NO tocar nada de Firebase/Firestore/Auth (eso va siempre directo a
   la red; Firebase maneja su propio offline y sube los cambios solo al reconectar).
   Este SW solo intercepta el HTML del propio sitio y archivos estáticos conocidos. */
var CACHE = "probaltrack-v2";
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
    return Promise.all(keys.map(function(k){ return k===CACHE ? null : caches.delete(k); })); // borra caches viejos (incl. v1)
  }).then(function(){ return self.clients.claim(); }));
});

self.addEventListener("fetch", function(e){
  var req = e.request;
  if(req.method !== "GET") return;                       // nada de POST/PUT (escrituras de Firestore)
  var url; try{ url = new URL(req.url); }catch(_){ return; }
  var sameOrigin = (url.origin === self.location.origin);

  // Solo cacheamos: (a) el HTML del propio sitio, (b) archivos estáticos conocidos.
  // SCRIPTS del CDN que usamos (Firebase SDK de gstatic y XLSX de cdnjs). TODO lo demás pasa directo.
  var isAppScript = /^https:\/\/(www\.gstatic\.com\/firebasejs\/|cdnjs\.cloudflare\.com\/ajax\/libs\/xlsx\/)/.test(req.url);

  // 1) Abrir la app (navegación / HTML del sitio): red primero, cache de respaldo si no hay señal.
  if(sameOrigin && (req.mode === "navigate" || (req.headers.get("accept")||"").indexOf("text/html") !== -1)){
    e.respondWith(
      fetch(req).then(function(resp){
        try{ var c = resp.clone(); caches.open(CACHE).then(function(ca){ ca.put("./index.html", c); }); }catch(_){}
        return resp;
      }).catch(function(){
        return caches.match(req).then(function(r){ return r || caches.match("./index.html").then(function(r2){ return r2 || caches.match("./"); }); });
      })
    );
    return;
  }

  // 2) Estáticos del propio sitio (icon, manifest…) o los scripts del CDN: cache primero.
  if(sameOrigin || isAppScript){
    e.respondWith(
      caches.match(req).then(function(cached){
        return cached || fetch(req).then(function(resp){
          if(resp && (resp.ok || resp.type === "opaque")){ try{ var c = resp.clone(); caches.open(CACHE).then(function(ca){ ca.put(req, c); }); }catch(_){} }
          return resp;
        }).catch(function(){ return cached; });
      })
    );
    return;
  }

  // 3) TODO lo demás (Firestore, Auth, Google APIs, etc.): NO intervenir → red directa.
  return;
});
