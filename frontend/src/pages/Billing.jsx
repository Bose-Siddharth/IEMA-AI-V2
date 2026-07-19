import { useEffect, useState } from 'react';
import { useSelector } from 'react-redux';
import { useNavigate } from 'react-router-dom';
import api from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Check, Loader2, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import { Skeleton } from '@/components/ui/skeleton';
import { BILLING } from '@/constants/testIds';

export default function Billing() {
  const [packs, setPacks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [buying, setBuying] = useState(null);
  const navigate = useNavigate();
  const user = useSelector((s) => s.auth.user);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const { data } = await api.get(`/packs/?currency=usd`);
        setPacks(data.items);
      } finally { setLoading(false); }
    })();
  }, []);

  const buyRazorpay = async (pack) => {
    setBuying(pack.slug);
    try {
      const { data } = await api.post('/payments/razorpay/order', { pack_slug: pack.slug });
      if (!data.short_url) {
        toast.error('No checkout URL returned from Razorpay');
        setBuying(null);
        return;
      }
      // Redirect the user to the Razorpay-hosted checkout page (rzp.io).
      // This bypasses the "unauthorized website" block that fires when we
      // open the Checkout.js modal on our own domain before Razorpay has
      // approved this domain on the merchant profile.
      window.location.href = data.short_url;
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to start payment');
      setBuying(null);
    }
  };

  return (
    <div className="p-6 md:p-8 max-w-6xl">
      <div className="mb-8">
        <h1 className="font-display text-3xl font-medium tracking-tight">Credit Packs</h1>
        <p className="text-muted-foreground mt-1">Recharge your wallet — credits never expire. Prices in USD.</p>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-72 rounded-2xl" />)}
        </div>
      ) : (
        <>
          <SubscribeSection />
          <h2 className="font-display text-2xl font-medium mt-12 mb-4">Top-up packs</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {packs.map((p) => (
              <div key={p.slug}
                data-testid={BILLING.packCard}
                className={`relative rounded-2xl border p-6 flex flex-col ${p.is_popular ? 'border-primary shadow-[0_0_30px_hsl(var(--primary)/0.15)]' : 'border-border'} bg-card`}
              >
                {p.is_popular && <Badge className="absolute -top-2 right-4">Most popular</Badge>}
                <div className="text-sm text-muted-foreground">{p.name}</div>
                <div className="mt-2 font-display text-4xl font-medium tracking-tight">
                  ${p.price.toFixed(2)}
                </div>
                <div className="mt-1 text-sm text-muted-foreground">{Math.floor(p.credits).toLocaleString()} credits{p.bonus_credits > 0 && <span className="text-emerald-400"> + {Math.floor(p.bonus_credits)} bonus</span>}</div>
                <ul className="mt-6 space-y-2 flex-1">
                  <FeatureItem>Never-expiring credits</FeatureItem>
                  <FeatureItem>All models: Claude + GPT</FeatureItem>
                  <FeatureItem>Priority processing</FeatureItem>
                  {p.bonus_credits > 0 && <FeatureItem>+{Math.floor(p.bonus_credits)} bonus credits</FeatureItem>}
                </ul>
                <Button
                  data-testid={BILLING.buyBtn}
                  className="mt-6 w-full"
                  variant={p.is_popular ? 'default' : 'outline'}
                  onClick={() => buyRazorpay(p)}
                  disabled={buying === p.slug}
                >
                  {buying === p.slug ? <Loader2 className="h-4 w-4 animate-spin" /> : `Buy ${p.name}`}
                </Button>
              </div>
            ))}
          </div>
        </>
      )}

      <div className="mt-10 rounded-xl border border-border bg-[hsl(var(--surface))] p-6 flex items-start gap-4">
        <Sparkles className="h-5 w-5 text-primary mt-0.5 flex-shrink-0" />
        <div className="text-sm text-muted-foreground">
          <span className="text-foreground font-medium">Payments powered by Razorpay.</span> Prices shown in USD; your card is billed the equivalent INR amount at checkout.
        </div>
      </div>
    </div>
  );
}

function FeatureItem({ children }) {
  return (
    <li className="flex items-center gap-2 text-sm">
      <Check className="h-3.5 w-3.5 text-primary flex-shrink-0" />
      <span className="text-muted-foreground">{children}</span>
    </li>
  );
}

function SubscribeSection() {
  const [plans, setPlans] = useState([]);
  const [busy, setBusy] = useState(null);
  useEffect(() => {
    api.get('/payments/plans').then(r => setPlans(r.data.items || [])).catch(() => {});
  }, []);
  const subscribe = async (plan_id) => {
    setBusy(plan_id);
    try {
      const { data } = await api.post(`/payments/subscribe/${plan_id}`);
      if (data.short_url) window.location.href = data.short_url;
      else toast.error('No checkout URL returned');
    } catch (e) { toast.error(e.response?.data?.detail || 'Subscribe failed'); }
    finally { setBusy(null); }
  };
  if (plans.length === 0) return null;
  return (
    <div>
      <h2 className="font-display text-2xl font-medium mb-4">Recurring plans</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4" data-testid="billing-subscribe-section">
        {plans.map((p) => (
          <div key={p.plan_id} className="rounded-2xl border border-border bg-card p-6 flex flex-col">
            <div className="text-xs uppercase tracking-wider text-primary">{p.billing_period}</div>
            <div className="font-display text-xl font-medium mt-1">{p.name}</div>
            <div className="mt-2 text-3xl font-medium">${p.price_usd}<span className="text-sm text-muted-foreground font-normal"> / {p.billing_period === 'annual' ? 'year' : 'month'}</span></div>
            <ul className="mt-4 space-y-1.5 flex-1">
              <FeatureItem>{p.monthly_credits} credits / {p.billing_period === 'annual' ? 'year' : 'month'}</FeatureItem>
              <FeatureItem>{p.window_credits} credits per {p.window_hours}h window</FeatureItem>
              <FeatureItem>All AI modules</FeatureItem>
            </ul>
            <Button className="mt-4 w-full" onClick={() => subscribe(p.plan_id)} disabled={busy === p.plan_id} data-testid={`billing-subscribe-${p.plan_id}`}>
              {busy === p.plan_id ? 'Opening…' : 'Subscribe'}
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
}
