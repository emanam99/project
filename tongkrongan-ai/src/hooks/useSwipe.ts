'use client';

import { useRef, useCallback } from 'react';

interface SwipeHandlers {
  onSwipeLeft?: () => void;
  onSwipeRight?: () => void;
  onSwipeUp?: () => void;
  onSwipeDown?: () => void;
}

export function useSwipe(handlers: SwipeHandlers, threshold = 50) {
  const touchStart = useRef<{ x: number; y: number } | null>(null);

  const onTouchStart = useCallback((e: React.TouchEvent) => {
    touchStart.current = {
      x: e.touches[0].clientX,
      y: e.touches[0].clientY,
    };
  }, []);

  const onTouchEnd = useCallback(
    (e: React.TouchEvent) => {
      if (!touchStart.current) return;

      const diffX = touchStart.current.x - e.changedTouches[0].clientX;
      const diffY = touchStart.current.y - e.changedTouches[0].clientY;

      const absX = Math.abs(diffX);
      const absY = Math.abs(diffY);

      // Determine if horizontal or vertical swipe
      if (absX > absY && absX > threshold) {
        if (diffX > 0) {
          handlers.onSwipeLeft?.();
        } else {
          handlers.onSwipeRight?.();
        }
      } else if (absY > absX && absY > threshold) {
        if (diffY > 0) {
          handlers.onSwipeUp?.();
        } else {
          handlers.onSwipeDown?.();
        }
      }

      touchStart.current = null;
    },
    [handlers, threshold]
  );

  return {
    onTouchStart,
    onTouchEnd,
  };
}
