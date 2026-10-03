/**
 * IME（拼音/语音等输入法）打字水滴判定 —— 纯函数
 *
 * 目标：拼音整句输入只在最终上屏时响一声，组词阶段不响；
 *      取消组词（Esc）不响；compositionend 后各浏览器尾随的 input 不双响。
 *
 * 浏览器差异背景：
 * - Chrome：组词期间 input 事件 inputType=insertCompositionText，
 *   结束顺序为「最后一个 input → compositionend」；
 * - Firefox：结束顺序为「compositionend → input(insertFromComposition)」；
 * - Safari/iOS：compositionend 后可能尾随 insertText；
 * - 部分安卓 IME 不发 composition 事件，只有 keyCode=229 的 keydown + input。
 * 因此同时使用「composition 状态」「inputType」「compositionend 时间窗」三重信号。
 */

/** compositionend 之后抑制尾随 input 的窗口（ms），与提交回车的拦截窗一致 */
export const COMPOSITION_TAIL_MS = 100;

/** 这些 inputType 永远不触发水滴（删除类、组词中的提交类、撤销重做） */
const SILENT_INPUT_TYPES = new Set([
  "insertCompositionText",
  "insertFromComposition",
  "deleteContentBackward",
  "deleteContentForward",
  "deleteByCut",
  "deleteWordBackward",
  "deleteWordForward",
  "deleteSoftLineBackward",
  "deleteSoftLineForward",
  "deleteEntireSoftLine",
  "deleteHardLineBackward",
  "deleteHardLineForward",
  "historyUndo",
  "historyRedo",
]);

export interface TypingDropInput {
  /** 是否正处于 composition 组词中 */
  composing: boolean;
  /** 距最近一次 compositionend 的毫秒数（首次输入前传一个大数即可） */
  msSinceCompositionEnd: number;
  /** 原生 InputEvent.inputType，老浏览器可能为 undefined */
  inputType: string | null | undefined;
  /** 变化前文本长度 */
  prevLen: number;
  /** 变化后文本长度 */
  nextLen: number;
}

/**
 * 普通 input（onChange）是否响水滴
 * 规则：组词中不响 → composition 尾随窗内不响 → 静默 inputType 不响 →
 *       其余情况仅在文本净增加时响（替代旧的 next.length > value.length）
 */
export function shouldPlayTypingDrop(i: TypingDropInput): boolean {
  if (i.composing) return false;
  if (i.msSinceCompositionEnd < COMPOSITION_TAIL_MS) return false;
  if (i.inputType && SILENT_INPUT_TYPES.has(i.inputType)) return false;
  return i.nextLen > i.prevLen;
}

/**
 * compositionend（整词上屏）是否响那唯一的一声
 * @param data     CompositionEvent.data：实际提交的文本；Esc 取消组词时为 ""
 * @param startLen 组词开始时输入框文本长度
 * @param endLen   组词结束时输入框文本长度
 */
export function shouldPlayCompositionDrop(
  data: string | null | undefined,
  startLen: number,
  endLen: number
): boolean {
  return !!data && data.length > 0 && endLen > startLen;
}
