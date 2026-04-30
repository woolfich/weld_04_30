import { useEffect, useState } from 'react';
import { subscribeToRefresh } from '@/lib/utils';

export function useRefreshTrigger() {
  const [refreshCount, setRefreshCount] = useState(0);

  useEffect(() => {
    const unsubscribe = subscribeToRefresh(setRefreshCount);
    return unsubscribe;
  }, []);

  return refreshCount;
}