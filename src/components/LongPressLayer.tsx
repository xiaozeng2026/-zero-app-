"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";

interface Ripple {
  id: number;
  x: number;
  y: number;
}

const LONG_PRESS_MS = 420; // 触发长按的判定时间
const RIPPLE_INTERVAL = 620; // 水波纹生成间隔
const MAX_DEPTH_TIME = 2600; // 按压多久达到最深

/**
 * 长按沉降层：
 * - 覆盖全屏，捕获 pointer 长按（mouse / touch 统一走 pointer events）
 * - 按压中持续扩散柔和水波纹，回调 pressDepth 让背景渐暗
 * - 松手：震动 + 触发一句承接短语
 */
export default function LongPressLayer({
  onDepthChange,
  onRelease,
  disabled,
}: {
  onDepthChange: (depth: number) => void;
  onRelease: () => void;
  disabled: boolean;
}) {
  const [ripples, setRipples] = useState<Ripple[]>([]);
  const rippleId = useRef(0);
  const pressStart = useRef<number | null>(null);
  const pressPoint = useRef({ x: 0, y: 0 });
  const depthRaf = useRef(0);
  const rippleTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const didLongPress = useRef(false);

  const stopPress = useCallback(
    (completed: boolean) => {
      if (pressStart.current === null) return;
      pressStart.current = null;
      cancelAnimationFrame(depthRaf.current);
      if (rippleTimer.current) {
        clearInterval(rippleTimer.current);
        rippleTimer.current = null;
      }
      // 深度缓缓回落
      let depth = 0;
      const from = performance.now();
      const startDepth = currentDepth.current;
      const easeOut = () => {
        const p = Math.min(1, (performance.now() - from) / 900);
        depth = startDepth * (1 - p);
        onDepthChange(depth);
        if (p < 1) requestAnimationFrame(easeOut);
      };
      requestAnimationFrame(easeOut);

      if (completed && didLongPress.current) {
        if (typeof navigator !== "undefined" && "vibrate" in navigator) {
          navigator.vibrate(18);
        }
        onRelease();
      }
      didLongPress.current = false;
    },
    [onDepthChange, onRelease]
  );

  const currentDepth = useRef(0);

  const startPress = useCallback(
    (x: number, y: number) => {
      if (disabled) return;
      pressStart.current = performance.now();
      pressPoint.current = { x, y };
      didLongPress.current = false;

      const growDepth = () => {
        if (pressStart.current === null) return;
        const held = performance.now() - pressStart.current;
        if (held >= LONG_PRESS_MS) didLongPress.current = true;
        const depth = Math.min(
          1,
          Math.max(0, (held - LONG_PRESS_MS) / MAX_DEPTH_TIME)
        );
        currentDepth.current = depth;
        onDepthChange(depth);
        depthRaf.current = requestAnimationFrame(growDepth);
      };
      depthRaf.current = requestAnimationFrame(growDepth);

      rippleTimer.current = setInterval(() => {
        if (pressStart.current === null) return;
        const held = performance.now() - pressStart.current;
        if (held < LONG_PRESS_MS) return;
        const id = ++rippleId.current;
        const jitter = 12;
        setRipples((rs) => [
          ...rs.slice(-5),
          {
            id,
            x: pressPoint.current.x + (Math.random() - 0.5) * jitter,
            y: pressPoint.current.y + (Math.random() - 0.5) * jitter,
          },
        ]);
      }, RIPPLE_INTERVAL);
    },
    [disabled, onDepthChange]
  );

  // 全局 pointer 监听，避开文字/输入区域（由事件目标判断）
  useEffect(() => {
    const isInteractive = (el: EventTarget | null) =>
      el instanceof HTMLElement &&
      !!el.closest("input, textarea, button, [data-no-press]");

    const down = (e: PointerEvent) => {
      if (isInteractive(e.target)) return;
      if (e.pointerType === "mouse" && e.button !== 0) return;
      startPress(e.clientX, e.clientY);
    };
    const up = () => stopPress(true);
    const cancel = () => stopPress(false);
    const move = (e: PointerEvent) => {
      // 移动过远视为取消按压
      if (pressStart.current === null) return;
      const dx = e.clientX - pressPoint.current.x;
      const dy = e.clientY - pressPoint.current.y;
      if (Math.hypot(dx, dy) > 28) stopPress(false);
    };

    window.addEventListener("pointerdown", down);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", cancel);
    window.addEventListener("pointermove", move);
    window.addEventListener("blur", cancel);
    return () => {
      window.removeEventListener("pointerdown", down);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", cancel);
      window.removeEventListener("pointermove", move);
      window.removeEventListener("blur", cancel);
    };
  }, [startPress, stopPress]);

  // 阻止长按弹出系统菜单 / 文本选择
  useEffect(() => {
    const prevent = (e: Event) => e.preventDefault();
    document.addEventListener("contextmenu", prevent);
    return () => document.removeEventListener("contextmenu", prevent);
  }, []);

  return (
    <div className="pointer-events-none fixed inset-0 z-10 overflow-hidden">
      <AnimatePresence>
        {ripples.map((r) => (
          <motion.span
            key={r.id}
            className="absolute rounded-full border"
            style={{
              left: r.x,
              top: r.y,
              width: 12,
              height: 12,
              x: "-50%",
              y: "-50%",
              borderColor: "rgba(147, 164, 189, 0.22)",
              boxShadow: "0 0 24px rgba(147, 164, 189, 0.08) inset",
            }}
            initial={{ scale: 0.4, opacity: 0.85 }}
            animate={{ scale: 16, opacity: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 3.4, ease: [0.16, 0.6, 0.3, 1] }}
            onAnimationComplete={() =>
              setRipples((rs) => rs.filter((x) => x.id !== r.id))
            }
          />
        ))}
      </AnimatePresence>
    </div>
  );
}
