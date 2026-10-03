"use client";

/**
 * 「归零 (Zero)」— 宇宙深海 × 情绪自适应 × 星云热力学 × 同辈之网
 *
 * 本文件只做页面编排（状态接线 + 提交流程 + JSX），实现拆分在三个模块：
 *   - src/lib/audioEngine.ts    音频引擎：Tone.js 单例（Drone/水滴/拨弦/Bass/双混响）
 *   - src/hooks/useStarStorage  星穹存储：localStorage 恒星日记
 *   - src/hooks/useFxLayer      特效层：涟漪/溶解/流星/热力/星尘/两个共鸣调度器
 *
 * 交互闭环：打字水滴声 → 回车 → 文字 blur 溶解 → 自适应星尘+涟漪+恒星+光影字条
 * 自适应：字数 <10 轻=青白粒子+Pluck 拨弦+快涟漪；>=10 重=琥珀粒子+G1 极低频+深紫巨波
 * IME：组词（拼音未上屏）期间回车不提交、不逐键响水滴，仅整词上屏后响一声
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import StarfieldBackground from "@/components/StarfieldBackground";
import NebulaWonders from "@/components/NebulaWonders";
import {
  applyCircadianPhase,
  ensureAudio,
  playBassG1,
  playBellThrottled,
  playDrop,
  playPluck,
  primeAudio,
  sleepAudio,
  wakeAudio,
} from "@/lib/audioEngine";
import { CIRCADIAN_TOKENS } from "@/lib/circadian";
import { CRISIS_WHISPER, detectCrisis } from "@/lib/crisis";
import { hapticShatter } from "@/lib/haptics";
import { useCircadianPhase } from "@/hooks/useCircadianPhase";
import { useKeyboardInset } from "@/hooks/useVisualViewport";
import { usePageVisibility } from "@/hooks/usePageVisibility";
import { useStarStorage } from "@/hooks/useStarStorage";
import { RippleWave, useFxLayer, type DissolveText } from "@/hooks/useFxLayer";

/* ------------------------------------------------------------------ */
/* 常量                                                                */
/* ------------------------------------------------------------------ */

const PHRASES = [
  "迷茫...",
  "没关系的...",
  "晚安...",
  "撑住...",
  "也是一个人...",
];

/** 沉重情绪字数阈值 */
const HEAVY_THRESHOLD = 10;

interface Whisper {
  id: number;
  text: string;
  /** 危机兜底字条：更笃定、停留更久（≥15s）、多行排版 */
  crisis?: boolean;
}

/* ------------------------------------------------------------------ */
/* 主组件                                                              */
/* ------------------------------------------------------------------ */

