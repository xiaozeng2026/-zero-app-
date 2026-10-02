/**
 * circadian 纯逻辑单测：
 * - 时段边界（深夜 00-05 / 白天 06-18 / 傍晚 19-23）
 * - 距下一边界毫秒数
 * - token 表跨时段单调性与取值合法性（防止抄重/越界）
 */
import { describe, it, expect } from "vitest";
import {
  getCircadianPhase,
  msUntilNextPhase,
  CIRCADIAN_TOKENS,
  type CircadianPhase,
} from "./circadian";

const at = (h: number, m = 0, s = 0) => new Date(2026, 9, 3, h, m, s);

describe("getCircadianPhase 时段边界", () => {
  it.each<[number, number, CircadianPhase]>([
    [0, 0, "night"],
    [5, 59, "night"],
    [6, 0, "day"],
    [12, 30, "day"],
    [18, 59, "day"],
    [19, 0, "evening"],
    [23, 59, "evening"],
  ])("%02i:%02i → %s", (h, m, want) => {
    expect(getCircadianPhase(at(h, m))).toBe(want);
  });
});

describe("msUntilNextPhase 距下一边界", () => {
  const SECOND = 1000;
  const MINUTE = 60 * SECOND;
  const HOUR = 60 * MINUTE;

  it("00:30 → 06:00（5 小时 30 分）", () => {
    expect(msUntilNextPhase(at(0, 30))).toBe(5 * HOUR + 30 * MINUTE);
  });

  it("05:59:30 → 06:00（30 秒）", () => {
    expect(msUntilNextPhase(at(5, 59, 30))).toBe(30 * SECOND);
  });

  it("18:59:59 → 19:00（1 秒）", () => {
    expect(msUntilNextPhase(at(18, 59, 59))).toBe(SECOND);
  });

  it("23:59:59 → 次日 00:00（1 秒，跨天）", () => {
    expect(msUntilNextPhase(at(23, 59, 59))).toBe(SECOND);
  });

  it("恰好处于边界时刻：当前边界视为已过，给下一个", () => {
    expect(msUntilNextPhase(at(0, 0))).toBe(6 * HOUR);
    expect(msUntilNextPhase(at(6, 0))).toBe(13 * HOUR);
    expect(msUntilNextPhase(at(19, 0))).toBe(5 * HOUR);
  });
});

describe("CIRCADIAN_TOKENS 参数表", () => {
  const phases = Object.keys(CIRCADIAN_TOKENS) as CircadianPhase[];

  it("恰好三个时段且键名固定", () => {
    expect(phases.sort()).toEqual(["day", "evening", "night"]);
  });

  it("每个时段字段完整且取值合法", () => {
    for (const phase of phases) {
      const t = CIRCADIAN_TOKENS[phase];
      expect(t.starSpeed.min).toBeGreaterThan(0);
      expect(t.starSpeed.max).toBeGreaterThan(t.starSpeed.min);
      expect(t.ripplePace).toBeGreaterThan(0);
      expect(t.nebulaDim).toBeGreaterThan(0);
      expect(t.nebulaDim).toBeLessThanOrEqual(1);
      expect(t.veil.opacity).toBeGreaterThanOrEqual(0);
      expect(t.veil.opacity).toBeLessThanOrEqual(1);
      expect(t.audio.reverbWet).toBeGreaterThan(0);
      expect(t.audio.reverbWet).toBeLessThanOrEqual(1);
      expect(t.audio.droneGain).toBeGreaterThan(0);
      expect(t.audio.droneLfo.max).toBeGreaterThan(t.audio.droneLfo.min);
    }
  });

  it("深夜：星速最慢 / 混响最湿 / 星云压暗 / 纯黑薄纱", () => {
    const n = CIRCADIAN_TOKENS.night;
    expect(n.starSpeed.max).toBeLessThan(CIRCADIAN_TOKENS.day.starSpeed.max);
    expect(n.starSpeed.max).toBeLessThan(CIRCADIAN_TOKENS.evening.starSpeed.max);
    expect(n.audio.reverbWet).toBeGreaterThan(CIRCADIAN_TOKENS.day.audio.reverbWet);
    expect(n.audio.reverbWet).toBeGreaterThan(CIRCADIAN_TOKENS.evening.audio.reverbWet);
    expect(n.nebulaDim).toBeLessThan(1);
    expect(n.veil.color.toLowerCase()).toBe("#000000");
  });

  it("白天：波纹最轻快、薄纱为深海蓝；傍晚：无薄纱基准态", () => {
    expect(CIRCADIAN_TOKENS.day.ripplePace).toBeLessThan(1);
    expect(CIRCADIAN_TOKENS.night.ripplePace).toBeGreaterThan(1);
    expect(CIRCADIAN_TOKENS.day.veil.color.toLowerCase()).toBe("#0a1c3d");
    expect(CIRCADIAN_TOKENS.evening.veil.opacity).toBe(0);
    expect(CIRCADIAN_TOKENS.evening.ripplePace).toBe(1);
    expect(CIRCADIAN_TOKENS.evening.nebulaDim).toBe(1);
  });
});
