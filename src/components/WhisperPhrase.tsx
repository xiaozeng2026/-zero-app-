"use client";

import { useEffect } from "react";
import { AnimatePresence, motion } from "framer-motion";

export interface Whisper {
  id: number;
  text: string;
}

const PHRASE_MS = 7500;

/**
 * 片语共鸣 · 深海字条
 * blur(8px) 看不清 → 2.5s 缓慢清晰到 blur(3px) → 停留 3s →
 * 再次模糊到 blur(12px) 并淡出。总时长 7.5s。
 * 层级最顶（z-30），但永不拦截手势。
 */
export default function WhisperPhrase({
  whisper,
  onDone,
}: {
  whisper: Whisper | null;
  onDone: () => void;
}) {
  // 用计时器精确控制生命周期，避免多属性动画完成回调提前触发
  useEffect(() => {
    if (!whisper) return;
    const t = window.setTimeout(onDone, PHRASE_MS);
    return () => window.clearTimeout(t);
  }, [whisper, onDone]);

  return (
    <div className="pointer-events-none fixed inset-0 z-30 flex items-center justify-center">
      <AnimatePresence>
        {whisper && (
          <motion.p
            key={whisper.id}
            className="select-none px-8 text-center text-xl tracking-[0.3em]"
            style={{
              color: "rgba(198, 210, 245, 0.92)",
              textShadow:
                "0 0 14px rgba(150,180,255,0.65), 0 0 42px rgba(120,100,230,0.45), 0 0 90px rgba(90,140,255,0.28)",
            }}
            initial={{ opacity: 0, filter: "blur(8px)", y: 6 }}
            animate={{
              opacity: [0, 0.68, 0.68, 0],
              filter: [
                "blur(8px)",
                "blur(3px)",
                "blur(3px)",
                "blur(12px)",
              ],
              y: [6, 0, 0, -4],
            }}
            transition={{
              duration: 7.5,
              times: [0, 0.33, 0.73, 1],
              ease: "easeInOut",
            }}
          >
            {whisper.text}
          </motion.p>
        )}
      </AnimatePresence>
    </div>
  );
}

