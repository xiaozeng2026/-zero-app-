"use client";

/**
 * 星穹 —— 单 canvas 渲染层
 *
 * 旧实现：每颗恒星一个 motion.div + motion.button + motion.span，
 * 120 颗 = 240 个常驻 framer-motion 动画 + 多层 box-shadow，持续占着合成器。
 * 现实现：
 * - 视觉全部在一张 canvas 上由 rAF + 全局时间函数绘制（闪烁相位由 id 哈希稳定）；
 * - 恒星位图（径向渐变核心 + 三层辉光）按「颜色×整数尺寸」离屏缓存，
 *   最多 4 色 × 15 档 = 60 张，避免每帧重建 120 个渐变；
 * - 入场沿用旧弹簧语义（stiffness 160 / damping 14 的观感：easeOutBack，约 600ms）；
 * - DOM 只保留不可见命中按钮，悬停/触摸事件与音频链路一字不动
 *   （onMouseEnter/onTouchStart → playBellThrottled → bell → 13s 混响）。
 */

import { useEffect, useRef } from "react";
import type { Star } from "@/hooks/useStarStorage";
import { playBellThrottled } from "@/lib/audioEngine";

/* ------------------------------------------------------------------ */
/* 位图缓存                                                            */
/* ------------------------------------------------------------------ */

interface Sprite {
  canvas: HTMLCanvasElement;
  /** 位图对应的 CSS 像素边长（含辉光 padding） */
  css: number;
}

/** 辉光向外铺的余量（最大一层 shadow blur 52，58px 处已近零） */
const SPRITE_PAD = 58;
const SPRITE_RES = 2;

const spriteCache = new Map<string, Sprite>();

/** 按 颜色×整数尺寸 取（或懒构建）一张恒星位图；尺寸四舍五入，0.5px 内不可察 */
function getSprite(size: number, color: string): Sprite {
  const key = `${color}|${Math.round(size)}`;
  const hit = spriteCache.get(key);
  if (hit) return hit;

  const s = Math.round(size);
  const css = s + SPRITE_PAD * 2;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = Math.ceil(css * SPRITE_RES);
  const g = canvas.getContext("2d");
  if (g) {
    g.scale(SPRITE_RES, SPRITE_RES);
    g.translate(css / 2, css / 2);
    const r = s / 2;

    // 三层 box-shadow：用同源圆形的 shadowBlur 模拟，由大到小叠绘
    const shadowPasses: ReadonlyArray<readonly [string, number]> = [
      ["rgba(245,158,11,0.28)", 52],
      ["rgba(245,158,11,0.55)", 22],
      ["rgba(251,191,36,0.90)", 6],
    ];
    for (const [shadowColor, blur] of shadowPasses) {
      g.beginPath();
      g.arc(0, 0, r, 0, Math.PI * 2);
      g.shadowColor = shadowColor;
      g.shadowBlur = blur;
      g.fillStyle = shadowColor;
      g.fill();
    }

    // 核心径向渐变（对应旧 span 的 background）：
    // #FFFBEB 0% → 恒星色 42% → 琥珀 55% 68% → 透明 78%
    g.shadowColor = "transparent";
    g.shadowBlur = 0;
    const grad = g.createRadialGradient(0, 0, 0, 0, 0, r);
    grad.addColorStop(0, "#FFFBEB");
    grad.addColorStop(0.42, color);
    grad.addColorStop(0.68, "rgba(245,158,11,0.55)");
    grad.addColorStop(0.78, "rgba(245,158,11,0)");
    grad.addColorStop(1, "rgba(245,158,11,0)");
    g.beginPath();
    g.arc(0, 0, r, 0, Math.PI * 2);
    g.fillStyle = grad;
    g.fill();
  }

  const sprite: Sprite = { canvas, css };
  spriteCache.set(key, sprite);
  return sprite;
}

/* ------------------------------------------------------------------ */
/* 动画小工具                                                          */
/* ------------------------------------------------------------------ */

