"use client";

/**
 * 极简环境底噪：Web Audio API 生成的低噪雨声。
 * 不加载外部音频文件，适合 demo 部署。
 */
let ctx: AudioContext | null = null;
let gainNode: GainNode | null = null;
let isPlaying = false;

/** 生成粉红噪声 buffer */
function createNoiseBuffer(ctx: AudioContext, seconds = 4): AudioBuffer {
  const len = ctx.sampleRate * seconds;
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const data = buf.getChannelData(0);

  // 简化的粉红噪声（低通滤波白噪声近似）
  let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0;
  for (let i = 0; i < len; i++) {
    const white = Math.random() * 2 - 1;
    b0 = 0.99765 * b0 + white * 0.099046;
    b1 = 0.96300 * b1 + white * 0.2965164;
    b2 = 0.57000 * b2 + white * 1.0526913;
    b3 = white * 0.1848;
    data[i] = (b0 + b1 + b2 + b3) * 0.05;
  }
  return buf;
}

export function startAmbient() {
  if (typeof window === "undefined" || isPlaying) return;
  try {
    const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextClass) return;
    ctx = new AudioContextClass();
    gainNode = ctx.createGain();
    gainNode.gain.value = 0.06;
    gainNode.connect(ctx.destination);

    const src = ctx.createBufferSource();
    src.buffer = createNoiseBuffer(ctx);
    src.loop = true;
    src.connect(gainNode);
    src.start(0);
    isPlaying = true;
  } catch {
    // 浏览器策略阻止时静默失败
  }
}

export function setAmbientLevel(level: number) {
  if (!gainNode || !ctx) return;
  // 平滑过渡
  gainNode.gain.exponentialRampToValueAtTime(
    Math.max(0.001, level),
    ctx.currentTime + 0.8
  );
}

export function toggleAmbient() {
  if (!isPlaying) {
    startAmbient();
    return;
  }
  if (!gainNode || !ctx) return;
  const now = ctx.currentTime;
  const target = gainNode.gain.value > 0.01 ? 0.001 : 0.06;
  gainNode.gain.exponentialRampToValueAtTime(target, now + 0.8);
}
