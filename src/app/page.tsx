"use client";

/**
 * 「归零 (Zero)」— 宇宙深海 (Cosmic Ocean) 版情绪承接页
 *
 * 视觉：#020111 深空底座 + 呼吸星云 + 150 颗失重星野（@tsparticles/react v4）
 * 涟漪：点击星空 → Framer Motion 暗紫/青能量波纹 scale 0→4，2.5s
 * 闭环：打字水滴 → 文字 blur 上浮溶解 → 暖金超新星光环 + confetti 星尘
 *       → 琥珀恒星落入星穹(localStorage) → 光影字条回响；陌生人流星/涟漪共鸣
 * 音律：Tone.js 深空 Drone + 13s 大混响颂钵 + C2 叹息 + 恒星五声音阶
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

/* ---- 时空涟漪（Framer Motion DOM 能量波纹） ---- */

type RippleTone = "violet" | "cyan" | "gold";

interface RippleFx {
  id: number;
  x: number;
  y: number;
  tone: RippleTone;
  /** 超新星：更大更亮、带暖金 */
  supernova: boolean;
  /** 陌生人自动涟漪：起始透明度更低 */
  dim: boolean;
}

/** 回车时正在溶解的文字 */
interface DissolveText {
  id: number;
  text: string;
  x: number;
  y: number;
}

interface Meteor {
  x: number;
  y: number;
  vx: number;
  vy: number;
  start: number;
  life: number;
  gold: boolean;
  trail: { x: number; y: number }[];
}

/** 三种能量波纹的发光配色 */
const RIPPLE_TONES: Record<
  RippleTone,
  { border: string; glow: string; core: string }
