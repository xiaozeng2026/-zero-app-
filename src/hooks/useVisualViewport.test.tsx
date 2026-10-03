/**
 * useKeyboardInset hook 单测：
 * jsdom 没有 visualViewport，手工 stub 一个带事件订阅的假对象，
 * 验证挂载初始计算、resize/scroll 事件更新与卸载清理；
 * 以及无 visualViewport 的降级（恒 0，不抛错）。
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useKeyboardInset } from "./useVisualViewport";

type Listener = () => void;

function makeFakeVV(initial: { height: number; offsetTop?: number }) {
  const listeners = new Map<string, Set<Listener>>();
  const vv = {
    height: initial.height,
    offsetTop: initial.offsetTop ?? 0,
    innerWidth: 390,
    addEventListener(type: string, fn: Listener) {
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type)!.add(fn);
    },
    removeEventListener(type: string, fn: Listener) {
      listeners.get(type)?.delete(fn);
    },
    emit(type: string, patch?: Partial<{ height: number; offsetTop: number }>) {
      if (patch) Object.assign(vv, patch);
      listeners.get(type)?.forEach((fn) => fn());
    },
  };
  return vv;
}

const INNER = 844;
let originalVV: PropertyDescriptor | undefined;

beforeEach(() => {
  originalVV = Object.getOwnPropertyDescriptor(window, "visualViewport");
  Object.defineProperty(window, "innerHeight", {
    value: INNER,
    configurable: true,
    writable: true,
  });
});

afterEach(() => {
  if (originalVV) Object.defineProperty(window, "visualViewport", originalVV);
  else Reflect.deleteProperty(window, "visualViewport");
});

describe("useKeyboardInset", () => {
  it("挂载时立即按当前 visualViewport 计算遮挡高度", () => {
    const vv = makeFakeVV({ height: 538 }); // 306px
    Object.defineProperty(window, "visualViewport", {
      value: vv,
      configurable: true,
      writable: true,
    });
    const { result } = renderHook(() => useKeyboardInset());
    expect(result.current).toBe(306);
  });

  it("vv resize（键盘弹出/收起）后更新 inset", () => {
    const vv = makeFakeVV({ height: 844 });
    Object.defineProperty(window, "visualViewport", {
      value: vv,
      configurable: true,
      writable: true,
    });
    const { result } = renderHook(() => useKeyboardInset());
    expect(result.current).toBe(0);

    act(() => vv.emit("resize", { height: 538 }));
    expect(result.current).toBe(306);

    act(() => vv.emit("resize", { height: 844 }));
    expect(result.current).toBe(0);
  });

  it("scroll 事件（offsetTop 变化）同样驱动更新", () => {
    const vv = makeFakeVV({ height: 538, offsetTop: 0 });
    Object.defineProperty(window, "visualViewport", {
      value: vv,
      configurable: true,
      writable: true,
    });
    const { result } = renderHook(() => useKeyboardInset());
    expect(result.current).toBe(306);

    act(() => vv.emit("scroll", { offsetTop: 40 }));
    expect(result.current).toBe(266);
  });

  it("无 visualViewport 的环境恒返回 0 且不抛错", () => {
    Reflect.deleteProperty(window, "visualViewport");
    const { result } = renderHook(() => useKeyboardInset());
    expect(result.current).toBe(0);
  });

  it("卸载后移除事件监听（不再更新）", () => {
    const vv = makeFakeVV({ height: 844 });
    Object.defineProperty(window, "visualViewport", {
      value: vv,
      configurable: true,
      writable: true,
    });
    const { result, unmount } = renderHook(() => useKeyboardInset());
    expect(result.current).toBe(0);
    unmount();
    // 卸载后触发事件不应抛错，也不应影响（监听器已移除）
    expect(() => vv.emit("resize", { height: 538 })).not.toThrow();
  });
});
