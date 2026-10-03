/**
 * 情绪重量 —— 本地加权词典 + 标点/重复字符信号，输出 0~1 连续重量
 *
 * 替代旧的「字数 >=10」二态判定：
 * - 负面词加权、正面词减权（按出现次数累计，单词封顶防堆叠刷分）；
 * - 长度给基线（保持旧行为：10 字中性文本 ≈ 0.5 沉重阈值）；
 * - 标点强度（！？…）与连续重复字符（啊啊啊）追加情绪强度；
 * - 危机文本（见 crisis.ts）直接判满重。
 *
 * 下游所有表现（涟漪/星尘/星云加热/溶解时长/音效）都由该连续值插值，
 * emotionRipple / emotionStardust 在 w=0 与 w=1 的取值与旧二态档位逐一对齐。
 */

/* ------------------------------------------------------------------ */
/* 词典                                                                */
/* ------------------------------------------------------------------ */

/** 负面信号：权重 = 情绪向下跌落的幅度 */
const NEGATIVE_WORDS: Readonly<Record<string, number>> = {
  绝望: 1.8,
  痛苦: 1.4,
  崩溃: 1.4,
  抑郁: 1.4,
  废物: 1.4,
  喘不过气: 1.3,
  煎熬: 1.3,
  撑不下去: 2,
  撑不住: 1.3,
  无助: 1.2,
  心碎: 1.2,
  压抑: 1.1,
  窒息: 1.2,
  空虚: 1.1,
  没用: 1.1,
  没意义: 1.1,
  扛不住: 1.2,
  难过: 0.8,
  难受: 0.8,
  失望: 0.8,
  委屈: 0.9,
  孤独: 0.9,
  寂寞: 0.8,
  焦虑: 1,
  想哭: 0.8,
  受不了: 1,
  没意思: 1,
  无力: 1,
  麻木: 0.9,
  眼泪: 0.6,
  孤单: 0.7,
  恐惧: 1,
  害怕: 0.7,
  愤怒: 0.9,
  压力: 0.7,
  低落: 0.8,
  彷徨: 0.8,
  迷茫: 0.6,
  心烦: 0.8,
  烦躁: 0.8,
  好烦: 0.7,
  很烦: 0.7,
  烦死: 0.9,
  好累: 0.7,
  太累: 0.7,
  累死: 0.9,
  疲惫: 0.7,
  糟糕: 0.7,
  糟透了: 1.2,
  讨厌: 0.6,
  失败: 0.9,
  哭: 0.5,
  恨: 0.6,
  生气: 0.5,
  心痛: 1,
};

/** 正面信号：负权重，把重量往上托 */
const POSITIVE_WORDS: Readonly<Record<string, number>> = {
  开心: 1,
  高兴: 1,
  快乐: 1,
  幸福: 1,
  好起来: 0.8,
  治愈: 0.8,
  哈哈: 0.8,
  棒: 0.7,
  喜欢: 0.7,
  轻松: 0.7,
  美好: 0.7,
  嘻嘻: 0.6,
  满足: 0.6,
  温暖: 0.6,
  放松: 0.6,
  舒服: 0.6,
  安心: 0.6,
  踏实: 0.6,
  希望: 0.5,
  期待: 0.5,
  不错: 0.5,
  谢谢: 0.4,
  感谢: 0.5,
  温柔: 0.4,
  爱: 0.5,
  笑: 0.3,
};

/** 情绪标点（！？…～）的强度信号 */
const INTENSE_PUNCT = /[!！?？…~～]/g;
/** 连续重复 ≥3 的字（啊啊啊/滚滚滚）；笑声叹词不计（哈哈哈本身是正面信号） */
const REPEAT_RUN = /(.)\1{2,}/g;
const REPEAT_EXCLUDE = new Set(["哈", "嘻", "嘿", "呵"]);

/* ------------------------------------------------------------------ */
/* 基础数值工具                                                        */
/* ------------------------------------------------------------------ */

export function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** #RRGGBB 线性插值（粒子配色用） */
export function mixHex(a: string, b: string, t: number): string {
  const pa = parseInt(a.slice(1), 16);
  const pb = parseInt(b.slice(1), 16);
  const r = Math.round(lerp((pa >> 16) & 255, (pb >> 16) & 255, t));
  const g = Math.round(lerp((pa >> 8) & 255, (pb >> 8) & 255, t));
  const bl = Math.round(lerp(pa & 255, pb & 255, t));
  return `#${((1 << 24) + (r << 16) + (g << 8) + bl).toString(16).slice(1)}`;
}

/* ------------------------------------------------------------------ */
/* 重量计算                                                            */
/* ------------------------------------------------------------------ */

/** 词典分：负面累加、正面扣减，每个词最多计 3 次 */
function dictionaryScore(text: string): number {
  let score = 0;
  const tally = (dict: Readonly<Record<string, number>>, sign: 1 | -1) => {
    for (const [word, w] of Object.entries(dict)) {
      let count = 0;
      let from = 0;
      while (true) {
        const i = text.indexOf(word, from);
        if (i < 0) break;
        count += 1;
        from = i + word.length;
        if (count >= 3) break;
      }
      score += sign * count * w;
    }
  };
  tally(NEGATIVE_WORDS, 1);
  tally(POSITIVE_WORDS, -1);
  return score;
}

/** 标点强度：每个情绪标点 +0.05，封顶 0.10 */
function punctuationScore(text: string): number {
  const n = (text.match(INTENSE_PUNCT) ?? []).length;
  return Math.min(0.1, n * 0.05);
}

