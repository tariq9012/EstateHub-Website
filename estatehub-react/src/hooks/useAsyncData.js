// src/hooks/useAsyncData.js
// Small data-loading hook used by the Agent portal pages: { data, loading, error, reload }.
// `loader` is called on mount and whenever `reload()` is called; a stale response (from an older
// call) can never overwrite a newer one. `silent` reloads keep showing the current data.

import { useCallback, useEffect, useRef, useState } from 'react';

export default function useAsyncData(loader, deps = []) {
  const [state, setState] = useState({ data: null, loading: true, error: '' });
  const reqRef = useRef(0);
  const loaderRef = useRef(loader);
  loaderRef.current = loader;

  const run = useCallback(async ({ silent = false } = {}) => {
    const reqId = ++reqRef.current;
    if (!silent) setState((prev) => ({ ...prev, loading: true, error: '' }));
    try {
      const data = await loaderRef.current();
      if (reqId !== reqRef.current) return;
      setState({ data, loading: false, error: '' });
    } catch (err) {
      if (reqId !== reqRef.current) return;
      setState((prev) => ({ data: silent ? prev.data : null, loading: false, error: silent ? prev.error : err.message || 'Something went wrong.' }));
    }
  }, []);

  useEffect(() => {
    run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return { ...state, reload: run };
}
