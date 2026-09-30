"use client";

/**
 * 「归零 (Zero)」— 温暖明亮版情绪承接页
 *
 * 视觉：纯黑底 + 深海蓝 / 暗紫红星云 8s 交替呼吸
 * 闭环：打字 → confetti 星尘爆裂 → 琥珀恒星落入星穹(localStorage) → 光影字条回响
 * 音律：Tone.js 深空 Drone + 水滴混响 + C2 叹息 + 恒星五声音阶
 *
 * 全部逻辑集中在本文件；旧版组件仍保留在 src/components 中（未被引用）。
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import confetti from "canvas-confetti";
import * as Tone from "tone";
import StarfieldBackground from "@/components/StarfieldBackground";

/* ------------------------------------------------------------------ */
/* 常量与类型                                                          */
/* ------------------------------------------------------------------ */

const STORAGE_KEY = "zero:stars:warm:v1";
const STARS_LIMIT = 120;

const PHRASES = [
  "迷茫...",
  "没关系的...",
  "晚安...",
  "撑住...",
  "也是一个人...",
];

/** 五声音阶（水滴音走高把位，悬停音走中把位） */
const PENTA_HIGH = ["C5", "D5", "E5", "G5", "A5"] as const;
const PENTA_MID = ["C4", "D4", "E4", "G4", "A4"] as const;

const STAR_COLORS = ["#FBBF24", "#F59E0B", "#FDE68A", "#FB923C"];
const CONFETTI_COLORS = ["#F59E0B", "#FBBF24", "#FDE68A", "#FB923C", "#FFF7ED"];

interface Star {
  id: string;
  /** 相对视口的百分比坐标（y 只落上半屏） */
  x: number;
  y: number;
  size: number;
  color: string;
  twinkle: number; // 闪烁周期（秒），存盘以保持稳定
  timestamp: number;
}

interface Whisper {
  id: number;
  text: string;
}

/* ------------------------------------------------------------------ */
/* localStorage：仅在客户端读写                                        */
/* ------------------------------------------------------------------ */

function loadStars(): Star[] {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as Star[];
    return Array.isArray(parsed) ? parsed.slice(-STARS_LIMIT) : [];
  } catch {
    return [];
  }
}

/* ------------------------------------------------------------------ */
/* 主组件                                                              */
/* ------------------------------------------------------------------ */

