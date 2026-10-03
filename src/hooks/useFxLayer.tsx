"use client";

/**
 * 特效层 hook —— 涟漪 / 文字溶解 / 流星 Canvas / 星云热力 / 星尘爆裂
 *
 * 职责：
 * - 能量涟漪（DOM + Framer Motion，硬上限 25）+ 渲染组件 RippleWave
 * - 文字溶解状态（回车后文字 blur 上浮；动画完成回调交给页面释放情绪）
 * - 流星 canvas rAF 渲染 + 星云温度指数冷却（直写热力层 style，不走 React state）
 * - 近场共鸣调度器（5~12s）与同辈之网调度器（15~45s）
 *   ※ 同辈之网为本地模拟：坐标与时机全部在浏览器内随机生成，
 *     无任何网络请求、无任何数据上传
 * - 回车星尘爆裂（canvas-confetti，按情绪重量自适应）
 */

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type RefObject,
} from "react";
import { motion } from "framer-motion";
import confetti from "canvas-confetti";
import { playBell, playPeerBell } from "@/lib/audioEngine";
import { CIRCADIAN_TOKENS, type CircadianPhase } from "@/lib/circadian";
import {
  emotionHeat,
  emotionStardust,
  type RippleColors,
} from "@/lib/emotionWeight";
import { hapticTick } from "@/lib/haptics";

/* ------------------------------------------------------------------ */
/* 类型与常量                                                          */
/* ------------------------------------------------------------------ */

export type RippleTone = "violet" | "cyan" | "gold";

export interface RippleFx {
  id: number;
  x: number;
  y: number;
  tone: RippleTone;
  /** 超新星：更大更亮、带暖金（默认参数档位） */
  supernova: boolean;
  /** 陌生人自动涟漪：起始透明度更低 */
  dim: boolean;
  /** 自适应覆盖项（不给则按 supernova/dim 取默认） */
  size?: number;
  scaleTo?: number;
  duration?: number;
  peak?: number;
  /** 连续重量插值出的自定义配色（不给则按 tone 取） */
  colors?: RippleColors;
}

