# XM Integration Plan

This plan keeps XM as a slim Codex-focused fork while integrating the hosted XM relay at `https://sub.xingmeng.xin` and the recharge flow.

## Standing Rules

- The visible product brand is uppercase `XM`.
- The app opens directly into the Codex workspace; do not restore a visible Dashboard transition page.
- Visible navigation stays simple: `XM`, `Codex`, and `Settings`.
- Preserve upstream code where practical and hide old upstream surfaces through XM-specific UI composition/config.
- The first Codex tab is the XM platform onboarding surface: registration, login, balance, API key/token setup, redeem/recharge, and shop handoff.
- The second Codex tab contains local API configuration and Codex account switching.
- Wakeup, instances, and sessions live under the advanced Codex area.
- Normal users should not see model-provider management. Login to XM should create/reuse the XM API key and write the XM provider/account into Codex.
- Default local API port is `1457`; if occupied, try the next free ports without killing user-owned processes.
- If XM traffic or credit is exhausted, show the recharge popup first. The shop URL is `https://pay.ldxp.cn/shop/VP1H5YKA`.
- Do not read, print, commit, or embed credentials from `.release-secrets`, `admin-credentials.txt`, `backend/config.yaml`, or `.env*` files.

## Verified Context

- Desktop repo: `D:\722\codex-tools\cockpit-tools`
- Slim fork branch: `orbit-desk-slim-upstream`
- Server deployment workspace: `D:\722\sub-xingmeng`
- Public xm URL: `https://sub.xingmeng.xin`
- User/admin API base: `https://sub.xingmeng.xin/api/v1`
- OpenAI-compatible relay base: `https://sub.xingmeng.xin/v1`
- Server install path: `/opt/sub2api`
- Server config path: `/opt/sub2api/config.yaml`
- systemd service: `sub2api`
- App port: `8888`
- Reverse proxy: Nginx to `127.0.0.1:8888`
- Public settings endpoint is reachable, but reports `payment_enabled: false`, `registration_enabled: false`, and version `0.1.133`.
- Local deployment README says installed release archive is `v0.1.134`; verify the live binary/version before changing payment behavior.

Do not read, print, commit, or embed credentials from `D:\722\sub-xingmeng\admin-credentials.txt` or any `.release-secrets/` file.

The provided Codex thread `codex://threads/019ea22e-5147-7ca3-b4d5-8838ed8ba018` is registered as the server deployment context, but relay resume did not produce a usable log. Use the local `D:\722\sub-xingmeng` files as the source of truth.

## Product Shape

xm should feel like a compact work console, not a marketing page. The first relay screen should show account, key, usage, and recharge state with dense controls and clear status.

Primary user flow:

1. User signs in with the xm account password.
2. Desktop stores access/refresh tokens securely; it never stores the password.
3. Desktop calls a managed-key endpoint to create or fetch the user's xm API key.
4. The managed key is inserted into the existing Codex model provider configuration using `integrationType: "sub2api"` and base URL `https://sub.xingmeng.xin/v1`.
5. User can copy the key, inspect balance/usage, and open quick recharge.
6. Recharge presents QR/payment status in a modal and refreshes balance after fulfillment.

## Upstream Sync Boundaries

Keep xm-specific code isolated so upstream `cockpit-tools` upstream changes can be merged with minimal conflict.

Preferred new desktop files:

- `src/utils/orbitRelayConfig.ts`
- `src/services/orbitRelayService.ts`
- `src/components/orbit-relay/*`
- `src/pages/OrbitRelayPage.tsx`

Keep edits to upstream-heavy files narrow:

- `src/App.tsx`: route registration only.
- `src/components/SideNav.tsx`: one visible xm entry if needed.
- `src/utils/codexProviderPresets.ts`: add or replace one xm preset.
- `src/components/codex/CodexModelProviderManager.tsx`: small integration hook only if the provider manager must surface the managed key.

Avoid broad rewrites of existing shared account/provider pages unless a later upstream merge proves they are already fork-only.

## Desktop Implementation

Add an xm service wrapper for:

- `POST /api/v1/auth/login`
- `POST /api/v1/auth/login/2fa` when 2FA is required
- `POST /api/v1/auth/refresh`
- `GET /api/v1/auth/me`
- `GET /api/v1/user/profile`
- `GET /api/v1/user/platform-quotas`
- `POST /api/v1/orbit/managed-key` after the server endpoint is added
- payment endpoints listed below, depending on the selected payment path

Token handling:

- Persist access and refresh tokens through the Tauri backend or OS credential storage where possible.
- Keep passwords in memory only for the login request.
- Clear local provider state on logout, but do not attempt to delete the managed server key.

Codex provider handling:

