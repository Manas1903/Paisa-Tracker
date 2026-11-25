"use client";

import { animate, motion, useMotionValue, useTransform } from "motion/react";
import { useEffect } from "react";

/** Number that counts up/down to its new value. */
export function Ticker({ value, format }: { value: number; format: (n: number) => string }) {
  const mv = useMotionValue(0);
  const text = useTransform(mv, format);
  useEffect(() => {
    const c = animate(mv, value, { duration: 1.2, ease: [0.16, 1, 0.3, 1] });
    return () => c.stop();
  }, [mv, value]);
  return <motion.span className="tabular-nums">{text}</motion.span>;
}
