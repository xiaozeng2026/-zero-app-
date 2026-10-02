"use client";

/**
 * 星穹存储 hook —— 情绪凝成的恒星的本地持久化（星穹日记）
 *
 * - Key `zero:stars:warm:v1`，仅客户端 useEffect 内读取，规避 SSR 注水不一致
 * - 写入只在恒星落定时显式触发（addStar），无自动同步 effect
 * - 上限 STARS_LIMIT 颗；localStorage 不可用（满/禁用）时静默降级，不影响体验
 * - 本地存储，无任何数据上传
 */

import { useCallback, useEffect, useRef, useState } from "react";

export interface Star {
  id: string;
  /** 相对视口的百分比坐标（y 只落上半屏） */
  x: number;
  y: number;
  size: number;
  color: string;
  twinkle: number; // 闪烁周期（秒），存盘以保持稳定
  timestamp: number;
}

const STORAGE_KEY = "zero:stars:warm:v1";
const STARS_LIMIT = 120;

/** 恒星色：暖金系 */
const STAR_COLORS = ["#FBBF24", "#F59E0B", "#FDE68A", "#FB923C"];

function loadStars(): Star[] {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as Star[];
    return Array.isArray(parsed) ? parsed.slice(-STARS_LIMIT) : [];
  } catch {
    return [];
  }
}

/** 随机生成一颗落入上半屏的恒星 */
function randomStar(): Star {
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    x: 8 + Math.random() * 84,
    y: 6 + Math.random() * 34,
    size: 12 + Math.random() * 14,
    color: STAR_COLORS[Math.floor(Math.random() * STAR_COLORS.length)],
    twinkle: 3 + Math.random() * 3,
    timestamp: Date.now(),
  };
}

export function useStarStorage() {
  const [stars, setStars] = useState<Star[]>([]);
  const [hydrated, setHydrated] = useState(false);
  /** 镜像 ref：addStar 不依赖 stars 数组，回调保持稳定 */
  const starsRef = useRef<Star[]>([]);

  const commit = useCallback((next: Star[]) => {
    starsRef.current = next;
    setStars(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      /* 存储已满或被禁用：忽略，不影响体验 */
    }
  }, []);

  /** 一颗明亮恒星落入上半屏星穹并持久化 */
  const addStar = useCallback(() => {
    commit([...starsRef.current, randomStar()].slice(-STARS_LIMIT));
  }, [commit]);

  /* 启动：只在客户端恢复星穹一次（localStorage 仅浏览器可读，SSR 渲染期不能读取，
     刻意采用「effect 内一次性注水」模式，规则误报故显式豁免） */
  useEffect(() => {
    const loaded = loadStars();
    starsRef.current = loaded;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setStars(loaded);
    setHydrated(true);
  }, []);

  return { stars, hydrated, addStar };
}
