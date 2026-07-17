import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useDispatch } from 'react-redux';
import { PublicClientApplication } from '@azure/msal-browser';
import api from '@/lib/api';
import { setAuth } from '@/store/slices/authSlice';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Sparkles, Loader2, Apple as AppleIcon, Github, Linkedin } from 'lucide-react';
import { AUTH } from '@/constants/testIds';

const GSI_SRC = 'https://accounts.google.com/gsi/client';
const APPLE_SRC = 'https://appleid.cdn-apple.com/appleauth/static/jsapi/appleid/1/en_US/appleid.auth.js';

// Cache MSAL instance across renders
let msalInstance = null;

export default function AuthPage({ mode }) {
  const isRegister = mode === 'register';
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);
  const [oauthCfg, setOauthCfg] = useState({ google: {}, microsoft: {}, apple: {} });
  const [searchParams] = useSearchParams();
  const googleBtnRef = useRef(null);
  const dispatch = useDispatch();
  const navigate = useNavigate();

  const handleAuthSuccess = (data, providerLabel) => {
    dispatch(setAuth(data));
    toast.success(`Signed in with ${providerLabel}`);
    navigate('/chat', { replace: true });
  };

  useEffect(() => {
    api.get('/auth/oauth-config').then((r) => setOauthCfg(r.data)).catch(() => {});
    // If returning from legacy OAuth code redirect
    const code = searchParams.get('code');
    const state = searchParams.get('state');
    if (code && state) exchangeOAuthCode(state, code);
    // eslint-disable-next-line
  }, []);

  // ---------- Google Identity Services ----------
  useEffect(() => {
    if (!oauthCfg.google?.enabled) return;
    const init = () => {
      if (!window.google?.accounts?.id) return;
      try {
        window.google.accounts.id.initialize({
          client_id: oauthCfg.google.client_id,
          callback: async (resp) => {
            console.log('[Google] GIS callback:', { hasCredential: !!resp?.credential });
            if (!resp?.credential) {
              toast.error('Google did not return a credential');
              return;
            }
            setLoading(true);
            try {
              const { data } = await api.post('/auth/google-verify', { credential: resp.credential });
              handleAuthSuccess(data, 'Google');
            } catch (err) {
              console.error('[Google] verify error:', err);
              toast.error(err.response?.data?.detail || 'Google sign-in failed');
            } finally { setLoading(false); }
          },
          ux_mode: 'popup',
          auto_select: false,
          use_fedcm_for_prompt: true,
        });
        if (googleBtnRef.current) {
          window.google.accounts.id.renderButton(googleBtnRef.current, {
            theme: 'outline', size: 'large',
            width: googleBtnRef.current.offsetWidth || 320,
            text: isRegister ? 'signup_with' : 'signin_with',
            shape: 'rectangular',
          });
        }
      } catch (e) {
        console.error('[Google] GIS init failed:', e);
      }
    };
    const existing = document.querySelector(`script[src="${GSI_SRC}"]`);
    if (existing) init();
    else {
      const s = document.createElement('script');
      s.src = GSI_SRC; s.async = true; s.defer = true; s.onload = init;
      document.body.appendChild(s);
    }
  }, [oauthCfg.google?.enabled, oauthCfg.google?.client_id, isRegister]);

  // ---------- Apple Sign-In JS ----------
  useEffect(() => {
    if (!oauthCfg.apple?.enabled) return;
    const init = () => {
      if (!window.AppleID?.auth) return;
      try {
        window.AppleID.auth.init({
          clientId: oauthCfg.apple.client_id,
          scope: 'name email',
          redirectURI: window.location.origin + '/auth/callback',
          state: 'apple',
          usePopup: true,
        });
      } catch (e) { /* Apple init failed */ }
    };
    const existing = document.querySelector(`script[src="${APPLE_SRC}"]`);
    if (existing) init();
    else {
      const s = document.createElement('script');
      s.src = APPLE_SRC; s.async = true; s.defer = true; s.onload = init;
      document.body.appendChild(s);
    }
  }, [oauthCfg.apple?.enabled, oauthCfg.apple?.client_id]);

  // Initialize MSAL on mount + handle redirect return (loginRedirect flow)
  useEffect(() => {
    if (!oauthCfg.microsoft?.enabled || !oauthCfg.microsoft?.client_id) return;
    (async () => {
      try {
        const msal = getMsal();
        await msal.initialize();
        const result = await msal.handleRedirectPromise();
        // Only auto-complete if we initiated the redirect from this app
        const pending = (() => { try { return sessionStorage.getItem('iema_msal_pending'); } catch { return null; } })();
        if (result?.idToken && pending) {
          try { sessionStorage.removeItem('iema_msal_pending'); } catch { /* ignore */ }
          setLoading(true);
          try {
            const { data } = await api.post('/auth/microsoft-verify', { id_token: result.idToken });
            handleAuthSuccess(data, 'Microsoft');
          } catch (err) {
            console.error('[MS] verify error:', err);
            toast.error(err.response?.data?.detail || 'Microsoft verification failed');
          } finally { setLoading(false); }
        }
      } catch (e) {
        console.warn('[MS] init/handleRedirect error, clearing state:', e?.errorCode);
        clearMsalInteractionState();
        msalInstance = null;
      }
    })();
    // eslint-disable-next-line
  }, [oauthCfg.microsoft?.enabled, oauthCfg.microsoft?.client_id]);

  // ---------- MSAL (Microsoft) ----------
  const getMsal = () => {
    if (!msalInstance) {
      msalInstance = new PublicClientApplication({
        auth: {
          clientId: oauthCfg.microsoft.client_id,
          // 'common' = any Microsoft Entra tenant + personal Microsoft accounts.
          // Requires Azure App → Supported account types set to
          // "Accounts in any org directory AND personal Microsoft accounts".
          authority: 'https://login.microsoftonline.com/common',
          redirectUri: window.location.origin,
        },
        cache: { cacheLocation: 'sessionStorage', storeAuthStateInCookie: false },
      });
    }
    return msalInstance;
  };

  // Clear any stuck MSAL interaction state
  const clearMsalInteractionState = () => {
    try {
      const keys = Object.keys(sessionStorage);
      for (const k of keys) {
        if (k.startsWith('msal.') || k.includes('interaction.status') || k.includes('msal-interaction')) {
          sessionStorage.removeItem(k);
        }
      }
    } catch (e) { /* ignore */ }
  };

  const exchangeOAuthCode = async (provider, code) => {
    // Legacy code-flow (kept for backward compat only)
    setLoading(true);
    try {
      const redirectUri = `${window.location.origin}/auth/callback`;
      const { data } = await api.post(`/auth/${provider}`, { code, redirect_uri: redirectUri });
      handleAuthSuccess(data, provider);
    } catch (err) {
      toast.error(err.response?.data?.detail || 'OAuth failed');
      navigate('/login', { replace: true });
    } finally { setLoading(false); }
  };

  const submit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const url = isRegister ? '/auth/register' : '/auth/login';
      const body = isRegister ? { email, password, name } : { email, password };
      const { data } = await api.post(url, body);
      dispatch(setAuth(data));
      toast.success(isRegister ? 'Account created — enjoy your 100 welcome credits!' : 'Welcome back');
      navigate('/chat');
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Something went wrong');
    } finally { setLoading(false); }
  };

  const githubSignIn = () => {
    if (!oauthCfg.github?.enabled) { toast.info('GitHub OAuth not configured'); return; }
    const redirect_uri = window.location.origin + '/auth/callback';
    const state = 'github';
    const url = 'https://github.com/login/oauth/authorize?' + new URLSearchParams({
      client_id: oauthCfg.github.client_id, redirect_uri, scope: 'read:user user:email', state,
    }).toString();
    window.location.href = url;
  };

  const linkedinSignIn = () => {
    if (!oauthCfg.linkedin?.enabled) { toast.info('LinkedIn OAuth not configured'); return; }
    const redirect_uri = window.location.origin + '/auth/callback';
    const state = 'linkedin';
    const url = 'https://www.linkedin.com/oauth/v2/authorization?' + new URLSearchParams({
      response_type: 'code', client_id: oauthCfg.linkedin.client_id, redirect_uri,
      scope: 'openid profile email', state,
    }).toString();
    window.location.href = url;
  };

  const microsoftSignIn = async () => {
    if (!oauthCfg.microsoft?.enabled) { toast.info('Microsoft OAuth not configured'); return; }
    setLoading(true);
    try {
      const msal = getMsal();
      await msal.initialize();
      try { await msal.handleRedirectPromise(); } catch { /* ignore */ }
      // Popup flow: keeps state inside this window, no root-page detour and
      // no chance of React Router consuming the response fragment.
      const result = await msal.loginPopup({
        scopes: ['openid', 'email', 'profile'],
        prompt: 'select_account',
      });
      if (!result?.idToken) throw new Error('No id_token from Microsoft');
      const { data } = await api.post('/auth/microsoft-verify', { id_token: result.idToken });
      handleAuthSuccess(data, 'Microsoft');
    } catch (err) {
      console.error('[MS] sign-in error:', err);
      const code = err?.errorCode || '';
      const msg = err?.errorMessage || err?.message || '';
      if (code === 'user_cancelled' || msg.includes('user_cancelled') || msg.includes('User cancelled')) return;
      if (code === 'interaction_in_progress') {
        clearMsalInteractionState();
        msalInstance = null;
        toast.info('Please click Microsoft again — cleared previous session');
        return;
      }
      const detail = err?.response?.data?.detail;
      toast.error(detail || msg || `Microsoft sign-in failed${code ? ' (' + code + ')' : ''}`);
    } finally { setLoading(false); }
  };

  const appleSignIn = async () => {
    if (!oauthCfg.apple?.enabled) { toast.info('Apple Sign-In not configured'); return; }
    if (!window.AppleID?.auth) { toast.error('Apple SDK not loaded yet, try again'); return; }
    setLoading(true);
    try {
      const resp = await window.AppleID.auth.signIn();
      console.log('[Apple] signIn resp:', { hasIdToken: !!resp?.authorization?.id_token });
      const idToken = resp?.authorization?.id_token;
      if (!idToken) throw new Error('No id_token from Apple');
      const { data } = await api.post('/auth/apple', { id_token: idToken });
      handleAuthSuccess(data, 'Apple');
    } catch (err) {
      console.error('[Apple] sign-in error:', err);
      if (err?.error === 'popup_closed_by_user' || err?.error === 'user_cancelled_authorize') return;
      toast.error(err?.response?.data?.detail || err?.error || err?.message || 'Apple sign-in failed');
    } finally { setLoading(false); }
  };

  const facebookSignIn = () => toast.info('Facebook Sign-In is not enabled (no client secret provided).');

  return (
    <div className="min-h-screen flex bg-background">
      <div className="hidden lg:flex flex-col justify-between w-1/2 relative overflow-hidden bg-[hsl(var(--surface))] border-r border-border p-10">
        <div className="grid-pattern absolute inset-0 opacity-40" />
        <Link to="/" className="relative flex items-center gap-2">
          <div className="h-7 w-7 rounded-md bg-primary flex items-center justify-center">
            <Sparkles className="h-4 w-4 text-primary-foreground" />
          </div>
          <span className="font-display font-semibold">IEMA<span className="text-primary">.</span>ai</span>
        </Link>
        <div className="relative max-w-md">
          <div className="text-xs uppercase tracking-wider text-primary mb-3">v2.0</div>
          <h2 className="font-display text-3xl font-medium tracking-tight leading-tight">One AI to learn, build a career, and grow.</h2>
          <p className="mt-3 text-muted-foreground">12 intelligence modules — chat, career, resume, interviews, courses and more — with one credit wallet across web + mobile.</p>
          <div className="mt-8 grid grid-cols-3 gap-4 text-sm">
            <div><div className="font-display text-2xl font-medium">100</div><div className="text-xs text-muted-foreground">Welcome credits</div></div>
            <div><div className="font-display text-2xl font-medium">20</div><div className="text-xs text-muted-foreground">Daily free credits</div></div>
            <div><div className="font-display text-2xl font-medium">12</div><div className="text-xs text-muted-foreground">Modules</div></div>
          </div>
        </div>
        <div className="relative text-xs text-muted-foreground">&copy; 2026 IEMA.ai — Own the data. Grow every day.</div>
      </div>

      <div className="flex-1 flex flex-col justify-center items-center p-6">
        <div className="w-full max-w-sm animate-fade-in-up">
          <Link to="/" className="lg:hidden flex items-center gap-2 mb-8">
            <div className="h-7 w-7 rounded-md bg-primary flex items-center justify-center"><Sparkles className="h-4 w-4 text-primary-foreground" /></div>
            <span className="font-display font-semibold">IEMA<span className="text-primary">.</span>ai</span>
          </Link>
          <h1 className="font-display text-3xl font-medium tracking-tight">{isRegister ? 'Create your account' : 'Welcome back'}</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {isRegister ? 'Start with 100 credits. No card required.' : 'Sign in to continue to your workspace.'}
          </p>

          <div className="mt-6 space-y-2">
            <div ref={googleBtnRef} data-testid={AUTH.googleBtn} className="w-full flex justify-center min-h-[44px]">
              {!oauthCfg.google?.enabled && <Button variant="outline" className="w-full justify-center" disabled>Google (not configured)</Button>}
            </div>
            <div className="grid grid-cols-3 gap-2">
              <Button variant="outline" size="sm" onClick={appleSignIn} disabled={!oauthCfg.apple?.enabled || loading} data-testid="auth-apple-btn">
                <AppleIcon className="h-4 w-4 mr-1" /> Apple
              </Button>
              <Button variant="outline" size="sm" onClick={microsoftSignIn} disabled={!oauthCfg.microsoft?.enabled || loading} data-testid="auth-microsoft-btn">
                <svg className="h-3.5 w-3.5 mr-1" viewBox="0 0 21 21" xmlns="http://www.w3.org/2000/svg"><rect x="1" y="1" width="9" height="9" fill="#f25022"/><rect x="11" y="1" width="9" height="9" fill="#7fba00"/><rect x="1" y="11" width="9" height="9" fill="#00a4ef"/><rect x="11" y="11" width="9" height="9" fill="#ffb900"/></svg>
                Microsoft
              </Button>
              <Button variant="outline" size="sm" onClick={githubSignIn} disabled={!oauthCfg.github?.enabled || loading} data-testid="auth-github-btn">
                <Github className="h-3.5 w-3.5 mr-1" /> GitHub
              </Button>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Button variant="outline" size="sm" onClick={linkedinSignIn} disabled={!oauthCfg.linkedin?.enabled || loading} data-testid="auth-linkedin-btn">
                <Linkedin className="h-3.5 w-3.5 mr-1 text-[#0a66c2]" /> LinkedIn
              </Button>
              <Button variant="outline" size="sm" onClick={facebookSignIn} data-testid="auth-facebook-btn" disabled>Facebook</Button>
            </div>
          </div>

          <div className="my-6 flex items-center gap-3 text-xs text-muted-foreground">
            <div className="h-px flex-1 bg-border" /><span>or continue with email</span><div className="h-px flex-1 bg-border" />
          </div>

          <form onSubmit={submit} className="space-y-3">
            {isRegister && (
              <div className="space-y-1.5">
                <Label htmlFor="name">Full name</Label>
                <Input id="name" data-testid={AUTH.nameInput} value={name} onChange={(e) => setName(e.target.value)} required placeholder="Jane Doe" />
              </div>
            )}
            <div className="space-y-1.5">
              <Label htmlFor="email">Email</Label>
              <Input id="email" data-testid={AUTH.emailInput} type="email" value={email} onChange={(e) => setEmail(e.target.value)} required placeholder="you@company.com" />
            </div>
            <div className="space-y-1.5 relative">
              <div className="flex items-center justify-between">
                <Label htmlFor="password">Password</Label>
                {!isRegister && (
                  <Link to="/forgot-password" className="text-xs text-muted-foreground hover:text-primary" data-testid="auth-forgot-link">Forgot?</Link>
                )}
              </div>
              <Input id="password" data-testid={AUTH.passwordInput} type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} placeholder="••••••••" />
            </div>
            <Button type="submit" className="w-full" disabled={loading} data-testid={AUTH.submitBtn}>
              {loading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {isRegister ? 'Create account' : 'Sign in'}
            </Button>
          </form>

          <div className="mt-6 text-center text-sm text-muted-foreground">
            {isRegister ? (
              <>Already have an account? <Link to="/login" data-testid={AUTH.toggleLink} className="text-primary hover:underline">Sign in</Link></>
            ) : (
              <>New here? <Link to="/register" data-testid={AUTH.toggleLink} className="text-primary hover:underline">Create an account</Link></>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
