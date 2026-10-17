"use client";
import { useEffect } from "react";

/** Reloads the page the moment the connection comes back. */
export function AutoReload() {
  useEffect(() => {
    const go = () => window.location.reload();
    window.addEventListener("online", go);
    return () => window.removeEventListener("online", go);
  }, []);
  return null;
}
