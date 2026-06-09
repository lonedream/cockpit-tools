import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  CheckCircle2,
  Copy,
  Eye,
  EyeOff,
  KeyRound,
  LogOut,
  RefreshCw,
  ShieldCheck,
  TicketCheck,
  WalletCards,
} from 'lucide-react';
import {
  clearOrbitRelaySession,
  formatOrbitRelayError,
  loadOrbitRelaySession,
  ORBIT_RELAY_API_BASE,
  ORBIT_RELAY_IS_LOCAL_TESTING,
  ORBIT_RELAY_PROVIDER_BASE_URL,
  ORBIT_RELAY_REQUEST_API_BASE,
  orbitRelayGetProfile,
  orbitRelayLogin,
  orbitRelayRedeem,
  saveOrbitRelaySession,
  type OrbitRelayRedeemResponse,
  type OrbitRelaySession,
  type OrbitRelayUser,
} from '../services/orbitRelayService';
import './ApiKeyFunPage.css';

function formatNumber(value?: number | null, suffix = ''): string {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '--';
  const formatted = new Intl.NumberFormat(undefined, {
    maximumFractionDigits: Math.abs(value) >= 100 ? 2 : 4,
  }).format(value);
  return suffix ? `${formatted} ${suffix}` : formatted;
}

function formatDateTime(value?: string | null): string {
  if (!value) return '--';
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return '--';
  return new Intl.DateTimeFormat(undefined, {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(timestamp));
}

function redeemTypeLabel(value?: string | null): string {
  switch (value) {
    case 'balance':
    case 'admin_balance':
      return '余额';
    case 'concurrency':
    case 'admin_concurrency':
      return '并发';
    case 'subscription':
      return '订阅';
    default:
      return value || '兑换码';
  }
}

function profileDisplayName(user: OrbitRelayUser | null): string {
  if (!user) return '--';
  return user.username?.trim() || user.email || `#${user.id}`;
}

function formatRedeemResult(result: OrbitRelayRedeemResponse): string {
  const typeLabel = redeemTypeLabel(result.type);
  const valueText = formatNumber(result.value);
  const suffix =
    result.type === 'subscription' && result.validity_days
      ? `，有效期 ${result.validity_days} 天`
      : '';
  return `${typeLabel} +${valueText}${suffix}`;
}

export function ApiKeyFunPage() {
  const [session, setSession] = useState<OrbitRelaySession | null>(() => loadOrbitRelaySession());
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [redeemCode, setRedeemCode] = useState('');
  const [loginError, setLoginError] = useState<string | null>(null);
  const [redeemError, setRedeemError] = useState<string | null>(null);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [lastRedeem, setLastRedeem] = useState<OrbitRelayRedeemResponse | null>(null);
  const [loggingIn, setLoggingIn] = useState(false);
  const [redeeming, setRedeeming] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);

  const user = session?.user ?? null;
  const isLoggedIn = Boolean(session?.accessToken);
  const statusTone = user?.status === 'active' ? 'ok' : 'warn';
  const lastSyncText = useMemo(() => {
    if (!session?.savedAt) return '--';
    return new Intl.DateTimeFormat(undefined, {
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(session.savedAt));
  }, [session?.savedAt]);

  const copyText = useCallback((text: string, id: string) => {
    if (!text) return;
    void navigator.clipboard.writeText(text).then(() => {
      setCopied(id);
      window.setTimeout(() => setCopied(null), 1500);
    });
  }, []);

  const refreshProfile = useCallback(
    async (targetSession = session) => {
      if (!targetSession) return null;
      setRefreshing(true);
      setProfileError(null);
      try {
        const profile = await orbitRelayGetProfile(targetSession);
        const nextSession: OrbitRelaySession = {
          ...targetSession,
          user: profile,
          savedAt: Date.now(),
        };
        saveOrbitRelaySession(nextSession);
        setSession(nextSession);
        return nextSession;
      } catch (error) {
        setProfileError(formatOrbitRelayError(error));
        return null;
      } finally {
        setRefreshing(false);
      }
    },
    [session],
  );

  useEffect(() => {
    if (!session) return;
    void refreshProfile(session);
  }, []);

  const handleLogin = useCallback(
    async (event: React.FormEvent) => {
      event.preventDefault();
      setLoggingIn(true);
      setLoginError(null);
      setProfileError(null);
      setLastRedeem(null);
      try {
        const nextSession = await orbitRelayLogin(email, password);
        setSession(nextSession);
        setPassword('');
      } catch (error) {
        setLoginError(formatOrbitRelayError(error));
      } finally {
        setLoggingIn(false);
      }
    },
    [email, password],
  );

  const handleLogout = useCallback(() => {
    clearOrbitRelaySession();
    setSession(null);
    setLastRedeem(null);
    setRedeemError(null);
    setProfileError(null);
  }, []);

  const handleRedeem = useCallback(
    async (event: React.FormEvent) => {
      event.preventDefault();
      if (!session) return;
      setRedeeming(true);
      setRedeemError(null);
      setLastRedeem(null);
      try {
        const result = await orbitRelayRedeem(session, redeemCode);
        setLastRedeem(result);
        setRedeemCode('');
        await refreshProfile(session);
      } catch (error) {
        setRedeemError(formatOrbitRelayError(error));
      } finally {
        setRedeeming(false);
      }
    },
    [redeemCode, refreshProfile, session],
  );

  return (
    <div className="orbit-relay-page">
      <header className="orbit-relay-topbar">
        <div className="orbit-relay-title-block">
          <div className="orbit-relay-kicker-row">
            <span className="orbit-relay-kicker">XM</span>
            {ORBIT_RELAY_IS_LOCAL_TESTING && (
              <span className="orbit-relay-env-badge">本地测试</span>
            )}
          </div>
          <h1>XM 控制台</h1>
          <p>登录 XM 账号后，可以在桌面端查看余额、刷新账户状态，并使用兑换码充值。</p>
        </div>
        <div className="orbit-relay-endpoints">
          <button
            className="orbit-relay-endpoint"
            type="button"
            onClick={() => copyText(ORBIT_RELAY_PROVIDER_BASE_URL, 'provider')}
            title="复制 XM OpenAI 兼容地址"
          >
            <KeyRound size={15} />
            <span>{ORBIT_RELAY_PROVIDER_BASE_URL}</span>
            {copied === 'provider' ? <CheckCircle2 size={14} /> : <Copy size={14} />}
          </button>
          <button
            className="orbit-relay-endpoint"
            type="button"
            onClick={() => copyText(ORBIT_RELAY_API_BASE, 'api')}
            title="复制 XM 控制台 API 地址"
          >
            <ShieldCheck size={15} />
            <span>{ORBIT_RELAY_API_BASE}</span>
            {copied === 'api' ? <CheckCircle2 size={14} /> : <Copy size={14} />}
          </button>
        </div>
      </header>

      <div className="orbit-relay-grid">
        <main className="orbit-relay-main">
          {!isLoggedIn ? (
            <section className="orbit-relay-panel">
              <div className="orbit-relay-panel-head">
                <div>
                  <h2>登录 XM 账号</h2>
                  <p>使用本地测试站的邮箱和密码登录。密码只用于本次登录请求。</p>
                </div>
              </div>
              <form className="orbit-relay-form" onSubmit={handleLogin}>
                <label className="orbit-relay-field">
                  <span>邮箱</span>
                  <input
                    type="email"
                    value={email}
                    autoComplete="email"
                    placeholder="name@example.com"
                    onChange={(event) => {
                      setEmail(event.target.value);
                      setLoginError(null);
                    }}
                  />
                </label>
                <label className="orbit-relay-field">
                  <span>密码</span>
                  <div className="orbit-relay-secret">
                    <input
                      type={showPassword ? 'text' : 'password'}
                      value={password}
                      autoComplete="current-password"
                      placeholder="输入账号密码"
                      onChange={(event) => {
                        setPassword(event.target.value);
                        setLoginError(null);
                      }}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((value) => !value)}
                      title={showPassword ? '隐藏密码' : '显示密码'}
                    >
                      {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                </label>
                {loginError && <div className="orbit-relay-message error">{loginError}</div>}
                <button className="orbit-relay-primary" type="submit" disabled={loggingIn}>
                  {loggingIn ? (
                    <RefreshCw size={16} className="spin" />
                  ) : (
                    <ShieldCheck size={16} />
                  )}
                  <span>{loggingIn ? '正在登录' : '登录'}</span>
                </button>
              </form>
            </section>
          ) : (
            <>
              <section className="orbit-relay-account-strip">
                <div>
                  <span>当前账号</span>
                  <strong>{profileDisplayName(user)}</strong>
                  <small>{user?.email ?? '--'}</small>
                </div>
                <div className={`orbit-relay-status ${statusTone}`}>
                  {user?.status === 'active' ? '可用' : user?.status || '未知'}
                </div>
              </section>

              <div className="orbit-relay-metrics">
                <div className="orbit-relay-metric primary">
                  <span>账户余额</span>
                  <strong>{formatNumber(user?.balance)}</strong>
                </div>
                <div className="orbit-relay-metric">
                  <span>并发额度</span>
                  <strong>{formatNumber(user?.concurrency)}</strong>
                </div>
                <div className="orbit-relay-metric">
                  <span>账号 ID</span>
                  <strong>{user?.id ?? '--'}</strong>
                </div>
                <div className="orbit-relay-metric">
                  <span>上次同步</span>
                  <strong>{lastSyncText}</strong>
                </div>
              </div>

              <section className="orbit-relay-panel">
                <div className="orbit-relay-panel-head">
                  <div>
                    <h2>兑换码充值</h2>
                    <p>输入后台生成的兑换码，成功后会自动刷新余额。</p>
                  </div>
                  <TicketCheck size={20} />
                </div>
                <form className="orbit-relay-redeem-row" onSubmit={handleRedeem}>
                  <input
                    value={redeemCode}
                    placeholder="输入兑换码"
                    spellCheck={false}
                    onChange={(event) => {
                      setRedeemCode(event.target.value);
                      setRedeemError(null);
                    }}
                  />
                  <button type="submit" disabled={redeeming || !redeemCode.trim()}>
                    {redeeming ? (
                      <RefreshCw size={16} className="spin" />
                    ) : (
                      <TicketCheck size={16} />
                    )}
                    <span>{redeeming ? '兑换中' : '兑换'}</span>
                  </button>
                </form>
                {redeemError && <div className="orbit-relay-message error">{redeemError}</div>}
                {lastRedeem && (
                  <div className="orbit-relay-message success">
                    <CheckCircle2 size={16} />
                    <span>兑换成功：{formatRedeemResult(lastRedeem)}</span>
                  </div>
                )}
              </section>
            </>
          )}
        </main>

        <aside className="orbit-relay-side">
          <section className="orbit-relay-panel">
            <div className="orbit-relay-panel-head compact">
              <div>
                <h2>服务状态</h2>
                <p>当前桌面端直连 XM API。</p>
              </div>
              <WalletCards size={20} />
            </div>
            <div className="orbit-relay-info-list">
              <div>
                <span>OpenAI 兼容地址</span>
                <strong>{ORBIT_RELAY_PROVIDER_BASE_URL}</strong>
              </div>
              <div>
                <span>控制台 API</span>
                <strong>{ORBIT_RELAY_API_BASE}</strong>
              </div>
              {ORBIT_RELAY_REQUEST_API_BASE !== ORBIT_RELAY_API_BASE && (
                <div>
                  <span>本地代理</span>
                  <strong>{ORBIT_RELAY_REQUEST_API_BASE}</strong>
                </div>
              )}
              <div>
                <span>加入时间</span>
                <strong>{formatDateTime(user?.created_at)}</strong>
              </div>
            </div>
            {profileError && <div className="orbit-relay-message error">{profileError}</div>}
            <div className="orbit-relay-side-actions">
              <button
                className="orbit-relay-secondary"
                type="button"
                disabled={!session || refreshing}
                onClick={() => void refreshProfile()}
              >
                <RefreshCw size={16} className={refreshing ? 'spin' : undefined} />
                <span>{refreshing ? '刷新中' : '刷新资料'}</span>
              </button>
              {isLoggedIn && (
                <button className="orbit-relay-ghost" type="button" onClick={handleLogout}>
                  <LogOut size={16} />
                  <span>退出登录</span>
                </button>
              )}
            </div>
          </section>
        </aside>
      </div>
    </div>
  );
}
