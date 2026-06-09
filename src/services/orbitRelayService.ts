import { invoke } from '@tauri-apps/api/core';

const LOCAL_RELAY_API_BASE = 'http://127.0.0.1:8080/api/v1';
const LOCAL_RELAY_PROVIDER_BASE_URL = 'http://127.0.0.1:8080/v1';
const PRODUCTION_RELAY_API_BASE = 'https://sub.xingmeng.xin/api/v1';
const PRODUCTION_RELAY_PROVIDER_BASE_URL = 'https://sub.xingmeng.xin/v1';
const DEV_BROWSER_RELAY_API_BASE = '/xm-api/v1';

declare global {
  interface Window {
    __TAURI__?: unknown;
    __TAURI_INTERNALS__?: unknown;
  }
}

function resolveRelayUrl(envValue: string | undefined, devDefault: string, productionDefault: string): string {
  const configured = envValue?.trim();
  if (configured) return configured;
  return import.meta.env.DEV ? devDefault : productionDefault;
}

function isTauriRuntime(): boolean {
  return typeof window !== 'undefined' && Boolean(window.__TAURI_INTERNALS__ || window.__TAURI__);
}

function stripTrailingSlash(value: string): string {
  return value.replace(/\/+$/, '');
}

export const ORBIT_RELAY_API_BASE = resolveRelayUrl(
  import.meta.env.VITE_XM_RELAY_API_BASE,
  LOCAL_RELAY_API_BASE,
  PRODUCTION_RELAY_API_BASE,
);
export const ORBIT_RELAY_PROVIDER_BASE_URL = resolveRelayUrl(
  import.meta.env.VITE_XM_RELAY_PROVIDER_BASE_URL,
  LOCAL_RELAY_PROVIDER_BASE_URL,
  PRODUCTION_RELAY_PROVIDER_BASE_URL,
);
export const ORBIT_RELAY_REQUEST_API_BASE =
  import.meta.env.DEV && !isTauriRuntime() && !import.meta.env.VITE_XM_RELAY_API_BASE
    ? DEV_BROWSER_RELAY_API_BASE
    : ORBIT_RELAY_API_BASE;
export const ORBIT_RELAY_SESSION_STORAGE_KEY = 'orbit_relay_session.v1';
export const ORBIT_RELAY_IS_LOCAL_TESTING =
  ORBIT_RELAY_REQUEST_API_BASE.startsWith('/xm-api') ||
  /^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?\//.test(ORBIT_RELAY_API_BASE);

export interface OrbitRelayUser {
  id: number;
  username: string;
  email: string;
  role?: string | null;
  balance: number;
  concurrency: number;
  status: string;
  created_at?: string | null;
  updated_at?: string | null;
}

export interface OrbitRelayAuthResponse {
  access_token: string;
  refresh_token?: string | null;
  expires_in?: number | null;
  token_type: string;
  user: OrbitRelayUser;
}

export interface OrbitRelayTokenResponse {
  access_token: string;
  refresh_token?: string | null;
  expires_in?: number | null;
  token_type: string;
}

export interface OrbitRelayRedeemResponse {
  id: number;
  code: string;
  type: string;
  value: number;
  status: string;
  used_by?: number | null;
  used_at?: string | null;
  created_at?: string | null;
  expires_at?: string | null;
  group_id?: number | null;
  validity_days?: number | null;
}

export interface OrbitRelayApiKey {
  id: number;
  user_id: number;
  key: string;
  name: string;
  group_id?: number | null;
  group?: OrbitRelayGroup | null;
  status: string;
  quota?: number;
  quota_used?: number;
  rate_limit_5h?: number;
  rate_limit_1d?: number;
  rate_limit_7d?: number;
  expires_at?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
}

export interface OrbitRelayGroup {
  id: number;
  name: string;
  description?: string | null;
  platform?: string | null;
  rate_multiplier?: number | null;
  is_exclusive?: boolean;
  status?: string;
  subscription_type?: string | null;
}

export interface OrbitRelayRegisterInput {
  email: string;
  password: string;
  verifyCode?: string;
  promoCode?: string;
  invitationCode?: string;
  affCode?: string;
}

export interface OrbitRelayApiKeyUpdateInput {
  name?: string;
  status?: 'active' | 'inactive';
  groupId?: number | null;
  quota?: number;
  rateLimit5h?: number;
  rateLimit1d?: number;
  rateLimit7d?: number;
}

export interface OrbitRelaySession {
  accessToken: string;
  refreshToken?: string | null;
  expiresAt?: number | null;
  tokenType: string;
  user: OrbitRelayUser;
  savedAt: number;
}

interface OrbitRelayEnvelope<T> {
  code?: number;
  message?: string;
  reason?: string;
  data?: T;
}

