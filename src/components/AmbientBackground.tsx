"use client";

import { useEffect, useRef } from "react";
import { motion } from "framer-motion";

/** 微弱浮尘粒子 */
interface Particle {
  x: number;
  y: number;
  r: number;
  vx: number;
  vy: number;
  phase: number;
  speed: number;
}

/**
 * 深夜呼吸背景：
 * - 两团错位呼吸的微弱光晕
 * - canvas 绘制的缓慢上浮浮尘
 * - pressDepth 0~1 控制整体压暗
 */
export default function AmbientBackground({
  pressDepth,
  lightsOut,
}: {
  pressDepth: number;
  lightsOut: boolean;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let w = 0;
    let h = 0;
    let raf = 0;
    const particles: Particle[] = [];

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
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

    const COUNT = Math.min(42, Math.floor((w * h) / 42000));
    for (let i = 0; i < COUNT; i++) {
      particles.push({
        x: Math.random() * w,
        y: Math.random() * h,
        r: 0.5 + Math.random() * 1.3,
        vx: (Math.random() - 0.5) * 0.06,
        vy: -(0.02 + Math.random() * 0.08),
        phase: Math.random() * Math.PI * 2,
        speed: 0.3 + Math.random() * 0.7,
      });
    }

    let t = 0;
    const tick = () => {
      t += 0.008;
      ctx.clearRect(0, 0, w, h);
      for (const p of particles) {
        p.x += p.vx + Math.sin(t * p.speed + p.phase) * 0.05;
        p.y += p.vy;
        if (p.y < -8) {
          p.y = h + 8;
          p.x = Math.random() * w;
        }
        if (p.x < -8) p.x = w + 8;
        if (p.x > w + 8) p.x = -8;

        const twinkle = 0.5 + 0.5 * Math.sin(t * p.speed * 2 + p.phase);
        const alpha = 0.04 + twinkle * 0.1;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(147, 164, 189, ${alpha})`;
        ctx.fill();
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
    };
  }, []);

  return (
    <div className="pointer-events-none fixed inset-0 overflow-hidden">
      {/* 情绪呼吸光晕：深海蓝→暗夜紫，居中 50vw，极度模糊，6 秒缓慢呼吸 */}
      <div
        className="mood-halo absolute left-1/2 top-1/2 h-[50vw] w-[50vw] rounded-full"
        style={{
          background:
            "radial-gradient(circle, rgba(78, 102, 176, 0.34) 0%, rgba(41, 55, 107, 0.2) 42%, rgba(15, 23, 42, 0.1) 62%, transparent 72%)",
          filter: "blur(70px)",
        }}
      />
      {/* 主光晕：偏青，位于上三分之一 */}
      <div
        className="glow-breathe absolute left-1/2 top-[28%] h-[60vmin] w-[60vmin] -translate-x-1/2 -translate-y-1/2 rounded-full"
        style={{
          background:
            "radial-gradient(circle, rgba(70, 96, 138, 0.16) 0%, rgba(70, 96, 138, 0.05) 42%, transparent 70%)",
          filter: "blur(10px)",
        }}
      />
      {/* 副光晕：偏暖，位于右下 */}
      <div
        className="glow-breathe-alt absolute right-[8%] bottom-[12%] h-[38vmin] w-[38vmin] rounded-full"
        style={{
          background:
            "radial-gradient(circle, rgba(160, 120, 70, 0.08) 0%, transparent 65%)",
          filter: "blur(14px)",
        }}
      />
      {/* 浮尘 */}
      <canvas ref={canvasRef} className="absolute inset-0" />

      {/* 按压压暗层 + 熄灯压暗层 */}
      <motion.div
        className="absolute inset-0 bg-black"
        animate={{
          opacity: Math.min(0.85, pressDepth * 0.7 + (lightsOut ? 0.45 : 0)),
        }}
        transition={{ duration: 0.6, ease: "easeOut" }}
      />
    </div>
  );
}
