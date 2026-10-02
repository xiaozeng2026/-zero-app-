/**
 * useCircadianPhase 单测 —— 重点守护 e746577 修复的水合不变量：
 *
 * SSG 在 UTC runner 上构建，静态 HTML 烤的是构建时刻相位；React 水合不会
 * patch 与首帧不一致的既有 style。因此无论访客本地处于哪个时段：
 *   1) 首次渲染（=== SSG / 水合渲染）必须恒为基准态 "evening"；
 *   2) 挂载 effect 之后才同步为访客真实时段；
 *   3) 跨时段边界（00/06/19）定时器自动换天；
 *   4) 卸载后定时器被清理，不再 setState。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { renderHook, act, cleanup } from "@testing-library/react";
import { useCircadianPhase } from "./useCircadianPhase";
import type { CircadianPhase } from "@/lib/circadian";

const setClock = (h: number, m = 0, s = 0) =>
  vi.setSystemTime(new Date(2026, 9, 3, h, m, s));

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  cleanup();
});

describe("水合不变量：首帧恒为 evening，挂载后同步真实时段", () => {
  it.each<[number, CircadianPhase]>([
    [2, "night"],
    [12, "day"],
    [20, "evening"],
  ])("本地 %02i 点：首帧 evening → effect 后 %s", (hour, real) => {
    setClock(hour);
    const renderLog: CircadianPhase[] = [];

    const { result } = renderHook(() => {
      const phase = useCircadianPhase();
      renderLog.push(phase); // 记录每次渲染主体执行时看到的值
      return phase;
    });

    // 第一次渲染必须是基准态（模拟 SSG HTML 与水合渲染一致）
    expect(renderLog[0]).toBe("evening");
    // effect 同步后为访客真实时段
    expect(result.current).toBe(real);
    // 深夜/白天场景下必须发生过一次 evening → 真实时段 的切换
    if (real !== "evening") {
      expect(renderLog).toContain(real);
      expect(renderLog.indexOf("evening")).toBeLessThan(renderLog.indexOf(real));
    }
  });

  it("回归守卫：深夜访客首帧绝不允许直接是 night（SSG 相位漂移 bug）", () => {
    setClock(0, 30);
    let firstRender: CircadianPhase | null = null;

    renderHook(() => {
      const phase = useCircadianPhase();
      if (firstRender === null) firstRender = phase;
      return phase;
    });

    expect(firstRender).toBe("evening");
  });
});

describe("边界自动换天", () => {
  it("05:59:59 挂载为 night，越过 06:00 后自动切到 day", () => {
    setClock(5, 59, 59);
    const { result } = renderHook(() => useCircadianPhase());
    expect(result.current).toBe("night");

    // hook 在 msUntilNextPhase()+1000ms（此处 2000ms）后重检
    act(() => {
      vi.advanceTimersByTime(2000);
    });

    expect(new Date().getHours()).toBe(6);
    expect(result.current).toBe("day");
  });

  it("23:59:59 挂载为 evening，越过午夜后切到 night（跨天）", () => {
    setClock(23, 59, 59);
    const { result } = renderHook(() => useCircadianPhase());
    expect(result.current).toBe("evening");

    act(() => {
      vi.advanceTimersByTime(2000);
    });

    expect(new Date().getHours()).toBe(0);
    expect(result.current).toBe("night");
  });

  it("未到边界时提前推进定时器不切换", () => {
    setClock(0, 30); // 距 06:00 还有 5.5 小时
    const { result } = renderHook(() => useCircadianPhase());

    act(() => {
      vi.advanceTimersByTime(60 * 60 * 1000); // 只推进 1 小时
    });

    expect(result.current).toBe("night");
  });
});

describe("卸载清理", () => {
  it("卸载后跨过边界不再 setState（无 React 告警/抛错）", () => {
    setClock(5, 59, 59);
    const { result, unmount } = renderHook(() => useCircadianPhase());
    expect(result.current).toBe("night");

    unmount();

    expect(() => {
      act(() => {
        vi.advanceTimersByTime(24 * 60 * 60 * 1000);
      });
    }).not.toThrow();
  });
});
