"use client";

import { useCallback, useRef, useState } from "react";
import { motion } from "framer-motion";

/**
 * 向上飘散、模糊、放大并消融的字符
 * 整个生命周期由 Framer Motion 驱动（无 rAF，省电且丝滑）
 */
interface Bubble {
  id: number;
  char: string;
  x: number;
  y: number;
  drift: number; // 水平随风偏移
  rise: number; // 上升距离
  delay: number; // 逐字错峰
  duration: number; // 2.4 ~ 3 秒
  scale: number;
}

export default function DissolvingInput({
  disabled,
  onSubmit,
}: {
  disabled: boolean;
  onSubmit: (text: string) => void;
}) {
  const [value, setValue] = useState("");
  const [bubbles, setBubbles] = useState<Bubble[]>([]);
  const idRef = useRef(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const removeBubble = useCallback((id: number) => {
    setBubbles((prev) => prev.filter((b) => b.id !== id));
  }, []);

  const spawnBubbles = useCallback((text: string, rect: DOMRect) => {
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top - 10;
    const created: Bubble[] = [];

    for (let i = 0; i < text.length; i++) {
      const fan =
        (i / Math.max(1, text.length - 1) - 0.5) * Math.PI * 0.7;
      created.push({
        id: ++idRef.current,
        char: text[i],
        x: centerX + Math.sin(fan) * (10 + Math.random() * 22) + (Math.random() - 0.5) * 10,
        y: centerY + Math.cos(fan) * 8 - Math.random() * 8,
        drift: Math.sin(fan) * 26 + (Math.random() - 0.5) * 22,
        rise: -50 - Math.random() * 42, // 向上 50 ~ 92px
        delay: Math.min(i * 0.045, 1.1) + Math.random() * 0.16,
        duration: 2.4 + Math.random() * 0.6,
        scale: 0.75 + Math.random() * 0.5,
      });
    }
    // 同屏最多保留 60 个字符，避免长文本堆积
    setBubbles((prev) => [...prev.slice(-60 + created.length), ...created]);
  }, []);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key !== "Enter" || disabled || !value.trim()) return;
      e.preventDefault();
      const el = inputRef.current;
      const v = value.trim();
      if (el) spawnBubbles(v, el.getBoundingClientRect());
      setValue("");
      onSubmit(v);
    },
    [value, disabled, onSubmit, spawnBubbles]
  );

  return (
    <>
      {/* 化烟飘散的字符层 */}
      <div className="pointer-events-none fixed inset-0 z-30 overflow-hidden">
        {bubbles.map((b) => (
          <motion.span
            key={b.id}
            className="absolute text-[rgba(147,164,189,0.6)]"
            style={{
              left: b.x,
              top: b.y,
              fontSize: "15px",
              // 独立 CSS translate 居中，不与 framer 驱动的 transform 冲突
              translate: "-50% -50%",
              textShadow: "0 0 8px rgba(147,164,189,0.14)",
              fontFamily:
                '"Songti SC", "Noto Serif CJK SC", "Noto Serif SC", serif',
            }}
            initial={{
              opacity: 0.72,
              x: 0,
              y: 0,
              scale: b.scale,
              filter: "blur(0px)",
            }}
            animate={{
              opacity: 0,
              x: b.drift,
              y: b.rise,
              scale: 1.05,
              filter: "blur(10px)",
            }}
            transition={{
              duration: b.duration,
              delay: b.delay,
              ease: [0.22, 1, 0.36, 1],
            }}
            onAnimationComplete={() => removeBubble(b.id)}
          >
            {b.char}
          </motion.span>
        ))}
      </div>

      {/* 底部输入框 */}
      <div className="fixed bottom-8 left-0 right-0 z-30 flex justify-center">
        <input
          ref={inputRef}
          data-no-press
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={disabled}
          placeholder="这里什么都不留下"
          className="zero-input w-72 text-center text-sm tracking-widest"
          autoComplete="off"
          autoCapitalize="off"
          spellCheck={false}
          enterKeyHint="send"
        />
      </div>
    </>
  );
}
