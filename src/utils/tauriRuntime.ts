export function isTauriRuntime(): boolean {
  if (typeof window === 'undefined') {
    return false;
  }
  const runtimeWindow = window as typeof window & {
    __TAURI_INTERNALS__?: unknown;
    __TAURI__?: unknown;
  };
  return Boolean(runtimeWindow.__TAURI_INTERNALS__ || runtimeWindow.__TAURI__);
}