/** 回车时正在溶解的文字 */
export interface DissolveText {
  id: number;
  text: string;
  x: number;
  y: number;
  /** 情绪重量 0（轻灵）~ 1（沉重） */
  weight: number;
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

/** 星云温度冷却半衰期（秒）：约 5 个半衰期 ≈ 2.5 分钟回到冰冷深空 */
const NEBULA_COOL_HALFLIFE = 28;

/* ------------------------------------------------------------------ */
/* Hook                                                                */
/* ------------------------------------------------------------------ */

export function useFxLayer(
  inputRef: RefObject<HTMLInputElement | null>,
  phase: CircadianPhase = "evening"
) {
  const [ripples, setRipples] = useState<RippleFx[]>([]);
  const [dissolve, setDissolve] = useState<DissolveText | null>(null);

  /** 波纹时长随时段变化（白天轻快 0.92×，深夜沉缓 1.08×） */
  const ripplePace = CIRCADIAN_TOKENS[phase].ripplePace;

  const rippleSeq = useRef(0);
  const dissolveSeq = useRef(0);
  /** 供长生命周期的调度器调用最新版 addRipple */
  const rippleApiRef = useRef<(r: Omit<RippleFx, "id">) => void>(() => {});

  /* ---- 流星 canvas（涟漪已改为 DOM，canvas 只负责流星拖尾） ---- */
  const fxCanvasRef = useRef<HTMLCanvasElement>(null);
  const meteorsRef = useRef<Meteor[]>([]);

  /* ---- 星云温度（0=冰冷深空，1=灼热）：仅 rAF 读写，不触发 React 渲染 ---- */
  const nebulaTempRef = useRef(0);
  const heatLayerRef = useRef<HTMLDivElement>(null);

  /* ---- 生成一道时空涟漪（DOM，Framer Motion 驱动） ---- */
  const addRipple = useCallback((r: Omit<RippleFx, "id">, withChime = false) => {
    rippleSeq.current += 1;
    const id = rippleSeq.current;
    // 硬上限 25 个，连点也不堆积 DOM
    setRipples((prev) => [...prev.slice(-24), { ...r, id }]);
    if (withChime) playBell();
  }, []);

  useEffect(() => {
    rippleApiRef.current = addRipple;
  }, [addRipple]);

  const removeRipple = useCallback((id: number) => {
    setRipples((prev) => prev.filter((q) => q.id !== id));
  }, []);

  /* ---- 点击星空：紫 / 青能量涟漪 + 颂钵音 + 极轻触觉（输入框/恒星/字条豁免） ---- */
  /* 注意：近场共鸣/同辈之网走 rippleApiRef.addRipple，不经此监听，不会误震 */
  useEffect(() => {
    const onPointerUp = (e: PointerEvent) => {
      const target = e.target as HTMLElement | null;
      if (target?.closest?.("input, button, a, p")) return;
      hapticTick();
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

    const spawnMeteor = () => {
      const leftToRight = Math.random() > 0.35;
      const speed = 380 + Math.random() * 300;
      const angle = (24 + Math.random() * 18) * (Math.PI / 180);
      meteorsRef.current.push({
        x: leftToRight
          ? w * (Math.random() * 0.5 - 0.05)
          : w * (1.05 - Math.random() * 0.5),
        y: h * (Math.random() * 0.35 - 0.05),
        vx: Math.cos(angle) * speed * (leftToRight ? 1 : -1),
        vy: Math.sin(angle) * speed,
        start: performance.now(),
        life: 1800 + Math.random() * 700,
        gold: Math.random() < 0.25,
        trail: [],
      });
    };

    /* ---- 近场共鸣：5~12s 一次，65% 流星 / 35% 暗涟漪（同辈之网另有独立慢循环） ---- */
    let echoTimer: ReturnType<typeof setTimeout>;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const scheduleEcho = () => {
      echoTimer = setTimeout(
        () => {
          if (!document.hidden) {
            if (Math.random() < 0.65) {
              spawnMeteor();
            } else {
              rippleApiRef.current({
                x: w * (0.12 + Math.random() * 0.76),
                y: h * (0.16 + Math.random() * 0.55),
                tone: Math.random() < 0.5 ? "violet" : "cyan",
                supernova: false,
                dim: true,
              });
            }
            playBell();
          }
          scheduleEcho();
        },
        reduced ? 11000 + Math.random() * 8000 : 5000 + Math.random() * 7000
      );
    };
    scheduleEcho();

    /* ---- 渲染循环：流星 + 星云温度指数冷却 ---- */
    let raf = 0;
    let lastTs: number | null = null;
    let lastAppliedTemp = -1;
    const render = (ts: number) => {
      const now = performance.now();

      // 星云热力学：T(t) = T0 * 0.5^(dt/半衰期)，非线性、前段温吞后段悠长
      if (lastTs !== null) {
        const dt = Math.min(0.1, (ts - lastTs) / 1000);
        if (nebulaTempRef.current > 0) {
          nebulaTempRef.current *= Math.pow(0.5, dt / NEBULA_COOL_HALFLIFE);
          if (nebulaTempRef.current < 0.002) nebulaTempRef.current = 0;
        }
      }
      lastTs = ts;

      // 温度 → 暖光层 opacity / scale（直写 style，不走 React state）
      const layer = heatLayerRef.current;
      if (layer && Math.abs(nebulaTempRef.current - lastAppliedTemp) > 0.003) {
        const t = nebulaTempRef.current;
        lastAppliedTemp = t;
        layer.style.opacity = (t * 0.85).toFixed(3);
        layer.style.transform = `scale(${(1 + t * 0.22).toFixed(3)})`;
      }

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
  }, []);

  /* ---- 同辈之网：独立慢循环 15~45s，屏幕极边缘的微弱时空波动 + 海量混响风铃 ---- */
  /* 本地模拟：坐标与时机全部随机生成于浏览器内，无任何网络请求、无任何数据上传 */
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;

    /** 取屏幕四条极边缘带内的一个坐标 */
    const edgePoint = () => {
      const w = window.innerWidth;
      const h = window.innerHeight;
      const bandX = w * 0.08;
      const bandY = h * 0.12;
      const side = Math.floor(Math.random() * 4);
      switch (side) {
        case 0:
          return { x: Math.random() * bandX, y: Math.random() * h };
        case 1:
          return { x: w - Math.random() * bandX, y: Math.random() * h };
        case 2:
          return { x: Math.random() * w, y: Math.random() * bandY };
        default:
          return { x: Math.random() * w, y: h - Math.random() * bandY };
      }
    };

    const schedule = () => {
      timer = setTimeout(() => {
        if (!document.hidden) {
          const { x, y } = edgePoint();
          rippleApiRef.current({
            x,
            y,
            tone: Math.random() < 0.6 ? "violet" : "cyan",
            supernova: false,
            dim: true,
            // 极远处传来：更小、更慢、近乎透明
            size: 105,
            scaleTo: 2.8,
            duration: 3.8,
            peak: 0.1 + Math.random() * 0.1,
          });
          playPeerBell();
        }
        schedule();
      }, 15000 + Math.random() * 30000);
    };
    schedule();

    return () => clearTimeout(timer);
  }, []);

  /* ---- 在输入框位置放一束星尘（按情绪重量连续插值：轻=青白少而飘，重=琥珀多而坠） ---- */
  const burstStardust = useCallback((weight: number) => {
    const el = inputRef.current;
    const rect = el?.getBoundingClientRect();
    const origin = rect
      ? {
          x: (rect.left + rect.width / 2) / window.innerWidth,
          y: rect.top / window.innerHeight,
        }
      : { x: 0.5, y: 0.75 };

    const p = emotionStardust(weight);
    const base: confetti.Options = {
      colors: p.colors,
      shapes: ["circle"],
      scalar: p.scalar,
      // 沉重：重力明显下坠；轻度：近乎失重地漂浮
      gravity: p.gravity,
      decay: p.decay,
      ticks: p.ticks,
      disableForReducedMotion: true,
      zIndex: 60,
    };

    confetti({
      ...base,
      particleCount: p.count,
      spread: p.spread,
      startVelocity: p.velocity,
      origin,
    });
    // 向上的"逃逸星尘"：越沉重，向上的余烬比例越小
    confetti({
      ...base,
      particleCount: p.upCount,
      spread: p.upSpread,
      startVelocity: p.upVelocity,
      angle: 270,
      scalar: p.upScalar,
      origin,
    });
  }, [inputRef]);

  /* ---- 星云加热：回车瞬间把文字粉碎的能量传递给背景星云（按重量插值 0.26~0.55） ---- */
  const heatNebula = useCallback((weight: number) => {
    nebulaTempRef.current = Math.min(1, nebulaTempRef.current + emotionHeat(weight));
  }, []);

  /* ---- 文字溶解状态（渲染在页面；动画完成回调交还页面释放情绪） ---- */
  const startDissolve = useCallback(
    (text: string, x: number, y: number, weight: number) => {
      dissolveSeq.current += 1;
      setDissolve({ id: dissolveSeq.current, text, x, y, weight });
    },
    []
  );
  const clearDissolve = useCallback(() => setDissolve(null), []);

  return {
    ripples,
    addRipple,
    removeRipple,
    ripplePace,
    dissolve,
    startDissolve,
    clearDissolve,
    fxCanvasRef,
    heatLayerRef,
    nebulaTempRef,
    heatNebula,
    burstStardust,
  };
}

/* ------------------------------------------------------------------ */
/* 时空能量波纹：双环星云辉光，Framer Motion 驱动 scale 0 → 4 / → 6     */
/* ------------------------------------------------------------------ */

export function RippleWave({
  ripple,
  pace = 1,
  onDone,
}: {
  ripple: RippleFx;
  /** 生物钟节奏倍率：>1 沉缓，<1 轻快 */
  pace?: number;
  onDone: () => void;
}) {
  const tone = ripple.colors ?? RIPPLE_TONES[ripple.tone];
  const size = ripple.size ?? (ripple.supernova ? 170 : 130);
  const endScale = ripple.scaleTo ?? (ripple.supernova ? 6 : 4);
  const dur = (ripple.duration ?? (ripple.supernova ? 3.2 : 2.5)) * pace;
  const peak =
    ripple.peak ?? (ripple.supernova ? 0.85 : ripple.dim ? 0.38 : 0.6);
  // 辉光随扩散尺度增强（深紫巨波最盛，同辈涟漪最弱）
  const glowPx = Math.max(
    12,
    Math.min(46, Math.round(9 + endScale * (ripple.supernova ? 6 : 4.6)))
  );
  const glowSpread = endScale >= 5.5 ? 8 : 2;
  const innerGlow = endScale >= 5.5 ? 40 : 22;

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
              boxShadow: `0 0 ${glowPx}px ${glowSpread}px ${tone.glow}, inset 0 0 ${innerGlow}px ${tone.glow}`,
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
