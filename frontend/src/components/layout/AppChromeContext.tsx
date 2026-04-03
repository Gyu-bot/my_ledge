/* eslint-disable react-refresh/only-export-components */
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

interface AppChromeContextValue {
  meta: ReactNode;
  setMeta: (meta: ReactNode) => void;
}

const AppChromeContext = createContext<AppChromeContextValue>({
  meta: null,
  setMeta: () => undefined,
});

export function AppChromeProvider({ children }: { children: ReactNode }) {
  const [meta, setMeta] = useState<ReactNode>(null);

  const value = useMemo(
    () => ({
      meta,
      setMeta,
    }),
    [meta],
  );

  return <AppChromeContext.Provider value={value}>{children}</AppChromeContext.Provider>;
}

export function useAppChromeMeta(meta: ReactNode) {
  const { setMeta } = useContext(AppChromeContext);

  useEffect(() => {
    setMeta(meta);

    return () => {
      setMeta(null);
    };
  }, [meta, setMeta]);
}

export function useAppChromeContext() {
  return useContext(AppChromeContext);
}
