/**
 * 可视视口几何（iOS 软键盘适配纯函数）
 *
 * iPhone Safari / 微信 WKWebView 弹起软键盘时：
 * window.innerHeight（布局视口）不变，但 visualViewport.height 缩小、
 * offsetTop/offsetLeft 可能偏移。fixed + vh 定位的输入框会被键盘盖住，
 * 需要把底部 Dock 抬升「键盘遮挡高度」。
 */

/**
 * 键盘对布局视口底部的遮挡高度（px）
 * @param innerHeight  window.innerHeight（布局视口高）
 * @param vvHeight     visualViewport.height（当前可视高）
 * @param offsetTop    visualViewport.offsetTop
 * @returns 0 表示无遮挡；>0 为需要抬升的像素
 */
export function keyboardInset(
  innerHeight: number,
  vvHeight: number,
  offsetTop: number
): number {
  if (!Number.isFinite(innerHeight) || !Number.isFinite(vvHeight)) return 0;
  const inset = innerHeight - vvHeight - Math.max(0, offsetTop || 0);
  // 小于 80px 视为工具栏抖动等噪声，不抬升
  return inset > 80 ? Math.round(inset) : 0;
}
