const CACHE = 'kid-v2';
const ASSETS = ['./', 'index.html', 'style.css', 'app.js', 'manifest.webmanifest', 'icon.svg', 'icon-192.png', 'icon-512.png'];

self.addEventListener('install', (e) => { e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting())); });
self.addEventListener('activate', (e) => { e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k.startsWith('kid-') && k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())); });

// 앱 파일: 네트워크 우선, 실패 시 캐시 (오프라인에서도 열림)
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (url.origin !== location.origin || e.request.method !== 'GET') return;
  e.respondWith(fetch(e.request).then((r) => { const copy = r.clone(); caches.open(CACHE).then((c) => c.put(e.request, copy)); return r; }).catch(() => caches.match(e.request)));
});

// 백그라운드 주기 확인(설치형 PWA, 크롬 계열): 데이터 파일이 바뀌면 알림
self.addEventListener('periodicsync', (e) => {
  if (e.tag !== 'kid-refresh') return;
  e.waitUntil((async () => {
    const r = await fetch('data.enc.json', { cache: 'no-store' });
    const txt = await r.text();
    const c = await caches.open(CACHE);
    const prev = await c.match('__last');
    const prevTxt = prev ? await prev.text() : '';
    await c.put('__last', new Response(txt));
    if (prevTxt && prevTxt !== txt) {
      await self.registration.showNotification('오늘 학교: 새 소식이 도착했어요', { body: '학교 알림장이 갱신됐어요. 눌러서 확인하세요.', icon: 'icon-192.png', tag: 'oc-new' });
    }
  })());
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  e.waitUntil(self.clients.matchAll({ type: 'window' }).then((cs) => (cs[0] ? cs[0].focus() : self.clients.openWindow('./'))));
});
