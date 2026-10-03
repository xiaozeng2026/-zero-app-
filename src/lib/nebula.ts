/**
 * 星云温度热力学 —— 纯函数
 *
 * T(t) = T0 · 0.5^(dt / 半衰期)：非线性指数冷却，
 * 前段温吞（回车后暖光会停留一阵）、后段悠长（约 5 个半衰期 ≈ 2.5 分钟回冷）。
 * 从 useFxLayer 的 rAF 中抽出，便于单测；hook 只负责按帧喂 dt。
 */

/** 冷却半衰期（秒） */
export const NEBULA_COOL_HALFLIFE = 28;
/** 低于此温度直接归零，避免浮点尾巴让 rAF 永远算下去 */
export const NEBULA_ZERO_EPSILON = 0.002;

/**
 * 推进一次星云温度
 * @param temp      当前温度（≥0）
 * @param dtSeconds 距上一帧的秒数（调用方负责把异常大的帧间隔截断）
 * @param halflife  半衰期秒数，默认 28
 */
export function coolNebula(
  temp: number,
  dtSeconds: number,
  halflife: number = NEBULA_COOL_HALFLIFE
): number {
  if (temp <= 0) return 0;
  if (!(dtSeconds > 0)) return temp;
  const next = temp * Math.pow(0.5, dtSeconds / halflife);
  return next < NEBULA_ZERO_EPSILON ? 0 : next;
}