interface OrbitRelayPaginated<T> {
  items: T[];
  total?: number;
  page?: number;
  page_size?: number;
  pages?: number;
}

export const ORBIT_RELAY_CLIENT_API_KEY_NAME = 'XM Codex 客户端';

export function formatOrbitRelayError(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error ?? '');
  if (!raw) return '请求失败，请稍后再试。';
  const message = raw.replace(/^ORBIT_RELAY_[A-Z0-9_]+:\s*/, '').trim();
  if (message.includes('MISSING_CREDENTIALS')) return '请输入邮箱和密码。';
  if (message.includes('MISSING_REDEEM_CODE')) return '请输入兑换码。';
  if (message.includes('MISSING_REFRESH_TOKEN')) return '登录状态缺少刷新凭据，请重新登录。';
  if (message.includes('401')) return '登录状态已失效，请重新登录。';
  if (message.includes('NETWORK') || message.includes('Network') || message.includes('fetch')) {
    return `无法连接 XM 测试服务，请确认 ${ORBIT_RELAY_API_BASE} 可访问。`;
  }
  return message || raw;
}

function parseErrorMessage(text: string): string {
  if (!text.trim()) return '';
  try {
    const value = JSON.parse(text) as Record<string, unknown>;
    const message = value.message ?? value.reason ?? value.detail ?? value.error;
    return typeof message === 'string' ? message : text.slice(0, 300);
  } catch {
    return text.slice(0, 300);
  }
}

async function requestOrbitRelay<T>(
  path: string,
  options: {
    method?: 'GET' | 'POST' | 'PUT';
    body?: Record<string, unknown>;
    accessToken?: string;
  } = {},
): Promise<T> {
  const headers: Record<string, string> = {
    Accept: 'application/json',
  };
  if (options.body) {
    headers['Content-Type'] = 'application/json';
  }
  if (options.accessToken) {
    headers.Authorization = `Bearer ${options.accessToken}`;
  }

  const response = await fetch(
    `${stripTrailingSlash(ORBIT_RELAY_REQUEST_API_BASE)}/${path.replace(/^\/+/, '')}`,
    {
      method: options.method ?? (options.body ? 'POST' : 'GET'),
      headers,
      body: options.body ? JSON.stringify(options.body) : undefined,
    },
  ).catch((error) => {
    throw new Error(`ORBIT_RELAY_NETWORK_FAILED: ${error}`);
  });

  const text = await response.text();
  if (!response.ok) {
    throw new Error(`ORBIT_RELAY_HTTP_${response.status}: ${parseErrorMessage(text)}`);
  }

  let envelope: OrbitRelayEnvelope<T>;
  try {
    envelope = JSON.parse(text) as OrbitRelayEnvelope<T>;
  } catch (error) {
    throw new Error(`ORBIT_RELAY_PARSE_FAILED: ${error}`);
  }

  if (typeof envelope.code === 'number' && envelope.code !== 0) {
    throw new Error(`ORBIT_RELAY_API_${envelope.code}: ${envelope.message || envelope.reason || '请求失败'}`);
  }
  if (typeof envelope.data === 'undefined') {
    throw new Error('ORBIT_RELAY_EMPTY_RESPONSE');
  }

  return envelope.data;
}

function buildExpiresAt(expiresIn?: number | null): number | null {
  if (typeof expiresIn !== 'number' || !Number.isFinite(expiresIn) || expiresIn <= 0) {
    return null;
  }
  return Date.now() + expiresIn * 1000;
}

function normalizeSession(value: unknown): OrbitRelaySession | null {
  if (!value || typeof value !== 'object') return null;
  const session = value as Partial<OrbitRelaySession>;
  if (
    typeof session.accessToken !== 'string' ||
    typeof session.tokenType !== 'string' ||
    typeof session.savedAt !== 'number' ||
    !session.user ||
    typeof session.user !== 'object'
  ) {
    return null;
  }
  return session as OrbitRelaySession;
}

export function loadOrbitRelaySession(): OrbitRelaySession | null {
  try {
    const raw = window.localStorage.getItem(ORBIT_RELAY_SESSION_STORAGE_KEY);
    if (!raw) return null;
    return normalizeSession(JSON.parse(raw));
  } catch {
    return null;
  }
}

export function saveOrbitRelaySession(session: OrbitRelaySession): void {
  window.localStorage.setItem(ORBIT_RELAY_SESSION_STORAGE_KEY, JSON.stringify(session));
}

export function clearOrbitRelaySession(): void {
  window.localStorage.removeItem(ORBIT_RELAY_SESSION_STORAGE_KEY);
}

