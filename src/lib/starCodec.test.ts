/**
 * 星穹存档解析单测（loadStars 的纯函数内核 parseStars）：
 * - 非数组 / 非对象 / 坏 JSON 形态一律安全降级
 * - 逐元素形状校验：缺字段、类型错、NaN/Infinity、空字符串都剔除
 * - 合法条目保序；超过 120 颗只保留最后 120
 */
import { describe, it, expect } from "vitest";
import { isValidStar, parseStars, STARS_LIMIT } from "./starCodec";
import type { Star } from "@/hooks/useStarStorage";

const star = (over: Partial<Star> = {}): Star => ({
  id: "s1",
  x: 50,
  y: 20,
  size: 18,
  color: "#FBBF24",
  twinkle: 4,
  timestamp: 1_700_000_000_000,
  ...over,
});

describe("isValidStar 形状校验", () => {
  it("合法恒星", () => {
    expect(isValidStar(star())).toBe(true);
  });

  it.each([
    ["null", null],
    ["数字", 42],
    ["字符串", "s1"],
    ["数组", []],
    ["缺 id", star({ id: "" })],
    ["id 非字符串", star({ id: 1 as unknown as string })],
    ["x NaN", star({ x: Number.NaN })],
    ["y Infinity", star({ y: Number.POSITIVE_INFINITY })],
    ["size 非数字", star({ size: "18" as unknown as number })],
    ["twinkle 缺失", ({ ...star(), twinkle: undefined } as unknown)],
    ["timestamp 布尔", star({ timestamp: true as unknown as number })],
    ["color 空", star({ color: "" })],
  ])("拒收：%s", (_name, bad) => {
    expect(isValidStar(bad)).toBe(false);
  });
});

describe("parseStars 解析与过滤", () => {
  it("非数组输入全部降级为空数组", () => {
    expect(parseStars(null)).toEqual([]);
    expect(parseStars(undefined)).toEqual([]);
    expect(parseStars({})).toEqual([]);
    expect(parseStars("[]")).toEqual([]);
    expect(parseStars(123)).toEqual([]);
  });

  it("空数组", () => {
    expect(parseStars([])).toEqual([]);
  });

  it("坏元素整条丢弃，好元素保序保留", () => {
    const a = star({ id: "a" });
    const b = star({ id: "b" });
    const out = parseStars([
      null,
      "junk",
      42,
      { id: "x" },
      star({ x: Number.NaN }),
      a,
      b,
    ]);
    expect(out).toEqual([a, b]);
  });

  it(`超过 ${STARS_LIMIT} 颗时只保留最后 ${STARS_LIMIT} 颗（最旧先滚出）`, () => {
    const many = Array.from({ length: STARS_LIMIT + 10 }, (_, i) =>
      star({ id: `id-${i}`, timestamp: i })
    );
    const out = parseStars(many);
    expect(out).toHaveLength(STARS_LIMIT);
    expect(out[0].id).toBe("id-10");
    expect(out[STARS_LIMIT - 1].id).toBe(`id-${STARS_LIMIT + 9}`);
  });

  it("恰好 120 颗全部保留", () => {
    const many = Array.from({ length: STARS_LIMIT }, (_, i) => star({ id: `${i}` }));
    expect(parseStars(many)).toHaveLength(STARS_LIMIT);
  });
});
