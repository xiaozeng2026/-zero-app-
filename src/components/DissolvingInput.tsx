"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { AnimatePresence, motion } from "framer-motion";

/** 向上飘散并消融的字符气泡 */
interface Bubble {
  id: number;
  char: string;
  x: number;
  y: number;
  drift: number;
  scale: number;
  opacity: number;
  born: number;
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
  const animRef = useRef<number>(0);
  const bubblesRef = useRef<Bubble[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  // 将 bubbles 状态同步到 ref，避免在 raf 中闭包陷阱
  useEffect(() => {
    bubblesRef.current = bubbles;
  }, [bubbles]);

  const tick = useCallback(() => {
    const now = performance.now();
    if (bubblesRef.current.length === 0) {
      animRef.current = requestAnimationFrame(tick);
      return;
    }
    const alive: Bubble[] = [];
    for (const b of bubblesRef.current) {
      // 缓升 + 随风漂移 + 渐隐
      const age = (now - b.born) / 1000;
      if (age > 3.5) continue;
      alive.push({
        ...b,
        y: b.y - 0.35 * (1 + age * 0.5),
        x: b.x + Math.sin(now * 0.0012 + b.drift) * 0.25,
        scale: b.scale * (1 - age * 0.12),
        opacity: Math.max(0, b.opacity * (1 - age * 0.35)),
      });
    }
    setBubbles(alive);
    animRef.current = requestAnimationFrame(tick);
  }, []);

  useEffect(() => {
    animRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(animRef.current);
  }, [tick]);

  const spawnBubbles = useCallback(
    (text: string, rect: DOMRect) => {
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top - 10;
      const now = performance.now();
      const created: Bubble[] = [];

      for (let i = 0; i < text.length; i++) {
        const angle = ((i / Math.max(1, text.length)) * Math.PI * 0.8) - Math.PI * 0.4;
        const radius = 12 + Math.random() * 28;
        created.push({
          id: ++idRef.current,
          char: text[i],
          x: centerX + Math.sin(angle) * radius + (Math.random() - 0.5) * 18,
          y: centerY + Math.cos(angle) * 6 - Math.random() * 8,
          drift: Math.random() * Math.PI * 2,
          scale: 0.7 + Math.random() * 0.7,
          opacity: 0.6 + Math.random() * 0.3,
          born: now,
        });
      }
      setBubbles((prev) => [...prev.slice(-40), ...created]);
    },
    []
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key !== "Enter" || disabled || !value.trim()) return;
      e.preventDefault();
      const el = inputRef.current;
      if (el) spawnBubbles(value, el.getBoundingClientRect());
      const v = value.trim();
      setValue("");
      onSubmit(v);
    },
    [value, disabled, onSubmit, spawnBubbles]
  );

  return (
    <>
      {/* 飘散的字符气泡 */}
      <div className="pointer-events-none fixed inset-0 z-30 overflow-hidden">
        <AnimatePresence>
          {bubbles.map((b) => (
            <motion.span
              key={b.id}
              className="absolute text-[rgba(147,164,189,0.55)]"
              style={{
                left: b.x,
                top: b.y,
                fontSize: `${14 * b.scale}px`,
                transform: `translate(-50%, -50%) scale(${b.scale})`,
                opacity: b.opacity,
                textShadow: "0 0 6px rgba(147,164,189,0.12)",
                fontFamily:
                  '"Songti SC", "Noto Serif CJK SC", "Noto Serif SC", serif',
              }}
              initial={{ opacity: 0.8 }}
              exit={{ opacity: 0, y: -20, transition: { duration: 0.5 } }}
            >
              {b.char}
            </motion.span>
          ))}
        </AnimatePresence>
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