> = {
  violet: {
    border: "rgba(167,139,250,0.55)",
    glow: "rgba(124,58,237,0.30)",
    core: "rgba(139,92,246,0.10)",
  },
  cyan: {
    border: "rgba(103,232,249,0.50)",
    glow: "rgba(34,211,238,0.26)",
    core: "rgba(34,211,238,0.08)",
  },
  gold: {
    border: "rgba(253,224,140,0.75)",
    glow: "rgba(245,158,11,0.45)",
    core: "rgba(251,191,36,0.14)",
  },
};

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
  const [ripples, setRipples] = useState<RippleFx[]>([]);
  const [dissolve, setDissolve] = useState<DissolveText | null>(null);

  const inputRef = useRef<HTMLInputElement>(null);
  const whisperTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastPhrase = useRef<string>("");
  const lastHoverNoteAt = useRef(0);
  /** 同一合成器的触发时间必须严格递增，快速连打时让出 1ms */
  const nextNoteTime = useRef(0);
  const rippleSeq = useRef(0);
  const dissolveSeq = useRef(0);

  /* ---- 流星 canvas（涟漪已改为 DOM，canvas 只负责流星拖尾） ---- */
  const fxCanvasRef = useRef<HTMLCanvasElement>(null);
  const meteorsRef = useRef<Meteor[]>([]);
  /** 供长生命周期的共鸣调度器调用最新版 addRipple */
  const rippleApiRef = useRef<(r: Omit<RippleFx, "id">) => void>(() => {});

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

      const reverb = new Tone.Reverb({ decay: 13, wet: 0.72 });
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

  /* ---- 生成一道时空涟漪（DOM，Framer Motion 驱动） ---- */
  const addRipple = useCallback(
    (r: Omit<RippleFx, "id">, withChime = false) => {
      rippleSeq.current += 1;
      const id = rippleSeq.current;
      // 硬上限 25 个，连点也不堆积 DOM
      setRipples((prev) => [...prev.slice(-24), { ...r, id }]);
      if (withChime) {
        const note = PENTA_MID[Math.floor(Math.random() * PENTA_MID.length)];
        audio.current?.bell.triggerAttackRelease(note, "2n", claimTime());
      }
    },
    [claimTime]
  );

  useEffect(() => {
    rippleApiRef.current = addRipple;
  }, [addRipple]);

  /* ---- 点击星空：紫 / 青能量涟漪 + 颂钵音（输入框/恒星/字条豁免） ---- */
  useEffect(() => {
    const onPointerUp = (e: PointerEvent) => {
      const target = e.target as HTMLElement | null;
      if (target?.closest?.("input, button, a, p")) return;
      addRipple(
        {
          x: e.clientX,
          y: e.clientY,
          tone: Math.random() < 0.5 ? "violet" : "cyan",
          supernova: false,
          dim: false,
        },
        true
      );
    };
    window.addEventListener("pointerup", onPointerUp);
    return () => window.removeEventListener("pointerup", onPointerUp);
  }, [addRipple]);

  /* ---- 流星 canvas（仅拖尾流星）+ 陌生人共鸣调度 ---- */
  useEffect(() => {
    const canvas = fxCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let w = 0;
    let h = 0;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);

    const resize = () => {
      w = window.innerWidth;
      h = window.innerHeight;
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    window.addEventListener("resize", resize);

    const playChime = () => {
      const note = PENTA_MID[Math.floor(Math.random() * PENTA_MID.length)];
      audio.current?.bell.triggerAttackRelease(note, "2n", claimTime());
    };

    const spawnMeteor = () => {
      const leftToRight = Math.random() > 0.35;
      const speed = 380 + Math.random() * 300;
      const angle = (24 + Math.random() * 18) * (Math.PI / 180);
      meteorsRef.current.push({
        x: leftToRight ? w * (Math.random() * 0.5 - 0.05) : w * (1.05 - Math.random() * 0.5),
        y: h * (Math.random() * 0.35 - 0.05),
        vx: Math.cos(angle) * speed * (leftToRight ? 1 : -1),
        vy: Math.sin(angle) * speed,
        start: performance.now(),
        life: 1800 + Math.random() * 700,
        gold: Math.random() < 0.25,
        trail: [],
      });
    };

    /* ---- 陌生人共鸣：3~8s 一次，62% 暗紫/青涟漪 / 38% 流星 ---- */
    let echoTimer: ReturnType<typeof setTimeout>;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const scheduleEcho = () => {
      echoTimer = setTimeout(
        () => {
          if (!document.hidden) {
            if (Math.random() < 0.62) {
              rippleApiRef.current({
                x: w * (0.12 + Math.random() * 0.76),
                y: h * (0.16 + Math.random() * 0.55),
                tone: Math.random() < 0.5 ? "violet" : "cyan",
                supernova: false,
                dim: true,
              });
            } else {
              spawnMeteor();
            }
            playChime();
          }
          scheduleEcho();
        },
        reduced ? 9000 + Math.random() * 6000 : 3000 + Math.random() * 5000
      );
    };
    scheduleEcho();

    /* ---- 渲染循环：仅流星 ---- */
    let raf = 0;
    const render = () => {
      const now = performance.now();
      ctx.clearRect(0, 0, w, h);
      ctx.globalCompositeOperation = "lighter";

      meteorsRef.current = meteorsRef.current.filter(
        (m) => now - m.start < m.life && m.x > -80 && m.x < w + 80 && m.y < h + 80
      );
      for (const m of meteorsRef.current) {
        const dt = 1 / 60;
        m.x += m.vx * dt;
        m.y += m.vy * dt;
        m.trail.push({ x: m.x, y: m.y });
        if (m.trail.length > 16) m.trail.shift();

        const rgb = m.gold ? "251,210,130" : "190,220,255";
        for (let i = 1; i < m.trail.length; i++) {
          const p0 = m.trail[i - 1];
          const p1 = m.trail[i];
          const k = i / m.trail.length;
          ctx.beginPath();
          ctx.moveTo(p0.x, p0.y);
          ctx.lineTo(p1.x, p1.y);
          ctx.lineWidth = Math.max(0.3, 2.4 * k);
          ctx.strokeStyle = `rgba(${rgb},${k * 0.6})`;
          ctx.stroke();
        }
        // 头部亮核
        const g = ctx.createRadialGradient(m.x, m.y, 0, m.x, m.y, 7);
        g.addColorStop(0, "rgba(255,255,255,0.95)");
        g.addColorStop(0.4, `rgba(${rgb},0.6)`);
        g.addColorStop(1, `rgba(${rgb},0)`);
        ctx.fillStyle = g;
        ctx.fillRect(m.x - 7, m.y - 7, 14, 14);
      }

      ctx.globalCompositeOperation = "source-over";
      raf = requestAnimationFrame(render);
    };
    raf = requestAnimationFrame(render);

    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(echoTimer);
      window.removeEventListener("resize", resize);
    };
  }, [claimTime]);

  /* ---- 恒星悬停：放大发亮 + 五声音阶 ---- */
  const touchStar = useCallback(() => {
    const now = Tone.now();
    if (now - lastHoverNoteAt.current < 0.12) return; // 防止快速划过多音堆叠
    lastHoverNoteAt.current = now;
    const note = PENTA_MID[Math.floor(Math.random() * PENTA_MID.length)];
    audio.current?.bell.triggerAttackRelease(note, "2n", claimTime());
  }, [claimTime]);

  /* ---- 文字溶解结束 → 超新星 + 星尘 + 恒星（情绪彻底释放） ---- */
  const releaseEmotion = useCallback(
    (d: DissolveText) => {
      setDissolve(null);

      // 超新星能量光环：更大、更亮、暖金
      addRipple({ x: d.x, y: d.y, tone: "gold", supernova: true, dim: false });

      // 温暖星尘
      burstStardust();

      // 一颗明亮恒星落入上半屏星穹
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
    },
    [addRipple, burstStardust, persistStars, stars]
  );

  /* ---- 提交情绪：文字先在原位 blur 溶解，释放后再超新星爆发 ---- */
  const submitEmotion = useCallback(() => {
    const text = value.trim();
    if (!text) return;

    const rect = inputRef.current?.getBoundingClientRect();
    const x = rect ? rect.left + rect.width / 2 : window.innerWidth / 2;
    const y = rect ? rect.top + rect.height / 2 : window.innerHeight * 0.87;

    setValue("");

    // C2 下潜叹息随文字溶解起声
    audio.current?.bass.triggerAttackRelease("C2", "2n", claimTime());

    // 文字本体留在原位，模糊上浮地溶解
    dissolveSeq.current += 1;
    setDissolve({ id: dissolveSeq.current, text, x, y });

    // 超新星爆发的同时，深空飘来一句光影字条（不连续重复）
    if (whisperTimer.current) clearTimeout(whisperTimer.current);
    whisperTimer.current = setTimeout(() => {
      let phrase = PHRASES[Math.floor(Math.random() * PHRASES.length)];
      if (PHRASES.length > 1) {
        while (phrase === lastPhrase.current) {
          phrase = PHRASES[Math.floor(Math.random() * PHRASES.length)];
        }
      }
      lastPhrase.current = phrase;
      setWhisper({ id: Date.now(), text: phrase });
    }, 1050);
  }, [value, claimTime]);

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

      {/* 流星拖尾：在星空之上，不拦截任何点击 */}
      <canvas ref={fxCanvasRef} aria-hidden className="pointer-events-none fixed inset-0 z-[5]" />

      {/* 时空涟漪：能量波纹，在星空之上、星穹与输入框之下 */}
      <div aria-hidden className="pointer-events-none fixed inset-0 z-[6]">
        {ripples.map((r) => (
          <RippleWave
            key={r.id}
            ripple={r}
            onDone={() =>
              setRipples((prev) => prev.filter((q) => q.id !== r.id))
            }
          />
        ))}
      </div>

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

      {/* 回车瞬间：文字在原位模糊上浮、溶解于宇宙（1s 后触发超新星） */}
      <AnimatePresence>
        {dissolve && (
          <motion.div
            key={dissolve.id}
            className="pointer-events-none fixed z-20"
            style={{ left: dissolve.x, top: dissolve.y }}
            initial={{ opacity: 1, filter: "blur(0px)", x: "-50%", y: "-50%" }}
            animate={{
              opacity: 0,
              filter: "blur(10px)",
              x: "-50%",
              y: "-68%",
            }}
            transition={{ duration: 1, ease: "easeInOut" }}
            onAnimationComplete={() => releaseEmotion(dissolve)}
          >
            <span
              className="block whitespace-nowrap text-center text-[17px] font-light tracking-[0.2em] text-amber-50/75"
              style={{ textShadow: "0 0 22px rgba(251,191,36,0.3)" }}
            >
              {dissolve.text}
            </span>
          </motion.div>
        )}
      </AnimatePresence>

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

