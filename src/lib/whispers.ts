"use client";

/**
 * 片语共鸣 · 陌生人碎片语料库
 * 每次文字碎裂升空后，系统回赠一张看不真切的深海字条。
 */
export const WHISPERS = [
  "迷茫...",
  "一个人...",
  "好累...",
  "撑住...",
  "晚安...",
  "没关系的...",
  "我在呢...",
  "会过去的...",
  "慢一点也可以...",
  "今天辛苦了...",
  "你不是一个人...",
  "抱抱你...",
] as const;

export function pickWhisper(last?: string | null): string {
  let w = WHISPERS[Math.floor(Math.random() * WHISPERS.length)];
  // 尽量不连续重复同一张字条
  if (last && WHISPERS.length > 1) {
    let guard = 0;
    while (w === last && guard++ < 6) {
      w = WHISPERS[Math.floor(Math.random() * WHISPERS.length)];
    }
  }
  return w;
}
