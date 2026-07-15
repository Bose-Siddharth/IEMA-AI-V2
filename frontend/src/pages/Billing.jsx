import { useEffect, useState } from 'react';
import { useSelector } from 'react-redux';
import { useNavigate } from 'react-router-dom';
import api from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Check, Loader2, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { BILLING } from '@/constants/testIds';

const CURRENCY_SYMBOL = { usd: '$', inr: '₹' };

export default function Billing() {
  const [packs, setPacks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [buying, setBuying] = useState(null);
  const [currency, setCurrency] = useState('usd');
  const navigate = useNavigate();
  const user = useSelector((s) => s.auth.user);

  const loadPacks = async (curr) => {
    setLoading(true);
    try {
      const { data } = await api.get(`/packs/?currency=${curr}`);
      setPacks(data.items);
    } finally { setLoading(false); }
  };

  useEffect(() => { loadPacks(currency); }, [currency]);

  const buyStripe = async (pack) => {
    setBuying(pack.slug);
    try {
      const { data } = await api.post('/payments/stripe/checkout', {
        pack_slug: pack.slug,
        origin_url: window.location.origin,
      });
      window.location.href = data.url;
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to start checkout');
      setBuying(null);
    }
  };

  const buyRazorpay = async (pack) => {
    setBuying(pack.slug);
    try {
      const { data } = await api.post('/payments/razorpay/order', { pack_slug: pack.slug });
      // Load Razorpay script
      if (!window.Razorpay) {
        await new Promise((resolve, reject) => {
          const s = document.createElement('script');
          s.src = 'https://checkout.razorpay.com/v1/checkout.js';
          s.onload = resolve;
          s.onerror = reject;
          document.body.appendChild(s);
        });
      }
      const options = {
        key: data.key_id,
        amount: data.amount,
        currency: data.currency,
        order_id: data.order_id,
        name: 'IEMA.ai',
        description: `${pack.name} — ${data.credits} credits`,
        prefill: { email: user?.email, name: user?.name },
        theme: { color: '#3B82F6' },
        handler: async (res) => {
          try {
            await api.post('/payments/razorpay/verify', {
              razorpay_order_id: res.razorpay_order_id,
              razorpay_payment_id: res.razorpay_payment_id,
              razorpay_signature: res.razorpay_signature,
            });
            toast.success(`${data.credits} credits added to your wallet!`);
            navigate('/wallet');
          } catch (e) {
            toast.error('Payment verification failed');
          }
        },
        modal: { ondismiss: () => setBuying(null) },
      };
      const rzp = new window.Razorpay(options);
      rzp.open();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to start payment');
      setBuying(null);
    }
  };

  return (
    <div className="p-6 md:p-8 max-w-6xl">
      <div className="mb-8 flex items-start justify-between flex-wrap gap-4">
        <div>
          <h1 className="font-display text-3xl font-medium tracking-tight">Credit Packs</h1>
          <p className="text-muted-foreground mt-1">Recharge your wallet — credits never expire.</p>
        </div>
        <Tabs value={currency} onValueChange={setCurrency}>
          <TabsList data-testid={BILLING.currencySelect}>
            <TabsTrigger value="usd">USD (Stripe)</TabsTrigger>
            <TabsTrigger value="inr">INR (Razorpay)</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-72 rounded-2xl" />)}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {packs.map((p) => (
            <div key={p.slug}
              data-testid={BILLING.packCard}
              className={`relative rounded-2xl border p-6 flex flex-col ${p.is_popular ? 'border-primary shadow-[0_0_30px_hsl(var(--primary)/0.15)]' : 'border-border'} bg-card`}
            >
              {p.is_popular && <Badge className="absolute -top-2 right-4">Most popular</Badge>}
              <div className="text-sm text-muted-foreground">{p.name}</div>
              <div className="mt-2 font-display text-4xl font-medium tracking-tight">
                {CURRENCY_SYMBOL[currency]}{p.price.toFixed(currency === 'usd' ? 2 : 0)}
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
                onClick={() => currency === 'usd' ? buyStripe(p) : buyRazorpay(p)}
                disabled={buying === p.slug}
              >
                {buying === p.slug ? <Loader2 className="h-4 w-4 animate-spin" /> : `Buy ${p.name}`}
              </Button>
            </div>
          ))}
        </div>
      )}

      <div className="mt-10 rounded-xl border border-border bg-[hsl(var(--surface))] p-6 flex items-start gap-4">
        <Sparkles className="h-5 w-5 text-primary mt-0.5 flex-shrink-0" />
        <div className="text-sm text-muted-foreground">
          <span className="text-foreground font-medium">Test mode.</span> Use Stripe test card <code className="font-mono">4242 4242 4242 4242</code> for USD or Razorpay test card <code className="font-mono">4111 1111 1111 1111</code> for INR. Any future date + any CVV.
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
