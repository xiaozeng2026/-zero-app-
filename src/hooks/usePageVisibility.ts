"use client";

/**
 * usePageVisibility —— 标签页可见性（环保休眠机制的信号源）
 *
 * 返回 document.hidden：切走标签页 / 退后台 / 锁屏时为 true。
 * 用 useSyncExternalStore 订阅 visibilitychange，无轮询。
 * SSR 快照为 false（服务端视为可见）。
 */

import { useSyncExternalStore } from "react";

function subscribe(onChange: () => void): () => void {
  document.addEventListener("visibilitychange", onChange);
  return () => document.removeEventListener("visibilitychange", onChange);
}

export function usePageVisibility(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => document.hidden,
    () => false
  );
}
