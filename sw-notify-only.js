/**
 * dev / Vercel preview 渠道专用「通知通路 Service Worker」
 *
 * 背景：
 *  - 这些渠道为了规避「Workbox precache 引用失效 chunk → 主屏幕 PWA 打开后白屏」的历史问题，
 *    通过 src/pwaPreviewCleanup.js + src/pwa.js 把所有 Service Worker 全部卸载。
 *  - 但 Android Chrome 在 PWA standalone 模式下硬编码禁用 `new Notification(...)`
 *    （会抛 Illegal constructor），唯一通路是 `ServiceWorkerRegistration.showNotification()`。
 *  - 因此 dev / preview 渠道里：没 SW = Android PWA 永远收不到通知。
 *
 * 本文件的策略：
 *  - 仍然给页面注册一个 SW，让 `getRegistration()` 拿得到东西；
 *  - 但本 SW **不监听 fetch 事件、不做任何缓存**，所以浏览器对所有静态资源都走原生网络，
 *    完全不会触发当年那个「过期 precache → 白屏」的链路；
 *  - 只处理 notificationclick + push 这两类通知相关事件。
 *
 * 与正式 main 部署的 Workbox `sw.js` 互不冲突：两者文件名/scope 不同，注册时按 scriptURL 区分。
 */

const SW_VERSION = 'notify-only-v1';

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(self.clients.claim());
});

// 用户点击系统通知 → 把已有 tab 拉到前台；没 tab 就新开一个
self.addEventListener('notificationclick', event => {
  try { event.notification.close(); } catch (_) {}
  const fallback = '/';
  let targetUrl = fallback;
  try {
    targetUrl = (event.notification && event.notification.data && event.notification.data.url) || fallback;
  } catch (_) {}
  event.waitUntil((async () => {
    try {
      const list = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      for (const c of list) {
        try {
          if (c && typeof c.focus === 'function') {
            await c.focus();
            try {
              if (typeof c.navigate === 'function' && targetUrl && c.url !== targetUrl) {
                await c.navigate(targetUrl);
              }
            } catch (_) {
              // navigate 可能因 same-origin 检查失败，focus 成功就算成功
            }
            return;
          }
        } catch (_) {
          // 尝试下一个 client
        }
      }
      if (typeof self.clients.openWindow === 'function') {
        await self.clients.openWindow(targetUrl);
      }
    } catch (_) {
      // ignore
    }
  })());
});

// Web Push 兜底（项目目前用本地 registration.showNotification，不一定走 push；
// 留下兜底是为了避免 push 真到了之后浏览器自己弹一个空白默认通知）
self.addEventListener('push', event => {
  let title = '新消息';
  let body = '';
  let data = {};
  try {
    if (event.data) {
      try {
        const payload = event.data.json();
        if (payload && typeof payload === 'object') {
          title = payload.title || title;
          body = payload.body || '';
          data = payload.data || {};
        }
      } catch (_) {
        try { body = event.data.text() || ''; } catch (_) {}
      }
    }
  } catch (_) {}
  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon: '/ovo.png',
      badge: '/ovo.png',
      tag: data.tag || 'chat-msg',
      renotify: true,
      data,
    }),
  );
});
