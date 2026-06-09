import { useState, useEffect, useRef } from "react";

interface UseTypewriterOptions {
  text: string;
  speed?: number;
  enabled?: boolean;
  onComplete?: () => void;
}

export function useTypewriter({
  text,
  speed = 18,
  enabled = true,
  onComplete,
}: UseTypewriterOptions) {
  const [displayed, setDisplayed] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const indexRef = useRef(0);
  const rafRef = useRef<number | null>(null);
  const lastTimeRef = useRef(0);

  useEffect(() => {
    if (!enabled || !text) {
      setDisplayed(text || "");
      setIsTyping(false);
      return;
    }

    setDisplayed("");
    indexRef.current = 0;
    setIsTyping(true);
    lastTimeRef.current = 0;

    const animate = (timestamp: number) => {
      if (!lastTimeRef.current) lastTimeRef.current = timestamp;
      const elapsed = timestamp - lastTimeRef.current;

      if (elapsed >= speed) {
        const charsToAdd = Math.max(1, Math.floor(elapsed / speed));
        const nextIndex = Math.min(indexRef.current + charsToAdd, text.length);
        setDisplayed(text.slice(0, nextIndex));
        indexRef.current = nextIndex;
        lastTimeRef.current = timestamp;

        if (nextIndex >= text.length) {
          setIsTyping(false);
          onComplete?.();
          return;
        }
      }

      rafRef.current = requestAnimationFrame(animate);
    };

    rafRef.current = requestAnimationFrame(animate);

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [text, speed, enabled, onComplete]);

  return { displayed, isTyping, isComplete: !isTyping && displayed === text };
}
