/**
 * 情绪重量词典单测：
 * - 验收锚点：正面短句=0、高重量句≈0.81、危机判满、9字中性=0.375
 * - 输出恒在 0~1；长度不再是唯一变量（同字数正负文本重量不同）
 * - 下游插值端点与旧二态档位逐项对齐
 */
import { describe, it, expect } from "vitest";
import {
  emotionDissolve,
  emotionHeat,
  emotionRipple,
  emotionStardust,
  HEAVY_WEIGHT,
  weightEmotion,
} from "./emotionWeight";

describe("weightEmotion 重量锚点", () => {
  it("「哈哈今天真开心」轻灵：正面词抵消长度基线，钳到 0", () => {
    expect(weightEmotion("哈哈今天真开心")).toBe(0);
  });

  it("「我真的撑不下去了」沉重：约 0.81，过沉重阈值", () => {
    const w = weightEmotion("我真的撑不下去了");
    expect(w).toBeCloseTo(0.81, 2);
    expect(w).toBeGreaterThanOrEqual(HEAVY_WEIGHT);
  });

  it("9 字中性文本只有长度基线 0.375（无词典信号）", () => {
    expect(weightEmotion("今天下午开了个长会")).toBeCloseTo(0.375, 3);
  });

  it("危机标记直接判满", () => {
    expect(weightEmotion("随便写点什么", true)).toBe(1);
  });

  it("空文本为 0", () => {
    expect(weightEmotion("")).toBe(0);
  });
});

describe("weightEmotion 连续与边界", () => {
  it("输出始终落在 0~1（堆叠正面/负面词都被钳制）", () => {
    const light = weightEmotion("开心快乐幸福哈哈嘻嘻");
    const heavy = weightEmotion("绝望崩溃痛苦抑郁废物煎熬窒息受不了受不了");
    expect(light).toBeGreaterThanOrEqual(0);
    expect(light).toBeLessThanOrEqual(1);
    expect(heavy).toBeLessThanOrEqual(1);
    expect(heavy).toBe(1);
  });

  it("字数不再是唯一变量：同长度负面文本重于正面文本", () => {
    const neg = weightEmotion("绝望崩溃痛苦抑郁."); // 9 字符级
    const pos = weightEmotion("开心快乐幸福哈哈.");
    expect(neg).toBeGreaterThan(pos);
  });

  it("标点强度与三连重复字符追加重量", () => {
    expect(weightEmotion("怎么会这样！！")).toBeGreaterThan(weightEmotion("怎么会这样"));
    expect(weightEmotion("滚滚滚滚滚")).toBeGreaterThan(weightEmotion("滚"));
    // 笑声三连豁免：哈哈哈不按重复字符计
    const laugh = weightEmotion("哈哈哈哈哈");
    expect(laugh).toBe(0);
  });
});

describe("重量 → 涟漪插值（端点对齐旧二态）", () => {
  it("w=0：青白快波 120/3.4/1.7s/0.55", () => {
    const r = emotionRipple(0);
    expect(r.size).toBe(120);
    expect(r.scaleTo).toBe(3.4);
    expect(r.duration).toBe(1.7);
    expect(r.peak).toBe(0.55);
    expect(r.colors.border).toContain("103,232,249");
  });

  it("w=1：深紫巨波 200/6.5/4.4s/0.72", () => {
    const r = emotionRipple(1);
    expect(r.size).toBe(200);
    expect(r.scaleTo).toBe(6.5);
    expect(r.duration).toBe(4.4);
    expect(r.peak).toBe(0.72);
    expect(r.colors.border).toContain("167,139,250");
  });

  it("w=0.5 严格居中、随重量单调", () => {
    const mid = emotionRipple(0.5);
    expect(mid.size).toBe(160);
    expect(mid.duration).toBeCloseTo(3.05, 2);
    expect(emotionRipple(0.3).duration).toBeLessThan(emotionRipple(0.8).duration);
  });
});

describe("重量 → 其余物理量插值", () => {
  it("星尘：数量/重力/配色两端点", () => {
    const light = emotionStardust(0);
    const heavy = emotionStardust(1);
    expect(light.count).toBe(46);
    expect(light.gravity).toBeCloseTo(0.32, 2);
    expect(light.colors[0]).toBe("#67E8F9");
    expect(heavy.count).toBe(110);
    expect(heavy.gravity).toBeCloseTo(0.95, 2);
    expect(heavy.colors[0]).toBe("#b45309"); // toString(16) 输出小写
  });

  it("溶解 1s → 1.5s、加热 0.26 → 0.55，单调", () => {
    expect(emotionDissolve(0)).toBe(1);
    expect(emotionDissolve(1)).toBe(1.5);
    expect(emotionHeat(0)).toBeCloseTo(0.26, 2);
    expect(emotionHeat(1)).toBeCloseTo(0.55, 2);
  });
});
