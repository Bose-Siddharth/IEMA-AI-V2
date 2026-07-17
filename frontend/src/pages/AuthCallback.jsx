import { useEffect, useRef, useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import api from '@/lib/api';
import { useDispatch } from 'react-redux';
import { setAuth } from '@/store/slices/authSlice';
import { toast } from 'sonner';
import { Loader2, Sparkles } from 'lucide-react';

export default function AuthCallback() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const dispatch = useDispatch();
  const [error, setError] = useState(null);
  const exchangedRef = useRef(false);

  useEffect(() => {
    // Guard against React StrictMode double-invocation which would replay
    // the single-use OAuth code and cause the second exchange to fail.
    if (exchangedRef.current) return;
    exchangedRef.current = true;

    const code = params.get('code');
    const state = params.get('state');
    const err = params.get('error');
    if (err) { setError(err); toast.error(`OAuth error: ${err}`); setTimeout(() => navigate('/login'), 2000); return; }
    if (!code || !state) { navigate('/login', { replace: true }); return; }
    (async () => {
      try {
        const redirectUri = `${window.location.origin}/auth/callback`;
        const { data } = await api.post(`/auth/${state}`, { code, redirect_uri: redirectUri });
        dispatch(setAuth(data));
        toast.success(`Signed in with ${state}`);
        navigate('/chat', { replace: true });
      } catch (e) {
        setError(e.response?.data?.detail || 'OAuth failed');
        toast.error(e.response?.data?.detail || 'OAuth failed');
        setTimeout(() => navigate('/login'), 2000);
      }
    })();
    // eslint-disable-next-line
  }, []);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-background">
      <div className="h-14 w-14 rounded-2xl bg-primary/10 border border-primary/30 flex items-center justify-center mb-6">
        <Sparkles className="h-6 w-6 text-primary" />
      </div>
      {!error ? (
        <>
          <Loader2 className="h-6 w-6 animate-spin text-primary mb-2" />
          <p className="text-muted-foreground">Signing you in…</p>
        </>
      ) : (
        <p className="text-destructive text-sm">{error}</p>
      )}
    </div>
  );
}
