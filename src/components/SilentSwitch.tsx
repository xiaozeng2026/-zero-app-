"use client";

import { motion, AnimatePresence } from "framer-motion";

/**
 * 一键熄灯：
 * - 中央极小烛光图标，微弱闪烁。
 * - 点击后熄灭，并切换 lightsOut 状态。
 */
export default function SilentSwitch({
  lightsOut,
  onToggle,
}: {
  lightsOut: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="fixed inset-0 flex items-center justify-center z-20">
      <button
        data-no-press
        onClick={onToggle}
        className="relative flex h-16 w-16 cursor-pointer items-center justify-center rounded-full border border-transparent bg-transparent outline-none transition-transform duration-500 hover:scale-105 active:scale-95"
        aria-label={lightsOut ? "点亮灯火" : "熄灭灯火"}
      >
        {/* 微弱外晕 */}
        <AnimatePresence>
          {!lightsOut && (
            <motion.div
              className="absolute inset-0 rounded-full"
              style={{
                background:
                  "radial-gradient(circle, rgba(232, 176, 75, 0.12) 0%, transparent 70%)",
              }}
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1.5 }}
              exit={{ opacity: 0, scale: 0.6 }}
              transition={{ duration: 1.2 }}
            />
          )}
        </AnimatePresence>

        <svg
          width="36"
          height="36"
          viewBox="0 0 36 36"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className="relative"
        >
          <AnimatePresence mode="wait">
            {!lightsOut ? (
              <motion.g
                key="flame"
                className="flame-flicker"
                initial={{ opacity: 0, scaleY: 0.6 }}
                animate={{ opacity: 1, scaleY: 1 }}
                exit={{ opacity: 0, scaleY: 0.3, transition: { duration: 0.8 } }}
                style={{ originX: "18px", originY: "28px" }}
              >
                {/* 烛芯 */}
                <line
                  x1="18"
                  y1="22"
                  x2="18"
                  y2="28"
                  stroke="rgba(147, 164, 189, 0.35)"
                  strokeWidth="0.8"
                />
                {/* 火焰主体 */}
                <path
                  d="M18 22c-2.8 0-5-2.6-5-5.8 0-2.2 1.6-4.2 3.2-6.2.8-1 1.8-2 1.8-3.2 0 1.2 1 2.2 1.8 3.2 1.6 2 3.2 4 3.2 6.2 0 3.2-2.2 5.8-5 5.8z"
                  fill="rgba(232, 176, 75, 0.9)"
                  fillOpacity="0.92"
                />
                {/* 火焰内芯 */}
                <ellipse
                  cx="18"
                  cy="19.5"
                  rx="1.6"
                  ry="2.4"
                  fill="rgba(255, 240, 200, 0.65)"
                />
              </motion.g>
            ) : (
              <motion.g
                key="smoke"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 1.2 }}
              >
                {/* 熄灭后残留的一缕微烟 */}
                <motion.path
                  d="M18 28q-1.2 -2.4 -0.4 -5.6t1.4 -5.2"
                  stroke="rgba(147, 164, 189, 0.14)"
                  strokeWidth="0.6"
                  fill="none"
                  initial={{ pathLength: 0, opacity: 0 }}
                  animate={{ pathLength: 1, opacity: 1 }}
                  transition={{ duration: 2.4, ease: "easeOut" }}
                />
              </motion.g>
            )}
          </AnimatePresence>
        </svg>
      </button>
    </div>
  );
}
