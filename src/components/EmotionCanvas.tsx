"use client";

import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
} from "react";
import { motion, useAnimationControls } from "framer-motion";

/**
 * 情绪黑洞 · 粒子宇宙（单一 Canvas，单 rAF）
 *
 * 1. 物理毁灭：输入文字回车 → 像素取样 → 数百枚发光余烬瞬间爆裂，
 *    受重力向下散落（短促顿挫）。
 * 2. 情绪炼金：散落 1 秒后粒子受阻尼弹簧牵引，上浮汇聚至屏幕上半部，
 *    凝聚成一颗呼吸的微光星体。颜色/尺寸由文字长度决定
 *    （短 → 冷蓝，长 → 暗红）。
 * 3. 无字共鸣：3~8 秒随机间隔，在世界的随机角落泛起一次
 *    微弱涟漪或流星（opacity 0.1~0.3），代表陌生人刚刚消解的烦恼。
 */

export interface EmotionCanvasHandle {
  dissolve: (text: string, origin: { x: number; y: number }) => void;
}

interface Ember {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  hue: number;
  age: number;
  absorbed: boolean;
}

interface Wisp {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  hue: number;
  age: number;
  dur: number;
}

interface Shockwave {
  x: number;
  y: number;
  hue: number;
  age: number;
  dur: number;
  maxR: number;
}

interface Orb {
  x: number;
  y: number;
  hue: number;
  targetR: number;
  energy: number; // 0~1，汇聚进度
  absorbed: number;
  total: number;
  dyingAge: number; // >=0 表示正在消逝
}

interface RippleEvt {
  kind: "ripple";
  x: number;
  y: number;
  age: number;
  dur: number;
  maxR: number;
  peak: number;
}

interface MeteorEvt {
  kind: "meteor";
  x: number;
  y: number;
  dx: number;
  dy: number;
  age: number;
  dur: number;
  speed: number;
  tail: number;
  peak: number;
}

type Echo = RippleEvt | MeteorEvt;

const MAX_EMBERS = 720;
const SPRITE_N = 26;
const BURST_END = 0.95; // 爆裂散落时长（秒）
const GATHER_BLEND = 0.34; // 切换到汇聚引力的过渡时长
const GATHER_Y_RATIO = 0.3; // 星体汇聚在屏幕上半部

const clamp = (v: number, lo: number, hi: number) =>
  Math.max(lo, Math.min(hi, v));
const smooth = (p: number) => p * p * (3 - 2 * p);
const easeOutCubic = (p: number) => 1 - Math.pow(1 - p, 3);

/** 预渲染柔光精灵，按色相分桶，避免逐粒子创建渐变 */
function makeGlowSprite(hue: number): HTMLCanvasElement {
  const s = 32;
  const c = document.createElement("canvas");
  c.width = s;
  c.height = s;
  const g = c.getContext("2d");
  if (!g) return c;
  const grad = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
  grad.addColorStop(0, `hsla(${hue}, 100%, 90%, 1)`);
  grad.addColorStop(0.22, `hsla(${hue}, 95%, 70%, 0.85)`);
  grad.addColorStop(0.58, `hsla(${hue}, 90%, 56%, 0.2)`);
  grad.addColorStop(1, `hsla(${hue}, 90%, 50%, 0)`);
  g.fillStyle = grad;
  g.fillRect(0, 0, s, s);
  return c;
}

