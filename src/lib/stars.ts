"use client";

/**
 * 星穹日记 · 本地星辰持久化
 *
 * 位置存为 0~1 的归一化比例（跨设备/窗口尺寸仍能回到同一片天空）。
 * 启动时仅读取一次；写入走显式事件（星辰诞生），不做 useEffect 自动同步，
 * 避免「恢复 setState → 立刻写回覆盖」的反馈回路。
 */

export interface StarRecord {
  id: string;
  color: number; // hue 0~360
  size: number; // 微星辰半径（px）
  x_position: number; // 0~1
  y_position: number; // 0~1
  timestamp: number;
}

const STORAGE_KEY = "zero:stars:v1";
const MAX_STARS = 220;

export function loadStars(): StarRecord[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(
        (s): s is StarRecord =>
          !!s &&
          typeof s.id === "string" &&
          typeof s.color === "number" &&
          typeof s.size === "number" &&
          typeof s.x_position === "number" &&
          typeof s.y_position === "number"
      )
      .slice(-MAX_STARS);
  } catch {
    return [];
  }
}

export function saveStar(star: StarRecord): StarRecord[] {
  const list = loadStars();
  list.push(star);
  const trimmed = list.slice(-MAX_STARS);
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed));
  } catch {
    // 隐私模式/配额满：静默失败，只保留内存中的天空
  }
  return trimmed;
}

export function newStarId(): string {
  return `s_${Date.now().toString(36)}_${Math.random()
    .toString(36)
    .slice(2, 8)}`;
}
