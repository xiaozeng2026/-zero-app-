/**
 * keyboardInset 纯逻辑单测（iOS / 微信 WKWebView 软键盘遮挡）：
 * - 无键盘 / 典型 iPhone 键盘 / 带 offsetTop 的键盘
 * - 80px 噪声阈值、负值（外接键盘等）、NaN/Infinity、取整
 */
import { describe, it, expect } from "vitest";
import { keyboardInset } from "./viewport";

describe("keyboardInset 键盘遮挡高度", () => {
  it("无键盘（vv 与布局视口等高）→ 0", () => {
    expect(keyboardInset(844, 844, 0)).toBe(0);
  });

  it("iPhone 12/13 典型键盘（844→538，遮挡 306px）→ 306", () => {
    expect(keyboardInset(844, 538, 0)).toBe(306);
  });

  it("带 offsetTop 时扣除顶部偏移（844→538，offsetTop 40）→ 266", () => {
    expect(keyboardInset(844, 538, 40)).toBe(266);
  });

  it("负 offsetTop 按 0 处理（不得加成遮挡量）", () => {
    expect(keyboardInset(844, 538, -20)).toBe(306);
  });

  it("遮挡 ≤80px 视为工具栏噪声 → 0", () => {
    expect(keyboardInset(844, 800, 0)).toBe(0); // 44px
    expect(keyboardInset(844, 764, 0)).toBe(0); // 恰好 80px
  });

  it("超过 80px 阈值才抬升（81px → 81）", () => {
    expect(keyboardInset(844, 763, 0)).toBe(81);
  });

  it("可视区高于布局视口（外接键盘/分屏切换，负 inset）→ 0", () => {
    expect(keyboardInset(844, 900, 0)).toBe(0);
  });

  it("非有限数（visualViewport 缺失时的脏值）→ 0", () => {
    expect(keyboardInset(NaN, 538, 0)).toBe(0);
    expect(keyboardInset(844, NaN, 0)).toBe(0);
    expect(keyboardInset(Infinity, 538, 0)).toBe(0);
    expect(keyboardInset(844, Infinity, 0)).toBe(0);
  });

  it("结果四舍五入到整像素", () => {
    expect(keyboardInset(844, 537.4, 0)).toBe(307); // 306.6 → 307
  });
});
