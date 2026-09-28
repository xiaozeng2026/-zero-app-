/**
 * 「归零」本地语料库 —— 纯前端静态版
 * 所有短句遵循四条铁律：无问号、无建议、无鸡汤、30 字以内。
 * 按场景分类，交互时从对应类别中随机抽取。
 */

/** 字落无声 —— 用户输入文字后浮现 */
export const INPUT_WHISPERS = [
  "字已经落下来了，落进夜里，谁也看不见。",
  "这里不记账。说过的一切，都不会被翻出来。",
  "没关系。不想说话就不说，雨声会替你发声。",
  "那就把最后一点电留给自己。这里没有任务。",
  "哭出来就好。水流走了，心里就空出地方了。",
  "累是被允许的。沉默也是被允许的。",
  "风经过了，没有问你要去哪里。",
  "这一页翻过去了，不需要批注。",
  "夜很深了。你可以不用再撑着了。",
  "觉得没意思的时候，就先躺一会。地板会托住你。",
] as const;

/** 长按沉降 —— 长按松手后浮现 */
export const LONG_PRESS_WHISPERS = [
  "沉下去了，世界已静音。",
  "闭上眼睛，慢慢沉下来。世界已经静音了。",
  "指尖松开后，夜往下沉了一寸。",
  "水压过来了，很轻，很稳。",
  "现在，不需要呼吸给任何人看。",
  "沉到最底，反而不冷了。",
  "失重的瞬间，所有壳都卸下来了。",
  "往下走，不需要方向。",
  "夜把你接住了，很轻。",
  "停下来的这一刻，是安全的。",
] as const;

/** 一键熄灯 —— 熄灯后浮现 */
export const LIGHTS_OUT_WHISPERS = [
  "灯已熄灭，你可以卸下防备。",
  "灯暗了。现在不需要扮演任何人。",
  "黑下来的瞬间，影子也休息了。",
  "没有光，就没有需要被看见的东西。",
  "熄灯之后，房间只剩呼吸。",
  "暗下来，世界就退回成一个轮廓。",
  "现在，你可以消失一会。",
  "光走了，安静就来了。",
  "夜色接管了一切，包括你。",
  "不用亮着，也不用好起来。",
] as const;

/** 全部语料（去重合并，供不指定场景时使用） */
export const ALL_WHISPERS = [
  ...INPUT_WHISPERS,
  ...LONG_PRESS_WHISPERS,
  ...LIGHTS_OUT_WHISPERS,
] as const;

export type WhisperCategory = "input" | "longPress" | "lightsOut";

/**
 * 从指定类别随机抽取一条短句。
 * 传入 seed（如用户输入文本）可让同一句话稳定命中同一条，
 * 不传则完全随机。
 */
export function pickWhisper(
  category: WhisperCategory,
  seed?: string
): string {
  const pool =
    category === "input"
      ? INPUT_WHISPERS
      : category === "longPress"
      ? LONG_PRESS_WHISPERS
      : LIGHTS_OUT_WHISPERS;

  if (seed) {
    let h = 0;
    for (let i = 0; i < seed.length; i++) {
      h = (h * 31 + seed.charCodeAt(i)) >>> 0;
    }
    return pool[h % pool.length];
  }
  return pool[Math.floor(Math.random() * pool.length)];
}
