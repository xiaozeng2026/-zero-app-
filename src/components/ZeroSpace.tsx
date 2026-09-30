"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { motion, useAnimationControls } from "framer-motion";
import AmbientBackground from "./AmbientBackground";
import EmotionCanvas, {
  type EmotionCanvasHandle,
} from "./EmotionCanvas";
import DissolvingInput from "./DissolvingInput";
import { dimAmbient, startAmbient } from "@/lib/ambientAudio";

const T1 = 400; // ms — 短按→中按 阈值
const T2 = 1500; // ms — 中按→长按 阈值

export default function ZeroSpace() {
  const emotionRef = useRef<EmotionCanvasHandle>(null);
  const haloControls = useAnimationControls();
  const [lightsOut, setLightsOut] = useState(false);

  const handleSubmit = useCallback(
    (text: string, origin: { x: number; y: number }) => {
      emotionRef.current?.dissolve(text, origin);
    },
    []
  );

  // 浏览器自动播放策略：第一次有效交互时启动雨声
  useEffect(() => {
    const boot = () => {
      startAmbient();
      window.removeEventListener("pointerdown", boot);
      window.removeEventListener("keydown", boot);
    };
    window.addEventListener("pointerdown", boot);
    window.addEventListener("keydown", boot);
    return () => {
      window.removeEventListener("pointerdown", boot);
      window.removeEventListener("keydown", boot);
    };
  }, []);

  // 长按时长分层：短按=共鸣 / 中按=碎裂 / 长按=熄灯
  useEffect(() => {
    let pressStart = 0;
    let t1Timer = 0;
    let t2Timer = 0;
    let pressed = false;

    // 阈值瞬间：让 transient halo 闪一下，给用户段落感（松手即回 0）
    const flash = (level: 1 | 2) => {
      haloControls.start({
        opacity: [0, level === 1 ? 0.22 : 0.38, 0],
        scale: [0.86, level === 1 ? 1.04 : 1.10, 1],
        transition: { duration: 0.5, ease: [0.16, 1, 0.3, 1] },
      });
    };

    const onDown = (e: PointerEvent) => {
      // 输入框区域交给输入框自身（获取焦点 / 选词），不参与长按派发
      const target = e.target as HTMLElement | null;
      if (target?.closest?.("input")) return;
      pressStart = performance.now();
      pressed = true;
      t1Timer = window.setTimeout(() => flash(1), T1);
      t2Timer = window.setTimeout(() => flash(2), T2);
    };

    const onUp = (e: PointerEvent) => {
      if (!pressed) return;
      pressed = false;
      window.clearTimeout(t1Timer);
      window.clearTimeout(t2Timer);
      const dur = performance.now() - pressStart;
      const x = e.clientX;
      const y = e.clientY;
      if (dur < T1) {
        // 短按 → 召唤共鸣（涟漪或流星）
        emotionRef.current?.echo(x, y);
      } else if (dur < T2) {
        // 中按 → 默认文字「…」走爆裂 → 星体流程
        emotionRef.current?.dissolve("…", { x, y });
      } else {
        // 长按 → 切换熄灯
        setLightsOut((v) => {
          const next = !v;
          dimAmbient(next);
          return next;
        });
      }
    };

    const onCancel = () => {
      pressed = false;
      window.clearTimeout(t1Timer);
      window.clearTimeout(t2Timer);
    };

    window.addEventListener("pointerdown", onDown);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onCancel);
    return () => {
      window.removeEventListener("pointerdown", onDown);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onCancel);
      window.clearTimeout(t1Timer);
      window.clearTimeout(t2Timer);
    };
  }, [haloControls]);

  return (
    <main className="relative h-full w-full">
      {/* 深渊：呼吸光晕 + 缓慢浮尘 */}
      <AmbientBackground />

      {/* 情绪黑洞：碎裂 → 汇聚 → 共鸣 */}
      <EmotionCanvas ref={emotionRef} />

      {/* 阈值瞬间 halo 脉冲：平时 opacity:0 不可见，松手即回 */}
      <motion.div
        className="pointer-events-none fixed left-1/2 top-1/2 z-20 h-[50vw] w-[50vw] -translate-x-1/2 -translate-y-1/2 rounded-full"
        style={{
          background:
            "radial-gradient(circle, rgba(120, 150, 220, 0.5) 0%, rgba(60, 80, 140, 0.18) 40%, transparent 70%)",
          filter: "blur(70px)",
        }}
        initial={{ opacity: 0 }}
        animate={haloControls}
      />

      {/* 熄灯层 */}
      <motion.div
        className="pointer-events-none fixed inset-0 z-20 bg-black"
        animate={{ opacity: lightsOut ? 0.92 : 0 }}
        transition={{ duration: 1.6, ease: [0.16, 1, 0.3, 1] }}
      />

      {/* 唯一可见入口 */}
      <DissolvingInput onSubmit={handleSubmit} />
    </main>
  );
}
