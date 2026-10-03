"use client";

/**
 * StarfieldBackground —— 浩瀚星空视觉基底（最底层 z-index: -10）
 *
 * 第一层：深空蓝 → 纯黑径向渐变；左上紫色 / 右下深蓝两团星云，
 *        blur(120px)、基准透明度 0.15，以 10s 周期反相交替呼吸。
 *        生物钟薄纱（veil）叠在其上：深夜压成近纯黑、白天微透深海蓝。
 * 第二层：@tsparticles/slim 渲染 150 颗散落星辰，漂浮速度随时段变化
 *        （深夜最慢），twinkle 在 0.1↔0.8 间呼吸。不开启任何连线。
 *
 * 纯展示层：pointer-events-none，不拦截恒星悬停 / 输入框 / confetti。
 * 环保休眠：paused=true 时暂停 tsparticles 容器渲染（CPU/GPU 降载）。
 */

import { memo, useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import { Particles, ParticlesProvider } from "@tsparticles/react";
import { loadSlim } from "@tsparticles/slim";
import type { Container, Engine, ISourceOptions } from "@tsparticles/engine";
import {
  CIRCADIAN_TOKENS,
  type CircadianPhase,
} from "@/lib/circadian";

/**
 * ParticlesProvider 要求 init 回调在整个应用生命周期内引用稳定，
 * 必须放在模块级（组件重渲染/时段切换时都不能变，否则引擎直接抛错）。
 */
const initSlim = async (engine: Engine): Promise<void> => {
  await loadSlim(engine);
};

function StarfieldBackground({
  phase = "evening",
  paused = false,
}: {
  phase?: CircadianPhase;
  paused?: boolean;
}) {
  const containerRef = useRef<Container | null>(null);
  const tok = CIRCADIAN_TOKENS[phase];

  /* 手机降档：iPhone DPR=3 时 retina 画布像素量 9 倍，是 WKWebView
     GPU 重绘/被杀的主因之一。小屏关 retina（物理像素仍够锐利）、
     粒子 150 减至 90、帧率 60 降至 30（缓慢漂浮肉眼无差）。SSG 首帧固定 false，挂载后检测。 */
  const [mobile, setMobile] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 640px)");
    const update = () => setMobile(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  const options = useMemo<ISourceOptions>(
    () => ({
      fullScreen: false,
      fpsLimit: mobile ? 30 : 60,
      detectRetina: !mobile,
      background: { color: { value: "transparent" } },
      particles: {
        number: { value: mobile ? 90 : 150, density: { enable: true } },
        // 大部分纯白（重复 4 份加权），少部分浅蓝与暗金
        color: {
          value: ["#ffffff", "#ffffff", "#ffffff", "#ffffff", "#e0f2fe", "#fef3c7"],
        },
        opacity: { value: 0.8 },
        size: { value: { min: 0.4, max: 1.6 } },
        links: { enable: false }, // 明确：纯粹散落星辰，绝无连线
        twinkle: {
          particles: {
            enable: true,
            frequency: 0.05, // 低频随机闪烁
            opacity: 0.1, // 闪烁谷底 0.1，基础亮度 0.8
          },
        },
        move: {
          enable: true,
          speed: tok.starSpeed, // 生物钟：深夜最慢，白天稍快
          direction: "top", // 统一缓慢向上（视觉上的失重下沉）
          random: true, // 方向带随机抖动，不机械
          straight: false,
          outModes: { default: "out" },
        },
      },
      detectOn: "window",
    }),
    [tok.starSpeed, mobile]
  );

  /* 环保休眠：暂停 / 恢复粒子容器（选项变化导致的引擎重建后重新抓一次状态） */
  useEffect(() => {
    const c = containerRef.current;
    if (!c) return;
    if (paused) c.pause();
    else c.play();
  }, [paused, options]);

  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-0 overflow-hidden"
      style={{
        zIndex: -10,
        background:
          "radial-gradient(ellipse 120% 100% at 50% 42%, #020111 0%, #01010a 48%, #000000 82%)",
      }}
    >
      {/* 第一层 · 呼吸星云：左上紫（10s 明 → 暗） */}
      <motion.div
        className="absolute left-[-16%] top-[-22%] h-[72vmin] w-[72vmin] rounded-full"
        style={{
          background:
            "radial-gradient(circle, rgba(138,92,214,0.5) 0%, rgba(96,60,170,0.22) 48%, transparent 72%)",
          filter: "blur(calc(120px * var(--zero-blur-scale, 1)))",
          opacity: 0.15,
          willChange: "transform, opacity",
        }}
        animate={{ opacity: [0.15, 0.34, 0.15], scale: [1, 1.1, 1] }}
        transition={{ duration: 10, ease: "easeInOut", repeat: Infinity }}
      />
      {/* 右下深蓝：与紫云反相呼吸，交替成为视觉锚点 */}
      <motion.div
        className="absolute bottom-[-24%] right-[-16%] h-[76vmin] w-[76vmin] rounded-full"
        style={{
          background:
            "radial-gradient(circle, rgba(37,99,196,0.5) 0%, rgba(24,60,140,0.22) 50%, transparent 74%)",
          filter: "blur(calc(120px * var(--zero-blur-scale, 1)))",
          opacity: 0.34,
          willChange: "transform, opacity",
        }}
        animate={{ opacity: [0.34, 0.15, 0.34], scale: [1.1, 1, 1.1] }}
        transition={{ duration: 10, ease: "easeInOut", repeat: Infinity }}
      />

      {/* 生物钟薄纱：背景渐变不可平滑插值，用纯色层 opacity 3s 过渡来"换天" */}
      <div
        className="absolute inset-0"
        style={{
          background: tok.veil.color,
          opacity: tok.veil.opacity,
          transition: "opacity 3s ease-in-out",
        }}
      />

      {/* 第二层 · 微光星空 */}
      <ParticlesProvider init={initSlim}>
        <Particles
          id="zero-starfield"
          className="absolute inset-0"
          options={options}
          particlesLoaded={async (container?: Container) => {
            containerRef.current = container ?? null;
            if (paused) container?.pause();
          }}
        />
      </ParticlesProvider>
    </div>
  );
}

/**
 * memo 隔离：props（phase 字符串 / paused 布尔）只在生物钟换天与标签隐藏时变化，
 * 点击涟漪等高频父组件 state 不再触发 tsparticles 树（150 粒子）重协调。
 */
export default memo(StarfieldBackground);
