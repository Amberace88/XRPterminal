"use client";

import { useEffect, useRef, useState } from "react";
import {
  LazyMotion,
  MotionConfig,
  animate,
  domAnimation,
  m,
  useInView,
  useMotionTemplate,
  useMotionValue,
  useReducedMotion,
  useScroll,
  useSpring,
  useTransform,
  type Variants,
} from "framer-motion";
import { cn } from "@/lib/utils/cn";

/**
 * Motion primitives for the marketing site. All motion is subtle, runs once, and is
 * disabled for visitors who prefer reduced motion (MotionConfig reducedMotion="user"
 * plus explicit checks where transforms are driven manually).
 */
export function MarketingMotion({ children }: { children: React.ReactNode }) {
  return (
    <LazyMotion features={domAnimation} strict>
      <MotionConfig reducedMotion="user">{children}</MotionConfig>
    </LazyMotion>
  );
}

const EASE = [0.2, 0.7, 0.2, 1] as const;

export const fadeUp: Variants = {
  hidden: { opacity: 0, y: 18 },
  show: { opacity: 1, y: 0, transition: { duration: 0.6, ease: EASE } },
};

/** Staggered reveal container — children should use <RevealItem>. */
export function Reveal({
  children,
  className,
  stagger = 0.08,
  delay = 0,
  as = "div",
  amount = 0.2,
}: {
  children: React.ReactNode;
  className?: string;
  stagger?: number;
  delay?: number;
  as?: "div" | "section" | "ul" | "ol";
  amount?: number;
}) {
  const Comp = m[as];
  return (
    <Comp
      className={className}
      initial="hidden"
      whileInView="show"
      viewport={{ once: true, amount }}
      variants={{ hidden: {}, show: { transition: { staggerChildren: stagger, delayChildren: delay } } }}
    >
      {children}
    </Comp>
  );
}

export function RevealItem({ children, className, as = "div" }: { children: React.ReactNode; className?: string; as?: "div" | "li" | "p" | "h2" | "span" }) {
  const Comp = m[as];
  return (
    <Comp className={className} variants={fadeUp}>
      {children}
    </Comp>
  );
}

/** Animated count-up for REAL product facts (never for invented metrics). */
export function CountUp({ value, className, duration = 1.4 }: { value: number; className?: string; duration?: number }) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, amount: 0.6 });
  const reduce = useReducedMotion();
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (!inView || reduce || value === 0) {
      el.textContent = String(value);
      return;
    }
    const controls = animate(0, value, {
      duration,
      ease: EASE,
      onUpdate: (v) => {
        el.textContent = String(Math.round(v));
      },
    });
    return () => controls.stop();
  }, [inView, reduce, value, duration]);
  return (
    <span ref={ref} className={cn("num", className)}>
      {value}
    </span>
  );
}

/** Card with pointer-driven depth (3D tilt + spotlight). Inert for touch and reduced motion. */
export function TiltCard({ children, className, max = 5 }: { children: React.ReactNode; className?: string; max?: number }) {
  const reduce = useReducedMotion();
  const [enabled, setEnabled] = useState(false);
  useEffect(() => {
    setEnabled(!reduce && typeof window !== "undefined" && window.matchMedia("(hover: hover) and (pointer: fine)").matches);
  }, [reduce]);
  const rx = useMotionValue(0);
  const ry = useMotionValue(0);
  const mx = useMotionValue(50);
  const my = useMotionValue(50);
  const srx = useSpring(rx, { stiffness: 180, damping: 18 });
  const sry = useSpring(ry, { stiffness: 180, damping: 18 });
  const spotlight = useMotionTemplate`radial-gradient(420px circle at ${mx}% ${my}%, rgb(var(--accent) / 0.10), transparent 60%)`;

  const onMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!enabled) return;
    const r = e.currentTarget.getBoundingClientRect();
    const px = (e.clientX - r.left) / r.width;
    const py = (e.clientY - r.top) / r.height;
    ry.set((px - 0.5) * 2 * max);
    rx.set(-(py - 0.5) * 2 * max);
    mx.set(px * 100);
    my.set(py * 100);
  };
  const onLeave = () => {
    rx.set(0);
    ry.set(0);
  };
  return (
    <m.div
      onPointerMove={onMove}
      onPointerLeave={onLeave}
      style={enabled ? { rotateX: srx, rotateY: sry, transformPerspective: 900 } : undefined}
      className={cn("group relative will-change-transform", className)}
    >
      {enabled && <m.div aria-hidden className="pointer-events-none absolute inset-0 z-0 rounded-[inherit] opacity-0 transition-opacity duration-300 group-hover:opacity-100" style={{ background: spotlight }} />}
      <div className="relative z-10 h-full">{children}</div>
    </m.div>
  );
}

/** Background grid that drifts slower than the page (parallax) and fades at the edges. */
export function ParallaxGrid({ className }: { className?: string }) {
  const reduce = useReducedMotion();
  const { scrollY } = useScroll();
  const y = useTransform(scrollY, [0, 800], [0, reduce ? 0 : 160]);
  return (
    <m.div
      aria-hidden
      style={{ y }}
      className={cn(
        "grid-bg pointer-events-none absolute inset-x-0 -top-24 h-[900px] opacity-60 [mask-image:radial-gradient(ellipse_70%_60%_at_50%_30%,black_30%,transparent_75%)]",
        className,
      )}
    />
  );
}

export { m };