- Provider name: `xm`
- API base URL: `https://sub.xingmeng.xin/v1`
- Integration type: `sub2api`
- Use the existing `queryCodexModelProviderUsage` path for balance/usage checks.
- Managed key delete buttons should be hidden or disabled in the desktop UI, but this is only UX. The server must enforce non-deletion.

## Required Server Changes

The current xm key model supports CRUD but does not show a managed/non-deletable field. To make "不可删除" real, add server-side enforcement.

Recommended schema additions on `api_keys`:

- `managed_source varchar(64) null`
- `delete_locked boolean not null default false`

Recommended endpoint:

`POST /api/v1/orbit/managed-key`

Behavior:

- Requires normal user JWT.
- Idempotently returns the user's existing active xm managed key.
- Creates a new key only when no active xm managed key exists.
- Names the key `xm`.
- Sets `managed_source = "orbit_desk"` and `delete_locked = true`.
- Does not expose admin-only controls.

Delete policy:

- `DELETE /api/v1/keys/:id` must reject `delete_locked` keys with a clear `403` error.
- Admin UI may show locked state, but should not silently bypass it unless an explicit emergency admin-only unlock flow is later added.

Tests:

- Managed-key endpoint is idempotent for the same user.
- Different users get different managed keys.
- A normal user cannot delete a locked key.
- Existing unlocked keys keep current behavior.

## Recharge Integration

There are two viable paths. Prefer path A unless the external shop has a stable API/webhook contract.

### Path A: Use xm built-in payment

Enable and configure xm payment providers, then let the desktop consume user payment APIs:

- `GET /api/v1/payment/checkout-info`
- `GET /api/v1/payment/plans`
- `GET /api/v1/payment/channels`
- `POST /api/v1/payment/orders`
- `GET /api/v1/payment/orders/:id`
- `POST /api/v1/payment/orders/verify`

Desktop behavior:

- Show amount buttons and payment method options from checkout info.
- Create an order.
- Show `qr_code` or open `pay_url`.
- Poll/verify order status.
- Refresh balance after the webhook completes fulfillment.

This is the cleanest path because xm already contains payment fulfillment that creates and redeems a balance code after payment success.

### Path B: Use `pay.ldxp.cn` Shop

Use this only if the shop supports official order creation/status/webhook APIs.

Required contract from the shop:

- Create order for a specific amount/product.
- Return QR/payment URL.
- Notify payment success through signed webhook or allow reliable polling.
- Return delivered card/redeem key or order payload.

Safe fulfillment:

- The shop webhook or a small server-side bridge calls xm Admin API:
  `POST /api/v1/admin/redeem-codes/create-and-redeem`
- Use `x-api-key` and `Idempotency-Key` only on the server side.
- The desktop must never contain the xm admin API key.

Alternative user-token fulfillment:

- If the shop delivers a redeem code, the desktop can call `POST /api/v1/redeem` with the user's token.
- This is acceptable only if the redeem code is meant to be user-visible.

Avoid scraping the shop page as a primary integration. It is brittle and makes payment failure handling hard to audit.

## UI Direction

Replace the current previous relay page with a quiet xm console:

- Top bar: connection state, relay base URL, logged-in user, logout.
- Account panel: username/email, balance, quota, refresh status.
- Managed key panel: masked key, copy, status, last checked time, "configured for Codex" state.
- Usage panel: remaining quota, daily usage, token/request counters where available.
- Recharge panel: amount choices, payment method, QR modal, order status, retry/cancel.
- Diagnostics row: API base, last request error, version mismatch notice if server version differs from expected.

Visual rules:

- Use compact layouts, tables, segmented controls, icon buttons, and 8px-or-less radii.
- Avoid marketing hero sections, nested cards, large gradients, and long feature copy.
- Keep non-Codex and upstream-branded menus hidden according to `AGENTS.md`.

## Delivery Phases

1. Desktop UI style pass
   - Convert relay/API page to the Orbit console style.
   - Keep changes isolated under new xm-specific files where possible.

2. Desktop relay account integration
   - Add login/refresh/profile service.
   - Add secure token persistence.
   - Add xm page and provider preset.

3. Server managed-key support
   - Add schema/migration, service method, route, and delete lock.
   - Deploy and verify `POST /api/v1/orbit/managed-key`.

4. Recharge
   - Prefer enabling xm built-in payment first.
   - If using the shop, implement a server-side bridge/webhook before desktop UI consumes it.

5. Release
   - Use GitHub Releases and the existing `orbit-desk-release` skill.
   - Bump version, verify typecheck/Cargo, push tag, monitor workflow, and verify `latest.json`.

## Open Decisions

- Confirm whether `pay.ldxp.cn` provides official API/webhook documentation.
- Decide whether to enable xm built-in payment instead of routing through the external shop.
- Resolve live version mismatch: public endpoint reports `0.1.133`; local archive is `0.1.134`.
- Decide whether users self-register elsewhere, because the public settings currently have registration disabled.
