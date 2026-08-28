import { useCallback, useEffect, useRef, useState } from "react";
import { AppState } from "react-native";


const PING_URL = "https://clients3.google.com/generate_204";
const PING_TIMEOUT_MS = 4000;
const POLL_MS = 15000;

async function checkOnline(): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), PING_TIMEOUT_MS);
    await fetch(PING_URL, { method: "GET", cache: "no-store", signal: controller.signal });
    clearTimeout(timer);
    return true;
  } catch {
    return false;
  }
}

export function useOnline(): { online: boolean | null; recheck: () => void } {
  const [online, setOnline] = useState<boolean | null>(null);
  const mounted = useRef(true);

  const recheck = useCallback(() => {
    checkOnline().then((o) => {
      if (mounted.current) setOnline(o);
    });
  }, []);

  useEffect(() => {
    mounted.current = true;
    recheck();
    const interval = setInterval(recheck, POLL_MS);
    const sub = AppState.addEventListener("change", (s) => {
      if (s === "active") recheck();
    });
    return () => {
      mounted.current = false;
      clearInterval(interval);
      sub.remove();
    };
  }, [recheck]);

  return { online, recheck };
}
