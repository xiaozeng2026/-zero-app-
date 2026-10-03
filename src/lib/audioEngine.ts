/**
 * 音频引擎 —— Tone.js 生成式音律（模块级单例）
 *
 * 信号链：
 *   Drone（55/55.4/110.2Hz 微失谐正弦 + 低通 LFO 呼吸）→ Destination
 *   打字水滴 / 悬停颂钵 / 轻情绪拨弦 → Reverb(decay 13) → Destination
 *   重情绪 G1 Sub-bass → Destination + Reverb + Massive Reverb(decay 22)
 *   同辈风铃 → Massive Reverb → Gain 0.5 → Destination
 *
 * 约束：
 * - 首次用户手势后 ensureAudio() 幂等初始化（浏览器自动播放策略）
 * - 所有触发走 claimTime() 的严格递增时间戳，防 "strictly greater" 断言报错
 * - 生物钟 applyCircadianPhase()：深夜混响最大/Drone 最远，白天稍干稍清晰
 * - 环保休眠 sleepAudio()：Drone 0.5s 淡出后挂起 AudioContext；
 *   wakeAudio()：恢复上下文并把 Drone 在 1.6s 内平滑淡入，杜绝突然吵闹
 */

import * as Tone from "tone";
import {
  CIRCADIAN_TOKENS,
  type CircadianPhase,
} from "@/lib/circadian";

/** 五声音阶（水滴/拨弦走高把位，悬停/风铃走中把位） */
const PENTA_HIGH = ["C5", "D5", "E5", "G5", "A5"] as const;
const PENTA_MID = ["C4", "D4", "E4", "G4", "A4"] as const;

interface Engine {
  drop: Tone.Synth;
  bass: Tone.Synth;
  bell: Tone.Synth;
  pluck: Tone.PluckSynth;
  peerBell: Tone.Synth;
}

let engine: Engine | null = null;
let readyPromise: Promise<void> | null = null;
/** 同一合成器的触发时间必须严格递增，快速连打时让出 1ms */
let nextNoteTime = 0;
/** 悬停颂钵节流（秒） */
let lastBellAt = 0;

/* ---- 生物钟 / 环保休眠所需的节点句柄 ---- */
let reverbNode: Tone.Reverb | null = null;
let droneGainNode: Tone.Gain | null = null;
let droneLfo: Tone.LFO | null = null;
let currentPhase: CircadianPhase = (() => {
  // 模块在客户端被 import 时取初始时段（SSR 下不执行音频初始化，无影响）
  try {
    const h = new Date().getHours();
    if (h <= 5) return "night";
    if (h <= 18) return "day";
    return "evening";
  } catch {
    return "evening";
  }
})();
/** 是否由我们挂起的音频（仅这时才负责恢复） */
let suspendedByUs = false;
let sleepTimer: ReturnType<typeof setTimeout> | null = null;

const pick = <T,>(arr: readonly T[]): T =>
  arr[Math.floor(Math.random() * arr.length)];

const rawCtx = (): AudioContext | null => {
  try {
    return Tone.getContext().rawContext as AudioContext;
  } catch {
    return null;
  }
};

/**
 * 应用生物钟参数（可在引擎初始化前调用：缓存 phase，初始化末尾自动生效）
 * @param ramp 秒，参数平滑过渡时间；初始化瞬间传 0
 */
export function applyCircadianPhase(
  phase: CircadianPhase,
  ramp = 4
): void {
  currentPhase = phase;
  if (!engine || !reverbNode || !droneGainNode || !droneLfo) return;

  const tok = CIRCADIAN_TOKENS[phase].audio;
  // 休眠挂起期间 Tone 传输时间不前进，等唤醒时会再应用一次目标音量
  reverbNode.wet.rampTo(tok.reverbWet, ramp);
  if (!suspendedByUs) {
    droneGainNode.gain.rampTo(tok.droneGain, ramp);
  }
  // LFO 的 min/max 为数值 setter，直接切换低通起伏区间
  droneLfo.min = tok.droneLfo.min;
  droneLfo.max = tok.droneLfo.max;
}