/** 把文字绘制到离屏 canvas，按像素密度取样为粒子坐标 */
function sampleText(
  text: string,
  origin: { x: number; y: number }
): { x: number; y: number }[] {
  const fs = 42;
  const pad = fs;
  const font = `400 ${fs}px "Songti SC", "Noto Serif CJK SC", "Noto Serif SC", serif`;

  const probe = document.createElement("canvas").getContext("2d");
  if (!probe) return [];
  probe.font = font;
  const w = Math.ceil(probe.measureText(text).width) + pad * 2;
  const h = Math.ceil(fs * 1.8);

  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const g = c.getContext("2d");
  if (!g) return [];
  g.font = font;
  g.fillStyle = "#fff";
  g.textBaseline = "middle";
  g.fillText(text, pad, h / 2);

  const data = g.getImageData(0, 0, w, h).data;

  const gather = (step: number) => {
    const pts: { x: number; y: number }[] = [];
    for (let py = 0; py < h; py += step) {
      for (let px = 0; px < w; px += step) {
        const a = data[(py * w + px) * 4 + 3];
        if (a > 140) pts.push({ x: px, y: py });
      }
    }
    return pts;
  };

  let pts = gather(3);
  if (pts.length > MAX_EMBERS) {
    const step = Math.max(4, Math.ceil(3 * Math.sqrt(pts.length / MAX_EMBERS)));
    pts = gather(step);
  }

  const ox = origin.x - w / 2;
  const oy = origin.y - h / 2;
  return pts.map((p) => ({ x: ox + p.x, y: oy + p.y }));
}

