"use client";

import { useCallback, useRef, useState } from "react";
import { playType } from "@/lib/generativeAudio";

/**
 * 隐形输入框：回车后把文字与“文字所在位置”交给粒子系统，
 * 自身不保留任何痕迹。
 */
export default function DissolvingInput({
  onSubmit,
}: {
  onSubmit: (text: string, origin: { x: number; y: number }) => void;
}) {
  const [value, setValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  // 每敲入一个字符：极轻的低频水滴（删除/粘贴不触发）
  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const next = e.target.value;
      if (next.length > value.length) playType();
      setValue(next);
    },
    [value]
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key !== "Enter" || !value.trim()) return;
      e.preventDefault();
      const el = inputRef.current;
      const text = value.trim();
      const rect = el?.getBoundingClientRect();
      onSubmit(text, {
        x: rect ? rect.left + rect.width / 2 : window.innerWidth / 2,
        y: rect ? rect.top - 34 : window.innerHeight * 0.85,
      });
      setValue("");
    },
    [value, onSubmit]
  );

  return (
    <div className="fixed bottom-9 left-0 right-0 z-30 flex justify-center">
      <input
        ref={inputRef}
        type="text"
        value={value}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        placeholder="这里什么都不留下"
        maxLength={80}
        className="zero-input w-80 text-center text-sm tracking-widest"
        autoComplete="off"
        autoCapitalize="off"
        spellCheck={false}
        enterKeyHint="send"
        aria-label="消解你的念头"
      />
    </div>
  );
}
