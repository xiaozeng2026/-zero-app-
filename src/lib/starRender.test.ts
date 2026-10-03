/**
 * 恒星帧布局纯函数单测（canvas 渲染迁移的回归守卫）：
 * - 静止绘制边长 = 位图 css 边长（size + 2*PAD），位置=百分比坐标
 * - 悬停 2x / 触摸 1.7x 几何放大
 * - 出生瞬间边长 0、600ms 后落定，中途 easeOutBack 超调
 * - 闪烁 alpha 恒在 [0.78,1]
 */
import { describe, it, expect } from "vitest";
import { ENTRANCE_MS, SPRITE_PAD, starFrame } from "./starRender";
import type { Star } from "@/hooks/useStarStorage";

const s: Star = {
  id: "star-1",
  x: 50,
  y: 25,
  size: 19,
  color: "#FBBF24",
  twinkle: 4,
  timestamp: 0,
};

describe("starFrame 静止态", () => {
  it("位置按百分比映射，边长=size+2*PAD（19+116=135）", () => {
    const f = starFrame(s, 400, 800, 10_000, undefined, 1, 0);
    expect(f.cx).toBe(200);
    expect(f.cy).toBe(200);
    expect(f.drawW).toBe(135);
    expect(f.focusGlow).toBe(0);
  });

  it("闪烁透明度始终落在 0.78~1（扫描多个时刻）", () => {
    for (let ts = 0; ts < 8000; ts += 137) {
      const f = starFrame(s, 400, 800, ts, undefined, 1, 0);
      expect(f.alpha).toBeGreaterThanOrEqual(0.78 - 1e-9);
      expect(f.alpha).toBeLessThanOrEqual(1 + 1e-9);
    }
  });
});

describe("starFrame 悬停/触摸", () => {
  it("悬停 2x、触摸 1.7x 且携带加亮", () => {
    const hover = starFrame(s, 400, 800, 9_000, undefined, 2, 0.6);
    const tap = starFrame(s, 400, 800, 9_000, undefined, 1.7, 0.45);
    expect(hover.drawW).toBeCloseTo(270, 6);
    expect(hover.focusGlow).toBe(0.6);
    expect(tap.drawW).toBeCloseTo(229.5, 6);
    expect(tap.focusGlow).toBe(0.45);
  });

  it("同 id 的闪烁相位跨帧稳定（不随时间跳相）", () => {
    const a = starFrame({ ...s, id: "fixed" }, 100, 100, 1234, undefined, 1, 0);
    const b = starFrame({ ...s, id: "fixed" }, 100, 100, 5678, undefined, 1, 0);
    // 不同 ts alpha 一般不同，但两次同一 ts 结果必须完全一致
    const again = starFrame({ ...s, id: "fixed" }, 100, 100, 1234, undefined, 1, 0);
    expect(again.alpha).toBe(a.alpha);
    expect([a.alpha, b.alpha].every((v) => v >= 0.78 && v <= 1)).toBe(true);
  });
});

describe("starFrame 入场弹簧", () => {
  it("出生瞬间边长 0、透明度 0", () => {
    const f = starFrame(s, 400, 800, 1000, 1000, 1, 0);
    expect(f.drawW).toBe(0);
    expect(f.alpha).toBe(0);
  });

  it("中途 easeOutBack 超调（>静止边长），600ms 后精确落定", () => {
    const mid = starFrame(s, 400, 800, 1300, 1000, 1, 0);
    expect(mid.drawW).toBeGreaterThan(135);
    const done = starFrame(s, 400, 800, 1000 + ENTRANCE_MS, 1000, 1, 0);
    // 落定后几何精确；alpha 已交回闪烁项，与无入场态完全一致
    expect(done.drawW).toBe(135);
    const ref = starFrame(s, 400, 800, 1000 + ENTRANCE_MS, undefined, 1, 0);
    expect(done.alpha).toBe(ref.alpha);
  });
});

describe("SPRITE_PAD 常量", () => {
  it("辉光余量 58px（最外 shadow 52 不被裁切）", () => {
    expect(SPRITE_PAD).toBe(58);
  });
});
