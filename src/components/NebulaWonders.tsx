"use client";

/**
 * NebulaWonders —— 星云奇观层（纯视觉增量层，不承载任何业务逻辑）
 *
 * 层级：z-index -8
 *   星空 tsparticles(-10) / 热力层(-9) 【之上】
 *   流星 canvas(5) / 涟漪(6) / 恒星(10) / 输入框(30) 【之下】
 *
 * 设计：
 * - 3 团宏大星云，极端 blur(180~200px) + mix-blend-mode: screen
 * - Framer Motion：外层 120~170s 线性缓慢自转，内层 28~40s 呼吸缩放
 *   （两层嵌套分离时间尺度；仅 transform 变化，走合成器）
 * - 每团云由两张静态渐变层叠放：冷色层（深紫/海青/品红）常驻，
 *   暖色层（暗金/琥珀/余烬红）opacity 跟随星云温度
 * - 温度由外部 ref 注入（page.tsx 的 nebulaTempRef），组件内部 250ms
 *   低频采样并直写 DOM；颜色交叉淡化交给 CSS `transition: opacity 4s`
 *   → 升温时 3~5 秒「燃烧」，冷却时随指数衰减花数分钟回到冰冷深蓝
 * - 全程不触发 React 重渲染；blur 滤镜静态，只有 opacity/transform 变化
 */

import { useEffect, useRef, useState, type CSSProperties } from "react";
import { motion } from "framer-motion";

interface CloudDef {
  /** 位置（相对视口） */
  pos: CSSProperties;
  /** 几何尺寸（vmin） */
  size: number;
  blur: number;
  /** 冷色径向渐变（冰冷宇宙态） */
  cold: string;
  /** 暖色径向渐变（吸收情绪能量后的燃烧态） */
  hot: string;
  /** 冷态基础不透明度 */
  coldAlpha: number;
  /** 温度→暖层不透明度的个体系数（制造层次差异） */
  hotGain: number;
  /** 自转周期秒（正负控制方向） */
  spin: number;
  /** 呼吸周期秒与峰值缩放 */
  breathe: number;
  scalePeak: number;
  /** 初始相位（秒），避免三团云同步 */
  delay: number;
  /** 悬停视差幅度（px）：鼠标靠近时被吸引的最大偏移，越小越「深远」 */
  parallax: number;
  /** 悬停增亮上限：鼠标悬于云域时冷层 opacity 的最大增量 */
  hoverGlow: number;
}

const CLOUDS: CloudDef[] = [
  {
    // 暗紫罗兰 · 左上天幕
    pos: { left: "-18%", top: "-22%" },
    size: 82,
    blur: 180,
    cold: "radial-gradient(circle, rgba(88,28,135,0.55) 0%, rgba(49,16,100,0.30) 42%, transparent 70%)",
    hot: "radial-gradient(circle, rgba(255,153,64,0.60) 0%, rgba(196,58,24,0.34) 44%, rgba(120,20,10,0.12) 66%, transparent 76%)",
    coldAlpha: 0.85,
    hotGain: 0.95,
    spin: 140,
    breathe: 34,
    scalePeak: 1.22,
    delay: 0,
    parallax: 22,
    hoverGlow: 0.2,
  },
  {
    // 深海青蓝 · 右下
    pos: { right: "-20%", bottom: "-24%" },
    size: 88,
    blur: 190,
    cold: "radial-gradient(circle, rgba(14,116,144,0.50) 0%, rgba(20,52,120,0.30) 46%, transparent 72%)",
    hot: "radial-gradient(circle, rgba(251,191,36,0.55) 0%, rgba(180,83,9,0.34) 46%, rgba(120,40,8,0.10) 68%, transparent 78%)",
    coldAlpha: 0.8,
    hotGain: 0.8,
    spin: -120,
    breathe: 28,
    scalePeak: 1.18,
    delay: -9,
    parallax: 30,
    hoverGlow: 0.18,
  },
  {
    // 品红 / 暗金 · 中央偏上（最大最淡，提供主体辉光）
    pos: { left: "22%", top: "-30%" },
    size: 96,
    blur: 200,
    cold: "radial-gradient(circle, rgba(112,26,94,0.40) 0%, rgba(60,20,90,0.22) 44%, transparent 70%)",
    hot: "radial-gradient(circle, rgba(254,215,170,0.42) 0%, rgba(234,88,12,0.30) 42%, rgba(150,30,30,0.12) 64%, transparent 76%)",
    coldAlpha: 0.7,
    hotGain: 1,
    spin: 170,
    breathe: 40,
    scalePeak: 1.26,
    delay: -20,
    parallax: 14,
    hoverGlow: 0.15,
  },
];

