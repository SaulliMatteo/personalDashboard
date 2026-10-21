import { useEffect, useState } from "react";

/**
 * Dimensioni (px) di un elemento, aggiornate a ogni ridimensionamento.
 * Si usa con un callback ref: `const [el, setEl] = useState(null)`.
 */
export function useElementSize(element: HTMLElement | null) {
  const [size, setSize] = useState({ width: 0, height: 0 });
  useEffect(() => {
    if (!element) return;
    const measure = () => {
      const width = element.clientWidth;
      const height = element.clientHeight;
      setSize((prev) => (prev.width === width && prev.height === height ? prev : { width, height }));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [element]);
  return size;
}