/* ------------------------------------------------------------------ */
/* 时空能量波纹：双环星云辉光，Framer Motion 驱动 scale 0 → 4 / → 6     */
/* ------------------------------------------------------------------ */

function RippleWave({
  ripple,
  onDone,
}: {
  ripple: RippleFx;
  onDone: () => void;
}) {
  const tone = RIPPLE_TONES[ripple.tone];
  const size = ripple.supernova ? 170 : 130;
  const endScale = ripple.supernova ? 6 : 4;
  const dur = ripple.supernova ? 3.2 : 2.5;
  const peak = ripple.supernova ? 0.85 : ripple.dim ? 0.38 : 0.6;
  const glowPx = ripple.supernova ? 44 : 20;
  const glowSpread = ripple.supernova ? 8 : 2;

  return (
    <div className="absolute" style={{ left: ripple.x, top: ripple.y }}>
      {[0, 0.18].map((delay, i) => {
        const outer = i === 0;
        return (
          <motion.div
            key={i}
            className="absolute rounded-full"
            style={{
              width: size,
              height: size,
              marginLeft: -size / 2,
              marginTop: -size / 2,
              border: `${outer ? 1.5 : 1}px solid ${tone.border}`,
              boxShadow: `0 0 ${glowPx}px ${glowSpread}px ${tone.glow}, inset 0 0 ${
                ripple.supernova ? 40 : 22
              }px ${tone.glow}`,
              background: `radial-gradient(circle, ${tone.core} 0%, transparent 72%)`,
              willChange: "transform, opacity",
            }}
            initial={{ scale: 0, opacity: 0 }}
            animate={{
              scale: outer ? endScale : endScale * 0.62,
              opacity: [peak, peak * 0.5, 0],
            }}
            transition={{
              duration: outer ? dur : dur * 0.8,
              delay,
              ease: [0.16, 1, 0.3, 1],
            }}
            onAnimationComplete={outer ? onDone : undefined}
          />
        );
      })}
    </div>
  );
}
