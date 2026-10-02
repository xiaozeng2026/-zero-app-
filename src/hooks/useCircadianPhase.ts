"use client";

/**
 * useCircadianPhase —— 当前生物钟时段
 *
 * 初始按本地时间判定，并在到达下一个时段边界（00:00 / 06:00 / 19:00）时
 * 自动切换。页面长时间挂着不关也能在凌晨 6 点自然"天亮"。
 */

import { useEffect, useState } from "react";
import {
  getCircadianPhase,
  msUntilNextPhase,
  type CircadianPhase,
} from "@/lib/circadian";

export function useCircadianPhase(): CircadianPhase {
  const [phase, setPhase] = useState<CircadianPhase>(() => getCircadianPhase());

  useEffect(() => {
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
