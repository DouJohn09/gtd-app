import { useCallback } from 'react';

// Light mode is not yet implemented in the new design system.
// Hook is kept as a stable shape so callers don't break; toggleTheme is a no-op
// that forcibly re-asserts dark. Restore real toggling when the light palette ships.
export default function useTheme() {
  const toggleTheme = useCallback(() => {
    document.documentElement.classList.add('dark');
  }, []);

  return { isDark: true, toggleTheme };
}
