// Service worker do Corre em Dia: guarda o app no celular para abrir sem internet.
// Ao mudar o app, aumente a VERSAO para os celulares baixarem a nova.
const VERSAO = "corre-v2";
const ARQUIVOS = ["./", "index.html", "manifest.json", "icons/icon-192.png", "icons/icon-512.png", "icons/maskable-512.png"];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(VERSAO).then(c => c.addAll(ARQUIVOS)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== VERSAO).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});

// Mostra o que está guardado na hora e atualiza por trás quando houver internet.
self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  const fonte = url.host === "fonts.googleapis.com" || url.host === "fonts.gstatic.com";
  if (url.origin !== location.origin && !fonte) return;
  e.respondWith(caches.open(VERSAO).then(async cache => {
    const guardado = await cache.match(req, {ignoreSearch: url.origin === location.origin});
    const rede = fetch(req).then(r => { if (r && (r.ok || r.type === "opaque")) cache.put(req, r.clone()); return r; }).catch(() => guardado);
    return guardado || rede;
  }));
});