export default function Home() {
  const [value, setValue] = useState("");
  const [whisper, setWhisper] = useState<Whisper | null>(null);

  const inputRef = useRef<HTMLInputElement>(null);
  const whisperTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastPhrase = useRef<string>("");
  /** IME 组词中（拼音未上屏）：期间回车不提交、不逐键响水滴 */
  const composingRef = useRef(false);
  /** 部分安卓 IME 在 compositionend 之后才发提交回车的 keydown，靠时间窗拦截 */
  const compositionEndedAt = useRef(0);

  /* ---- 生物钟时段（深夜/白天/傍晚，到边界自动切换） ---- */
  const phase = useCircadianPhase();
  /* ---- 页面可见性（环保休眠信号源） ---- */
  const hidden = usePageVisibility();
  /* ---- iOS / 微信 WKWebView 软键盘遮挡高度（px），抬起底部输入区 ---- */
  const kbInset = useKeyboardInset();
  /** 回归薄纱纪元：每次从隐藏→可见 +1（渲染期检测外部 store 翻转，首挂天然不触发） */
  const [veilEpoch, setVeilEpoch] = useState(0);
  const [prevHidden, setPrevHidden] = useState(hidden);
  if (prevHidden !== hidden) {
    setPrevHidden(hidden);
    if (!hidden) setVeilEpoch((n) => n + 1);
  }

  /* ---- 三大模块：星穹存储 / 特效层（音频引擎为 lib 单例，直接按需调用） ---- */
  const { stars, hydrated, addStar } = useStarStorage();
  const {
    ripples,
    addRipple,
    removeRipple,
    ripplePace,
    dissolve,
    startDissolve,
    clearDissolve,
    fxCanvasRef,
    heatLayerRef,
    nebulaTempRef,
    heatNebula,
    burstStardust,
  } = useFxLayer(inputRef, phase);

  /* ---- 生物钟 → 音频引擎参数（混响湿度 / Drone 音量与低通区间） ---- */
  useEffect(() => {
    applyCircadianPhase(phase);
  }, [phase]);

  /* ---- 首次触摸 / 按键即解锁音频 ----
     关键：primeAudio() 必须在事件的同步调用栈里执行（先建出真实
     AudioContext 再 resume），微信 WKWebView 才放行；放到 await 后会
     导致 Context 以 suspended 诞生、全程无声。
     初始化失败时保留监听，下一次手势继续尝试。 */
  useEffect(() => {
    const unlock = () => {
      primeAudio();
      ensureAudio()
        .then(() => {
          window.removeEventListener("touchstart", unlock);
          window.removeEventListener("pointerdown", unlock);
          window.removeEventListener("keydown", unlock);
          window.removeEventListener("touchend", unlock);
        })
        .catch(() => {
          /* 保留监听，等待下一次手势 */
        });
    };
    // touchstart 是微信/iOS 上最早、最可靠的手势事件
    window.addEventListener("touchstart", unlock, { passive: true });
    window.addEventListener("pointerdown", unlock);
    window.addEventListener("keydown", unlock);
    window.addEventListener("touchend", unlock);

    // 微信桥就绪事件（部分版本先于首个手势即可解除媒体限制）
    const wx = window as unknown as {
      WeixinJSBridge?: unknown;
      addEventListener?(t: string, fn: () => void): void;
      removeEventListener?(t: string, fn: () => void): void;
    };
    const onBridge = () => primeAudio();
    if (wx.WeixinJSBridge) {
      onBridge();
    } else {
      document.addEventListener("WeixinJSBridgeReady", onBridge);
    }
    return () => {
      window.removeEventListener("touchstart", unlock);
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
      window.removeEventListener("touchend", unlock);
      document.removeEventListener("WeixinJSBridgeReady", onBridge);
    };
  }, []);

  /* ---- 环保休眠：切走 → 标题静默「…」+ 音频淡出挂起（粒子暂停由 StarfieldBackground 的 paused 负责）；
              切回 → 标题恢复 + 音频 1.6s 淡入（回归薄纱纪元在渲染期推进，驱动 1.3s 黑纱淡出） ---- */
  useEffect(() => {
    if (hidden) {
      document.title = "…";
      sleepAudio();
    } else {
      document.title = "归零 Zero";
      wakeAudio();
    }
  }, [hidden]);

  useEffect(
    () => () => {
      if (whisperTimer.current) clearTimeout(whisperTimer.current);
    },
    []
  );

  /* ---- 恒星悬停：放大发亮 + 五声音阶 ---- */
  const touchStar = useCallback(() => playBellThrottled(), []);

  /* ---- 文字溶解结束 → 自适应涟漪 + 星尘 + 恒星（情绪彻底释放） ---- */
  const releaseEmotion = useCallback(
    (d: DissolveText) => {
      clearDissolve();

      if (d.heavy) {
        // 沉重情绪：极其缓慢、巨大的深紫色能量涟漪（scale→6.5 / 4.4s）
        addRipple({
          x: d.x,
          y: d.y,
          tone: "violet",
          supernova: false,
          dim: false,
          size: 200,
          scaleTo: 6.5,
          duration: 4.4,
          peak: 0.72,
        });
      } else {
        // 轻度情绪：青蓝快速小涟漪，像一声清脆的叹息
        addRipple({
          x: d.x,
          y: d.y,
          tone: "cyan",
          supernova: false,
          dim: false,
          size: 120,
          scaleTo: 3.4,
          duration: 1.7,
          peak: 0.55,
        });
      }

      // 按重量自适应的星尘（青白漂浮 / 琥珀下坠）
      burstStardust(d.heavy);

      // 一颗明亮恒星落入上半屏星穹（随机生成 + 持久化，全部本地完成）
      addStar();
    },
    [addRipple, burstStardust, clearDissolve, addStar]
  );

  /* ---- 提交情绪：文字 blur 溶解；声学与物理按字数自适应 ---- */
  const submitEmotion = useCallback(() => {
    const text = value.trim();
    if (!text) return;

    const rect = inputRef.current?.getBoundingClientRect();
    const x = rect ? rect.left + rect.width / 2 : window.innerWidth / 2;
    const y = rect ? rect.top + rect.height / 2 : window.innerHeight * 0.87;

    // 情绪重量：字数 >=10 为沉重
    const heavy = text.length >= HEAVY_THRESHOLD;
    // 危机文本（自伤/轻生意图）：流程不变，仅替换稍后字条的文案与停留时长
    const crisis = detectCrisis(text);

    setValue("");

    // 触觉：轻情绪一短震，重情绪「震-停-震」模拟重物落地回弹
    hapticShatter(heavy);
    // 能量传递给星云：沉重更烫
    heatNebula(heavy);

    if (heavy) {
      // G1（49Hz）极低频叹息，经 22s 海量混响沉入深空
      playBassG1();
    } else {
      // 空灵拨弦：高把位五声音阶
      playPluck();
    }

    // 文字本体留在原位，模糊上浮地溶解（沉重时溶解更慢）
    startDissolve(text, x, y, heavy);

    // 释放的同时，深空飘来一句光影字条（不连续重复）；
    // 危机文本则换成笃定、长留（18s）的陪伴字条，附全国援助渠道
    if (whisperTimer.current) clearTimeout(whisperTimer.current);
    whisperTimer.current = setTimeout(() => {
      if (crisis) {
        setWhisper({ id: Date.now(), text: CRISIS_WHISPER, crisis: true });
        return;
      }
      let phrase = PHRASES[Math.floor(Math.random() * PHRASES.length)];
      if (PHRASES.length > 1) {
        while (phrase === lastPhrase.current) {
          phrase = PHRASES[Math.floor(Math.random() * PHRASES.length)];
        }
      }
      lastPhrase.current = phrase;
      setWhisper({ id: Date.now(), text: phrase });
    }, 1050);
  }, [value, heatNebula, startDissolve]);

  /* ---- 打字反馈：仅"新增字符"且不在 IME 组词中时响水滴 ----
     playDrop 内部自带「未解锁则初始化后补奏」兜底，无需手动 ensure */
  const handleChange = (next: string) => {
    setValue(next);
    if (!composingRef.current && next.length > value.length) {
      playDrop();
    }
  };

  /* ---------------------------------------------------------------- */

  return (
    <main className="fixed inset-0 overflow-hidden bg-black font-sans">
      <StarfieldBackground phase={phase} paused={hidden} />

      {/* 星云热力层：吸收文字粉碎能量后的暗红/琥珀暖光，rAF 直写 opacity/scale */}
      <div
        ref={heatLayerRef}
        aria-hidden
        className="pointer-events-none fixed inset-[-15%] z-[-9] opacity-0 will-change-[opacity,transform]"
        style={{
          background:
            "radial-gradient(ellipse 72% 58% at 50% 46%, rgba(255,150,70,0.17) 0%, rgba(190,60,30,0.13) 38%, rgba(120,20,25,0.06) 58%, rgba(0,0,0,0) 74%)",
          filter: "blur(calc(70px * var(--zero-blur-scale, 1)))",
        }}
      />

      {/* 星云奇观：宏大冷色星云，随星云温度交叉淡入暖金/余烬燃烧态（纯视觉层 z-8） */}
      <NebulaWonders tempRef={nebulaTempRef} dim={CIRCADIAN_TOKENS[phase].nebulaDim} />

      {/* 流星拖尾：在星空之上，不拦截任何点击 */}
      <canvas ref={fxCanvasRef} aria-hidden className="pointer-events-none fixed inset-0 z-[5]" />

      {/* 时空涟漪：能量波纹，在星空之上、星穹与输入框之下 */}
      <div aria-hidden className="pointer-events-none fixed inset-0 z-[6]">
        {ripples.map((r) => (
          <RippleWave key={r.id} ripple={r} pace={ripplePace} onDone={() => removeRipple(r.id)} />
        ))}
      </div>

      {/* 星穹：历史恒星（中层） */}
      {hydrated && (
        <div className="pointer-events-none fixed inset-0 z-10">
          <AnimatePresence>
            {stars.map((s) => (
              <motion.div
                key={s.id}
                className="absolute"
                style={{ left: `${s.x}%`, top: `${s.y}%` }}
                initial={{ scale: 0, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ type: "spring", stiffness: 160, damping: 14 }}
              >
                {/* 可交互命中区（放大，方便悬停/触摸） */}
                <motion.button
                  type="button"
                  aria-label="一颗恒星"
                  className="pointer-events-auto block cursor-pointer rounded-full border-0 bg-transparent p-0"
                  style={{ width: s.size + 18, height: s.size + 18, x: "-50%", y: "-50%" }}
                  whileHover={{ scale: 2 }}
                  whileTap={{ scale: 1.7 }}
                  onMouseEnter={touchStar}
                  onTouchStart={touchStar}
                >
                  {/* 内层高亮核心 + 低频闪烁 */}
                  <motion.span
                    className="absolute left-1/2 top-1/2 block rounded-full"
                    style={{
                      width: s.size,
                      height: s.size,
                      marginLeft: -s.size / 2,
                      marginTop: -s.size / 2,
                      background: `radial-gradient(circle, #FFFBEB 0%, ${s.color} 42%, rgba(245,158,11,0.55) 68%, transparent 78%)`,
                      boxShadow: `0 0 6px rgba(251,191,36,0.9), 0 0 22px rgba(245,158,11,0.55), 0 0 52px rgba(245,158,11,0.28)`,
                    }}
                    animate={{ opacity: [0.78, 1, 0.78] }}
                    transition={{
                      duration: s.twinkle,
                      ease: "easeInOut",
                      repeat: Infinity,
                    }}
                  />
                </motion.button>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}

      {/* 回车瞬间：文字在原位模糊上浮、溶解于宇宙（1s 后触发超新星） */}
      <AnimatePresence>
        {dissolve && (
          <motion.div
            key={dissolve.id}
            className="pointer-events-none fixed z-20"
            style={{ left: dissolve.x, top: dissolve.y }}
            initial={{ opacity: 1, filter: "blur(0px)", x: "-50%", y: "-50%" }}
            animate={{
              opacity: 0,
              filter: "blur(10px)",
              x: "-50%",
              y: "-68%",
            }}
            transition={{
              duration: dissolve.heavy ? 1.5 : 1,
              ease: "easeInOut",
            }}
            onAnimationComplete={() => releaseEmotion(dissolve)}
          >
            <span
              className="block whitespace-nowrap text-center text-[17px] font-light tracking-[0.2em] text-amber-50/75"
              style={{ textShadow: "0 0 22px rgba(251,191,36,0.3)" }}
            >
              {dissolve.text}
            </span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 宇宙回响：光影字条（顶层偏上）。
          危机字条：同一视觉语言，仅改为多行、放慢呼吸、停留 18s */}
      <AnimatePresence>
        {whisper && (
          <motion.p
            key={whisper.id}
            className={`pointer-events-none fixed left-1/2 z-20 -translate-x-1/2 text-center text-[15px] text-amber-50/70 sm:text-base ${
              whisper.crisis
                ? "max-w-[82vw] whitespace-pre-line px-6 leading-[2.4] tracking-[0.18em]"
                : "whitespace-nowrap tracking-[0.35em]"
            }`}
            style={{ top: "30%", textShadow: "0 0 24px rgba(251,191,36,0.35)" }}
            initial={{ opacity: 0, filter: "blur(10px)", y: 6 }}
            animate={{
              opacity: [0, 1, 1, 0],
              filter: ["blur(10px)", "blur(2px)", "blur(2px)", "blur(14px)"],
              y: 0,
            }}
            transition={{
              duration: whisper.crisis ? 18 : 7.4,
              times: whisper.crisis ? [0, 0.05, 0.9, 1] : [0, 0.32, 0.72, 1],
              ease: "easeInOut",
            }}
            onAnimationComplete={() => setWhisper(null)}
          >
            {whisper.text}
          </motion.p>
        )}
      </AnimatePresence>

      {/* 唯一的 UI：底部居中无边框输入框 + 呼吸暖光 / 地平线发丝线（纯 CSS 聚焦反馈）。
          iOS/微信键盘弹起时随 visualViewport 抬升，底部留 Home 指示条安全区 */}
      <div
        className="pointer-events-none fixed inset-x-0 z-30 flex justify-center px-8"
        style={{
          bottom: `calc(13vh + ${kbInset}px + env(safe-area-inset-bottom, 0px))`,
        }}
      >
        <div className="group relative flex w-full max-w-[520px] flex-col items-center">
          {/* 背后暖光：静息近无，聚焦时琥珀→暗紫缓缓亮起 */}
          <div
            aria-hidden
            className="absolute -bottom-12 left-1/2 h-44 w-[130%] -translate-x-1/2 rounded-full bg-[radial-gradient(ellipse_at_center,rgba(251,191,36,0.10),rgba(124,58,237,0.06)_46%,transparent_72%)] opacity-30 blur-2xl transition-opacity duration-1000 ease-out group-focus-within:opacity-100"
          />

          <input
            ref={inputRef}
            value={value}
            maxLength={80}
            autoComplete="off"
            spellCheck={false}
            onChange={(e) => handleChange(e.target.value)}
            onCompositionStart={() => {
              composingRef.current = true;
            }}
            onCompositionEnd={(e) => {
              composingRef.current = false;
              compositionEndedAt.current = performance.now();
              // 整词上屏：只响一声水滴（拼音期间的字符不逐键发声）
              if (e.currentTarget.value.length > 0) playDrop();
            }}
            onKeyDown={(e) => {
              if (e.key !== "Enter") return;
              // IME 组词中的回车（确认拼音/选字）不是提交意图：
              // isComposing / keyCode 229 覆盖主流浏览器；
              // 部分安卓 IME 的提交回车在 compositionend 之后才触发，靠 100ms 时间窗兜底
              if (
                e.nativeEvent.isComposing ||
                e.keyCode === 229 ||
                composingRef.current ||
                performance.now() - compositionEndedAt.current < 100
              ) {
                return;
              }
              e.preventDefault();
              submitEmotion();
            }}
            placeholder="把情绪留在这里..."
            className="pointer-events-auto relative z-10 w-full select-text border-none bg-transparent text-center text-[17px] font-light tracking-[0.2em] text-amber-50/55 caret-amber-300/80 outline-none transition-[color,text-shadow] duration-700 placeholder:tracking-[0.32em] placeholder:text-neutral-400/40 placeholder:transition-opacity duration-700 focus:text-amber-50/90 [text-shadow:0_0_14px_rgba(251,191,36,0.12)] focus:[text-shadow:0_0_26px_rgba(251,191,36,0.45)] focus:placeholder:opacity-30"
          />

          {/* 地平线：静息短而隐，聚焦/有字时延展并透出琥珀辉光 */}
          <div
            aria-hidden
            className={`relative mt-4 h-px w-28 overflow-hidden bg-gradient-to-r from-transparent via-slate-200/20 to-transparent transition-all duration-700 ease-out group-focus-within:w-72 group-focus-within:via-amber-200/70 ${
              value.trim() ? "w-72 via-amber-200/45" : ""
            }`}
          >
            {/* 辉光底层 */}
            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-amber-200/60 to-transparent opacity-0 blur-[3px] transition-opacity duration-700 group-focus-within:opacity-90" />
            {/* 游移流光（仅聚焦时可见） */}
            <div className="zero-line-shimmer absolute inset-y-0 w-1/3 bg-gradient-to-r from-transparent via-amber-50/80 to-transparent opacity-0 transition-opacity duration-700 group-focus-within:opacity-100" />
            {/* 两端星点 */}
            <span className="absolute -left-[2px] top-1/2 h-[3px] w-[3px] -translate-y-1/2 rounded-full bg-slate-200/30 shadow-[0_0_6px_1px_rgba(226,232,240,0.15)] transition-all duration-700 group-focus-within:scale-150 group-focus-within:bg-amber-200 group-focus-within:shadow-[0_0_8px_2px_rgba(251,191,36,0.5)]" />
            <span className="absolute -right-[2px] top-1/2 h-[3px] w-[3px] -translate-y-1/2 rounded-full bg-slate-200/30 shadow-[0_0_6px_1px_rgba(226,232,240,0.15)] transition-all duration-700 group-focus-within:scale-150 group-focus-within:bg-amber-200 group-focus-within:shadow-[0_0_8px_2px_rgba(251,191,36,0.5)]" />
          </div>
        </div>
      </div>

      {/* 回归薄纱：从后台切回时一层黑纱 1.3s 缓缓退去，画面不刺眼（与音频 1.6s 淡入同步） */}
      {veilEpoch > 0 && (
        <motion.div
          key={veilEpoch}
          aria-hidden
          className="pointer-events-none fixed inset-0 z-[70] bg-black"
          initial={{ opacity: 0.55 }}
          animate={{ opacity: 0 }}
          transition={{ duration: 1.3, ease: "easeOut" }}
        />
      )}
    </main>
  );
}
