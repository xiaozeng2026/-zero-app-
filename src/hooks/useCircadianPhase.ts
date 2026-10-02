"use client";

/**
 * useCircadianPhase —— 当前生物钟时段
 *
 * 初始固定为基准态 "evening"，挂载后才读取访客本地时间：
 * SSG 在 GitHub Actions（UTC）构建，构建时刻与访客时区几乎必然不同，
 * 若水合渲染直接用本地时间判定，会与烤进 HTML 的 style 不一致，而 React
 * 水合不 patch 既有属性 —— 底色薄纱/星云压暗将一直卡在构建时刻的时段。
 * 固定初值保证「SSG HTML === 首次客户端渲染」，挂载后经一次正常 state
 * 更新平滑切入真实时段（veil / 星云 3s 过渡，音频 4s ramp）。
 *
 * 之后在到达下一个时段边界（00:00 / 06:00 / 19:00）时自动切换，
 * 页面长时间挂着不关也能在凌晨 6 点自然"天亮"。
 */

import { useEffect, useState } from "react";
import {
  getCircadianPhase,
  msUntilNextPhase,
  type CircadianPhase,
} from "@/lib/circadian";

/** SSG / 水合渲染的稳定初值（基准观感：无薄纱、星云全亮） */
const INITIAL_PHASE: CircadianPhase = "evening";

export function useCircadianPhase(): CircadianPhase {
  const [phase, setPhase] = useState<CircadianPhase>(INITIAL_PHASE);

  useEffect(() => {
    // 挂载后同步一次访客真实时段（水合已完成，style 走正常 diff 提交）
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 浏览器环境值（本地时间）只能在挂载后读取，初值必须与 SSG 一致
    setPhase(getCircadianPhase());

    let timer: ReturnType<typeof setTimeout>;
    const recheck = () => {
      setPhase(getCircadianPhase());
      // 重新计算下一个边界（每次最多跨一个时段）
      timer = setTimeout(recheck, msUntilNextPhase() + 1000);
    };
    timer = setTimeout(recheck, msUntilNextPhase() + 1000);
    return () => clearTimeout(timer);
  }, []);

  return phase;
}
