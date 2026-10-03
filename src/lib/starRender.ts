/**
 * 恒星渲染原语 —— 供屏幕 canvas 层（StarCanvas）与海报导出（starExport）共用，
 * 保证「所见的星穹」与「导出的星穹」出自同一份绘制代码。
 *
 * 本模块只操作调用方传入的 CanvasRenderingContext2D，不碰 React/DOM 事件；
 * 位图缓存按「颜色 × 整数尺寸」懒构建，进程级复用，最多 4 色 × 15 档 = 60 张。
 */

import type { Star } from "@/hooks/useStarStorage";

/* ------------------------------------------------------------------ */
/* 位图缓存                                                            */
/* ------------------------------------------------------------------ */

export interface Sprite {
  canvas: HTMLCanvasElement;
  /** 位图对应的 CSS 像素边长（含辉光 padding） */
  css: number;
}

/** 辉光向外铺的余量（最大一层 shadow blur 52，58px 处已近零） */
export const SPRITE_PAD = 58;
const SPRITE_RES = 2;

const spriteCache = new Map<string, Sprite>();

/** 按 颜色×整数尺寸 取（或懒构建）一张恒星位图；尺寸四舍五入，0.5px 内不可察 */
export function getSprite(size: number, color: string): Sprite {
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
export function phaseOf(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i += 1) {
    h = (h * 31 + id.charCodeAt(i)) % 100000;
  }
  return (h / 100000) * Math.PI * 2;
}

/** easeOutBack：近似旧弹簧 stiffness 160 / damping 14 的轻微超调落定 */
export function easeOutBack(p: number): number {
  const c1 = 1.4;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(p - 1, 3) + c1 * Math.pow(p - 1, 2);
}

export const ENTRANCE_MS = 600;

/* ------------------------------------------------------------------ */
/* 纯布局：给定状态算出本帧的绘制参数（不依赖 DOM/canvas，可单测）        */
/* ------------------------------------------------------------------ */

export interface StarFrame {
  /** 画布像素中心 */
  cx: number;
  cy: number;
  /** drawImage 目标边长（px，已含入场/悬停缩放） */
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
/* 绘制：把一颗恒星画到给定 ctx 的指定位置（屏幕与导出共用）              */
/* ------------------------------------------------------------------ */

/**
 * @param focusScale 悬停/触摸放大倍数（1=常态，2=悬停，1.7=触摸）
 * @param focusGlow  加性叠印亮度（0=常态）
 */
export function drawStar(
  ctx: CanvasRenderingContext2D,
  s: Star,
  w: number,
  h: number,
  ts: number,
  bornAt: number | undefined,
  focusScale = 1,
  focusGlow = 0
): void {
  const sprite = getSprite(s.size, s.color);
  const f = starFrame(s, w, h, ts, bornAt, focusScale, focusGlow);

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
