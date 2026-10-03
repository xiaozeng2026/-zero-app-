/**
 * audioEngine 健壮性单测（全程 mock "tone"，jsdom 无 WebAudio）：
 * - ensureAudio 初始化中途失败 → 已建节点被 dispose、状态清空，可再次尝试成功
 *     （微信 WKWebView 首次手势被音频策略拒绝的场景，旧实现会永久静音）
 * - wakeAudio 恢复被拒 → 下一次 pointerdown 手势内重试 resume 并淡入
 */
import { describe, it, expect, vi } from "vitest";

const h = vi.hoisted(() => ({
  /** Reverb.generate 是否拒绝（模拟首次初始化失败） */
  reverbFail: true,
  resumeCalls: 0,
  ctxState: "running" as "running" | "suspended" | "closed",
  /** 构造参数为 0 的 Gain —— 即 Drone 主增益 */
  gainZeroInstances: [] as Array<Record<string, unknown>>,
  reverbInstances: [] as Array<{ dispose: ReturnType<typeof vi.fn> }>,
}));

vi.mock("tone", () => {
  const makeParam = () => ({
    value: 0.5,
    rampTo: vi.fn(),
    cancelScheduledValues: vi.fn(),
    setValueAtTime: vi.fn(),
    linearRampToValueAtTime: vi.fn(),
    connect: vi.fn(function (this: unknown, node?: unknown) {
      return node ?? this;
    }),
  });

  class MockNode {
    gain: ReturnType<typeof makeParam>;
    frequency: ReturnType<typeof makeParam>;
    wet: ReturnType<typeof makeParam>;
    constructor(level?: number) {
      this.gain = makeParam();
      this.frequency = makeParam();
      this.wet = makeParam();
      if (level === 0) h.gainZeroInstances.push(this as unknown as Record<string, unknown>);
    }
    connect = vi.fn(function (this: MockNode) {
      return this;
    });
    toDestination = vi.fn(function (this: MockNode) {
      return this;
    });
    start = vi.fn(function (this: MockNode) {
      return this;
    });
    triggerAttackRelease = vi.fn();
    dispose = vi.fn(() => Promise.resolve());
    generate = vi.fn(async () => {
      if (h.reverbFail) throw new Error("reverb blocked by autoplay policy");
    });
  }

  class MockReverb extends MockNode {
    constructor() {
      super();
      h.reverbInstances.push(this);
    }
  }

  const ctx = {
    get state() {
      return h.ctxState;
    },
    resume: vi.fn(() => {
      h.resumeCalls += 1;
      if (h.resumeCalls === 1) {
        return Promise.reject(new Error("resume blocked: no user gesture"));
      }
      h.ctxState = "running";
      return Promise.resolve();
    }),
    suspend: vi.fn(() => {
      h.ctxState = "suspended";
      return Promise.resolve();
    }),
  };

  let clock = 0;
  return {
    start: vi.fn(async () => {}),
    now: vi.fn(() => {
      clock += 0.01;
      return clock;
    }),
    getContext: vi.fn(() => ({ rawContext: ctx })),
    Reverb: MockReverb,
    Gain: MockNode,
    Filter: MockNode,
    Oscillator: MockNode,
    LFO: MockNode,
    Synth: MockNode,
    PluckSynth: MockNode,
  };
});

// mock 必须在 import 被测模块前就绪 —— vitest 会把 vi.mock 提升到文件顶部
import { ensureAudio, primeAudio, sleepAudio, wakeAudio } from "./audioEngine";

const flush = async (ticks = 6) => {
  for (let i = 0; i < ticks; i++) await Promise.resolve();
};

describe("primeAudio 手势同步解锁", () => {
  it("Context 挂起时调用 resume，且 resume 被拒不抛错", () => {
    h.ctxState = "suspended";
    h.resumeCalls = 0;
    expect(() => primeAudio()).not.toThrow();
    expect(h.resumeCalls).toBe(1); // mock 中第 1 次 resume 拒绝，primeAudio 静默吞掉
  });

  it("Context 已 running 时不重复 resume", () => {
    h.ctxState = "running";
    h.resumeCalls = 0;
    primeAudio();
    expect(h.resumeCalls).toBe(0);
  });
});

describe("audioEngine 初始化失败可重试", () => {
  it("Reverb 生成失败 → reject 且已建节点被 dispose，状态允许重建", async () => {
    h.reverbFail = true;
    await expect(ensureAudio()).rejects.toThrow(/reverb blocked/);

    // 失败发生在第一个 Reverb.generate：该节点必须被释放，防止重试后 Drone 叠音
    expect(h.reverbInstances).toHaveLength(1);
    expect(h.reverbInstances[0].dispose).toHaveBeenCalledTimes(1);

    // 放开失败后，下一次手势重新初始化应成功
    h.reverbFail = false;
    await expect(ensureAudio()).resolves.toBeUndefined();
  });

  it("唤醒时 resume 被拒，下一次手势触发重试并淡入 Drone", async () => {
    vi.useFakeTimers();

    // 隐藏 → 0.5s 淡出 + 0.6s 后挂起上下文
    sleepAudio();
    await vi.advanceTimersByTimeAsync(600);
    expect(h.ctxState).toBe("suspended");

    // 第一次 resume 无手势被拒
    h.resumeCalls = 0;
    wakeAudio();
    await flush();

    // 用户下一次触摸：手势监听内应重试 resume（这次成功）并执行淡入
    window.dispatchEvent(new Event("pointerdown"));
    await flush();

    expect(h.resumeCalls).toBe(2);
    expect(h.ctxState).toBe("running");
    const droneGain = h.gainZeroInstances[0] as unknown as {
      gain: { linearRampToValueAtTime: ReturnType<typeof vi.fn> };
    };
    expect(droneGain.gain.linearRampToValueAtTime).toHaveBeenCalled();

    vi.useRealTimers();
  });
});
