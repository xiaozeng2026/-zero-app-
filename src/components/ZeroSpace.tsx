"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import AmbientBackground from "./AmbientBackground";
import LongPressLayer from "./LongPressLayer";
import SilentSwitch from "./SilentSwitch";
import DissolvingInput from "./DissolvingInput";
import { startAmbient, setAmbientLevel } from "@/lib/ambientAudio";
import { pickWhisper } from "@/lib/whispers";

/** 承接短语 */
interface Whisper {
  id: number;
  text: string;
  born: number;
}

const WHISPER_DURATION = 6000; // 短语显示时长：6 秒

export default function ZeroSpace() {
  const [lightsOut, setLightsOut] = useState(false);
  const [pressDepth, setPressDepth] = useState(0);
  const [whispers, setWhispers] = useState<Whisper[]>([]);
  const idRef = useRef(0);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 6 秒后自动移除最旧短句
  useEffect(() => {
    if (whispers.length === 0) return;
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    const oldest = whispers[0];
    const remain = WHISPER_DURATION - (Date.now() - oldest.born);
    if (remain <= 0) {
      setWhispers((w) => w.slice(1));
      return;
    }
    timeoutRef.current = setTimeout(() => {
      setWhispers((w) => w.filter((x) => x.id !== oldest.id));
    }, remain);
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, [whispers]);

  const pushWhisper = useCallback((text: string) => {
    setWhispers((prev) => [
      ...prev.slice(-1), // 最多保留 2 条
      { id: ++idRef.current, text, born: Date.now() },
    ]);
  }, []);

  const handleLongPressRelease = useCallback(() => {
    pushWhisper(pickWhisper("longPress"));
  }, [pushWhisper]);

  // 浏览器自动播放策略：第一次有效交互时才启动底噪
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

  // 监听熄灯状态：联动底噪音量 + 熄灯承接短语
  useEffect(() => {
    if (lightsOut) {
      setAmbientLevel(0.012);
      pushWhisper(pickWhisper("lightsOut"));
    } else {
      setAmbientLevel(0.06);
    }
  }, [lightsOut, pushWhisper]);

  const handleToggleLight = useCallback(() => {
    setLightsOut((v) => !v);
  }, []);

  // 纯前端本地抽取，无网络请求
  const handleSubmit = useCallback(
    (text: string) => {
      pushWhisper(pickWhisper("input", text));
    },
    [pushWhisper]
  );

  return (
    <main className="relative h-full w-full">
      {/* 背景：光晕 + 浮尘 + 压暗层 */}
      <AmbientBackground pressDepth={pressDepth} lightsOut={lightsOut} />

      {/* 长按交互层 */}
      <LongPressLayer
        disabled={false}
        onDepthChange={setPressDepth}
        onRelease={handleLongPressRelease}
      />

      {/* 中央烛光开关 */}
      <SilentSwitch lightsOut={lightsOut} onToggle={handleToggleLight} />

      {/* 承接短句浮现 */}
      <div className="pointer-events-none fixed inset-x-0 bottom-20 z-20 flex flex-col items-center gap-2 px-6">
        <AnimatePresence mode="popLayout">
          {whispers.map((w) => (
            <motion.div
              key={w.id}
              layout
              initial={{ opacity: 0, y: 12, filter: "blur(4px)" }}
              animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
              exit={{ opacity: 0, y: -8, filter: "blur(6px)" }}
              transition={{ duration: 1.6, ease: [0.22, 1, 0.36, 1] }}
              className="text-center text-[15px] leading-7 tracking-[0.08em] text-[rgba(147,164,189,0.65)]"
              style={{
                fontFamily:
                  '"Songti SC", "Noto Serif CJK SC", "Noto Serif SC", serif',
              }}
            >
              {w.text}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      {/* 底部输入 */}
      <DissolvingInput disabled={false} onSubmit={handleSubmit} />
    </main>
  );
}