export default function Home() {
  const [stars, setStars] = useState<Star[]>([]);
  const [value, setValue] = useState("");
  const [whisper, setWhisper] = useState<Whisper | null>(null);
  const [hydrated, setHydrated] = useState(false);

  const inputRef = useRef<HTMLInputElement>(null);
  const whisperTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastPhrase = useRef<string>("");
  const lastHoverNoteAt = useRef(0);
  /** 同一合成器的触发时间必须严格递增，快速连打时让出 1ms */
  const nextNoteTime = useRef(0);

  /* ---- Tone.js 句柄（首次手势后懒初始化） ---- */
  const audio = useRef<{
    reverb: Tone.Reverb;
    drop: Tone.Synth;
    bass: Tone.Synth;
    bell: Tone.Synth;
    droneGain: Tone.Gain;
  } | null>(null);
  const audioReady = useRef<Promise<void> | null>(null);

  /* ---- 启动：只在客户端恢复星穹（避免 SSR 注水不一致） ---- */
  useEffect(() => {
    setStars(loadStars());
    setHydrated(true);
  }, []);

  /* ---- 音频引擎初始化（幂等） ---- */
  const ensureAudio = useCallback(() => {
    if (audioReady.current) return audioReady.current;

    audioReady.current = (async () => {
      await Tone.start();

      const reverb = new Tone.Reverb({ decay: 9, wet: 0.55 });
      await reverb.generate();
      reverb.toDestination();

      // 极低音量低频 Drone：两支微失谐正弦 + 低通，模拟太空嗡鸣
      const droneGain = new Tone.Gain(0).toDestination();
      droneGain.gain.rampTo(0.045, 6); // 6 秒缓慢浮现
      const droneFilter = new Tone.Filter(150, "lowpass");
      droneFilter.connect(droneGain);
      [55, 55.4, 110.2].forEach((freq, i) => {
        const osc = new Tone.Oscillator(freq, "sine").start();
        const oscGain = new Tone.Gain(i === 2 ? 0.25 : 1);
        osc.connect(oscGain);
        oscGain.connect(droneFilter);
      });
      // 截止频率缓慢起伏，让 Drone 有"呼吸"
      new Tone.LFO({ frequency: 0.08, min: 90, max: 220 })
        .start()
        .connect(droneFilter.frequency);

      // 水滴 / 木琴：三角波 + 短包络，经混响
      const drop = new Tone.Synth({
        oscillator: { type: "triangle" },
        envelope: { attack: 0.002, decay: 0.35, sustain: 0, release: 0.6 },
        volume: -22,
      }).connect(reverb);

      // 回车叹息：C2 正弦 Sub-bass
      const bass = new Tone.Synth({
        oscillator: { type: "sine" },
        envelope: { attack: 0.03, decay: 1.2, sustain: 0.25, release: 3.5 },
        volume: -10,
      }).toDestination();
      bass.connect(reverb);

      // 恒星悬停：空灵五声音阶
      const bell = new Tone.Synth({
        oscillator: { type: "sine" },
        envelope: { attack: 0.01, decay: 1.4, sustain: 0, release: 2.6 },
        volume: -15,
      }).connect(reverb);

      audio.current = { reverb, drop, bass, bell, droneGain };
    })();

    return audioReady.current;
  }, []);

  /* ---- 首次点击 / 按键即解锁音频 ---- */
  useEffect(() => {
    const unlock = () => {
      ensureAudio().catch(() => {});
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
    };
    window.addEventListener("pointerdown", unlock);
    window.addEventListener("keydown", unlock);
    return () => {
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
    };
  }, [ensureAudio]);

  useEffect(
    () => () => {
      if (whisperTimer.current) clearTimeout(whisperTimer.current);
    },
    []
  );

  /* ---- 持久化星穹 ---- */
  const persistStars = useCallback((next: Star[]) => {
    setStars(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      /* 存储已满或被禁用：忽略，不影响体验 */
    }
  }, []);

  /* ---- 在输入框位置放一束温暖星尘 ---- */
  const burstStardust = useCallback(() => {
    const el = inputRef.current;
    const rect = el?.getBoundingClientRect();
    const origin = rect
      ? {
          x: (rect.left + rect.width / 2) / window.innerWidth,
          y: rect.top / window.innerHeight,
        }
      : { x: 0.5, y: 0.75 };

    const base: confetti.Options = {
      colors: CONFETTI_COLORS,
      shapes: ["circle"],
      scalar: 0.9,
      gravity: 0.55, // 低重力：星尘缓慢上浮飘散
      decay: 0.94,
      ticks: 220,
      disableForReducedMotion: true,
      zIndex: 60,
    };

    confetti({
      ...base,
      particleCount: 70,
      spread: 78,
      startVelocity: 32,
      origin,
    });
    // 少量向上的"逃逸星尘"
    confetti({
      ...base,
      particleCount: 26,
      spread: 42,
      startVelocity: 46,
      angle: 270,
      scalar: 0.7,
      origin,
    });
  }, []);

  /* ---- 取一个严格递增的音频时间戳（防同毫秒连触发报错） ---- */
  const claimTime = useCallback(() => {
    const t = Math.max(Tone.now(), nextNoteTime.current + 0.001);
    nextNoteTime.current = t;
    return t;
  }, []);

  /* ---- 恒星悬停：放大发亮 + 五声音阶 ---- */
  const touchStar = useCallback(() => {
    const now = Tone.now();
    if (now - lastHoverNoteAt.current < 0.12) return; // 防止快速划过多音堆叠
    lastHoverNoteAt.current = now;
    const note = PENTA_MID[Math.floor(Math.random() * PENTA_MID.length)];
    audio.current?.bell.triggerAttackRelease(note, "2n", claimTime());
  }, [claimTime]);

  /* ---- 提交情绪 ---- */
  const submitEmotion = useCallback(() => {
    const text = value.trim();
    if (!text) return;
    setValue("");

    // 1) 星尘爆裂 + C2 叹息
    burstStardust();
    const engine = audio.current;
    if (engine) {
      engine.bass.triggerAttackRelease("C2", "2n", claimTime());
    }

    // 2) 一颗明亮恒星落入上半屏星穹
    const star: Star = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      x: 8 + Math.random() * 84,
      y: 6 + Math.random() * 34,
      size: 12 + Math.random() * 14,
      color: STAR_COLORS[Math.floor(Math.random() * STAR_COLORS.length)],
      twinkle: 3 + Math.random() * 3,
      timestamp: Date.now(),
    };
    persistStars([...stars, star].slice(-STARS_LIMIT));

    // 3) 1 秒后，深空飘来一句光影字条（不连续重复）
    if (whisperTimer.current) clearTimeout(whisperTimer.current);
    whisperTimer.current = setTimeout(() => {
      let text = PHRASES[Math.floor(Math.random() * PHRASES.length)];
      if (PHRASES.length > 1) {
        while (text === lastPhrase.current) {
          text = PHRASES[Math.floor(Math.random() * PHRASES.length)];
        }
      }
      lastPhrase.current = text;
      setWhisper({ id: Date.now(), text });
    }, 1000);
  }, [value, stars, burstStardust, persistStars, claimTime]);

  /* ---- 打字反馈：仅在"新增字符"时响水滴 ---- */
  const handleChange = (next: string) => {
    setValue(next);
    if (next.length > value.length) {
      ensureAudio().then(() => {
        const note = PENTA_HIGH[Math.floor(Math.random() * PENTA_HIGH.length)];
        audio.current?.drop.triggerAttackRelease(note, "16n", claimTime());
      });
    }
  };

  /* ---------------------------------------------------------------- */

  return (
    <main className="fixed inset-0 overflow-hidden bg-black font-sans">
      <StarfieldBackground />

      {/* 星穹：历史恒星（中层） */}
      {hydrated && (
        <div className="pointer-events-none fixed inset-0 z-10">
          <AnimatePresence>
            {stars.map((s) => (
              <motion.div
                key={s.id}
                className="absolute"
                style={{ left: `${s.x}%`, top: `${s.y}%` }}
                initial={{ scale: 0, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ type: "spring", stiffness: 160, damping: 14 }}
              >
                {/* 可交互命中区（放大，方便悬停/触摸） */}
                <motion.button
                  type="button"
                  aria-label="一颗恒星"
                  className="pointer-events-auto block cursor-pointer rounded-full border-0 bg-transparent p-0"
                  style={{ width: s.size + 18, height: s.size + 18, x: "-50%", y: "-50%" }}
                  whileHover={{ scale: 2 }}
                  whileTap={{ scale: 1.7 }}
                  onMouseEnter={touchStar}
                  onTouchStart={touchStar}
                >
                  {/* 内层高亮核心 + 低频闪烁 */}
                  <motion.span
                    className="absolute left-1/2 top-1/2 block rounded-full"
                    style={{
                      width: s.size,
                      height: s.size,
                      marginLeft: -s.size / 2,
                      marginTop: -s.size / 2,
                      background: `radial-gradient(circle, #FFFBEB 0%, ${s.color} 42%, rgba(245,158,11,0.55) 68%, transparent 78%)`,
                      boxShadow: `0 0 6px rgba(251,191,36,0.9), 0 0 22px rgba(245,158,11,0.55), 0 0 52px rgba(245,158,11,0.28)`,
                    }}
                    animate={{ opacity: [0.78, 1, 0.78] }}
                    transition={{
                      duration: s.twinkle,
                      ease: "easeInOut",
                      repeat: Infinity,
                    }}
                  />
                </motion.button>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}

      {/* 宇宙回响：光影字条（顶层偏上） */}
      <AnimatePresence>
        {whisper && (
          <motion.p
            key={whisper.id}
            className="pointer-events-none fixed left-1/2 z-20 -translate-x-1/2 whitespace-nowrap text-center text-[15px] tracking-[0.35em] text-amber-50/70 sm:text-base"
            style={{ top: "30%", textShadow: "0 0 24px rgba(251,191,36,0.35)" }}
            initial={{ opacity: 0, filter: "blur(10px)", y: 6 }}
            animate={{
              opacity: [0, 1, 1, 0],
              filter: ["blur(10px)", "blur(2px)", "blur(2px)", "blur(14px)"],
              y: 0,
            }}
            transition={{
              duration: 7.4,
              times: [0, 0.32, 0.72, 1],
              ease: "easeInOut",
            }}
            onAnimationComplete={() => setWhisper(null)}
          >
            {whisper.text}
          </motion.p>
        )}
      </AnimatePresence>

      {/* 唯一的 UI：底部居中无边框输入框 */}
      <div className="fixed inset-x-0 bottom-[13vh] z-30 flex justify-center px-8">
        <input
          ref={inputRef}
          value={value}
          maxLength={80}
          autoComplete="off"
          spellCheck={false}
          onChange={(e) => handleChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              submitEmotion();
            }
          }}
          placeholder="把情绪留在这里..."
          className="w-full max-w-[520px] border-none bg-transparent text-center text-[17px] font-light tracking-[0.2em] text-amber-50/60 caret-amber-300/70 outline-none placeholder:text-neutral-500/70"
          style={{ textShadow: "0 0 18px rgba(251,191,36,0.18)" }}
        />
      </div>
    </main>
  );
}
