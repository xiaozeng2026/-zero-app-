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
 * - 标签页隐藏时 suspendAudio() 挂起省电；恢复时 resumeAudio() 只解我们自己挂起的
 */

import * as Tone from "tone";

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
/** 是否由我们挂起的音频（仅这时才负责恢复） */
let suspendedByUs = false;

const pick = <T,>(arr: readonly T[]): T =>
  arr[Math.floor(Math.random() * arr.length)];

/** 首次手势后初始化音频图（幂等；并发调用共享同一 Promise） */
export function ensureAudio(): Promise<void> {
  if (readyPromise) return readyPromise;

  readyPromise = (async () => {
    await Tone.start();

    const reverb = new Tone.Reverb({ decay: 13, wet: 0.72 });
    await reverb.generate();
    reverb.toDestination();

    // 同辈之网专用：22 秒海量混响，像从宇宙边缘折返的回响
    const massive = new Tone.Reverb({ decay: 22, wet: 0.92 });
    await massive.generate();
    const massiveBus = new Tone.Gain(0.5).toDestination();
    massive.connect(massiveBus);

    // 极低音量低频 Drone：两支微失谐正弦 + 低通，模拟太空嗡鸣
    const droneGain = new Tone.Gain(0).toDestination();
    droneGain.gain.rampTo(0.045, 6); // 6 秒缓慢浮现
    const droneFilter = new Tone.Filter(150, "lowpass");
    droneFilter.connect(droneGain);
    [55, 55.4, 110.2].forEach((freq, i) => {
      const osc = new Tone.Oscillator(freq, "sine").start();
      const oscGain = new Tone.Gain(i === 2 ? 0.25 : 1);
      osc.connect(oscGain);
      oscGain.connect(droneFilter);
    });
    // 截止频率缓慢起伏，让 Drone 有"呼吸"
    new Tone.LFO({ frequency: 0.08, min: 90, max: 220 })
      .start()
      .connect(droneFilter.frequency);

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

/** 标签页隐藏时挂起音频上下文省电（标题变化由页面负责，不依赖本函数） */
export function suspendAudio(): void {
  if (!engine) return;
  try {
    const ctx = Tone.getContext().rawContext as AudioContext;
    if (ctx.state === "running") {
      suspendedByUs = true;
      ctx.suspend().catch(() => {});
    }
  } catch {
    /* 音频上下文不可用时忽略 */
  }
}

/** 回到标签页时恢复音频（仅当是我们挂起的） */
export function resumeAudio(): void {
  if (!suspendedByUs) return;
  suspendedByUs = false;
  try {
    (Tone.getContext().rawContext as AudioContext).resume().catch(() => {});
  } catch {
    /* 忽略 */
  }
}
