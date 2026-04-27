'use client';

import React, { useState, useRef, useCallback, useEffect } from 'react';

interface LongPressProps {
  children: React.ReactNode;
  onLongPress: () => void;
  delay?: number;
}

export function LongPressWrapper({ children, onLongPress, delay = 500 }: LongPressProps) {
  const [pressing, setPressing] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressTriggered = useRef(false);

  const startPress = useCallback(() => {
    longPressTriggered.current = false;
    setPressing(true);
    timerRef.current = setTimeout(() => {
      longPressTriggered.current = true;
      onLongPress();
      setPressing(false);
    }, delay);
  }, [onLongPress, delay]);

  const stopPress = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    setPressing(false);
  }, []);

  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
    };
  }, []);

  return (
    <div
      onTouchStart={startPress}
      onTouchEnd={stopPress}
      onTouchMove={stopPress}
      onMouseDown={startPress}
      onMouseUp={stopPress}
      onMouseLeave={stopPress}
      onContextMenu={(e) => {
        e.preventDefault();
        if (!longPressTriggered.current) {
          onLongPress();
        }
      }}
      className={pressing ? 'opacity-70 transition-opacity' : 'transition-opacity'}
    >
      {children}
    </div>
  );
}
