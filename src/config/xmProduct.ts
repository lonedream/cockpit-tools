import type { Page } from '../types/navigation';

export const XM_PRODUCT_NAME = 'XM';
export const XM_PRODUCT_NAME_DEV = 'XM Dev';
export const XM_VISIBLE_NAV_PAGES: Page[] = ['codex', 'settings'];
export const XM_CODEX_TABS = ['xm-platform', 'codex-tools', 'settings', 'advanced'] as const;
export const XM_SHOW_MODEL_PROVIDER_UI = false;
export const XM_SHOW_LEGACY_SETTINGS = false;
export const XM_SHOW_ABOUT_SETTINGS = false;
export const XM_SHOW_UPDATE_SETTINGS = false;
export const XM_SHOW_SIDE_NAV = false;
export const XM_SHOW_PLATFORM_SWITCHER = false;
export const XM_CONSOLE_URL = 'https://sub.xingmeng.xin';
export const XM_SHOP_URL =
  import.meta.env.VITE_XM_SHOP_URL || 'https://pay.ldxp.cn/shop/VP1H5YKA';
export const XM_DEFAULT_CLIENT_API_KEY_QUOTA = 0;
export const XM_DEFAULT_CLIENT_API_KEY_RATE_LIMIT_5H = 0;
export const XM_DEFAULT_CLIENT_API_KEY_RATE_LIMIT_1D = 0;
export const XM_DEFAULT_CLIENT_API_KEY_RATE_LIMIT_7D = 0;

export function getXmDisplayName(): string {
  return import.meta.env.VITE_XM_PROFILE === 'dev'
    ? XM_PRODUCT_NAME_DEV
    : XM_PRODUCT_NAME;
}

export function normalizeXmPage(page: Page): Page {
  return XM_VISIBLE_NAV_PAGES.includes(page) ? page : 'codex';
}