/**
 * 手势同步解锁 —— 必须在用户事件（touchstart/pointerdown/keydown）的
 * **同步调用栈**里调用，不能放在 await 之后。
 *
 * 关键陷阱：Tone.start() 内部是 globalContext.resume()，而真实 AudioContext
 * 在首次 getContext() 时才惰性创建；此前 globalContext 是 DummyContext，
 * 其 resume() 只返回 resolve()（什么都没做）。若先 `await Tone.start()` 再
 * new 节点（我们的旧写法），真实 Context 在微任务中诞生——桌面 Chrome 仍以
 * running 启动，iOS Safari / 微信 WKWebView 则永久 suspended，表现为全程无声。
 *
 * 做法：同步 getContext() 先建出真实 Context，立刻 resume()。
 */
export function primeAudio(): void {
  try {
    const raw = Tone.getContext().rawContext as AudioContext | null;
    if (raw && raw.state !== "running") {
      raw.resume().catch(() => {});
    }
    // 微信内置浏览器：借 WeixinJSBridge 解除 WebView 媒体播放限制
    const w = window as unknown as {
      WeixinJSBridge?: { invoke?: (api: string, cb: () => void) => void };
    };
    w.WeixinJSBridge?.invoke?.("getNetworkType", () => {
      const c = rawCtx();
      if (c && c.state !== "running") c.resume().catch(() => {});
    });
  } catch {
    /* 无 WebAudio 环境：静默 */
  }
}

