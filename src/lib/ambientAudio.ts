"use client";

/**
 * 环境底噪（双轨，全程静默降级）：
 * 1. 首选：自托管真实雨声 public/audio/rain.mp3
 *    首次交互后 5 秒缓慢淡入，循环播放，常态音量 0.2
 * 2. 兜底：Web Audio 合成粉红噪声，文件加载失败/离线时自动接管
 *
 * 用相对路径引用音频：trailingSlash 下页面以 "/" 结尾，
 * 本地 "/" 与 GitHub Pages "/-zero-app-/" 子路径都能正确解析。
 */

const RAIN_SRC = "audio/rain.mp3";

const HTML_VOLUME = { normal: 0.2, dim: 0.06 };
const SYNTH_VOLUME = { normal: 0.06, dim: 0.012 };
const FADE_MS = 5000;

let audio: HTMLAudioElement | null = null;
let mode: "html" | "synth" | null = null;
let dim = false;
let bootStarted = false;
let rampToken = 0;

// ---- 合成兜底轨 ----
let actx: AudioContext | null = null;
let gainNode: GainNode | null = null;

/** 生成粉红噪声 buffer（低沉、不刺耳） */
function createNoiseBuffer(ctx: AudioContext, seconds = 4): AudioBuffer {
  const len = ctx.sampleRate * seconds;
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const data = buf.getChannelData(0);

  let b0 = 0, b1 = 0, b2 = 0, b3 = 0;
  for (let i = 0; i < len; i++) {
    const white = Math.random() * 2 - 1;
    b0 = 0.99765 * b0 + white * 0.099046;
    b1 = 0.963 * b1 + white * 0.2965164;
    b2 = 0.57 * b2 + white * 1.0526913;
    b3 = white * 0.1848;
    data[i] = (b0 + b1 + b2 + b3) * 0.05;
  }
  return buf;
}

/** HTML 音频音量平滑渐变（smoothstep 缓动，定时器驱动，后台标签也不中断） */
function rampHtmlVolume(to: number, ms: number) {
  const el = audio;
  if (!el) return;
  const token = ++rampToken;
  const from = el.volume;
  const t0 = performance.now();

  const timer = window.setInterval(() => {
    if (token !== rampToken || !audio) {
      window.clearInterval(timer);
      return;
    }
    const p = Math.min(1, (performance.now() - t0) / ms);
    const e = p * p * (3 - 2 * p);
    audio.volume = from + (to - from) * e;
    if (p >= 1) window.clearInterval(timer);
  }, 50);
}

/** 启动合成噪声轨 */
function startSynth(withFade: boolean) {
  try {
    const AC =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext;
    if (!AC) return;
    actx = new AC();
    gainNode = actx.createGain();
    const target = dim ? SYNTH_VOLUME.dim : SYNTH_VOLUME.normal;
    gainNode.gain.value = withFade ? 0.0001 : target;
    gainNode.connect(actx.destination);

    const src = actx.createBufferSource();
    src.buffer = createNoiseBuffer(actx);
    src.loop = true;
    src.connect(gainNode);
    src.start(0);

    if (withFade) {
      gainNode.gain.exponentialRampToValueAtTime(
        target,
        actx.currentTime + FADE_MS / 1000
      );
    }
    mode = "synth";
  } catch {
    // 音频不可用时彻底静默，不打扰
  }
}

/** 放弃 HTML 轨，切换到合成兜底 */
function fallBackToSynth() {
  if (mode) return;
  if (audio) {
    audio.pause();
    audio.removeAttribute("src");
    try {
      audio.load();
    } catch {
      /* ignore */
    }
    audio = null;
  }
  startSynth(true);
}

/**
 * 首次有效交互时调用：雨声从静默 5 秒淡入至 0.2 并循环。
 * 自动播放策略拒绝时，自动等待下一次手势重试。
 */
export function startAmbient() {
  if (typeof window === "undefined" || bootStarted) return;
  bootStarted = true;

  try {
    const el = new Audio(RAIN_SRC);
    el.loop = true;
    el.preload = "auto";
    el.volume = 0;
    audio = el;

    let settled = false;
    const timer = window.setTimeout(() => {
      if (!settled) {
        settled = true;
        fallBackToSynth();
      }
    }, 8000);

    el.addEventListener(
      "playing",
      () => {
        if (settled) return;
        settled = true;
        window.clearTimeout(timer);
        mode = "html";
        rampHtmlVolume(
          dim ? HTML_VOLUME.dim : HTML_VOLUME.normal,
          FADE_MS
        );
      },
      { once: true }
    );
    el.addEventListener("error", () => {
      window.clearTimeout(timer);
      // 无论是否曾进入播放态，解码/网络失败都交给合成轨兜底
      mode = null;
      fallBackToSynth();
    });

    const playPromise = el.play();
    if (playPromise && typeof playPromise.catch === "function") {
      playPromise.catch(() => {
        window.clearTimeout(timer);
        // 终止本次加载，避免多实例 Range 请求竞争；等待下一次手势重新引导
        el.pause();
        el.removeAttribute("src");
        audio = null;
        const retry = () => {
          window.removeEventListener("pointerdown", retry);
          window.removeEventListener("keydown", retry);
          bootStarted = false;
          startAmbient();
        };
        window.addEventListener("pointerdown", retry, { once: true });
        window.addEventListener("keydown", retry, { once: true });
      });
    }
  } catch {
    fallBackToSynth();
  }
}

/** 熄灯时压低底噪，点灯时恢复，1.5 秒平缓过渡 */
export function setAmbientDim(next: boolean) {
  dim = next;
  if (mode === "html") {
    rampHtmlVolume(next ? HTML_VOLUME.dim : HTML_VOLUME.normal, 1500);
  } else if (mode === "synth" && actx && gainNode) {
    gainNode.gain.cancelScheduledValues(actx.currentTime);
    gainNode.gain.setTargetAtTime(
      Math.max(0.0008, next ? SYNTH_VOLUME.dim : SYNTH_VOLUME.normal),
      actx.currentTime,
      0.4
    );
  }
}
