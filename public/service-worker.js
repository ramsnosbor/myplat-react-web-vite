/* eslint-disable no-restricted-globals */

// Service Worker para Push Notifications
// Este arquivo permite receber notificações mesmo com o navegador fechado

const CACHE_NAME = 'myplat-v1';

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

// Receber mensagem da aplicação para aplicar atualização
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

// Receber Push Notifications do servidor
self.addEventListener('push', (event) => {

  console.log('[Service Worker] Push recebido:', event.data ? event.data.text() : '(sem payload)');

  let notification = {
    title: 'MyPlat',
    body: 'Nova notificação',
    icon: '/logo192.png',
    badge: '/logo192.png',
    vibrate: [200, 100, 200],
    requireInteraction: false,
    data: {},
  };

  if (event.data) {
    // O payload pode vir como JSON (notificações tipadas) ou como texto puro
    // (testes simples do backend). Tentamos JSON; se falhar, usamos como corpo.
    let data = null;
    try {
      data = event.data.json();
    } catch {
      notification.body = event.data.text();
    }

    if (data) {
      switch (data.type) {
        case 'nfe_approved':
          notification.title = 'NF-e Aprovada! ✅';
          notification.body = `NF-e ${data.numero} foi aprovada pela SEFAZ`;
          notification.icon = '/assets/icons/success.png';
          notification.data = { url: `/nfe/${data.id}`, type: 'nfe_approved' };
          notification.requireInteraction = false;
          break;

        case 'nfe_rejected':
          notification.title = 'NF-e Rejeitada ❌';
          notification.body = `NF-e ${data.numero} foi rejeitada: ${data.motivo}`;
          notification.icon = '/assets/icons/error.png';
          notification.data = { url: `/nfe/${data.id}`, type: 'nfe_rejected' };
          notification.requireInteraction = true;
          break;

        case 'nfe_cancelled':
          notification.title = 'NF-e Cancelada 🚫';
          notification.body = `NF-e ${data.numero} foi cancelada`;
          notification.icon = '/assets/icons/warning.png';
          notification.data = { url: `/nfe/${data.id}`, type: 'nfe_cancelled' };
          break;

        case 'new_order':
          notification.title = 'Novo Pedido! 🛒';
          notification.body = `Pedido #${data.numero} foi recebido`;
          notification.icon = '/assets/icons/order.png';
          notification.data = { url: `/pedidos/${data.id}`, type: 'new_order' };
          break;

        case 'new_message':
          notification.title = `Nova Mensagem de ${data.sender}`;
          notification.body = data.message;
          notification.icon = '/assets/icons/message.png';
          notification.data = { url: `/mensagens/${data.id}`, type: 'new_message' };
          break;

        case 'reminder':
          notification.title = `⏰ Lembrete: ${data.title}`;
          notification.body = data.message;
          notification.icon = '/assets/icons/reminder.png';
          notification.data = { url: data.url, type: 'reminder' };
          notification.requireInteraction = true;
          break;

        default:
          notification.title = data.title || 'MyPlat';
          notification.body = data.body || 'Nova notificação';
          notification.icon = data.icon || '/logo192.png';
          notification.data = data.data || {};
      }
    }
  }

  console.log('[Service Worker] Exibindo notificação:', notification.title, notification.body);

  event.waitUntil(
    self.registration.showNotification(notification.title, notification)
      .then(() => {
        console.log('[Service Worker] showNotification OK');
        return self.clients.matchAll({ type: 'window', includeUncontrolled: true })
          .then((clients) => {
            clients.forEach(client => {
              client.postMessage({
                type: 'NEW_NOTIFICATION',
                notification: {
                  id: notification.data?.id || Date.now(),
                  title: notification.title,
                  message: notification.body,
                  type: notification.data?.type || 'info',
                  read: false,
                  timestamp: new Date().toISOString(),
                  data: notification.data,
                }
              });
            });
          });
      })
      .catch((err) => {
        console.error('[Service Worker] showNotification FALHOU:', err);
      })
  );
});

// Clique na notificação
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const urlToOpen = event.notification.data?.url
    ? new URL(event.notification.data.url, self.location.origin).href
    : self.location.origin;

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then((clientList) => {
        for (let client of clientList) {
          if (client.url === urlToOpen && 'focus' in client) {
            return client.focus();
          }
        }
        if (self.clients.openWindow) {
          return self.clients.openWindow(urlToOpen);
        }
      })
  );
});

self.addEventListener('notificationclose', (event) => {
  console.log('[Service Worker] Notificação fechada:', event.notification.data);
});

// Interceptar requisições — ignora chamadas de API, passa o resto direto
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  if (
    url.pathname.startsWith('/api') ||
    url.pathname.startsWith('/pfs') ||
    url.hostname.includes('api.') ||
    event.request.url.includes('api')
  ) {
    return;
  }

  event.respondWith(fetch(event.request));
});
