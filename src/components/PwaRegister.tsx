"use client";
import { useEffect } from "react";

/** Registers the service worker in production builds only (avoids stale caches while developing). */
export function PwaRegister() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => {
      /* The app works without it. */
    });
  }, []);
  return null;
}