export async function orbitRelayLogin(email: string, password: string): Promise<OrbitRelaySession> {
  const response = isTauriRuntime()
    ? await invoke<OrbitRelayAuthResponse>('orbit_relay_login', { email, password })
    : await requestOrbitRelay<OrbitRelayAuthResponse>('auth/login', {
        body: { email, password },
      });
  const session: OrbitRelaySession = {
    accessToken: response.access_token,
    refreshToken: response.refresh_token ?? null,
    expiresAt: buildExpiresAt(response.expires_in),
    tokenType: response.token_type || 'Bearer',
    user: response.user,
    savedAt: Date.now(),
  };
  saveOrbitRelaySession(session);
  return session;
}

export async function orbitRelayRegister(input: OrbitRelayRegisterInput): Promise<OrbitRelaySession> {
  const email = input.email.trim();
  const password = input.password;
  const verifyCode = input.verifyCode?.trim();
  const promoCode = input.promoCode?.trim();
  const invitationCode = input.invitationCode?.trim();
  const affCode = input.affCode?.trim();
  const response = isTauriRuntime()
    ? await invoke<OrbitRelayAuthResponse>('orbit_relay_register', {
        email,
        password,
        verifyCode: verifyCode || null,
        promoCode: promoCode || null,
        invitationCode: invitationCode || null,
        affCode: affCode || null,
      })
    : await requestOrbitRelay<OrbitRelayAuthResponse>('auth/register', {
        body: {
          email,
          password,
          ...(verifyCode ? { verify_code: verifyCode } : {}),
          ...(promoCode ? { promo_code: promoCode } : {}),
          ...(invitationCode ? { invitation_code: invitationCode } : {}),
          ...(affCode ? { aff_code: affCode } : {}),
        },
      });
  const session: OrbitRelaySession = {
    accessToken: response.access_token,
    refreshToken: response.refresh_token ?? null,
    expiresAt: buildExpiresAt(response.expires_in),
    tokenType: response.token_type || 'Bearer',
    user: response.user,
    savedAt: Date.now(),
  };
  saveOrbitRelaySession(session);
  return session;
}

export async function orbitRelayRefresh(session: OrbitRelaySession): Promise<OrbitRelaySession> {
  const refreshToken = session.refreshToken?.trim();
  if (!refreshToken) {
    throw new Error('ORBIT_RELAY_MISSING_REFRESH_TOKEN');
  }
  const response = isTauriRuntime()
    ? await invoke<OrbitRelayTokenResponse>('orbit_relay_refresh', {
        refreshToken,
      })
    : await requestOrbitRelay<OrbitRelayTokenResponse>('auth/refresh', {
        body: { refresh_token: refreshToken },
      });
  const nextSession: OrbitRelaySession = {
    ...session,
    accessToken: response.access_token,
    refreshToken: response.refresh_token ?? session.refreshToken ?? null,
    expiresAt: buildExpiresAt(response.expires_in),
    tokenType: response.token_type || session.tokenType || 'Bearer',
    savedAt: Date.now(),
  };
  saveOrbitRelaySession(nextSession);
  return nextSession;
}

export async function orbitRelayGetProfile(
  sessionOrToken: OrbitRelaySession | string,
): Promise<OrbitRelayUser> {
  const accessToken =
    typeof sessionOrToken === 'string' ? sessionOrToken : sessionOrToken.accessToken;
  return isTauriRuntime()
    ? invoke<OrbitRelayUser>('orbit_relay_get_profile', { accessToken })
    : requestOrbitRelay<OrbitRelayUser>('user/profile', { accessToken });
}

export async function orbitRelayRedeem(
  sessionOrToken: OrbitRelaySession | string,
  code: string,
): Promise<OrbitRelayRedeemResponse> {
  const accessToken =
    typeof sessionOrToken === 'string' ? sessionOrToken : sessionOrToken.accessToken;
  return isTauriRuntime()
    ? invoke<OrbitRelayRedeemResponse>('orbit_relay_redeem', { accessToken, code })
    : requestOrbitRelay<OrbitRelayRedeemResponse>('redeem', {
        accessToken,
        body: { code },
      });
}

export async function orbitRelayListApiKeys(
  sessionOrToken: OrbitRelaySession | string,
  groupId?: number | null,
): Promise<OrbitRelayApiKey[]> {
  const accessToken =
    typeof sessionOrToken === 'string' ? sessionOrToken : sessionOrToken.accessToken;
  const groupQuery =
    typeof groupId === 'number' && Number.isFinite(groupId) && groupId > 0
      ? `&group_id=${encodeURIComponent(String(groupId))}`
      : '';
  if (isTauriRuntime()) {
    return invoke<OrbitRelayApiKey[]>('orbit_relay_list_api_keys', {
      accessToken,
      group_id: typeof groupId === 'number' && Number.isFinite(groupId) && groupId > 0 ? groupId : null,
    });
  }
  const result = await requestOrbitRelay<OrbitRelayPaginated<OrbitRelayApiKey>>(
    `keys?page=1&page_size=100&sort_by=created_at&sort_order=desc${groupQuery}`,
    { accessToken },
  );
  return Array.isArray(result.items) ? result.items : [];
}