/** 稳定的闪烁相位：同 id 跨刷新同相 */
function phaseOf(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i += 1) {
    h = (h * 31 + id.charCodeAt(i)) % 100000;
  }
  return (h / 100000) * Math.PI * 2;
}

/** easeOutBack：近似旧弹簧 stiffness 160 / damping 14 的轻微超调落定 */
function easeOutBack(p: number): number {
  const c1 = 1.4;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(p - 1, 3) + c1 * Math.pow(p - 1, 2);
}

const ENTRANCE_MS = 600;
const TAP_HOLD_MS = 650;

/* ------------------------------------------------------------------ */
/* 纯布局：给定状态算出本帧的绘制参数（可单测，不依赖 DOM/canvas）        */
/* ------------------------------------------------------------------ */

export interface StarFrame {
  /** 画布像素中心 */
  cx: number;
  cy: number;
  /** drawImage 目标边长（CSS px，已含入场/悬停缩放） */
  drawW: number;
  /** 整体透明度（闪烁 × 入场） */
  alpha: number;
  /** 悬停/触摸加亮叠印强度（0=不叠） */
  focusGlow: number;
}

export function starFrame(
  s: Pick<Star, "id" | "x" | "y" | "size" | "twinkle">,
  w: number,
  h: number,
  ts: number,
  bornAt: number | undefined,
  focusScale: number,
  focusGlow: number
): StarFrame {
  // 全局时间闪烁：0.78 ↔ 1（旧 opacity keyframes [.78,1,.78] easeInOut 的余弦近似）
  const tw =
    0.89 +
    0.11 * Math.cos((ts / 1000 / s.twinkle) * Math.PI * 2 + phaseOf(s.id));

  // 入场弹簧（首挂/新增）；超 600ms 后恒为落定态
  let entrance = 1;
  let entranceAlpha = 1;
  if (bornAt !== undefined) {
    const p = Math.min(1, (ts - bornAt) / ENTRANCE_MS);
    if (p < 1) {
      entrance = Math.max(0, easeOutBack(p));
      entranceAlpha = 1 - Math.pow(1 - p, 2);
    }
  }

  const css = Math.round(s.size) + SPRITE_PAD * 2;
  return {
    cx: (s.x / 100) * w,
    cy: (s.y / 100) * h,
    drawW: css * entrance * focusScale,
    alpha: tw * entranceAlpha,
    focusGlow,
  };
}

/* ------------------------------------------------------------------ */
/* 组件                                                                */
/* ------------------------------------------------------------------ */

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
        drawStar(ctx, s, w, h, ts, bornAtRef.current, 1, 0);
      }
      if (focusStar) {
        const tapped = focusStar.id === tapIdRef.current;
        drawStar(
          ctx,
          focusStar,
          w,
          h,
          ts,
          bornAtRef.current,
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

/* ------------------------------------------------------------------ */
/* 单星绘制                                                            */
/* ------------------------------------------------------------------ */

function drawStar(
  ctx: CanvasRenderingContext2D,
  s: Star,
  w: number,
  h: number,
  ts: number,
  bornAt: Map<string, number>,
  focusScale: number,
  /** 悬停/触摸的加亮：lighter 混合模式再叠印一层的强度（0=不叠） */
  focusGlow: number
): void {
  const sprite = getSprite(s.size, s.color);
  const f = starFrame(s, w, h, ts, bornAt.get(s.id), focusScale, focusGlow);

  ctx.globalAlpha = f.alpha;
  ctx.drawImage(
    sprite.canvas,
    f.cx - f.drawW / 2,
    f.cy - f.drawW / 2,
    f.drawW,
    f.drawW
  );

  // 悬停/触摸：加性混合再叠一层，恒星整体「发亮」
  if (f.focusGlow > 0) {
    ctx.globalCompositeOperation = "lighter";
    ctx.globalAlpha = f.alpha * f.focusGlow;
    ctx.drawImage(
      sprite.canvas,
      f.cx - f.drawW / 2,
      f.cy - f.drawW / 2,
      f.drawW,
      f.drawW
    );
    ctx.globalCompositeOperation = "source-over";
  }

  ctx.globalAlpha = 1;
}
