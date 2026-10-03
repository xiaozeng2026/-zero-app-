/**
 * 星云温度指数冷却纯函数单测：
 * - 半衰期精确：28s 减半、56s 再减半
 * - 零温/零/负 dt 的边界
 * - 低于 epsilon 归零（避免浮点尾巴让 rAF 永转）
 * - 随时间严格单调下降
 */
import { describe, it, expect } from "vitest";
import {
  coolNebula,
  NEBULA_COOL_HALFLIFE,
  NEBULA_ZERO_EPSILON,
} from "./nebula";

describe("coolNebula 指数冷却", () => {
  it("一个半衰期（28s）恰好减半", () => {
    expect(coolNebula(1, NEBULA_COOL_HALFLIFE)).toBeCloseTo(0.5, 10);
  });

  it("两个半衰期再减半", () => {
    expect(coolNebula(1, NEBULA_COOL_HALFLIFE * 2)).toBeCloseTo(0.25, 10);
  });

  it("任意初温都按比例衰减（加热值 0.55 一个半衰期约 0.275）", () => {
    expect(coolNebula(0.55, NEBULA_COOL_HALFLIFE)).toBeCloseTo(0.275, 10);
  });

  it("支持自定义半衰期", () => {
    expect(coolNebula(1, 10, 10)).toBeCloseTo(0.5, 10);
  });

  it("随时间严格单调下降（逐帧 0.1s）", () => {
    let t = 0.8;
    let prev = t;
    for (let i = 0; i < 50; i += 1) {
      t = coolNebula(t, 0.1);
      expect(t).toBeLessThan(prev);
      prev = t;
    }
  });
});

describe("coolNebula 边界", () => {
  it("零温恒零", () => {
    expect(coolNebula(0, 1)).toBe(0);
    expect(coolNebula(-0.5, 1)).toBe(0);
  });

  it("dt=0 或负值时温度不变（首帧/异常帧）", () => {
    expect(coolNebula(0.5, 0)).toBe(0.5);
    expect(coolNebula(0.5, -1)).toBe(0.5);
  });

  it("衰减到 epsilon 以下直接归零", () => {
    const almost = NEBULA_ZERO_EPSILON * 0.9;
    expect(coolNebula(almost, 0.016)).toBe(0);
  });
});