/** 由定位参数推每团云的几何中心（px），随视口尺寸变化重算 */
function cloudCenters(vw: number, vh: number) {
  const vmin = Math.min(vw, vh);
  return CLOUDS.map((c) => {
    const s = (c.size / 100) * vmin;
    let x: number;
    let y: number;
    if (c.pos.left !== undefined) x = (parseFloat(String(c.pos.left)) / 100) * vw + s / 2;
    else x = vw - (parseFloat(String(c.pos.right)) / 100) * vw - s / 2;
    if (c.pos.top !== undefined) y = (parseFloat(String(c.pos.top)) / 100) * vh + s / 2;
    else y = vh - (parseFloat(String(c.pos.bottom)) / 100) * vh - s / 2;
    // 感应半径 = 云体半径 + 云心到视口边缘的补偿，确保视口内任意点都能被覆盖
    // 以云心到视口中心距离的 0.8 倍作为补偿上限，避免半径过大导致全域同亮
    const distToCenter = Math.hypot(x - vw / 2, y - vh / 2);
    const r = s * 0.6 + Math.min(distToCenter * 0.8, s * 0.9);
    return { x, y, r };
  });
}

/**
 * @param tempRef 与主页面共享的星云温度引用（0=冰冷，1=灼热）
 *                组件只读，不写入、不改变其冷却循环
 */
