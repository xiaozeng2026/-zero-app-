/**
 * 触觉反馈（Haptic Resonance）—— 极简封装
 *
 * 仅在支持 navigator.vibrate 的设备（主流 Android）生效；
 * iOS Safari 不支持 Vibration API，调用静默无效，不产生任何错误。
 */

function vibrate(pattern: number | number[]): void {
  try {
    if (typeof navigator !== "undefined" && typeof navigator.vibrate === "function") {
      navigator.vibrate(pattern);
    }
  } catch {
    /* 部分浏览器在跨域 iframe 中调用会抛错，忽略 */
  }
}

/** 点击涟漪：极轻一啄 */
export function hapticTick(): void {
  vibrate(10);
}

/**
 * 回车粉碎：按情绪重量分档
 * @param heavy 字数 >=10 时模拟重物落地的物理回弹（震-停-震）
 */
export function hapticShatter(heavy: boolean): void {
  vibrate(heavy ? [30, 50, 30] : 20);
}
