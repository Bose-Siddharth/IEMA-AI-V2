import { useEffect, useRef, useState } from 'react';
import { useDispatch } from 'react-redux';
import api from '@/lib/api';
import { setWalletBalance } from '@/store/slices/uiSlice';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Loader2, Heart, Briefcase, GraduationCap, Send, Sparkles, Database } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

const MODES = [
  { key: 'career', label: 'Career', Icon: Briefcase, hint: 'Confidential career advice. India tech context.', accent: 'from-indigo-500/20 to-indigo-500/5' },
  { key: 'psychology', label: 'Wellness', Icon: Heart, hint: 'Not a licensed therapist. Compassionate listening.', accent: 'from-rose-500/20 to-rose-500/5' },
  { key: 'academic', label: 'Academic', Icon: GraduationCap, hint: 'Study plans, exam strategies, free resources.', accent: 'from-emerald-500/20 to-emerald-500/5' },
];

export default function Counseling() {
  const [mode, setMode] = useState('career');
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const dispatch = useDispatch();
  const scrollRef = useRef(null);
  const activeMode = MODES.find(m => m.key === mode);

  useEffect(() => { setMessages([]); }, [mode]);
  useEffect(() => { scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' }); }, [messages, loading]);

  const send = async () => {
    const text = input.trim();
    if (text.length < 3) return;
    const userMsg = { role: 'user', text };
    setMessages(prev => [...prev, userMsg]); setInput(''); setLoading(true);
    try {
      const { data } = await api.post('/counseling', { mode, message: text });
      if (data.balance != null) dispatch(setWalletBalance(data.balance));
      setMessages(prev => [...prev, {
        role: 'assistant', text: data.response, source: data.source,
        score: data.score, disclaimer: data.disclaimer, credits: data.credits_used,
      }]);
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Counsel failed');
    } finally { setLoading(false); }
  };

  return (
    <div className="h-full flex flex-col" data-testid="counseling-page">
      <div className="border-b border-border p-4 md:p-6">
        <div className="max-w-4xl mx-auto">
          <div className="flex items-center gap-3 mb-4">
            <div className="h-11 w-11 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center">
              <Heart className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h1 className="font-display text-2xl md:text-3xl font-semibold tracking-tight">Counseling</h1>
              <p className="text-sm text-muted-foreground">{activeMode.hint}</p>
            </div>
          </div>
          <div className="flex gap-2 flex-wrap" data-testid="counseling-mode-picker">
            {MODES.map(m => (
              <button
                key={m.key}
                onClick={() => setMode(m.key)}
                data-testid={`counseling-mode-${m.key}`}
                className={cn(
                  'flex items-center gap-2 px-4 py-2 rounded-full text-sm border transition-all',
                  mode === m.key
                    ? 'border-primary bg-primary/10 text-foreground shadow-sm'
                    : 'border-border text-muted-foreground hover:border-primary/40 hover:text-foreground'
                )}
              >
                <m.Icon className="h-3.5 w-3.5" />
                {m.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 md:p-6">
        <div className="max-w-3xl mx-auto space-y-4" data-testid="counseling-thread">
          {messages.length === 0 && (
            <div className={cn('rounded-2xl border border-border bg-gradient-to-b p-8 text-center', activeMode.accent)}>
              <activeMode.Icon className="h-8 w-8 mx-auto text-primary mb-3" />
              <div className="text-lg font-medium">Start a private conversation</div>
              <div className="text-sm text-muted-foreground mt-1 max-w-md mx-auto">
                Every question is retrieved from IEMA's data lake first. Fresh AI answers cost 3 credits.
              </div>
            </div>
          )}
          {messages.map((m, i) => (
            <div key={i} className={cn('flex', m.role === 'user' ? 'justify-end' : 'justify-start')}>
              <div className={cn(
                'max-w-[85%] rounded-2xl px-4 py-3',
                m.role === 'user' ? 'bg-primary text-primary-foreground' : 'bg-card border border-border'
              )}>
                {m.role === 'user' ? (
                  <div className="text-sm">{m.text}</div>
                ) : (
                  <>
                    <div className="prose-chat text-sm">
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>{m.text}</ReactMarkdown>
                    </div>
                    <div className="mt-3 flex items-center gap-2 text-[10px] text-muted-foreground">
                      {m.source === 'kb' ? (
                        <span className="flex items-center gap-1 text-emerald-500">
                          <Database className="h-3 w-3" /> From Data Lake · {m.score ? `sim ${m.score}` : m.match} · 0 credits
                        </span>
                      ) : (
                        <span className="flex items-center gap-1 text-primary">
                          <Sparkles className="h-3 w-3" /> Fresh AI · {m.credits} credits
                        </span>
                      )}
                    </div>
                    {m.disclaimer && (
                      <div className="mt-3 text-[11px] text-muted-foreground italic border-t border-border/50 pt-2">
                        {m.disclaimer}
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          ))}
          {loading && (
            <div className="flex justify-start"><div className="bg-card border border-border rounded-2xl px-4 py-3 flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Consulting…
            </div></div>
          )}
        </div>
      </div>

      <div className="border-t border-border p-3 md:p-4 bg-background">
        <div className="max-w-3xl mx-auto flex gap-2 items-end">
          <Textarea
            value={input} onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
            rows={2}
            placeholder={mode === 'psychology' ? "What's on your mind? This is a safe space." :
              mode === 'academic' ? 'Ask about a subject, exam, or study plan…' :
              'Ask about your career move, skills, salary, next role…'}
            className="resize-none min-h-[52px] max-h-40"
            data-testid="counseling-input"
          />
          <Button onClick={send} disabled={loading || input.trim().length < 3} className="h-[52px] px-5" data-testid="counseling-send-btn">
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </Button>
        </div>
      </div>
    </div>
  );
}