/** 重复字符强度：每段三连以上 +0.08，封顶 0.15 */
function repetitionScore(text: string): number {
  INTENSE_PUNCT.lastIndex = 0;
  REPEAT_RUN.lastIndex = 0;
  let runs = 0;
  for (const m of text.matchAll(REPEAT_RUN)) {
    if (!REPEAT_EXCLUDE.has(m[1])) runs += 1;
  }
  return Math.min(0.15, runs * 0.08);
}

/**
 * 情绪重量 0（轻灵）~ 1（沉重）
 * @param text   已 trim 的输入
 * @param crisis 危机判定命中（由调用方先跑 detectCrisis）
 */
export function weightEmotion(text: string, crisis = false): number {
  if (crisis) return 1;
  const len = text.length;
  if (len === 0) return 0;

  // 长度基线：6 字起算；10 字中性文本 = 0.5 沉重阈值（对齐旧二态判定）；
  // 14 字到顶 0.75，把顶段留给真正的负面词/危机语义
  const lengthBase = clamp01((len - 6) / 6) * 0.75;
  const score = dictionaryScore(text) * 0.28;

  return clamp01(lengthBase + score + punctuationScore(text) + repetitionScore(text));
}

/* ------------------------------------------------------------------ */
/* 重量 → 表现插值（端点与旧二态档位逐项对齐）                          */
/* ------------------------------------------------------------------ */

/** 沉重触觉阈值（haptics 只有二态 API） */
export const HEAVY_WEIGHT = 0.5;

interface RGBA {
  r: number;
  g: number;
  b: number;
  a: number;
}

const RIPPLE_LIGHT = {
  border: { r: 103, g: 232, b: 249, a: 0.5 },
  glow: { r: 34, g: 211, b: 238, a: 0.26 },
  core: { r: 34, g: 211, b: 238, a: 0.08 },
};
const RIPPLE_HEAVY = {
  border: { r: 167, g: 139, b: 250, a: 0.55 },
  glow: { r: 124, g: 58, b: 237, a: 0.3 },
  core: { r: 139, g: 92, b: 246, a: 0.1 },
};

const rgba = (c: RGBA): string =>
  `rgba(${c.r},${c.g},${c.b},${c.a.toFixed(2)})`;
const mixRgba = (a: RGBA, b: RGBA, t: number): RGBA => ({
  r: Math.round(lerp(a.r, b.r, t)),
  g: Math.round(lerp(a.g, b.g, t)),
  b: Math.round(lerp(a.b, b.b, t)),
  a: lerp(a.a, b.a, t),
});

export interface RippleColors {
  border: string;
  glow: string;
  core: string;
}

/** 涟漪几何 + 配色（w=0 青白快波 / w=1 深紫巨波） */
export function emotionRipple(w: number): {
  size: number;
  scaleTo: number;
  duration: number;
  peak: number;
  colors: RippleColors;
} {
  return {
    size: Math.round(lerp(120, 200, w)),
    scaleTo: +lerp(3.4, 6.5, w).toFixed(2),
    duration: +lerp(1.7, 4.4, w).toFixed(2),
    peak: +lerp(0.55, 0.72, w).toFixed(2),
    colors: {
      border: w === 0 ? rgba(RIPPLE_LIGHT.border) : rgba(mixRgba(RIPPLE_LIGHT.border, RIPPLE_HEAVY.border, w)),
      glow: w === 0 ? rgba(RIPPLE_LIGHT.glow) : rgba(mixRgba(RIPPLE_LIGHT.glow, RIPPLE_HEAVY.glow, w)),
      core: w === 0 ? rgba(RIPPLE_LIGHT.core) : rgba(mixRgba(RIPPLE_LIGHT.core, RIPPLE_HEAVY.core, w)),
    },
  };
}

const STARDUST_LIGHT = ["#67E8F9", "#7DD3FC", "#BAE6FD", "#A5F3FC", "#FFFFFF"];
const STARDUST_HEAVY = ["#B45309", "#D97706", "#F59E0B", "#FBBF24", "#FDE68A"];

/** 星尘两束爆裂的参数（数量/重力/配色按重量插值） */
export function emotionStardust(w: number): {
  colors: string[];
  scalar: number;
  gravity: number;
  decay: number;
  ticks: number;
  count: number;
  spread: number;
  velocity: number;
  upCount: number;
  upSpread: number;
  upVelocity: number;
  upScalar: number;
} {
  const mix = (a: number, b: number) => +lerp(a, b, w).toFixed(3);
  return {
    colors: STARDUST_LIGHT.map((c, i) => (w === 0 ? c : mixHex(c, STARDUST_HEAVY[i], w))),
    scalar: mix(0.8, 1.05),
    gravity: mix(0.32, 0.95),
    decay: mix(0.93, 0.95),
    ticks: Math.round(lerp(200, 300, w)),
    count: Math.round(lerp(46, 110, w)),
    spread: Math.round(lerp(70, 92, w)),
    velocity: Math.round(lerp(28, 40, w)),
    upCount: Math.round(lerp(16, 30, w)),
    upSpread: 42,
    upVelocity: Math.round(lerp(44, 42, w)),
    upScalar: mix(0.65, 0.85),
  };
}

/** 星云加热增量（轻 0.26 / 重 0.55） */
export function emotionHeat(w: number): number {
  return +lerp(0.26, 0.55, w).toFixed(3);
}

/** 文字溶解时长（轻 1s / 重 1.5s） */
export function emotionDissolve(w: number): number {
  return +lerp(1, 1.5, w).toFixed(2);
}
