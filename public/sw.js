self.addEventListener('push', (event) => {
  let payload = { title: 'New update', body: '' };
  try {
    payload = { ...payload, ...event.data.json() };
  } catch {
    // Payload missing or not JSON — fall back to the generic title above rather than
    // throwing (a malformed push must never crash the worker).
  }
  event.waitUntil(
    self.registration.showNotification(payload.title, {
      body: payload.body,
      icon: '/icons/icon-1024.png',
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientsArr) => {
      const existing = clientsArr.find((c) => 'focus' in c);
      if (existing) return existing.focus();
      return self.clients.openWindow('/');
    })
  );
});