/** 首次手势后初始化音频图（幂等；并发调用共享同一 Promise） */
export function ensureAudio(): Promise<void> {
  if (readyPromise) return readyPromise;

  readyPromise = (async () => {
    /** 本次初始化已创建的节点：失败时逐一 dispose，避免重试后 Drone 叠音 */
    const created: { dispose?: () => void }[] = [];
    try {
      // 同步语义上的保险：先确保真实 Context 已建（正常路径 primeAudio 已建过）
      Tone.getContext();
      await Tone.start();
      const tok = CIRCADIAN_TOKENS[currentPhase].audio;

      const reverb = new Tone.Reverb({ decay: 13, wet: tok.reverbWet });
      created.push(reverb);
      await reverb.generate();
      reverb.toDestination();
      reverbNode = reverb;

      // 同辈之网专用：22 秒海量混响，像从宇宙边缘折返的回响
      const massive = new Tone.Reverb({ decay: 22, wet: 0.92 });
      created.push(massive);
      await massive.generate();
      const massiveBus = new Tone.Gain(0.5).toDestination();
      created.push(massiveBus);
      massive.connect(massiveBus);

      // 极低音量低频 Drone：两支微失谐正弦 + 低通，模拟太空嗡鸣
      const droneGain = new Tone.Gain(0).toDestination();
      created.push(droneGain);
      droneGain.gain.rampTo(tok.droneGain, 6); // 6 秒缓慢浮现
      droneGainNode = droneGain;
      const droneFilter = new Tone.Filter(150, "lowpass");
      created.push(droneFilter);
      droneFilter.connect(droneGain);
      [55, 55.4, 110.2].forEach((freq, i) => {
        const osc = new Tone.Oscillator(freq, "sine").start();
        created.push(osc);
        const oscGain = new Tone.Gain(i === 2 ? 0.25 : 1);
        created.push(oscGain);
        osc.connect(oscGain);
        oscGain.connect(droneFilter);
      });
      // 截止频率缓慢起伏，让 Drone 有"呼吸"（区间随时段变化）
      const lfo = new Tone.LFO({
        frequency: 0.08,
        min: tok.droneLfo.min,
        max: tok.droneLfo.max,
      })
        .start()
        .connect(droneFilter.frequency);
      created.push(lfo);
      droneLfo = lfo;

      // 水滴 / 木琴：三角波 + 短包络，经混响
      const drop = new Tone.Synth({
        oscillator: { type: "triangle" },
        envelope: { attack: 0.002, decay: 0.35, sustain: 0, release: 0.6 },
        volume: -22,
      }).connect(reverb);
      created.push(drop);

      // 回车叹息：正弦 Sub-bass（沉重情绪触发 G1 极低频），同时入海量混响长尾
      const bass = new Tone.Synth({
        oscillator: { type: "sine" },
        envelope: { attack: 0.04, decay: 1.6, sustain: 0.25, release: 4.5 },
        volume: -9,
      }).toDestination();
      created.push(bass);
      bass.connect(reverb);
      bass.connect(massive);

      // 恒星悬停：空灵五声音阶
      const bell = new Tone.Synth({
        oscillator: { type: "sine" },
        envelope: { attack: 0.01, decay: 1.4, sustain: 0, release: 2.6 },
        volume: -15,
      }).connect(reverb);
      created.push(bell);

      // 轻度情绪：Karplus-Strong 拨弦，轻快空灵
      const pluck = new Tone.PluckSynth({
        attackNoise: 1.2,
        dampening: 4200,
        resonance: 0.92,
        volume: -13,
      }).connect(reverb);
      created.push(pluck);

      // 同辈之网：极远处风铃，只进 22s 海量混响
      const peerBell = new Tone.Synth({
        oscillator: { type: "sine" },
        envelope: { attack: 0.02, decay: 2.2, sustain: 0, release: 4 },
        volume: -19,
      }).connect(massive);
      created.push(peerBell);

      engine = { drop, bass, bell, pluck, peerBell };

      // 初始化耗时（reverb 脉冲生成）后再确认一次：iOS 上 Context 可能仍是
      // suspended/interrupted，补一次 resume；Drone gain ramp 在 running 后才出声
      const ctx = rawCtx();
      if (ctx && ctx.state !== "running") ctx.resume().catch(() => {});
    } catch (err) {
      // 微信 WKWebView 等环境首次手势可能仍被音频策略拒绝：
      // 释放半成品节点并清空状态，允许下一次手势重新初始化（否则永久静音）
      for (const node of created) {
        try {
          node.dispose?.();
        } catch {
          /* 静默 */
        }
      }
      engine = null;
      reverbNode = null;
      droneGainNode = null;
      droneLfo = null;
      readyPromise = null;
      throw err;
    }
  })();

  return readyPromise;
}

/** 取一个严格递增的音频时间戳（防同毫秒连触发报错） */
export function claimTime(): number {
  const t = Math.max(Tone.now(), nextNoteTime + 0.001);
  nextNoteTime = t;
  return t;
}

/**
 * 播放统一入口：
 * - 引擎未就绪（首次手势后音频图还在构建）：先解锁初始化，就绪后补奏，不丢音；
 * - 引擎在但 Context 被系统挂起（iOS interrupted，非我方休眠）：顺手 resume。
 */
function whenReady(play: (e: Engine) => void): void {
  const c = rawCtx();
  if (engine) {
    if (c && c.state !== "running" && !suspendedByUs) c.resume().catch(() => {});
    play(engine);
    return;
  }
  primeAudio();
  ensureAudio()
    .then(() => {
      if (engine) play(engine);
    })
    .catch(() => {});
}

/** 打字水滴：高把位五声 */
export function playDrop(): void {
  whenReady((e) => e.drop.triggerAttackRelease(pick(PENTA_HIGH), "16n", claimTime()));
}

/** 轻情绪提交：空灵拨弦，高把位五声音阶 */
export function playPluck(): void {
  whenReady((e) => e.pluck.triggerAttackRelease(pick(PENTA_HIGH), "8n", claimTime()));
}

/** 重情绪提交：G1（49Hz）极低频叹息，经 22s 海量混响沉入深空 */
export function playBassG1(): void {
  whenReady((e) => e.bass.triggerAttackRelease("G1", "1n", claimTime()));
}