export async function orbitRelayListAvailableGroups(
  sessionOrToken: OrbitRelaySession | string,
): Promise<OrbitRelayGroup[]> {
  const accessToken =
    typeof sessionOrToken === 'string' ? sessionOrToken : sessionOrToken.accessToken;
  return isTauriRuntime()
    ? invoke<OrbitRelayGroup[]>('orbit_relay_list_available_groups', { accessToken })
    : requestOrbitRelay<OrbitRelayGroup[]>('groups/available', { accessToken });
}

export async function orbitRelayCreateApiKey(
  sessionOrToken: OrbitRelaySession | string,
  name = ORBIT_RELAY_CLIENT_API_KEY_NAME,
  groupId?: number | null,
): Promise<OrbitRelayApiKey> {
  const accessToken =
    typeof sessionOrToken === 'string' ? sessionOrToken : sessionOrToken.accessToken;
  const trimmedName = name.trim() || ORBIT_RELAY_CLIENT_API_KEY_NAME;
  const normalizedGroupId =
    typeof groupId === 'number' && Number.isFinite(groupId) && groupId > 0 ? groupId : null;
  return isTauriRuntime()
    ? invoke<OrbitRelayApiKey>('orbit_relay_create_api_key', {
        accessToken,
        name: trimmedName,
        group_id: normalizedGroupId,
      })
    : requestOrbitRelay<OrbitRelayApiKey>('keys', {
        accessToken,
        body: { name: trimmedName, ...(normalizedGroupId ? { group_id: normalizedGroupId } : {}) },
      });
}

export async function orbitRelayUpdateApiKey(
  sessionOrToken: OrbitRelaySession | string,
  id: number,
  updates: OrbitRelayApiKeyUpdateInput,
): Promise<OrbitRelayApiKey> {
  const accessToken =
    typeof sessionOrToken === 'string' ? sessionOrToken : sessionOrToken.accessToken;
  const body: Record<string, unknown> = {};
  if (typeof updates.name === 'string') {
    body.name = updates.name.trim() || ORBIT_RELAY_CLIENT_API_KEY_NAME;
  }
  if (updates.status) body.status = updates.status;
  if (updates.groupId === null) {
    body.group_id = null;
  } else if (typeof updates.groupId === 'number' && Number.isFinite(updates.groupId) && updates.groupId > 0) {
    body.group_id = updates.groupId;
  }
  if (typeof updates.quota === 'number' && Number.isFinite(updates.quota)) {
    body.quota = Math.max(0, updates.quota);
  }
  if (typeof updates.rateLimit5h === 'number' && Number.isFinite(updates.rateLimit5h)) {
    body.rate_limit_5h = Math.max(0, updates.rateLimit5h);
  }
  if (typeof updates.rateLimit1d === 'number' && Number.isFinite(updates.rateLimit1d)) {
    body.rate_limit_1d = Math.max(0, updates.rateLimit1d);
  }
  if (typeof updates.rateLimit7d === 'number' && Number.isFinite(updates.rateLimit7d)) {
    body.rate_limit_7d = Math.max(0, updates.rateLimit7d);
  }
  return isTauriRuntime()
    ? invoke<OrbitRelayApiKey>('orbit_relay_update_api_key', {
        accessToken,
        id,
      name: body.name ?? null,
      status: body.status ?? null,
      group_id: body.group_id ?? null,
      group_id_set: Object.prototype.hasOwnProperty.call(body, 'group_id'),
      quota: body.quota ?? null,
      rate_limit_5h: body.rate_limit_5h ?? null,
        rate_limit_1d: body.rate_limit_1d ?? null,
        rate_limit_7d: body.rate_limit_7d ?? null,
      })
    : requestOrbitRelay<OrbitRelayApiKey>(`keys/${id}`, {
        method: 'PUT',
        accessToken,
        body,
      });
}

export async function orbitRelayEnsureClientApiKey(
  sessionOrToken: OrbitRelaySession | string,
): Promise<OrbitRelayApiKey> {
  const keys = await orbitRelayListApiKeys(sessionOrToken);
  const existing = keys.find(
    (item) =>
      item.status === 'active' &&
      item.key.trim() &&
      item.name.trim() === ORBIT_RELAY_CLIENT_API_KEY_NAME,
  );
  if (existing) return existing;
  return orbitRelayCreateApiKey(sessionOrToken, ORBIT_RELAY_CLIENT_API_KEY_NAME);
}

export async function orbitRelayGetPublicSettings(): Promise<Record<string, unknown>> {
  return isTauriRuntime()
    ? invoke<Record<string, unknown>>('orbit_relay_get_public_settings')
    : requestOrbitRelay<Record<string, unknown>>('settings/public');
}
