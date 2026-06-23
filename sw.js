// ==========================================
// SERVICE WORKER - Detalles y Sorpresas STORE
// Estrategia: Cache-first para assets estáticos,
//             Network-first para Firebase y API calls
// ==========================================

const CACHE_VERSION = 'dys-v1';
const CACHE_STATIC = `${CACHE_VERSION}-static`;
const CACHE_DYNAMIC = `${CACHE_VERSION}-dynamic`;

// Assets que se cachean en la instalación (App Shell)
const STATIC_ASSETS = [
    './',
    './index.html',
    './main.js',
    './firebase-config.js',
    './manifest.json',
    './logo.png',
];

// URLs que NUNCA se cachean (siempre van a la red)
const NETWORK_ONLY = [
    'firestore.googleapis.com',
    'identitytoolkit.googleapis.com',
    'securetoken.googleapis.com',
    'api.imgbb.com',
    'wa.me',
];

// ==========================================
// INSTALL: Cachear el App Shell
// ==========================================
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_STATIC).then((cache) => {
            return cache.addAll(STATIC_ASSETS);
        }).then(() => self.skipWaiting())
    );
});

// ==========================================
// ACTIVATE: Limpiar caches viejos
// ==========================================
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((keys) => {
            return Promise.all(
                keys
                    .filter(key => key.startsWith('dys-') && key !== CACHE_STATIC && key !== CACHE_DYNAMIC)
                    .map(key => caches.delete(key))
            );
        }).then(() => self.clients.claim())
    );
});

// ==========================================
// FETCH: Estrategia híbrida
// ==========================================
self.addEventListener('fetch', (event) => {
    const { request } = event;
    const url = new URL(request.url);

    // Ignorar extensiones de Chrome y requests no GET
    if (request.method !== 'GET' || url.protocol === 'chrome-extension:') return;

    // Network-only para Firebase, ImgBB y APIs externas
    const isNetworkOnly = NETWORK_ONLY.some(domain => url.hostname.includes(domain));
    if (isNetworkOnly) {
        event.respondWith(fetch(request));
        return;
    }

    // Cache-first para assets estáticos del propio dominio
    if (url.origin === self.location.origin) {
        event.respondWith(
            caches.match(request).then((cached) => {
                if (cached) return cached;

                return fetch(request).then((response) => {
                    // Solo cachear respuestas válidas
                    if (!response || response.status !== 200 || response.type === 'opaque') {
                        return response;
                    }
                    const responseClone = response.clone();
                    caches.open(CACHE_DYNAMIC).then((cache) => {
                        cache.put(request, responseClone);
                    });
                    return response;
                }).catch(() => {
                    // Offline fallback: si es una navegación, devolver index.html
                    if (request.destination === 'document') {
                        return caches.match('./index.html');
                    }
                });
            })
        );
        return;
    }

    // Network-first para CDNs externos (Tailwind, Phosphor Icons, Fonts)
    event.respondWith(
        fetch(request).then((response) => {
            if (!response || response.status !== 200 || response.type === 'opaque') {
                return response;
            }
            const responseClone = response.clone();
            caches.open(CACHE_DYNAMIC).then((cache) => {
                cache.put(request, responseClone);
            });
            return response;
        }).catch(() => caches.match(request))
    );
});

// ==========================================
// PUSH: Notificaciones para el admin
// (Activar cuando se integre Firebase Cloud Messaging)
// ==========================================
self.addEventListener('push', (event) => {
    if (!event.data) return;
    try {
        const data = event.data.json();
        const options = {
            body: data.body || 'Tienes una nueva notificación',
            icon: './logo.png',
            badge: './logo.png',
            vibrate: [200, 100, 200],
            data: { url: data.url || './' },
            actions: [
                { action: 'ver', title: 'Ver pedido' },
                { action: 'cerrar', title: 'Cerrar' }
            ]
        };
        event.waitUntil(
            self.registration.showNotification(
                data.title || 'Detalles y Sorpresas STORE',
                options
            )
        );
    } catch (e) {
        console.error('Error en push notification:', e);
    }
});

self.addEventListener('notificationclick', (event) => {
    event.notification.close();
    if (event.action === 'cerrar') return;
    const url = event.notification.data?.url || './';
    event.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
            for (const client of windowClients) {
                if (client.url.includes(self.location.origin) && 'focus' in client) {
                    return client.focus();
                }
            }
            if (clients.openWindow) return clients.openWindow(url);
        })
    );
});
