/**
 * IME 打字水滴判定单测：
 * - 拼音组词期间一律静默；整词上屏（compositionend）只响一声
 * - Esc 取消组词 / 无净增字不响
 * - compositionend 尾随窗、静默 inputType、删除、净增判定
 */
import { describe, it, expect } from "vitest";
import {
  COMPOSITION_TAIL_MS,
  shouldPlayCompositionDrop,
  shouldPlayTypingDrop,
} from "./ime";

const base = {
  composing: false,
  msSinceCompositionEnd: 9999,
  inputType: "insertText" as string | null | undefined,
  prevLen: 0,
  nextLen: 1,
};

describe("shouldPlayTypingDrop 普通 input", () => {
  it("净增字 + insertText 才响", () => {
    expect(shouldPlayTypingDrop(base)).toBe(true);
  });

  it("组词中（composing=true）一律静默——拼音逐键不乱响", () => {
    expect(
      shouldPlayTypingDrop({
        ...base,
        composing: true,
        inputType: "insertCompositionText",
      })
    ).toBe(false);
  });

  it("compositionend 尾随窗内静默（防各浏览器尾随 input 双响）", () => {
    expect(
      shouldPlayTypingDrop({ ...base, msSinceCompositionEnd: COMPOSITION_TAIL_MS - 1 })
    ).toBe(false);
    expect(
      shouldPlayTypingDrop({ ...base, msSinceCompositionEnd: COMPOSITION_TAIL_MS + 1 })
    ).toBe(true);
  });

  it("组词提交类 inputType 永远静默", () => {
    expect(
      shouldPlayTypingDrop({ ...base, inputType: "insertCompositionText" })
    ).toBe(false);
    expect(
      shouldPlayTypingDrop({ ...base, inputType: "insertFromComposition" })
    ).toBe(false);
  });

  it("删除/剪切/撤销类 inputType 静默", () => {
    for (const inputType of [
      "deleteContentBackward",
      "deleteContentForward",
      "deleteByCut",
      "historyUndo",
      "historyRedo",
    ]) {
      expect(
        shouldPlayTypingDrop({ ...base, prevLen: 3, nextLen: 2, inputType })
      ).toBe(false);
    }
  });

  it("等长替换/缩短不响；老浏览器 inputType=undefined 时净增仍响", () => {
    expect(
      shouldPlayTypingDrop({ ...base, prevLen: 2, nextLen: 2 })
    ).toBe(false);
    expect(
      shouldPlayTypingDrop({ ...base, prevLen: 3, nextLen: 2 })
    ).toBe(false);
    expect(
      shouldPlayTypingDrop({ ...base, inputType: undefined })
    ).toBe(true);
  });
});

describe("shouldPlayCompositionDrop 整词上屏", () => {
  it("有提交文本且净增字才响那唯一一声", () => {
    expect(shouldPlayCompositionDrop("nihao", 0, 5)).toBe(true);
  });

  it("Esc 取消组词（data 为空）不响", () => {
    expect(shouldPlayCompositionDrop("", 0, 0)).toBe(false);
    expect(shouldPlayCompositionDrop(null, 0, 0)).toBe(false);
  });

  it("没有净增字（替换/删改）不响", () => {
    expect(shouldPlayCompositionDrop("a", 5, 5)).toBe(false);
    expect(shouldPlayCompositionDrop("a", 5, 4)).toBe(false);
  });
});
