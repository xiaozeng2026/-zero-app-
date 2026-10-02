/**
 * 生物钟环境（Circadian Ambience）—— 全天唯一参数事实源
 *
 * 时段划分（本地时间）：
 * - night   深夜 00:00–05:59：纯黑为主、星尘漂浮最慢、混响最大、Drone 最远 → 绝对静谧
 * - day     白天 06:00–18:59：极暗深海蓝微透、波纹略轻快、Drone 稍清晰
 * - evening 傍晚 19:00–23:59：基准态（暖金宇宙的默认观感）
 *
 * 所有视觉层 / 音频引擎只消费本文件的 token，不在各处硬编码时段参数。
 */

export type CircadianPhase = "night" | "day" | "evening";

/** @param date 默认当前时刻；可传参便于测试 */
export function getCircadianPhase(date: Date = new Date()): CircadianPhase {
  const h = date.getHours();
  if (h <= 5) return "night";
  if (h <= 18) return "day";
  return "evening";
}

/** 距下一个时段边界（00:00 / 06:00 / 19:00）的毫秒数 */
export function msUntilNextPhase(date: Date = new Date()): number {
  const boundaries = [0, 6, 19];
  const candidates = boundaries.map((h) => {
    const d = new Date(date);
    d.setSeconds(0, 0);
    d.setHours(h, 0, 0, 0);
    if (d.getTime() <= date.getTime()) d.setDate(d.getDate() + 1);
    return d;
  });
  return Math.min(...candidates.map((d) => d.getTime() - date.getTime()));
}

export interface CircadianTokens {
  /** 星野漂浮速度区间（tsparticles move.speed） */
  starSpeed: { min: number; max: number };
  /** 波纹时长倍率：>1 更慢更沉，<1 更轻快 */
  ripplePace: number;
  /** 星云奇观层整体压暗系数（深夜 0.82，让纯黑主导） */
  nebulaDim: number;
  /** 底色薄纱：盖在固定渐变之上的一层颜色（opacity 可平滑过渡） */
  veil: { color: string; opacity: number };
  /** 音频参数 */
  audio: {
    /** 主混响湿度：深夜最大，白天稍干更清晰 */
    reverbWet: number;
    /** Drone 底噪音量 */
    droneGain: number;
    /** Drone 低通 LFO 起伏区间（Hz）：深夜闷而远，白天透一点 */
    droneLfo: { min: number; max: number };
  };
}

export const CIRCADIAN_TOKENS: Record<CircadianPhase, CircadianTokens> = {
  night: {
    starSpeed: { min: 0.06, max: 0.18 },
    ripplePace: 1.08,
    nebulaDim: 0.82,
    // 纯黑薄纱：把 #020111 的蓝紫底进一步压成近纯黑
    veil: { color: "#000000", opacity: 0.55 },
    audio: {
      reverbWet: 0.82,
      droneGain: 0.04,
      droneLfo: { min: 80, max: 180 },
    },
  },
  day: {
    starSpeed: { min: 0.12, max: 0.36 },
    ripplePace: 0.92,
    nebulaDim: 1,
    // 极暗深海蓝：只微微透出，不破坏深空基调
    veil: { color: "#0a1c3d", opacity: 0.28 },
    audio: {
      reverbWet: 0.66,
      droneGain: 0.052,
      droneLfo: { min: 130, max: 280 },
    },
  },
  evening: {
    starSpeed: { min: 0.1, max: 0.3 },
    ripplePace: 1,
    nebulaDim: 1,
    veil: { color: "#000000", opacity: 0 },
    audio: {
      reverbWet: 0.72,
      droneGain: 0.045,
      droneLfo: { min: 90, max: 220 },
    },
  },
};
