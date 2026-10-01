/* 归零 Zero — 离线缓存 Service Worker
 * 部署在 GitHub Pages 子路径下，scope 由注册位置天然限定。
 * 导航请求：网络优先，离线回退缓存外壳；
 * 静态资源（带 hash 的 JS/CSS/字体/图标）：缓存优先 + 后台更新。
 */
const CACHE = "zero-shell-v1";
const SCOPE = self.registration.scope; // 末尾带 /，如 https://user.github.io/-zero-app-/
const SHELL = new URL("./", SCOPE).href;
const MANIFEST = new URL("./manifest.webmanifest", SCOPE).href;

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      // 清单是静态导出必有的文件；外壳失败也无妨（运行时会补齐）
      .then((cache) => cache.addAll([MANIFEST]).catch(() => {}))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // 页面导航：网络优先，成功时刷新外壳缓存
  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((cache) => cache.put(SHELL, copy));
          return res;
        })
        .catch(() => caches.match(SHELL))
    );
    return;
  }

  // 其余同源静态资源：Stale-While-Revalidate
  event.respondWith(
    caches.match(req).then((cached) => {
      const network = fetch(req)
        .then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(CACHE).then((cache) => cache.put(req, copy));
          }
          return res;
        })
        .catch(() => cached);
      return cached || network;
    })
  );
});
