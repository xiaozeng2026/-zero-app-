"use client";

/**
 * 星穹 —— 单 canvas 渲染层
 *
 * 旧实现：每颗恒星一个 motion.div + motion.button + motion.span，
 * 120 颗 = 240 个常驻 framer-motion 动画 + 多层 box-shadow，持续占着合成器。
 * 现实现：
 * - 视觉全部在一张 canvas 上由 rAF + 全局时间函数绘制（闪烁相位由 id 哈希稳定）；
 * - 位图缓存 / 绘制原语 / 布局数学在 src/lib/starRender.ts，与海报导出共用；
 * - 入场沿用旧弹簧语义（stiffness 160 / damping 14 的观感：easeOutBack，约 600ms）；
 * - DOM 只保留不可见命中按钮，悬停/触摸事件与音频链路一字不动
 *   （onMouseEnter/onTouchStart → playBellThrottled → bell → 13s 混响）。
 */

import { useEffect, useRef } from "react";
import type { Star } from "@/hooks/useStarStorage";
import { playBellThrottled } from "@/lib/audioEngine";
import { ENTRANCE_MS, drawStar } from "@/lib/starRender";

/** 触摸放大状态的最长保持（ms），兜底 touchend 丢失 */
const TAP_HOLD_MS = 650;

export default function StarCanvas({ stars }: { stars: Star[] }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  /** 最新恒星列表（rAF 读取，不触发重订阅） */
  const starsRef = useRef<Star[]>(stars);
  /** 每颗星第一次出现的时刻（入场弹簧；含首挂恢复的全部历史星，与旧 mount 行为一致） */
  const bornAtRef = useRef<Map<string, number>>(new Map());
  const hoverIdRef = useRef<string | null>(null);
  const tapIdRef = useRef<string | null>(null);
  const tapAtRef = useRef(0);

  useEffect(() => {
    starsRef.current = stars;
    const now = performance.now();
    const born = bornAtRef.current;
    for (const s of stars) {
      if (!born.has(s.id)) born.set(s.id, now);
    }
  }, [stars]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let w = 0;
    let h = 0;

    const resize = () => {
      w = window.innerWidth;
      h = window.innerHeight;
      // 与流星层一致的移动端 GPU 降档：窄屏 DPR 封顶 1.5
      const dpr = Math.min(
        window.devicePixelRatio || 1,
        w <= 640 ? 1.5 : 2
      );
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    window.addEventListener("resize", resize);

    let raf = 0;
    const render = (ts: number) => {
      const list = starsRef.current;
      ctx.clearRect(0, 0, w, h);

      // 触摸放大 650ms 后自动归位（兜底 touchend 丢失）
      if (tapIdRef.current && ts - tapAtRef.current > TAP_HOLD_MS) {
        tapIdRef.current = null;
      }

      // 悬停/触摸的恒星最后画，保证压在最上层
      let focusStar: Star | null = null;

      for (const s of list) {
        if (s.id === hoverIdRef.current || s.id === tapIdRef.current) {
          focusStar = s;
          continue;
        }
        drawStar(ctx, s, w, h, ts, bornAtRef.current.get(s.id));
      }
      if (focusStar) {
        const tapped = focusStar.id === tapIdRef.current;
        drawStar(
          ctx,
          focusStar,
          w,
          h,
          ts,
          bornAtRef.current.get(focusStar.id),
          tapped ? 1.7 : 2,
          tapped ? 0.45 : 0.6
        );
      }

      // 已完成入场的出生记录及时清掉，Map 不随会话膨胀
      const born = bornAtRef.current;
      if (born.size > list.length + 8) {
        for (const [id, t] of born) {
          if (ts - t > ENTRANCE_MS + 200) born.delete(id);
        }
      }

      if (!document.hidden) raf = requestAnimationFrame(render);
    };
    raf = requestAnimationFrame(render);

    // 标签页隐藏时 rAF 本就停摆；恢复时补一帧并续上循环
    const onVisible = () => {
      if (!document.hidden) {
        cancelAnimationFrame(raf);
        raf = requestAnimationFrame(render);
      }
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  /* ---- 交互：只接事件与音频，不承载视觉 ---- */
  const hoverStar = (id: string) => {
    hoverIdRef.current = id;
    playBellThrottled();
  };

  return (
    <div className="pointer-events-none fixed inset-0 z-10">
      <canvas ref={canvasRef} aria-hidden className="fixed inset-0" />

      {stars.map((s) => (
        <button
          key={s.id}
          type="button"
          aria-label="一颗恒星"
          className="pointer-events-auto absolute cursor-pointer rounded-full border-0 bg-transparent p-0"
          style={{
            left: `${s.x}%`,
            top: `${s.y}%`,
            width: s.size + 18,
            height: s.size + 18,
            transform: "translate(-50%, -50%)",
            WebkitTapHighlightColor: "transparent",
          }}
          onMouseEnter={() => hoverStar(s.id)}
          onMouseLeave={() => {
            if (hoverIdRef.current === s.id) hoverIdRef.current = null;
          }}
          onTouchStart={() => {
            // 触摸以 tap 放大（1.7x）为准；即便浏览器随后合成 mouseenter，
            // 绘制循环里 tap 优先于 hover，不会双重放大；音频仍只响这一声
            tapIdRef.current = s.id;
            tapAtRef.current = performance.now();
            playBellThrottled();
          }}
          onTouchEnd={() => {
            tapIdRef.current = null;
          }}
          onTouchCancel={() => {
            tapIdRef.current = null;
          }}
        />
      ))}
    </div>
  );
}
