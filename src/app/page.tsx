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

/* ---- 点击涟漪 / 流星（轻量 canvas 特效） ---- */

interface Ripple {
  x: number;
  y: number;
  start: number;
  dur: number;
  maxR: number;
  warm: boolean;
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
  const lastClickNoteAt = useRef(0);

  /* ---- 涟漪 / 流星 canvas 特效 ---- */
  const fxCanvasRef = useRef<HTMLCanvasElement>(null);
  const ripplesRef = useRef<Ripple[]>([]);
  const meteorsRef = useRef<Meteor[]>([]);

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

  /* ---- 涟漪 / 流星：一次 canvas + 一个 rAF，所有状态在 ref ---- */
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

    const spawnRipple = (x: number, y: number, warm: boolean) => {
      ripplesRef.current.push({
        x,
        y,
        start: performance.now(),
        dur: 2200 + Math.random() * 900,
        maxR: 90 + Math.random() * 120,
        warm,
      });
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

    /* ---- 点击空白：暖金涟漪（输入框 / 恒星 / 字条不响应） ---- */
    const onPointerUp = (e: PointerEvent) => {
      const target = e.target as HTMLElement | null;
      if (target?.closest?.("input, button, a, p")) return;
      spawnRipple(e.clientX, e.clientY, true);
      const now = Tone.now();
      if (now - lastClickNoteAt.current > 0.8) {
        lastClickNoteAt.current = now;
        playChime();
      }
    };
    window.addEventListener("pointerup", onPointerUp);

    /* ---- 陌生人共鸣：3~8s 一次，62% 冷光涟漪 / 38% 流星 ---- */
    let echoTimer: ReturnType<typeof setTimeout>;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const scheduleEcho = () => {
      echoTimer = setTimeout(
        () => {
          if (!document.hidden) {
            if (Math.random() < 0.62) {
              spawnRipple(w * (0.12 + Math.random() * 0.76), h * (0.16 + Math.random() * 0.55), false);
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

    /* ---- 渲染循环 ---- */
    let raf = 0;
    const render = () => {
      const now = performance.now();
      ctx.clearRect(0, 0, w, h);
      ctx.globalCompositeOperation = "lighter";

      // 涟漪：双环扩散 + 中心微光
      ripplesRef.current = ripplesRef.current.filter((r) => now - r.start < r.dur);
      for (const r of ripplesRef.current) {
        const t = (now - r.start) / r.dur;
        const ease = 1 - Math.pow(1 - t, 3);
        const radius = Math.max(0.1, ease * r.maxR);
        const alpha = (1 - t) * 0.55;
        const rgb = r.warm ? "251,191,36" : "150,190,255";
        ctx.beginPath();
        ctx.arc(r.x, r.y, radius, 0, Math.PI * 2);
        ctx.lineWidth = Math.max(0.4, 2.2 * (1 - t));
        ctx.strokeStyle = `rgba(${rgb},${alpha})`;
        ctx.stroke();
        // 内圈
        ctx.beginPath();
        ctx.arc(r.x, r.y, radius * 0.62, 0, Math.PI * 2);
        ctx.lineWidth = Math.max(0.3, 1 * (1 - t));
        ctx.strokeStyle = `rgba(${rgb},${alpha * 0.45})`;
        ctx.stroke();
        // 出生瞬间的中心微光
        if (t < 0.35) {
          const g = ctx.createRadialGradient(r.x, r.y, 0, r.x, r.y, 30);
          g.addColorStop(0, `rgba(${rgb},${(1 - t / 0.35) * 0.5})`);
          g.addColorStop(1, `rgba(${rgb},0)`);
          ctx.fillStyle = g;
          ctx.fillRect(r.x - 30, r.y - 30, 60, 60);
        }
      }

      // 流星：拖尾渐变线 + 发光头部
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
      window.removeEventListener("pointerup", onPointerUp);
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

      {/* 涟漪与流星：在星空之上、星穹之下，不拦截任何点击 */}
      <canvas ref={fxCanvasRef} aria-hidden className="pointer-events-none fixed inset-0 z-[5]" />

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
