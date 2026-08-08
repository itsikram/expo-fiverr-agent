/* eslint-disable no-restricted-globals */
/**
 * Service worker for Expo web / PWA push notifications.
 * Receives Web Push while the app is closed or in the background.
 */

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('push', (event) => {
  let payload = {
    title: 'New message',
    body: 'You have a new unread message',
    data: {},
    icon: '/apple-touch-icon.png',
    badge: '/apple-touch-icon.png',
  };

  try {
    if (event.data) {
      const parsed = event.data.json();
      payload = {
        ...payload,
        ...parsed,
        data: parsed?.data || {},
      };
    }
  } catch (_) {
    try {
      const text = event.data?.text?.();
      if (text) payload.body = text;
    } catch (_) {}
  }

  const tag =
    payload.data?.conversationId ||
    payload.data?.username ||
    payload.data?.type ||
    'fiverr-message';

  event.waitUntil(
    self.registration.showNotification(payload.title || 'New message', {
      body: payload.body || 'You have a new unread message',
      icon: payload.icon || '/apple-touch-icon.png',
      badge: payload.badge || '/apple-touch-icon.png',
      tag: String(tag),
      renotify: true,
      data: payload.data || {},
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const data = event.notification.data || {};
  const targetUrl = data.url || '/';

  event.waitUntil(
    (async () => {
      const allClients = await self.clients.matchAll({
        type: 'window',
        includeUncontrolled: true,
      });

      for (const client of allClients) {
        if ('focus' in client) {
          await client.focus();
          if (data.conversationId || data.username) {
            client.postMessage({
              type: 'push_notification_click',
              data,
            });
          }
          return;
        }
      }

      if (self.clients.openWindow) {
        await self.clients.openWindow(targetUrl);
      }
    })()
  );
});
