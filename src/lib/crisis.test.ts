/**
 * 危机文本本地兜底单测：
 * - 直接意图 / 行动方式 / 委婉口语变体的召回
 * - 标点与空格容错（先归一化再子串匹配）
 * - 口语假阳性防护（笑死 / 卡死了 / 撑不下去 等不应命中）
 */
import { describe, it, expect } from "vitest";
import {
  CRISIS_KEYWORDS,
  CRISIS_WHISPER,
  detectCrisis,
  normalizeText,
} from "./crisis";

describe("normalizeText 归一化", () => {
  it("去空白、去中英文标点并小写化", () => {
    expect(normalizeText(" 我，想。死！...")).toBe("我想死");
    expect(normalizeText("I WANT TO 死 ")).toBe("iwantto死");
    expect(normalizeText("活不下去……")).toBe("活不下去");
  });

  it("空值安全", () => {
    expect(normalizeText("")).toBe("");
  });
});

describe("detectCrisis 命中召回", () => {
  it.each([
    "我想死",
    "真的不想活了",
    "活着没意义",
    "我想离开这个世界",
    "割腕了",
    "我要跳楼",
    "想一了百了",
    "永远睡过去就好了",
    "如果我死了，你们就轻松了",
    "我 在 自 残",
    "活不下去了！！！",
  ])("命中：%s", (text) => {
    expect(detectCrisis(text)).toBe(true);
  });

  it("词表中的每个词本身都应被识别（防止归一化误伤词表）", () => {
    for (const word of CRISIS_KEYWORDS) {
      expect(detectCrisis(word)).toBe(true);
    }
  });
});

describe("detectCrisis 假阳性防护", () => {
  it.each([
    "",
    "今天不开心",
    "我真的撑不下去了", // 高重量情绪 ≠ 危机意图，归重量词典管
    "工作压得人喘不过气",
    "笑死，这个bug",
    "电脑卡死了",
    "热死了累死了",
    "好烦啊啊啊",
    "迷茫，不知道怎么办",
    "烦死了今天",
  ])("不命中：%s", (text) => {
    expect(detectCrisis(text)).toBe(false);
  });
});

describe("CRISIS_WHISPER 陪伴字条", () => {
  it("不提问、含两条援助渠道、多行", () => {
    expect(CRISIS_WHISPER).not.toContain("？");
    expect(CRISIS_WHISPER).not.toContain("?");
    expect(CRISIS_WHISPER).toContain("12356");
    expect(CRISIS_WHISPER).toContain("010-82951332");
    expect(CRISIS_WHISPER.split("\n").length).toBeGreaterThanOrEqual(3);
  });
});
