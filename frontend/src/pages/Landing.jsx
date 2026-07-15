import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Sparkles, ArrowRight, Zap, Shield, BarChart3, MessageSquare, CreditCard, Layers, Users, ArrowUpRight } from 'lucide-react';
import ThemeToggle from '@/components/ThemeToggle';
import { HOME } from '@/constants/testIds';

const FEATURES = [
  { Icon: MessageSquare, title: 'Multi-Model AI Chat', body: 'Stream from Claude Haiku 4.5 and GPT-5 with automatic failover. Never lose a conversation.' },
  { Icon: Zap, title: 'Credit-based Usage', body: 'Pay only for what you use. 100 welcome credits + 20 daily. No lock-in subscriptions.' },
  { Icon: BarChart3, title: 'Deep Analytics', body: 'Track token spend, model usage and cost timelines in a Vercel-grade dashboard.' },
  { Icon: Layers, title: 'Pluggable Modules', body: 'Career, Startup, Resume, Course Generator, Mock Interviews — all coming to your workspace.' },
  { Icon: Shield, title: 'JWT + OAuth Security', body: 'Refresh tokens, device sessions, RBAC and audit logs baked in from day one.' },
  { Icon: Users, title: 'Team Ready', body: 'Admin panel for wallets, pricing packs, providers, coupons and payments.' },
];

export default function Landing() {
  return (
    <div className="min-h-screen bg-background text-foreground overflow-x-hidden">
      {/* Top nav */}
      <header className="glass sticky top-0 z-40">
        <div className="max-w-7xl mx-auto flex items-center justify-between px-4 sm:px-6 lg:px-8 h-14">
          <Link to="/" className="flex items-center gap-2">
            <div className="h-7 w-7 rounded-md bg-primary flex items-center justify-center">
              <Sparkles className="h-4 w-4 text-primary-foreground" />
            </div>
            <span className="font-display font-semibold tracking-tight">IEMA<span className="text-primary">.</span>ai</span>
          </Link>
          <nav className="hidden md:flex items-center gap-6 text-sm text-muted-foreground">
            <a href="#features" className="hover:text-foreground">Features</a>
            <a href="#pricing" className="hover:text-foreground">Pricing</a>
            <a href="#stack" className="hover:text-foreground">Stack</a>
          </nav>
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <Link to="/login"><Button variant="ghost" size="sm">Sign in</Button></Link>
            <Link to="/register"><Button size="sm" data-testid={HOME.getStartedBtn}>Get started</Button></Link>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="relative pt-20 pb-24 sm:pt-32 sm:pb-40">
        <div className="grid-pattern absolute inset-0 pointer-events-none" />
        <div className="spot-glow" />
        <div className="relative max-w-5xl mx-auto px-4 text-center animate-fade-in-up">
          <div className="inline-flex items-center gap-2 rounded-full border border-border bg-background/60 backdrop-blur px-3 py-1 text-xs text-muted-foreground mb-6">
            <span className="h-1.5 w-1.5 rounded-full bg-primary dot-pulse" />
            Now live — v2.0 with Claude Haiku 4.5 + GPT-5
          </div>
          <h1 className="font-display text-4xl sm:text-6xl lg:text-7xl font-medium tracking-tighter leading-[1.05]">
            The AI Super Platform<br />
            for <span className="text-primary">every</span> ambition.
          </h1>
          <p className="mt-6 text-base sm:text-lg text-muted-foreground max-w-2xl mx-auto leading-relaxed">
            One workspace. Multi-model chat, credit wallet, analytics, payments and admin controls — built to scale
            from your first prompt to a million users.
          </p>
          <div className="mt-10 flex items-center justify-center gap-3">
            <Link to="/register">
              <Button size="lg" className="rounded-full px-6">
                Start free with 100 credits <ArrowRight className="h-4 w-4 ml-1" />
              </Button>
            </Link>
            <Link to="/login">
              <Button size="lg" variant="outline" className="rounded-full px-6">Sign in</Button>
            </Link>
          </div>
          <div className="mt-14 flex items-center justify-center gap-6 text-xs text-muted-foreground flex-wrap">
            <span>No credit card required</span>
            <span className="opacity-30">•</span>
            <span>20 free credits daily</span>
            <span className="opacity-30">•</span>
            <span>Multi-provider failover</span>
          </div>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="py-24 border-t border-border">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-2xl mb-12">
            <div className="text-xs uppercase tracking-wider text-primary mb-3">Platform</div>
            <h2 className="font-display text-3xl sm:text-4xl font-medium tracking-tight">
              Everything you need to ship AI products.
            </h2>
            <p className="mt-3 text-muted-foreground">A cohesive layer over the best LLMs — with usage, billing and admin already solved.</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {FEATURES.map(({ Icon, title, body }) => (
              <div key={title} className="group rounded-xl border border-border bg-card p-6 hover:border-primary/40 transition-colors">
                <Icon className="h-5 w-5 text-primary mb-4" strokeWidth={1.75} />
                <h3 className="font-display text-lg font-medium mb-1.5">{title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">{body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing preview */}
      <section id="pricing" className="py-24 border-t border-border bg-[hsl(var(--surface))]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <div className="text-xs uppercase tracking-wider text-primary mb-3">Simple pricing</div>
            <h2 className="font-display text-3xl sm:text-4xl font-medium tracking-tight">Pay only for the intelligence you use.</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 max-w-5xl mx-auto">
            {[
              { name: 'Starter', price: '$5', credits: '500' },
              { name: 'Standard', price: '$15', credits: '2,000', badge: 'Popular' },
              { name: 'Pro', price: '$39', credits: '5,750' },
              { name: 'Business', price: '$99', credits: '17,500' },
            ].map((p) => (
              <div key={p.name} className={`rounded-xl border p-6 relative ${p.badge ? 'border-primary shadow-[0_0_30px_hsl(var(--primary)/0.15)]' : 'border-border'} bg-card`}>
                {p.badge && (
                  <div className="absolute -top-2 right-4 text-[10px] uppercase tracking-wider bg-primary text-primary-foreground px-2 py-0.5 rounded-full">
                    {p.badge}
                  </div>
                )}
                <div className="text-sm text-muted-foreground">{p.name}</div>
                <div className="mt-1 font-display text-3xl font-medium">{p.price}</div>
                <div className="mt-1 text-sm text-muted-foreground">{p.credits} credits</div>
              </div>
            ))}
          </div>
          <div className="text-center mt-8">
            <Link to="/register"><Button size="lg" className="rounded-full">View full pricing <ArrowUpRight className="h-4 w-4 ml-1" /></Button></Link>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border py-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Sparkles className="h-4 w-4 text-primary" />
            <span>IEMA.ai © 2026 — Built with care.</span>
          </div>
          <div className="flex items-center gap-6 text-sm text-muted-foreground">
            <a href="#" className="hover:text-foreground">Privacy</a>
            <a href="#" className="hover:text-foreground">Terms</a>
            <a href="#" className="hover:text-foreground">Contact</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
