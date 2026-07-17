import { useState } from 'react';
import { useDispatch } from 'react-redux';
import api from '@/lib/api';
import { setWalletBalance } from '@/store/slices/uiSlice';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, Sparkles, ImageIcon, FileText, Download } from 'lucide-react';
import { toast } from 'sonner';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

export default function Studio() {
  return (
    <div className="max-w-5xl mx-auto p-6" data-testid="studio-page">
      <div className="mb-8">
        <div className="flex items-center gap-3">
          <div className="h-11 w-11 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center">
            <Sparkles className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="font-display text-3xl font-semibold tracking-tight">AI Studio</h1>
            <p className="text-sm text-muted-foreground">Summarize long text or generate images with GPT-Image-1.</p>
          </div>
        </div>
      </div>
      <Tabs defaultValue="summarize">
        <TabsList data-testid="studio-tabs">
          <TabsTrigger value="summarize" data-testid="studio-tab-summarize"><FileText className="h-4 w-4 mr-2" />Summarize</TabsTrigger>
          <TabsTrigger value="image" data-testid="studio-tab-image"><ImageIcon className="h-4 w-4 mr-2" />Image</TabsTrigger>
        </TabsList>
        <TabsContent value="summarize"><Summarize /></TabsContent>
        <TabsContent value="image"><ImageGen /></TabsContent>
      </Tabs>
    </div>
  );
}

function Summarize() {
  const [text, setText] = useState('');
  const [style, setStyle] = useState('default');
  const [result, setResult] = useState('');
  const [loading, setLoading] = useState(false);
  const dispatch = useDispatch();

  const run = async () => {
    if (text.trim().length < 20) return toast.error('Provide at least 20 characters');
    setLoading(true); setResult('');
    try {
      const { data } = await api.post('/studio/summarize', { text, style });
      setResult(data.summary);
      dispatch(setWalletBalance(data.balance));
      toast.success(`Used ${data.credits_used} credits`);
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Failed');
    } finally { setLoading(false); }
  };

  return (
    <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-6">
      <div className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <label className="text-sm font-medium">Text to summarize</label>
          <Select value={style} onValueChange={setStyle}>
            <SelectTrigger className="w-40 h-8 text-xs" data-testid="studio-summarize-style"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="default">Default</SelectItem>
              <SelectItem value="eli5">Explain like I'm 5</SelectItem>
              <SelectItem value="executive">Executive brief</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <Textarea
          data-testid="studio-summarize-input"
          value={text} onChange={(e) => setText(e.target.value)}
          rows={12} placeholder="Paste article, meeting notes, or report..."
          className="min-h-[280px] resize-none"
        />
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>{text.length} chars · 2 credits</span>
          <Button data-testid="studio-summarize-btn" onClick={run} disabled={loading || text.trim().length < 20}>
            {loading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Sparkles className="h-4 w-4 mr-2" />}
            Summarize
          </Button>
        </div>
      </div>
      <div className="rounded-lg border border-border bg-card p-4 min-h-[280px]">
        {result ? (
          <div className="prose-chat" data-testid="studio-summarize-result">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{result}</ReactMarkdown>
          </div>
        ) : (
          <div className="text-sm text-muted-foreground text-center py-16">
            {loading ? 'Analyzing...' : 'Summary appears here.'}
          </div>
        )}
      </div>
    </div>
  );
}

function ImageGen() {
  const [prompt, setPrompt] = useState('');
  const [quality, setQuality] = useState('low');
  const [n, setN] = useState(1);
  const [images, setImages] = useState([]);
  const [loading, setLoading] = useState(false);
  const dispatch = useDispatch();

  const baseCost = 10 * n * (quality === 'high' ? 4 : quality === 'medium' ? 2 : 1);

  const run = async () => {
    if (prompt.trim().length < 3) return toast.error('Provide a prompt');
    setLoading(true); setImages([]);
    try {
      const { data } = await api.post('/studio/image', { prompt, quality, n });
      setImages(data.images);
      dispatch(setWalletBalance(data.balance));
      toast.success(`Used ${data.credits_used} credits`);
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Failed');
    } finally { setLoading(false); }
  };

  return (
    <div className="mt-6 space-y-4">
      <div className="rounded-lg border border-border bg-card p-4 space-y-3">
        <Input
          data-testid="studio-image-prompt"
          value={prompt} onChange={(e) => setPrompt(e.target.value)}
          placeholder="Describe the image you want to generate..."
          className="h-11"
        />
        <div className="flex flex-wrap items-center gap-3">
          <Select value={quality} onValueChange={setQuality}>
            <SelectTrigger className="w-36" data-testid="studio-image-quality"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="low">Low (fast)</SelectItem>
              <SelectItem value="medium">Medium</SelectItem>
              <SelectItem value="high">High</SelectItem>
            </SelectContent>
          </Select>
          <Select value={String(n)} onValueChange={(v) => setN(parseInt(v))}>
            <SelectTrigger className="w-32" data-testid="studio-image-count"><SelectValue /></SelectTrigger>
            <SelectContent>
              {[1, 2, 3, 4].map(x => <SelectItem key={x} value={String(x)}>{x} image{x > 1 ? 's' : ''}</SelectItem>)}
            </SelectContent>
          </Select>
          <div className="text-xs text-muted-foreground flex-1">Cost: {baseCost} credits</div>
          <Button data-testid="studio-image-btn" onClick={run} disabled={loading || prompt.trim().length < 3}>
            {loading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <ImageIcon className="h-4 w-4 mr-2" />}
            Generate
          </Button>
        </div>
      </div>
      {loading && <div className="text-sm text-muted-foreground text-center py-8"><Loader2 className="h-5 w-5 animate-spin inline mr-2" />Generating {n} image{n > 1 ? 's' : ''}...</div>}
      {images.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4" data-testid="studio-image-results">
          {images.map((im, i) => (
            <div key={i} className="rounded-lg border border-border bg-card overflow-hidden group relative">
              <img src={im.url} alt={`Generated ${i + 1}`} className="w-full h-auto" />
              <a href={im.url} download={`iema-${i + 1}.png`} target="_blank" rel="noreferrer"
                 className="absolute top-2 right-2 h-8 w-8 rounded-md bg-black/70 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                <Download className="h-4 w-4" />
              </a>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
