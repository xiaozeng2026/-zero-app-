"use client";

import { useEffect } from "react";

/**
 * 注册离线 Service Worker。
 * 静态导出部署在子路径 /-zero-app-/ 下：
 * 页面 URL 末尾带斜杠，"./sw.js" 即解析到该子路径根，scope 自动匹配。
 */
export default function ServiceWorkerRegister() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    const onLoad = () => {
      navigator.serviceWorker
        .register(new URL("./sw.js", window.location.href))
        .catch(() => {
          /* 注册失败（如非安全上下文）静默忽略，不影响任何功能 */
        });
    };
    // 延迟到 load 后，避免抢占首屏资源
    if (document.readyState === "complete") onLoad();
    else window.addEventListener("load", onLoad, { once: true });
    return () => window.removeEventListener("load", onLoad);
  }, []);

  return null;
}
