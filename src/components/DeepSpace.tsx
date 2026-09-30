"use client";

import { useMemo } from "react";
import dynamic from "next/dynamic";
import { loadFull } from "tsparticles";
import type { Engine, ISourceOptions } from "tsparticles-engine";

const Particles = dynamic(() => import("react-tsparticles"), {
  ssr: false,
  loading: () => null,
});

interface LayerSpec {
  id: string;
  count: number;
  sizeMin: number;
  sizeMax: number;
  opMin: number;
  opMax: number;
  speed: number;
  parallaxForce: number;
  twinkleFreq: number;
  colors: string[];
}

/**
 * 三层纵深星野：
 * 远层 小/暗/慢、视差位移小；近层 大/亮/快、视差位移大。
 * 鼠标移动时三层错位量不同，产生三维空间纵深感。
 */
const LAYERS: LayerSpec[] = [
  {
    id: "stars-far",
    count: 120,
    sizeMin: 0.3,
    sizeMax: 0.9,
    opMin: 0.08,
    opMax: 0.3,
    speed: 0.06,
    parallaxForce: 8,
    twinkleFreq: 0.02,
    colors: ["#8fb6ff", "#c4d0f5"],
  },
  {
    id: "stars-mid",
    count: 85,
    sizeMin: 0.6,
    sizeMax: 1.5,
    opMin: 0.15,
    opMax: 0.5,
    speed: 0.14,
    parallaxForce: 20,
    twinkleFreq: 0.035,
    colors: ["#d6e0ff", "#8fb6ff", "#a98cff"],
  },
  {
    id: "stars-near",
    count: 50,
    sizeMin: 1.1,
    sizeMax: 2.4,
    opMin: 0.25,
    opMax: 0.7,
    speed: 0.28,
    parallaxForce: 42,
    twinkleFreq: 0.05,
    colors: ["#eef3ff", "#a98cff", "#ffdfae", "#8fe6ff"],
  },
];

/**
 * 浩瀚深空背景（最底层 z-0）
 *
 * - 径向渐变：中心极暗深空蓝 #020111 → 边缘纯黑
 * - 三团极暗星云气体（青蓝 / 幽紫），60~100s 几乎不可察地漂移
 * - 三层 tsparticles 星野：大小分层、低频 twinkle、
 *   move.direction="inside" 缓慢向中心坍缩 + 分层鼠标视差
 */
export default function DeepSpace() {
  const layerOptions = useMemo(
    () =>
      LAYERS.map<ISourceOptions>((l) => ({
        fullScreen: false,
        fpsLimit: 48,
        detectRetina: false, // 三层 canvas，关闭 DPR 倍增控制开销
        background: { color: { value: "transparent" } },
        particles: {
          number: { value: l.count, density: { enable: false } },
          color: { value: l.colors },
          opacity: { value: { min: l.opMin, max: l.opMax } },
          size: { value: { min: l.sizeMin, max: l.sizeMax } },
          lineLinked: { enable: false },
          twinkle: {
            particles: { enable: true, frequency: l.twinkleFreq, opacity: 1 },
          },
          move: {
            enable: true,
            speed: l.speed,
            direction: "inside",
            random: true,
            straight: false,
            outModes: { default: "out" },
          },
        },
        interactivity: {
          detectsOn: "window",
          events: {
            onHover: {
              enable: true,
              mode: "parallax",
              parallax: {
                enable: true,
                force: l.parallaxForce,
                smooth: 30,
              },
            },
          },
        },
      })),
    []
  );

  return (
    <div className="pointer-events-none fixed inset-0 z-0 overflow-hidden bg-black">
      {/* 深空径向渐变 */}
      <div
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse 120% 100% at 50% 42%, #020111 0%, #02010c 38%, #000000 78%)",
        }}
      />

      {/* 极暗星云气体：三层错位、超慢漂移，透明度刻意压到 0.1 以下 */}
      <div
        aria-hidden
        className="nebula nebula-a absolute left-[-12%] top-[-18%] h-[70vmin] w-[70vmin] rounded-full"
        style={{
          background:
            "radial-gradient(circle, rgba(38,62,150,0.16) 0%, rgba(28,40,110,0.07) 46%, transparent 70%)",
          filter: "blur(90px)",
        }}
      />
      <div
        aria-hidden
        className="nebula nebula-b absolute right-[-14%] top-[26%] h-[62vmin] w-[62vmin] rounded-full"
        style={{
          background:
            "radial-gradient(circle, rgba(86,40,150,0.13) 0%, rgba(50,24,100,0.06) 48%, transparent 72%)",
          filter: "blur(100px)",
        }}
      />
      <div
        aria-hidden
        className="nebula nebula-c absolute bottom-[-20%] left-[18%] h-[58vmin] w-[58vmin] rounded-full"
        style={{
          background:
            "radial-gradient(circle, rgba(16,72,110,0.12) 0%, rgba(10,44,70,0.05) 50%, transparent 74%)",
          filter: "blur(110px)",
        }}
      />

      {/* 三层纵深星野（远 → 近，后绘制的在上层） */}
      {LAYERS.map((l, i) => (
        <Particles
          key={l.id}
          id={l.id}
          className="absolute inset-0"
          init={async (engine: Engine) => {
            await loadFull(engine);
          }}
          options={layerOptions[i]}
        />
      ))}
    </div>
  );
}
