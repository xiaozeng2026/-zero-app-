/* 归零 Zero — 离线缓存 Service Worker
 * 部署在 GitHub Pages 子路径下，scope 由注册位置天然限定。
 * 导航请求：网络优先，离线回退缓存外壳（回退前校验壳引用的 hash chunk
 *           是否齐备，避免返回引用已删除 chunk 的旧壳造成白屏）；
 * 静态资源（带 hash 的 JS/CSS/字体/图标）：缓存优先 + 后台更新。
 */
const CACHE = "zero-shell-v2";
const SCOPE = self.registration.scope; // 末尾带 /，如 https://user.github.io/-zero-app-/
const SHELL = new URL("./", SCOPE).href;
const MANIFEST = new URL("./manifest.webmanifest", SCOPE).href;

/** 纯黑应急页：离线且缓存壳不完整时使用（无控件无文案，符合应用气质） */
const OFFLINE_FALLBACK =
  '<!doctype html><meta charset="utf-8">' +
  '<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,viewport-fit=cover">' +
  "<title>归零</title><style>html,body{margin:0;height:100%;background:#000}</style>";

/** 校验缓存壳引用的所有 _next/static 资源是否仍在缓存中（新旧版本错配防护） */
async function shellUsable(html) {
  const refs = [
    ...html.matchAll(/(?:src|href)="([^"]*\/_next\/static\/[^"]+)"/g),
  ].map((m) => m[1]);
  for (const ref of refs) {
    const hit = await caches.match(new URL(ref, SCOPE), { ignoreSearch: true });
    if (!hit) return false;
  }
  return true;
}

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
        .catch(async () => {
          const cached = await caches.match(SHELL);
          if (cached) {
            const html = await cached.clone().text();
            if (await shellUsable(html)) return cached;
          }
          return new Response(OFFLINE_FALLBACK, {
            status: 503,
            headers: { "Content-Type": "text/html; charset=utf-8" },
          });
        })
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
