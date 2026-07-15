import { useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useDispatch } from 'react-redux';
import api from '@/lib/api';
import { setAuth } from '@/store/slices/authSlice';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Sparkles, Loader2 } from 'lucide-react';
import { AUTH } from '@/constants/testIds';

export default function AuthPage({ mode }) {
  const isRegister = mode === 'register';
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);
  const dispatch = useDispatch();
  const navigate = useNavigate();

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
    } finally {
      setLoading(false);
    }
  };

  const oauthComingSoon = (provider) => () => toast.info(`${provider} OAuth is coming soon`);

  return (
    <div className="min-h-screen flex bg-background">
      {/* Left visual panel */}
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
          <h2 className="font-display text-3xl font-medium tracking-tight leading-tight">
            One AI workspace to think, ship and grow.
          </h2>
          <p className="mt-3 text-muted-foreground">
            Claude Haiku 4.5 + GPT-5 with credit wallet, analytics and admin — all in a single, gorgeous surface.
          </p>
          <div className="mt-8 grid grid-cols-3 gap-4 text-sm">
            <div>
              <div className="font-display text-2xl font-medium">100</div>
              <div className="text-xs text-muted-foreground">Welcome credits</div>
            </div>
            <div>
              <div className="font-display text-2xl font-medium">20</div>
              <div className="text-xs text-muted-foreground">Daily free credits</div>
            </div>
            <div>
              <div className="font-display text-2xl font-medium">2×</div>
              <div className="text-xs text-muted-foreground">Model failover</div>
            </div>
          </div>
        </div>
        <div className="relative text-xs text-muted-foreground">
          &copy; 2026 IEMA.ai — Built to feel like Vercel, ship like Linear.
        </div>
      </div>

      {/* Right form */}
      <div className="flex-1 flex flex-col justify-center items-center p-6">
        <div className="w-full max-w-sm animate-fade-in-up">
          <Link to="/" className="lg:hidden flex items-center gap-2 mb-8">
            <div className="h-7 w-7 rounded-md bg-primary flex items-center justify-center">
              <Sparkles className="h-4 w-4 text-primary-foreground" />
            </div>
            <span className="font-display font-semibold">IEMA<span className="text-primary">.</span>ai</span>
          </Link>
          <h1 className="font-display text-3xl font-medium tracking-tight">
            {isRegister ? 'Create your account' : 'Welcome back'}
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {isRegister ? 'Start with 100 credits. No card required.' : 'Sign in to continue to your workspace.'}
          </p>

          {/* Social buttons */}
          <div className="mt-6 space-y-2">
            <Button variant="outline" className="w-full justify-center" onClick={oauthComingSoon('Google')} data-testid={AUTH.googleBtn}>
              <svg className="h-4 w-4 mr-2" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09 0-.73.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>
              Continue with Google
            </Button>
            <div className="grid grid-cols-3 gap-2">
              <Button variant="outline" size="sm" onClick={oauthComingSoon('Apple')}>Apple</Button>
              <Button variant="outline" size="sm" onClick={oauthComingSoon('Microsoft')}>Microsoft</Button>
              <Button variant="outline" size="sm" onClick={oauthComingSoon('Facebook')} disabled>Facebook</Button>
            </div>
          </div>

          <div className="my-6 flex items-center gap-3 text-xs text-muted-foreground">
            <div className="h-px flex-1 bg-border" />
            <span>or continue with email</span>
            <div className="h-px flex-1 bg-border" />
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
            <div className="space-y-1.5">
              <Label htmlFor="password">Password</Label>
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
