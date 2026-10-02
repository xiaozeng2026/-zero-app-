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

/** 首次手势后初始化音频图（幂等；并发调用共享同一 Promise） */
export function ensureAudio(): Promise<void> {
  if (readyPromise) return readyPromise;

  readyPromise = (async () => {
    await Tone.start();
    const tok = CIRCADIAN_TOKENS[currentPhase].audio;

    const reverb = new Tone.Reverb({ decay: 13, wet: tok.reverbWet });
    await reverb.generate();
    reverb.toDestination();
    reverbNode = reverb;

    // 同辈之网专用：22 秒海量混响，像从宇宙边缘折返的回响
    const massive = new Tone.Reverb({ decay: 22, wet: 0.92 });
    await massive.generate();
    const massiveBus = new Tone.Gain(0.5).toDestination();
    massive.connect(massiveBus);

    // 极低音量低频 Drone：两支微失谐正弦 + 低通，模拟太空嗡鸣
    const droneGain = new Tone.Gain(0).toDestination();
    droneGain.gain.rampTo(tok.droneGain, 6); // 6 秒缓慢浮现
    droneGainNode = droneGain;
    const droneFilter = new Tone.Filter(150, "lowpass");
    droneFilter.connect(droneGain);
    [55, 55.4, 110.2].forEach((freq, i) => {
      const osc = new Tone.Oscillator(freq, "sine").start();
      const oscGain = new Tone.Gain(i === 2 ? 0.25 : 1);
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
    droneLfo = lfo;

    // 水滴 / 木琴：三角波 + 短包络，经混响
    const drop = new Tone.Synth({
      oscillator: { type: "triangle" },
      envelope: { attack: 0.002, decay: 0.35, sustain: 0, release: 0.6 },
      volume: -22,
    }).connect(reverb);

    // 回车叹息：正弦 Sub-bass（沉重情绪触发 G1 极低频），同时入海量混响长尾
    const bass = new Tone.Synth({
      oscillator: { type: "sine" },
      envelope: { attack: 0.04, decay: 1.6, sustain: 0.25, release: 4.5 },
      volume: -9,
    }).toDestination();
    bass.connect(reverb);
    bass.connect(massive);

    // 恒星悬停：空灵五声音阶
    const bell = new Tone.Synth({
      oscillator: { type: "sine" },
      envelope: { attack: 0.01, decay: 1.4, sustain: 0, release: 2.6 },
      volume: -15,
    }).connect(reverb);

    // 轻度情绪：Karplus-Strong 拨弦，轻快空灵
    const pluck = new Tone.PluckSynth({
      attackNoise: 1.2,
      dampening: 4200,
      resonance: 0.92,
      volume: -13,
    }).connect(reverb);

    // 同辈之网：极远处风铃，只进 22s 海量混响
    const peerBell = new Tone.Synth({
      oscillator: { type: "sine" },
      envelope: { attack: 0.02, decay: 2.2, sustain: 0, release: 4 },
      volume: -19,
    }).connect(massive);

    engine = { drop, bass, bell, pluck, peerBell };
  })();

  return readyPromise;
}

/** 取一个严格递增的音频时间戳（防同毫秒连触发报错） */
export function claimTime(): number {
  const t = Math.max(Tone.now(), nextNoteTime + 0.001);
  nextNoteTime = t;
  return t;
}

/** 打字水滴：高把位五声 */
export function playDrop(): void {
  engine?.drop.triggerAttackRelease(pick(PENTA_HIGH), "16n", claimTime());
}

/** 轻情绪提交：空灵拨弦，高把位五声音阶 */
export function playPluck(): void {
  engine?.pluck.triggerAttackRelease(pick(PENTA_HIGH), "8n", claimTime());
}

/** 重情绪提交：G1（49Hz）极低频叹息，经 22s 海量混响沉入深空 */
export function playBassG1(): void {
  engine?.bass.triggerAttackRelease("G1", "1n", claimTime());
}

/** 涟漪伴随 / 近场共鸣颂钵 */
export function playBell(): void {
  engine?.bell.triggerAttackRelease(pick(PENTA_MID), "2n", claimTime());
}

/** 恒星悬停：0.12s 节流，防止快速划过多音堆叠 */
export function playBellThrottled(): void {
  const now = Tone.now();
  if (now - lastBellAt < 0.12) return;
  lastBellAt = now;
  playBell();
}

/** 同辈之网风铃：只进 22s 海量混响 */
export function playPeerBell(): void {
  engine?.peerBell.triggerAttackRelease(pick(PENTA_MID), "2n", claimTime());
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
    ctx.resume().then(fadeIn).catch(() => {});
  } else {
    // 上下文从未真正挂住（快速切回）：直接平滑回弹
    fadeIn();
  }
}
