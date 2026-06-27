"use client";

import { useEffect, useState } from "react";
import { getTodayStr } from "@/lib/utils";

function getMsUntilTomorrow(): number {
  const now = new Date();
  const tomorrow = new Date(now);
  tomorrow.setHours(24, 0, 0, 0);
  return Math.max(1000, tomorrow.getTime() - now.getTime());
}

export function useTodayStr() {
  const [today, setToday] = useState(() => getTodayStr());

  useEffect(() => {
    let timeoutId: ReturnType<typeof setTimeout>;

    const scheduleNextDay = () => {
      timeoutId = setTimeout(() => {
        setToday(getTodayStr());
        scheduleNextDay();
      }, getMsUntilTomorrow());
    };

    scheduleNextDay();
    return () => clearTimeout(timeoutId);
  }, []);

  return today;
}
