"use client";

/**
 * 生成式音律（Generative Audio）· Tone.js · 浩瀚宇宙版
 *
 * 底噪：棕噪声经低通滤波 + 55Hz 亚音速正弦，缓慢 LFO 呼吸，
 *       模拟《星际穿越》式深空 Drone（从 0 缓慢淡入）。
 * 风铃：MetalSynth → 大 FeedbackDelay（0.62s / 0.55 反馈）→ 14s 大混响，
 *       像信号在空旷宇宙中回荡了几万年。
 *
 * - playType        每输入一个字符：极低音量的膜鸣水滴（-20dB 以下）
 * - playDestruction 回车碎裂：FMSynth 极低频重音 C2（重担落地/叹息）
 * - playAlchemy     粒子汇聚：Cmaj9 温暖 Pad，2.2s 缓慢淡入
 * - playEchoNote    每次涟漪（含陌生人随机共鸣）：五声音阶随机风铃音
 *
 * 必须在用户手势（pointerdown/keydown）中调用 initGenerative()，
 * 以满足浏览器 AudioContext 自动播放策略。
 */

import * as Tone from "tone";

// 五声音阶（C 宫调式）：任意音符组合都天然和谐
const PENTA = ["C4", "D4", "E4", "G4", "A4", "C5"] as const;
// 打字水滴：只在低音区小幅游走
const TYPE_NOTES = ["C3", "D3", "G3", "A3"] as const;
// Cmaj9：C3 E3 G3 B3 D4
const ALCHEMY_CHORD = ["C3", "E3", "G3", "B3", "D4"] as const;

const MASTER_DB = -4;
const MASTER_DIM_DB = -20;
const DRONE_LEVEL = 0.13;
const DRONE_DIM_LEVEL = 0.025;
const TYPE_MIN_GAP_MS = 55; // 连续打字时限流
const ECHO_MIN_GAP_MS = 140; // 防止快速连点堆叠

let master: Tone.Volume | null = null;
let reverb: Tone.Reverb | null = null;
let dropSynth: Tone.MembraneSynth | null = null;
let boomSynth: Tone.FMSynth | null = null;
let padSynth: Tone.PolySynth | null = null;
let bellSynth: Tone.MetalSynth | null = null;
let bellDelay: Tone.FeedbackDelay | null = null;
let hugSynth: Tone.PolySynth | null = null;
let droneBus: Tone.Gain | null = null;
let droneNoise: Tone.Noise | null = null;
let droneSub: Tone.Oscillator | null = null;
let droneLfo: Tone.LFO | null = null;

let started = false;
let starting: Promise<void> | null = null;
let lastTypeAt = 0;
let lastEchoAt = 0;
let lastHugAt = 0;

// 拥抱发送：低音大三和弦（C2 E2 G2），温暖、被托住
const HUG_SEND_CHORD = ["C2", "E2", "G2"];

const pick = <T,>(arr: readonly T[]): T =>
  arr[Math.floor(Math.random() * arr.length)];