/** 涟漪伴随 / 近场共鸣颂钵 */
export function playBell(): void {
  whenReady((e) => e.bell.triggerAttackRelease(pick(PENTA_MID), "2n", claimTime()));
}

/** 恒星悬停：0.12s 节流，防止快速划过多音堆叠 */
export function playBellThrottled(): void {
  if (!engine) {
    // 首次触摸即落在恒星上：节流依赖 Tone.now，未初始化时直接走兜底播放
    playBell();
    return;
  }
  const now = Tone.now();
  if (now - lastBellAt < 0.12) return;
  lastBellAt = now;
  playBell();
}

/** 同辈之网风铃：只进 22s 海量混响 */
export function playPeerBell(): void {
  whenReady((e) => e.peerBell.triggerAttackRelease(pick(PENTA_MID), "2n", claimTime()));
}

/**
 * 环保休眠：标签页隐藏时调用。
 * Drone 0.5s 淡出 → 挂起整个 AudioContext（混响长尾一并冻结，释放硬件资源）。
 * 标题变化等 UI 处理由页面负责，不依赖引擎是否已初始化。
 */
export function sleepAudio(): void {
  const ctx = rawCtx();
  if (!engine || !droneGainNode || !ctx || ctx.state !== "running") return;
  suspendedByUs = true;
  const now = Tone.now();
  droneGainNode.gain.cancelScheduledValues(now);
  droneGainNode.gain.setValueAtTime(Math.max(droneGainNode.gain.value, 0.0001), now);
  droneGainNode.gain.linearRampToValueAtTime(0.0001, now + 0.5);
  if (sleepTimer) clearTimeout(sleepTimer);
  sleepTimer = setTimeout(() => {
    sleepTimer = null;
    const c = rawCtx();
    if (c && c.state === "running") c.suspend().catch(() => {});
  }, 600);
}

/**
 * 环保唤醒：切回标签页时调用。
 * 恢复 AudioContext，Drone 从寂静在 1.6s 内线性浮回当前时段的目标音量。
 * 若用户在 0.6s 挂起窗口内就切回，则取消挂起、只做音量回弹。
 */
export function wakeAudio(): void {
  if (!suspendedByUs) return;
  suspendedByUs = false;
  if (sleepTimer) {
    clearTimeout(sleepTimer);
    sleepTimer = null;
  }
  const ctx = rawCtx();
  if (!engine || !droneGainNode || !ctx) return;

  const target = CIRCADIAN_TOKENS[currentPhase].audio.droneGain;
  const fadeIn = () => {
    if (!droneGainNode) return;
    const t = Tone.now();
    droneGainNode.gain.cancelScheduledValues(t);
    droneGainNode.gain.setValueAtTime(0.0001, t);
    droneGainNode.gain.linearRampToValueAtTime(target, t + 1.6);
  };

  if (ctx.state === "suspended") {
    ctx
      .resume()
      .then(fadeIn)
      .catch(() => {
        // iOS Safari / 微信 WKWebView：从后台返回时没有用户手势，resume 会被拒。
        // 挂一次性手势监听，下一次触摸/按键时再恢复并淡入，否则 Drone 永久静音。
        const rearm = () => {
          window.removeEventListener("pointerdown", rearm);
          window.removeEventListener("keydown", rearm);
          window.removeEventListener("touchend", rearm);
          const c = rawCtx();
          if (!c) return;
          if (c.state === "suspended") c.resume().then(fadeIn).catch(() => {});
          else fadeIn();
        };
        window.addEventListener("pointerdown", rearm, { once: true });
        window.addEventListener("keydown", rearm, { once: true });
        window.addEventListener("touchend", rearm, { once: true });
      });
  } else {
    // 上下文从未真正挂住（快速切回）：直接平滑回弹
    fadeIn();
  }
}