export default function NebulaWonders({
  tempRef,
}: {
  tempRef: { readonly current: number };
}) {
  const hotLayersRef = useRef<(HTMLDivElement | null)[]>([]);
  const coldLayersRef = useRef<(HTMLDivElement | null)[]>([]);
  const parallaxRef = useRef<(HTMLDivElement | null)[]>([]);
  // 仅客户端判定减弱动效（避免 SSR 预渲染期访问 window）
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(mq.matches);
  }, []);

  /* 鼠标悬停交互：靠近的星云被轻轻吸引（视差）并微微增亮，
     全程 ref + rAF 惯性插值，零 React 重渲染 */
  useEffect(() => {
    if (reduced) return;
    let centers = cloudCenters(window.innerWidth, window.innerHeight);
    const mouse = { x: -9999, y: -9999 };
    // 每团云独立的当前值（目标值实时由鼠标推导）
    const cur = CLOUDS.map(() => ({ x: 0, y: 0, glow: 0 }));

    const onMove = (e: PointerEvent) => {
      mouse.x = e.clientX;
      mouse.y = e.clientY;
    };
    const onLeave = () => {
      mouse.x = -9999;
      mouse.y = -9999;
    };
    const onResize = () => {
      centers = cloudCenters(window.innerWidth, window.innerHeight);
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    window.addEventListener("pointerleave", onLeave);
    window.addEventListener("blur", onLeave);
    window.addEventListener("resize", onResize);

    let raf = 0;
    const LERP = 0.045; // 小系数 = 沉重的惯性，星云「缓慢回应」
    const loop = () => {
      for (let i = 0; i < CLOUDS.length; i++) {
        const c = CLOUDS[i];
        const ctr = centers[i];
        const dx = mouse.x - ctr.x;
        const dy = mouse.y - ctr.y;
        const dist = Math.hypot(dx, dy);
        // 感应强度：云心为 1，感应半径外线性衰减到 0
        const prox = Math.max(0, 1 - dist / (ctr.r * 1.6));
        // 视差目标：朝鼠标方向被吸引，上限 parallax px
        const tx = dist > 1 ? (dx / dist) * c.parallax * prox : 0;
        const ty = dist > 1 ? (dy / dist) * c.parallax * prox : 0;
        const st = cur[i];
        st.x += (tx - st.x) * LERP;
        st.y += (ty - st.y) * LERP;
        st.glow += (c.hoverGlow * prox - st.glow) * LERP;

        const p = parallaxRef.current[i];
        if (p) p.style.transform = `translate3d(${st.x.toFixed(2)}px, ${st.y.toFixed(2)}px, 0)`;
        const cold = coldLayersRef.current[i];
        if (cold) {
          cold.style.opacity = Math.min(1, c.coldAlpha + st.glow).toFixed(3);
        }
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerleave", onLeave);
      window.removeEventListener("blur", onLeave);
      window.removeEventListener("resize", onResize);
    };
  }, [reduced]);

  useEffect(() => {
    // 低频采样温度 → 直写暖层 opacity；4s CSS 过渡负责平滑交叉淡化。
    // 升温：温度阶跃后暖层用约 4 秒淡入（燃烧）；
    // 冷却：温度本身指数慢降，叠加 4s 滞后，整体耗时数分钟回归冷色。
    const tick = () => {
      const t = tempRef.current;
      hotLayersRef.current.forEach((el, i) => {
        if (!el) return;
        const target = Math.max(0, Math.min(1, t * CLOUDS[i].hotGain));
        el.style.opacity = target.toFixed(3);
      });
    };
    tick();
    const timer = window.setInterval(tick, reduced ? 1000 : 250);
    return () => window.clearInterval(timer);
  }, [tempRef, reduced]);

  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-0 overflow-hidden"
      style={{ zIndex: -8, mixBlendMode: "screen" }}
    >
      {CLOUDS.map((c, i) => (
        // 最外层：悬停视差平移（ref 直写 transform，rAF 惯性插值）
        <div
          key={i}
          ref={(el) => {
            parallaxRef.current[i] = el;
          }}
          className="absolute will-change-transform"
          style={{ ...c.pos, width: `${c.size}vmin`, height: `${c.size}vmin` }}
        >
        {/* 第二层：120~170s 线性缓慢自转 */}
        <motion.div
          className="absolute inset-0"
          initial={{ rotate: 0 }}
          animate={reduced ? undefined : { rotate: c.spin > 0 ? 360 : -360 }}
          transition={{
            duration: Math.abs(c.spin),
            ease: "linear",
            repeat: Infinity,
          }}
        >
          {/* 内层：28~40s 呼吸缩放（与自转时间尺度解耦） */}
          <motion.div
            className="absolute inset-0 will-change-transform"
            initial={{ scale: 1 }}
            animate={{ scale: reduced ? [1, 1.05, 1] : [1, c.scalePeak, 1] }}
            transition={{
              duration: reduced ? c.breathe * 1.6 : c.breathe,
              ease: "easeInOut",
              repeat: Infinity,
              delay: c.delay,
            }}
          >
            {/* 冷色层：常驻的冰冷星云（静态 blur，浏览器只栅格化一次） */}
            <div
              ref={(el) => {
                coldLayersRef.current[i] = el;
              }}
              className="absolute inset-0"
              style={{
                background: c.cold,
                filter: `blur(${c.blur}px)`,
                opacity: c.coldAlpha,
                willChange: "opacity",
                // 不加 CSS transition——rAF 每帧直写 opacity，lerp 本身就是平滑的
              }}
            />
            {/* 暖色层：跟随星云温度交叉淡入，4s 过渡 = 3~5 秒「燃烧」 */}
            <div
              ref={(el) => {
                hotLayersRef.current[i] = el;
              }}
              className="absolute inset-0"
              style={{
                background: c.hot,
                filter: `blur(${c.blur}px)`,
                opacity: 0,
                transition: "opacity 4s ease-in-out",
                willChange: "opacity",
              }}
            />
          </motion.div>
        </motion.div>
        </div>
      ))}
    </div>
  );
}
