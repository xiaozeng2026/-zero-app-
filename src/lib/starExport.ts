/**
 * 星穹导出 —— 纯前端，把当前星穹渲染为 PNG 海报 + 打包 JSON 数据
 *
 * - 零网络请求、零后端：离屏 canvas 当场绘制，a[download] 本地落盘；
 * - 海报渲染复用 src/lib/starRender 的同一套恒星原语，所见即所得；
 * - 不产生任何可见 UI，调用时机由页面的「长按输入框」手势决定。
 */

import type { Star } from "@/hooks/useStarStorage";
import { drawStar } from "@/lib/starRender";

/** 海报尺寸 1080×1920（9:16，适合手机锁屏/社交平台） */
export const POSTER_W = 1080;
export const POSTER_H = 1920;
/** 海报以「450×800 逻辑视口」为基准整体放大，星点相对尺度接近手机实机 */
const POSTER_SCALE = POSTER_W / 450;

/** JSON 导出格式版本 */
export const STARSCAPE_JSON_FORMAT = "zero-starscape/1";

/** 时间戳 → 本地紧凑文件名片段 20260611-1630 */
function stamp(d = new Date()): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return (
    `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}` +
    `-${p(d.getHours())}${p(d.getMinutes())}`
  );
}

/**
 * 把星穹绘制到一张离屏 canvas（不挂载到 DOM）
 * @param now 闪烁时间基准；不传取当前 performance.now()
 */
export function renderPosterCanvas(
  stars: Star[],
  now: number = typeof performance !== "undefined" ? performance.now() : 0
): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = POSTER_W;
  canvas.height = POSTER_H;
  const ctx = canvas.getContext("2d");
  if (!ctx) return canvas;

  // 深空底：近黑的靛蓝纵向渐变 + 上半部一丝暖紫，贴近应用实机观感
  const bg = ctx.createLinearGradient(0, 0, 0, POSTER_H);
  bg.addColorStop(0, "#0a0718");
  bg.addColorStop(0.45, "#07040f");
  bg.addColorStop(1, "#030208");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, POSTER_W, POSTER_H);

  const halo = ctx.createRadialGradient(
    POSTER_W / 2,
    POSTER_H * 0.28,
    0,
    POSTER_W / 2,
    POSTER_H * 0.28,
    POSTER_W * 0.62
  );
  halo.addColorStop(0, "rgba(124,58,237,0.10)");
  halo.addColorStop(0.5, "rgba(88,28,135,0.05)");
  halo.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = halo;
  ctx.fillRect(0, 0, POSTER_W, POSTER_H);

  // 恒星层：逻辑坐标 450×800，再整体放大到海报分辨率
  ctx.save();
  ctx.scale(POSTER_SCALE, POSTER_SCALE);
  for (const s of stars) {
    drawStar(ctx, s, 450, 800, now, undefined);
  }
  ctx.restore();

  // 底部：极克制的落款（发丝线 + 疏排小字），无任何说明文案
  const wordmarkY = POSTER_H * 0.86;
  ctx.strokeStyle = "rgba(254,243,199,0.18)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(POSTER_W / 2 - 92, wordmarkY - 34);
  ctx.lineTo(POSTER_W / 2 + 92, wordmarkY - 34);
  ctx.stroke();

  ctx.fillStyle = "rgba(255,251,235,0.42)";
  ctx.font = "300 30px ui-sans-serif, system-ui, -apple-system, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("归 零   Z e r o", POSTER_W / 2, wordmarkY + 8);

  return canvas;
}

/** 星穹数据的可移植 JSON 信封（不丢任何 Star 字段） */
export function starscapeJson(stars: Star[], at = new Date()): string {
  return JSON.stringify(
    {
      app: "zero",
      format: STARSCAPE_JSON_FORMAT,
      exportedAt: at.toISOString(),
      count: stars.length,
      stars,
    },
    null,
    2
  );
}

function download(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  // 给浏览器一点时间真正开始下载再回收
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

export interface ExportResult {
  ok: boolean;
  pngName: string;
  jsonName: string;
}

/**
 * 导出当前星穹：一张 PNG 海报 + 一份 JSON 数据。
 * 空星穹不触发任何下载。整个过程不发声、不弹窗、不改变页面状态。
 */
export function exportStarscape(stars: Star[]): ExportResult {
  const base = `zero-starscape-${stamp()}`;
  const pngName = `${base}.png`;
  const jsonName = `${base}.json`;
  if (stars.length === 0) return { ok: false, pngName, jsonName };

  // JSON 立即落盘
  try {
    download(
      new Blob([starscapeJson(stars)], { type: "application/json" }),
      jsonName
    );
  } catch {
    /* 个别隐私浏览器禁用 Blob 链接：静默，不影响 PNG */
  }

  // PNG 经离屏 canvas 编码
  try {
    renderPosterCanvas(stars).toBlob((blob) => {
      if (blob) download(blob, pngName);
    }, "image/png");
  } catch {
    /* 内存不足等极端情况：静默 */
  }

  return { ok: true, pngName, jsonName };
}
