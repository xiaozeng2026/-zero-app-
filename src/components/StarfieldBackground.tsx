"use client";

/**
 * StarfieldBackground —— 浩瀚星空视觉基底（最底层 z-index: -10）
 *
 * 第一层：深空蓝 → 纯黑径向渐变；左上紫色 / 右下深蓝两团星云，
 *        blur(120px)、基准透明度 0.15，以 10s 周期反相交替呼吸。
 * 第二层：@tsparticles/slim 渲染 180 颗散落星辰，0.5–2px 大小分层、
 *        白/浅蓝/暗金三色、0.1–0.3 极慢向上失重漂浮、twinkle 在 0.1↔0.8 间呼吸。
 *        不开启任何连线。
 *
 * 纯展示层：pointer-events-none，不拦截恒星悬停 / 输入框 / confetti。
 */

import { useMemo } from "react";
import { motion } from "framer-motion";
import { Particles, ParticlesProvider } from "@tsparticles/react";
import { loadSlim } from "@tsparticles/slim";
import type { Engine, ISourceOptions } from "@tsparticles/engine";

export default function StarfieldBackground() {
  const options = useMemo<ISourceOptions>(
    () => ({
      fullScreen: false,
      fpsLimit: 60,
      detectRetina: true,
      background: { color: { value: "transparent" } },
      particles: {
        number: { value: 150, density: { enable: true } },
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
          speed: { min: 0.1, max: 0.3 }, // 极慢，个体有速度差 → 纵深感
          direction: "top", // 统一缓慢向上（视觉上的失重下沉）
          random: true, // 方向带随机抖动，不机械
          straight: false,
          outModes: { default: "out" },
        },
      },
      detectOn: "window",
    }),
    []
  );

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
          filter: "blur(120px)",
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
          filter: "blur(120px)",
          opacity: 0.34,
          willChange: "transform, opacity",
        }}
        animate={{ opacity: [0.34, 0.15, 0.34], scale: [1.1, 1, 1.1] }}
        transition={{ duration: 10, ease: "easeInOut", repeat: Infinity }}
      />

      {/* 第二层 · 微光星空 */}
      <ParticlesProvider
        init={async (engine: Engine) => {
          await loadSlim(engine);
        }}
      >
        <Particles id="zero-starfield" className="absolute inset-0" options={options} />
      </ParticlesProvider>
    </div>
  );
}