/** 用户首次交互时调用：解锁 AudioContext 并搭建音轨 */
export function initGenerative(): Promise<void> {
  if (started) return Promise.resolve();
  if (starting) return starting;

  starting = (async () => {
    await Tone.start();

    // 主音量轨（熄灯时统一渐弱，让音乐也“远去”）
    master = new Tone.Volume(MASTER_DB);
    master.toDestination();

    // 巨大空谷混响：14s 长尾，78% 湿声让声音悬浮；
    // 60ms 预延迟把干声与混响拉开距离，形成“远空回响”的空灵纵深感
    reverb = new Tone.Reverb({ decay: 14, wet: 0.78, preDelay: 0.06 });
    reverb.connect(master);

    // ---- 打字水滴：膜鸣合成器，极轻极短 ----
    dropSynth = new Tone.MembraneSynth({
      pitchDecay: 0.04,
      octaves: 4,
      envelope: { attack: 0.001, decay: 0.28, sustain: 0, release: 0.1 },
      volume: -21,
    });
    dropSynth.connect(reverb);

    // ---- 毁灭重音：FM 低频，柔软深沉 ----
    boomSynth = new Tone.FMSynth({
      harmonicity: 0.5,
      modulationIndex: 6,
      oscillator: { type: "sine" },
      envelope: { attack: 0.02, decay: 1.8, sustain: 0, release: 2.2 },
      modulation: { type: "sine" },
      modulationEnvelope: {
        attack: 0.02,
        decay: 0.6,
        sustain: 0.1,
        release: 1,
      },
      // 长混响下低频易堆积轰头，略降 2dB
      volume: -11,
    });
    boomSynth.connect(reverb);

    // ---- 升华 Pad：正弦波 PolySynth，2.2s 慢淡入 ----
    padSynth = new Tone.PolySynth(Tone.Synth, {
      oscillator: { type: "sine" },
      envelope: { attack: 2.2, decay: 0.8, sustain: 0.45, release: 4.5 },
      volume: -17,
    });
    padSynth.connect(reverb);

    // ---- 宇宙风铃/颂钵：MetalSynth → 极大延迟 → 大混响 ----
    // 延迟 0.62s、反馈 0.55：铃音在虚空中反复反弹，越来越远
    bellDelay = new Tone.FeedbackDelay({
      delayTime: 0.62,
      feedback: 0.55,
      wet: 0.85,
    });
    bellDelay.connect(reverb);

    bellSynth = new Tone.MetalSynth({
      envelope: { attack: 0.001, decay: 3.4, release: 0.9 },
      harmonicity: 12.1,
      modulationIndex: 20,
      resonance: 3200,
      octaves: 1.2,
      volume: -25, // 长延迟尾音会叠加，整体压低
    });
    bellSynth.connect(bellDelay);

    // ---- 无声拥抱：温暖低音和弦（C 大三低音转位，慢起音，像被托住）----
    hugSynth = new Tone.PolySynth(Tone.Synth, {
      oscillator: { type: "sine" },
      envelope: { attack: 0.35, decay: 1.2, sustain: 0.5, release: 4.5 },
      volume: -13,
    });
    hugSynth.connect(reverb);

    // ---- 深空 Drone：棕噪声 + 亚音速正弦，低通滤波缓慢呼吸 ----
    droneBus = new Tone.Gain(0);
    droneBus.connect(master);
    // 极少量混响发送，让底噪也身处空谷
    const droneVerbSend = new Tone.Gain(0.22);
    droneBus.connect(droneVerbSend);
    droneVerbSend.connect(reverb);

    const droneFilter = new Tone.Filter(150, "lowpass", -12);
    droneFilter.connect(droneBus);

    droneNoise = new Tone.Noise("brown");
    droneNoise.connect(droneFilter);

    const subGain = new Tone.Gain(0.07);
    subGain.connect(droneBus);
    droneSub = new Tone.Oscillator(55, "sine"); // A1：胸腔般的亚音速铺底
    droneSub.connect(subGain);

    // LFO 在 70~210Hz 之间极缓慢推拉滤波器，像飞船引擎般呼吸
    droneLfo = new Tone.LFO("4m", 70, 210);
    droneLfo.connect(droneFilter.frequency);

    droneNoise.start();
    droneSub.start();
    droneLfo.start();
    droneBus.gain.rampTo(DRONE_LEVEL, 9);

    started = true;
  })();

  return starting.catch((err) => {
    // 音频不可用时静默降级，不影响视觉
    starting = null;
    console.warn("[generativeAudio] init failed", err);
  });
}

/** 每输入一个字符：轻微低频水滴 */
export function playType() {
  if (!started || !dropSynth) return;
  const now = performance.now();
  if (now - lastTypeAt < TYPE_MIN_GAP_MS) return;
  lastTypeAt = now;
  try {
    dropSynth.triggerAttackRelease(pick(TYPE_NOTES), "16n", undefined, 0.22);
  } catch {
    /* ignore */
  }
}

/** 回车碎裂：C2 沉重低音 */
export function playDestruction() {
  if (!started || !boomSynth) return;
  try {
    boomSynth.triggerAttackRelease("C2", "2n", undefined, 0.55);
  } catch {
    /* ignore */
  }
}

/** 粒子汇聚升华：Cmaj9 温暖和弦缓慢淡入 */
export function playAlchemy() {
  if (!started || !padSynth) return;
  try {
    padSynth.triggerAttackRelease([...ALCHEMY_CHORD], 7);
  } catch {
    /* ignore */
  }
}

/** 涟漪共鸣：五声音阶随机风铃音 */
export function playEchoNote() {
  if (!started || !bellSynth) return;
  const now = performance.now();
  if (now - lastEchoAt < ECHO_MIN_GAP_MS) return;
  lastEchoAt = now;
  try {
    bellSynth.triggerAttackRelease(pick(PENTA), "8n", undefined, 0.32);
  } catch {
    /* ignore */
  }
}

/** 发送拥抱：涟漪化作光点时的温暖低音和弦 */
export function playHugSend() {
  if (!started || !hugSynth) return;
  const now = performance.now();
  if (now - lastHugAt < 400) return;
  lastHugAt = now;
  try {
    hugSynth.triggerAttackRelease(HUG_SEND_CHORD, 5);
  } catch {
    /* ignore */
  }
}

/** 接收拥抱：自己的某颗星被陌生人抱住，一记更柔亮的风铃回应 */
export function playHugReceive() {
  if (!started || !bellSynth) return;
  try {
    bellSynth.triggerAttackRelease("E4", "2n", undefined, 0.4);
  } catch {
    /* ignore */
  }
}

/** 熄灯/复原：让全部音律与深空 Drone 一起“远去/回来” */
export function setGenerativeDim(dim: boolean) {
  try {
    master?.volume.rampTo(dim ? MASTER_DIM_DB : MASTER_DB, 1.5);
    droneBus?.gain.rampTo(dim ? DRONE_DIM_LEVEL : DRONE_LEVEL, 2.2);
  } catch {
    /* ignore */
  }
}
