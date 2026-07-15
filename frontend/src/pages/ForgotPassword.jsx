import { useState } from 'react';
import { Link } from 'react-router-dom';
import api from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Sparkles, ArrowLeft, MailCheck, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

export default function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      await api.post('/auth/forgot-password', { email });
      setSent(true);
    } catch (err) {
      toast.error('Something went wrong');
    } finally { setLoading(false); }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6 bg-background">
      <div className="w-full max-w-sm animate-fade-in-up">
        <Link to="/" className="flex items-center gap-2 mb-10">
          <div className="h-7 w-7 rounded-md bg-primary flex items-center justify-center">
            <Sparkles className="h-4 w-4 text-primary-foreground" />
          </div>
          <span className="font-display font-semibold">IEMA<span className="text-primary">.</span>ai</span>
        </Link>
        {sent ? (
          <div className="text-center">
            <div className="h-14 w-14 rounded-2xl mx-auto bg-primary/10 border border-primary/30 flex items-center justify-center mb-6">
              <MailCheck className="h-6 w-6 text-primary" />
            </div>
            <h1 className="font-display text-2xl font-medium tracking-tight">Check your email</h1>
            <p className="mt-3 text-sm text-muted-foreground">
              If an account exists for <span className="text-foreground">{email}</span>, we've sent a link to reset your password. The link expires in 1 hour.
            </p>
            <Link to="/login">
              <Button variant="outline" className="mt-6 w-full"><ArrowLeft className="h-4 w-4 mr-2" /> Back to sign in</Button>
            </Link>
          </div>
        ) : (
          <>
            <h1 className="font-display text-3xl font-medium tracking-tight">Forgot password?</h1>
            <p className="mt-2 text-sm text-muted-foreground">Enter your email — we'll send you a link to choose a new password.</p>
            <form onSubmit={submit} className="mt-6 space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="email">Email</Label>
                <Input id="email" data-testid="forgot-email-input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required placeholder="you@company.com" />
              </div>
              <Button type="submit" className="w-full" disabled={loading} data-testid="forgot-submit-btn">
                {loading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Send reset link
              </Button>
            </form>
            <div className="mt-6 text-center text-sm text-muted-foreground">
              <Link to="/login" className="hover:text-foreground inline-flex items-center gap-1"><ArrowLeft className="h-3 w-3" /> Back to sign in</Link>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
