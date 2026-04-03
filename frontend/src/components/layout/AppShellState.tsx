/* eslint-disable react-refresh/only-export-components */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from 'react';

export const APP_SIDEBAR_STORAGE_KEY = 'my_ledge.sidebar.expanded';

interface AppShellStateValue {
  mobileSidebarOpen: boolean;
  setMobileSidebarOpen: Dispatch<SetStateAction<boolean>>;
  setSidebarExpanded: Dispatch<SetStateAction<boolean>>;
  sidebarExpanded: boolean;
}

const AppShellStateContext = createContext<AppShellStateValue | null>(null);

function readSidebarExpandedPreference() {
  if (typeof window === 'undefined') {
    return true;
  }

  try {
    const rawValue = window.localStorage.getItem(APP_SIDEBAR_STORAGE_KEY);

    if (rawValue === null) {
      return true;
    }

    return rawValue !== 'false';
  } catch {
    return true;
  }
}

export function AppShellStateProvider({ children }: { children: ReactNode }) {
  const [sidebarExpanded, setSidebarExpandedState] = useState<boolean>(() =>
    readSidebarExpandedPreference(),
  );
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

  useEffect(() => {
    try {
      window.localStorage.setItem(
        APP_SIDEBAR_STORAGE_KEY,
        sidebarExpanded ? 'true' : 'false',
      );
    } catch {
      // Ignore storage write failures and keep in-memory state.
    }
  }, [sidebarExpanded]);

  const setSidebarExpanded = useCallback<Dispatch<SetStateAction<boolean>>>(
    (value) => {
      setSidebarExpandedState((currentValue) =>
        typeof value === 'function' ? value(currentValue) : value,
      );
    },
    [],
  );

  const value = useMemo<AppShellStateValue>(
    () => ({
      mobileSidebarOpen,
      setMobileSidebarOpen,
      setSidebarExpanded,
      sidebarExpanded,
    }),
    [mobileSidebarOpen, setSidebarExpanded, sidebarExpanded],
  );

  return (
    <AppShellStateContext.Provider value={value}>
      {children}
    </AppShellStateContext.Provider>
  );
}

export function useAppShellState() {
  const context = useContext(AppShellStateContext);

  if (!context) {
    throw new Error('useAppShellState must be used within AppShellStateProvider');
  }

  return context;
}
