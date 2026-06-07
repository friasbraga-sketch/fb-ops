// FB Informática · Field Ops — Service Worker
// Versão: incrementar aqui ao fazer deploy de atualização
const CACHE_NAME = 'fb-ops-v1';

// Arquivos a cachear para funcionamento offline
const ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
  // Fontes do Google (cacheadas na primeira visita)
  'https://fonts.googleapis.com/css2?family=Rajdhani:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500&family=IBM+Plex+Sans:wght@300;400;500;600&display=swap'
];

// ── INSTALL: cachear assets estáticos ──
self.addEventListener('install', event => {
  console.log('[SW] Instalando...');
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('[SW] Cacheando arquivos');
        // Cachear um por um para não falhar tudo se um arquivo der erro
        return Promise.allSettled(
          ASSETS.map(url => cache.add(url).catch(e => console.log('[SW] Não cacheou:', url, e.message)))
        );
      })
      .then(() => self.skipWaiting())
  );
});

// ── ACTIVATE: limpar caches antigos ──
self.addEventListener('activate', event => {
  console.log('[SW] Ativando...');
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys.filter(k => k !== CACHE_NAME).map(k => {
          console.log('[SW] Removendo cache antigo:', k);
          return caches.delete(k);
        })
      )
    ).then(() => self.clients.claim())
  );
});

// ── FETCH: estratégia Cache First para assets, Network First para API ──
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // Requisições ao Google Apps Script: sempre network, sem cache
  if (url.hostname === 'script.google.com') {
    event.respondWith(
      fetch(event.request).catch(() =>
        new Response(JSON.stringify({ ok: false, erro: 'Offline' }), {
          headers: { 'Content-Type': 'application/json' }
        })
      )
    );
    return;
  }

  // Fontes do Google: cache first
  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    event.respondWith(
      caches.match(event.request).then(cached => {
        if (cached) return cached;
        return fetch(event.request).then(response => {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
          return response;
        }).catch(() => cached);
      })
    );
    return;
  }

  // App principal: Cache First → fallback Network
  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) {
        // Atualizar cache em background (stale-while-revalidate)
        fetch(event.request).then(response => {
          if (response && response.status === 200) {
            caches.open(CACHE_NAME).then(cache => cache.put(event.request, response));
          }
        }).catch(() => {});
        return cached;
      }
      return fetch(event.request).then(response => {
        if (!response || response.status !== 200) return response;
        const clone = response.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
        return response;
      }).catch(() => {
        // Offline e sem cache: retornar página principal
        return caches.match('./index.html');
      });
    })
  );
});

// ── MENSAGENS: forçar atualização quando solicitado ──
self.addEventListener('message', event => {
  if (event.data === 'skipWaiting') self.skipWaiting();
});