const EmotionCanvas = forwardRef<EmotionCanvasHandle>(
  function EmotionCanvas(_, ref) {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const punch = useAnimationControls();

    // 全部可变状态放在 ref 里，rAF 循环零闭包重建
    const embersRef = useRef<Ember[]>([]);
    const wispsRef = useRef<Wisp[]>([]);
    const wavesRef = useRef<Shockwave[]>([]);
    const echoesRef = useRef<Echo[]>([]);
    const orbRef = useRef<Orb | null>(null);
    const spritesRef = useRef<HTMLCanvasElement[]>([]);
    const sizeRef = useRef({ w: 0, h: 0, dpr: 1 });

    const spriteFor = (hue: number) => {
      const bucket = Math.round(
        (clamp(((hue % 360) + 360) % 360, 0, 360) / 360) * (SPRITE_N - 1)
      );
      return spritesRef.current[bucket];
    };

    const dissolve = (raw: string, origin: { x: number; y: number }) => {
      const text = raw.trim().slice(0, 40);
      if (!text) return;

      // 旧星体先化为余烬向上飘散
      const old = orbRef.current;
      if (old && old.dyingAge < 0) {
        old.dyingAge = 0;
        for (let i = 0; i < 80; i++) {
          const a = Math.random() * Math.PI * 2;
          const sp = 20 + Math.random() * 70;
          wispsRef.current.push({
            x: old.x + Math.cos(a) * old.targetR * 0.4,
            y: old.y + Math.sin(a) * old.targetR * 0.4,
            vx: Math.cos(a) * sp - 10,
            vy: Math.sin(a) * sp - 46,
            size: 0.7 + Math.random() * 1.5,
            hue: old.hue + (Math.random() - 0.5) * 18,
            age: 0,
            dur: 1.5 + Math.random() * 0.7,
          });
        }
      }

      // 长度 → 色相：短冷蓝（215），长暗红（0）
      const t = clamp(text.length / 20, 0, 1);
      const hue = 215 * (1 - t);
      const targetR = clamp(8 + text.length * 0.9, 10, 46);

      const pts = sampleText(text, origin);
      const cx = origin.x;
      const cy = origin.y;
      const embers: Ember[] = pts.map((p) => {
        const dx = p.x - cx;
        const dy = p.y - cy;
        const len = Math.hypot(dx, dy) || 1;
        // 以向外爆裂为主，带少量乱序
        const speed = 130 + Math.random() * 300;
        return {
          x: p.x,
          y: p.y,
          vx: (dx / len) * speed + (Math.random() - 0.5) * 150,
          vy: (dy / len) * speed - 120 - Math.random() * 120,
          size: 0.7 + Math.random() * 1.2,
          hue: hue + (Math.random() - 0.5) * 22,
          age: 0,
          absorbed: false,
        };
      });
      embersRef.current = embers;

      orbRef.current = {
        x: sizeRef.current.w / 2,
        y: sizeRef.current.h * GATHER_Y_RATIO,
        hue,
        targetR,
        energy: 0,
        absorbed: 0,
        total: Math.max(1, embers.length),
        dyingAge: -1,
      };

      wavesRef.current.push({
        x: cx,
        y: cy,
        hue,
        age: 0,
        dur: 0.6,
        maxR: 70 + Math.min(120, text.length * 4),
      });

      // 毁灭瞬间的顿挫：画布极其轻微的一次“呼吸外扩”
      punch.start({
        scale: [1, 1.014, 1],
        transition: { duration: 0.42, ease: [0.16, 1, 0.3, 1] },
      });
    };

    useImperativeHandle(ref, () => ({ dissolve }), [punch]);

    useEffect(() => {
      spritesRef.current = Array.from({ length: SPRITE_N }, (_, i) =>
        makeGlowSprite((i / (SPRITE_N - 1)) * 360)
      );

      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      let raf = 0;
      let last = performance.now();
      let echoTimer = 0;

      const resize = () => {
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        const w = window.innerWidth;
        const h = window.innerHeight;
        sizeRef.current = { w, h, dpr };
        canvas.width = w * dpr;
        canvas.height = h * dpr;
        canvas.style.width = `${w}px`;
        canvas.style.height = `${h}px`;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        if (orbRef.current && orbRef.current.dyingAge < 0) {
          orbRef.current.x = w / 2;
          orbRef.current.y = h * GATHER_Y_RATIO;
        }
      };
      resize();
      window.addEventListener("resize", resize);

      // ---- 无字共鸣：3~8 秒随机，陌生人的一次消解 ----
      const spawnEcho = () => {
        const { w, h } = sizeRef.current;
        if (Math.random() < 0.62) {
          echoesRef.current.push({
            kind: "ripple",
            x: w * (0.08 + Math.random() * 0.84),
            y: h * (0.1 + Math.random() * 0.72),
            age: 0,
            dur: 2.4 + Math.random() * 1.1,
            maxR: 46 + Math.random() * 72,
            peak: 0.1 + Math.random() * 0.13,
          });
        } else {
          const ang = Math.PI * (0.12 + Math.random() * 0.16);
          const dir = Math.random() < 0.5 ? 1 : -1;
          echoesRef.current.push({
            kind: "meteor",
            x: w * (0.12 + Math.random() * 0.7),
            y: h * (0.08 + Math.random() * 0.55),
            dx: Math.cos(ang) * dir,
            dy: Math.sin(ang),
            age: 0,
            dur: 1.5 + Math.random() * 0.9,
            speed: 150 + Math.random() * 110,
            tail: 60 + Math.random() * 55,
            peak: 0.1 + Math.random() * 0.12,
          });
        }
        echoTimer = window.setTimeout(spawnEcho, 3000 + Math.random() * 5000);
      };
      echoTimer = window.setTimeout(spawnEcho, 2200);

      const onVisibility = () => {
        if (document.hidden) {
          window.clearTimeout(echoTimer);
        } else {
          last = performance.now();
          window.clearTimeout(echoTimer);
          echoTimer = window.setTimeout(spawnEcho, 2500);
        }
      };
      document.addEventListener("visibilitychange", onVisibility);

      const drawGlow = (
        x: number,
        y: number,
        r: number,
        hue: number,
        alpha: number
      ) => {
        const sprite = spriteFor(hue);
        if (!sprite) return;
        ctx.globalAlpha = clamp(alpha, 0, 1);
        ctx.drawImage(sprite, x - r, y - r, r * 2, r * 2);
        ctx.globalAlpha = 1;
      };

      const tick = (now: number) => {
        const dt = clamp((now - last) / 1000, 0.001, 0.05);
        last = now;
        const { w, h } = sizeRef.current;
        ctx.clearRect(0, 0, w, h);
        ctx.globalCompositeOperation = "lighter";

        // ---------- 无字共鸣（背景层） ----------
        const echoes = echoesRef.current;
        for (let i = echoes.length - 1; i >= 0; i--) {
          const e = echoes[i];
          e.age += dt;
          const p = e.age / e.dur;
          if (p >= 1) {
            echoes.splice(i, 1);
            continue;
          }
          const a = e.peak * Math.sin(Math.PI * p); // 淡入再淡出
          if (e.kind === "ripple") {
            const r = easeOutCubic(p) * e.maxR;
            ctx.beginPath();
            ctx.strokeStyle = `rgba(168, 186, 220, ${a.toFixed(3)})`;
            ctx.lineWidth = 1.1;
            ctx.arc(e.x, e.y, r, 0, Math.PI * 2);
            ctx.stroke();
            ctx.beginPath();
            ctx.strokeStyle = `rgba(168, 186, 220, ${(a * 0.35).toFixed(3)})`;
            ctx.lineWidth = 0.6;
            ctx.arc(e.x, e.y, r * 0.72, 0, Math.PI * 2);
            ctx.stroke();
          } else {
            const dist = p * e.speed * e.dur;
            const hx = e.x + e.dx * dist;
            const hy = e.y + e.dy * dist;
            const tx = hx - e.dx * e.tail;
            const ty = hy - e.dy * e.tail;
            const grad = ctx.createLinearGradient(tx, ty, hx, hy);
            grad.addColorStop(0, "rgba(180, 198, 230, 0)");
            grad.addColorStop(1, `rgba(190, 208, 236, ${a.toFixed(3)})`);
            ctx.strokeStyle = grad;
            ctx.lineWidth = 1.1;
            ctx.beginPath();
            ctx.moveTo(tx, ty);
            ctx.lineTo(hx, hy);
            ctx.stroke();
            drawGlow(hx, hy, 3.2, 222, a * 0.9);
          }
        }

        // ---------- 毁灭冲击波（如释重负的顿挫） ----------
        const waves = wavesRef.current;
        for (let i = waves.length - 1; i >= 0; i--) {
          const wv = waves[i];
          wv.age += dt;
          const p = wv.age / wv.dur;
          if (p >= 1) {
            waves.splice(i, 1);
            continue;
          }
          const r = easeOutCubic(p) * wv.maxR;
          ctx.beginPath();
          ctx.strokeStyle = `hsla(${wv.hue}, 80%, 72%, ${(0.32 * (1 - p)).toFixed(3)})`;
          ctx.lineWidth = 1.4 * (1 - p) + 0.4;
          ctx.arc(wv.x, wv.y, r, 0, Math.PI * 2);
          ctx.stroke();
        }

        // ---------- 星体 ----------
        const orb = orbRef.current;
        if (orb) {
          if (orb.dyingAge >= 0) {
            orb.dyingAge += dt;
            if (orb.dyingAge > 0.9) orbRef.current = null;
          }
          const target = orb.absorbed / orb.total;
          orb.energy += (target - orb.energy) * Math.min(1, dt * 6);

          const dieP =
            orb.dyingAge >= 0 ? clamp(orb.dyingAge / 0.9, 0, 1) : 0;
          const live = 1 - smooth(dieP);
          const breathe = 1 + Math.sin(now * 0.0013) * 0.05;
          const R = Math.max(0.1, orb.targetR * easeOutCubic(orb.energy) * breathe * live);
          const ea = clamp(orb.energy, 0, 1) * live;

          if (ea > 0.01 && R > 0.5) {
            // 外层弥散光晕
            const grad = ctx.createRadialGradient(
              orb.x, orb.y, 0,
              orb.x, orb.y, R * 6.4
            );
            grad.addColorStop(0, `hsla(${orb.hue}, 90%, 72%, ${(0.2 * ea).toFixed(3)})`);
            grad.addColorStop(0.35, `hsla(${orb.hue}, 85%, 60%, ${(0.08 * ea).toFixed(3)})`);
            grad.addColorStop(1, `hsla(${orb.hue}, 85%, 55%, 0)`);
            ctx.fillStyle = grad;
            ctx.beginPath();
            ctx.arc(orb.x, orb.y, R * 6.4, 0, Math.PI * 2);
            ctx.fill();
            // 星核
            drawGlow(orb.x, orb.y, R * 1.7, orb.hue, 0.5 * ea);
            drawGlow(orb.x, orb.y, R * 0.62, orb.hue + 18, 0.95 * ea);
          }
        }

        // ---------- 余烬：爆裂散落 → 上浮汇聚 ----------
        const embers = embersRef.current;
        if (embers.length && orb) {
          const dragBurst = Math.exp(-1.15 * dt);
          for (let i = embers.length - 1; i >= 0; i--) {
            const p = embers[i];
            if (p.absorbed) continue;
            p.age += dt;

            if (p.age < BURST_END) {
              // 重力散落，初段速度快、阻尼重 → 顿挫落地感
              p.vy += 920 * dt;
              p.vx *= dragBurst;
              p.vy *= Math.exp(-0.55 * dt);
            } else {
              // 阻尼弹簧 + 轻微旋涡，把粒子吸向星体
              const k = smooth(
                clamp((p.age - BURST_END) / GATHER_BLEND, 0, 1)
              );
              const dx = orb.x - p.x;
              const dy = orb.y - p.y;
              const dist = Math.hypot(dx, dy) || 1;
              const swirl = 0.85 * k;
              const ax =
                dx * 4.4 * k + (-dy / dist) * swirl * 60 - p.vx * 3.8 * k;
              const ay =
                dy * 4.4 * k + (dx / dist) * swirl * 60 - p.vy * 3.8 * k;
              p.vx += ax * dt;
              p.vy += ay * dt;

              if (
                dist < orb.targetR * 0.5 + 5 &&
                k > 0.6
              ) {
                p.absorbed = true;
                orb.absorbed += 1;
                // 入核瞬间的一点微闪
                drawGlow(p.x, p.y, p.size * 5, p.hue, 0.8);
                continue;
              }
              // 兜底：超过 6 秒强制归核
              if (p.age > 6) {
                p.absorbed = true;
                orb.absorbed += 1;
                continue;
              }
            }

            p.x += p.vx * dt;
            p.y += p.vy * dt;
            const flick = 0.7 + 0.3 * Math.sin(now * 0.006 + i);
            drawGlow(p.x, p.y, p.size * 3.4, p.hue, 0.85 * flick);
          }
        }

        // ---------- 旧星体飘散的余烬 ----------
        const wisps = wispsRef.current;
        for (let i = wisps.length - 1; i >= 0; i--) {
          const s = wisps[i];
          s.age += dt;
          if (s.age > s.dur) {
            wisps.splice(i, 1);
            continue;
          }
          s.x += (s.vx + Math.sin(s.age * 2 + i) * 12) * dt;
          s.y += s.vy * dt;
          s.vy *= Math.exp(-0.35 * dt);
          const a = (1 - s.age / s.dur) * 0.7;
          drawGlow(s.x, s.y, s.size * 4, s.hue, a);
        }

        ctx.globalCompositeOperation = "source-over";
        raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);

      return () => {
        cancelAnimationFrame(raf);
        window.clearTimeout(echoTimer);
        window.removeEventListener("resize", resize);
        document.removeEventListener("visibilitychange", onVisibility);
      };
    }, [punch]);

    return (
      <motion.div
        className="pointer-events-none fixed inset-0 z-10"
        animate={punch}
        style={{ willChange: "transform" }}
      >
        <canvas ref={canvasRef} data-layer="emotion" className="block" />
      </motion.div>
    );
  }
);

export default EmotionCanvas;
