import { useEffect, useRef, useState } from 'react';

export function useWidth<T extends HTMLElement>(initial = 600) {
  const ref = useRef<T>(null);
  const [w, setW] = useState(initial);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver((es) => setW(Math.max(260, Math.floor(es[0].contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, w] as const;
}
