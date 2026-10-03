"use client";

/**
 * useKeyboardInset —— 软键盘遮挡高度（px）
 *
 * 订阅 visualViewport 的 resize/scroll（iOS Safari 与 WKWebView 弹键盘时触发），
 * 返回底部 Dock 需要抬升的高度；无 visualViewport 的环境恒返回 0。
 * 用 state 驱动（每次聚焦/收键盘只变化一次，非高频，不需要 rAF）。
 */

import { useEffect, useState } from "react";
import { keyboardInset } from "@/lib/viewport";

export function useKeyboardInset(): number {
  // 水合安全：SSG/首帧恒 0，挂载后才访问 visualViewport
  const [inset, setInset] = useState(0);

  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;

    const update = () => {
      setInset(keyboardInset(window.innerHeight, vv.height, vv.offsetTop));
    };
    update();
    vv.addEventListener("resize", update);
    vv.addEventListener("scroll", update);
    // iOS 部分版本键盘切换不触发 vv 事件，orientationchange 兜底
    window.addEventListener("orientationchange", update);
    return () => {
      vv.removeEventListener("resize", update);
      vv.removeEventListener("scroll", update);
      window.removeEventListener("orientationchange", update);
    };
  }, []);

  return inset;
}
