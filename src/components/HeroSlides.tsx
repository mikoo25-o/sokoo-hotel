"use client";
import Image from "next/image";
import { useCallback, useEffect, useRef, useState } from "react";
import { cn } from "@/lib/cn";

const SLIDES = [
  { src: "/landing/hero-manager.jpg", pos: "58% 30%", label: "A smiling restaurant manager standing in the dining room" },
  { src: "/landing/hero-customers.jpg", pos: "50% 45%", label: "Two guests laughing over a meal" },
  { src: "/landing/hero-growth.jpg", pos: "34% 40%", label: "A manager celebrating rising sales on a laptop" },
];

const INTERVAL_MS = 6500;

/**
 * Full-bleed photo background that cycles manager, customers, manager with
 * growth graph. Three separate images, crossfaded. Respects reduced motion
 * (no autoplay, no fade) and pauses while the tab is hidden.
 */
export function HeroSlides() {
  const [index, setIndex] = useState(0);
  const [reduced, setReduced] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(mq.matches);
    const on = () => setReduced(mq.matches);
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);

  const schedule = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    if (reduced || document.hidden) return;
    timer.current = setTimeout(() => setIndex((i) => (i + 1) % SLIDES.length), INTERVAL_MS);
  }, [reduced]);

  useEffect(() => {
    schedule();
    const onVisibility = () => schedule();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      if (timer.current) clearTimeout(timer.current);
    };
  }, [index, schedule]);

  return (
    <>
      <div className="absolute inset-0 bg-forest" aria-hidden>
        {SLIDES.map((s, i) => (
          <Image
            key={s.src}
            src={s.src}
            alt=""
            fill
            sizes="100vw"
            priority={i === 0}
            quality={70}
            className={cn("object-cover", reduced ? "" : "transition-opacity duration-1000 ease-in-out", i === index ? "opacity-100" : "opacity-0")}
            style={{ objectPosition: s.pos }}
          />
        ))}
        {/* One flat dark layer keeps white text readable on all three photos. */}
        <div className="absolute inset-0 bg-black/30" />
      </div>

      <div
        role="group"
        aria-label="Photo slides"
        className="absolute inset-x-0 bottom-5 z-20 flex items-center justify-center gap-2 lg:bottom-8"
      >
        {SLIDES.map((s, i) => (
          <button
            key={s.src}
            type="button"
            onClick={() => setIndex(i)}
            aria-label={`Show photo ${i + 1} of ${SLIDES.length}: ${s.label}`}
            aria-current={i === index ? "true" : undefined}
            className="flex h-6 items-center px-1"
          >
            <span
              className={cn(
                "block h-2 rounded-full transition-all",
                i === index ? "w-6 bg-action" : "w-2 bg-white/60 hover:bg-white/80",
              )}
            />
          </button>
        ))}
      </div>
    </>
  );
}
