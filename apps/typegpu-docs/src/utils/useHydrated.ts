import { useEffect, useState } from 'react';

/**
 * Returns true if the component using this hook has already been hydrated.
 * Can be used to change how a component is rendered based on client-state, without
 * tripping up the hydration process.
 */
export function useHydrated() {
  const [isHydrated, setIsHydrated] = useState(false);
  useEffect(() => {
    setIsHydrated(true);
  }, []);

  return isHydrated;
}
