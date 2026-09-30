"use client";

import { useCallback, useEffect, useRef } from "react";
import AmbientBackground from "./AmbientBackground";
import EmotionCanvas, {
  type EmotionCanvasHandle,
} from "./EmotionCanvas";
import DissolvingInput from "./DissolvingInput";
import { startAmbient } from "@/lib/ambientAudio";

export default function ZeroSpace() {
  const emotionRef = useRef<EmotionCanvasHandle>(null);

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

  return (
    <main className="relative h-full w-full">
      {/* 深渊：呼吸光晕 + 缓慢浮尘 */}
      <AmbientBackground />

      {/* 情绪黑洞：碎裂 → 汇聚 → 共鸣 */}
      <EmotionCanvas ref={emotionRef} />

      {/* 唯一可见入口 */}
      <DissolvingInput onSubmit={handleSubmit} />
    </main>
  );
}
