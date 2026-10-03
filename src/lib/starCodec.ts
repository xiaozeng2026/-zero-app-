/**
 * 星穹存档编解码 —— 纯函数
 *
 * 从 useStarStorage 抽出：localStorage 里的 JSON 不可信（手工篡改 /
 * 旧版本数据 / 损坏写入），读取时逐元素做形状校验，坏条目整条丢弃，
 * 合法条目只保留最后 STARS_LIMIT 颗（最旧的先滚出）。
 */

import type { Star } from "@/hooks/useStarStorage";

/** 星穹容量上限（最旧恒星先被挤出） */
export const STARS_LIMIT = 120;

function isFiniteNumber(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

/** 单个值是否满足恒星记录的最小形状（字段齐全、类型正确、数值有限） */
export function isValidStar(value: unknown): value is Star {
  if (value === null || typeof value !== "object") return false;
  const o = value as Record<string, unknown>;
  return (
    typeof o.id === "string" &&
    o.id.length > 0 &&
    isFiniteNumber(o.x) &&
    isFiniteNumber(o.y) &&
    isFiniteNumber(o.size) &&
    isFiniteNumber(o.twinkle) &&
    isFiniteNumber(o.timestamp) &&
    typeof o.color === "string" &&
    o.color.length > 0
  );
}

/**
 * 解析 localStorage 读出的已解析 JSON（unknown）：
 * 非数组 → []；数组内坏元素剔除；超过上限只留最后 120 颗。
 */
export function parseStars(raw: unknown): Star[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter(isValidStar).slice(-STARS_LIMIT);
}
