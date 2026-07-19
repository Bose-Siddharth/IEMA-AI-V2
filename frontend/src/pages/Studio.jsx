import { useState } from 'react';
import { useDispatch } from 'react-redux';
import api from '@/lib/api';
import { setWalletBalance } from '@/store/slices/uiSlice';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, Sparkles, ImageIcon, FileText, Download, Video as VideoIcon } from 'lucide-react';
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
            <p className="text-sm text-muted-foreground">Summarize long text, generate images with GPT-Image-1, or produce videos with Sora 2.</p>
          </div>
        </div>
      </div>
      <Tabs defaultValue="summarize">
        <TabsList data-testid="studio-tabs">
          <TabsTrigger value="summarize" data-testid="studio-tab-summarize"><FileText className="h-4 w-4 mr-2" />Summarize</TabsTrigger>
          <TabsTrigger value="image" data-testid="studio-tab-image"><ImageIcon className="h-4 w-4 mr-2" />Image</TabsTrigger>
          <TabsTrigger value="video" data-testid="studio-tab-video"><VideoIcon className="h-4 w-4 mr-2" />Video</TabsTrigger>
        </TabsList>
        <TabsContent value="summarize"><Summarize /></TabsContent>
        <TabsContent value="image"><ImageGen /></TabsContent>
        <TabsContent value="video"><VideoGen /></TabsContent>
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
      toast.success('Done');
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
              <SelectItem value="eli5">Explain like I&apos;m 5</SelectItem>
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
          <span>{text.length} chars</span>
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

  const run = async () => {
    if (prompt.trim().length < 3) return toast.error('Provide a prompt');
    setLoading(true); setImages([]);
    try {
      const { data } = await api.post('/studio/image', { prompt, quality, n });
      setImages(data.images);
      dispatch(setWalletBalance(data.balance));
      toast.success('Done');
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
          <div className="text-xs text-muted-foreground flex-1"></div>
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

function VideoGen() {
  const [prompt, setPrompt] = useState('');
  const [size, setSize] = useState('1280x720');
  const [duration, setDuration] = useState(4);
  const [model, setModel] = useState('sora-2');
  const [video, setVideo] = useState(null);
  const [loading, setLoading] = useState(false);
  const dispatch = useDispatch();

  // Deliberately clip the "expected credit cost" client-side so users
  // see what they'll spend before firing a 2-5 minute generation job.
  const CREDIT_TABLE = {
    'sora-2':      { 4: 60,  8: 120, 12: 180 },
    'sora-2-pro':  { 4: 180, 8: 360, 12: 540 },
  };
  const expectedCost = (CREDIT_TABLE[model] || {})[duration] || 0;

  const run = async () => {
    if (prompt.trim().length < 3) return toast.error('Provide a prompt');
    setLoading(true); setVideo(null);
    try {
      const { data } = await api.post('/studio/video', { prompt, size, duration, model });
      setVideo(data);
      dispatch(setWalletBalance(data.balance));
      toast.success(`Video ready — ${data.credits_used} credits used`);
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Video generation failed');
    } finally { setLoading(false); }
  };

  return (
    <div className="mt-6 space-y-4">
      <div className="rounded-lg border border-border bg-card p-4 space-y-3">
        <Input data-testid="studio-video-prompt" value={prompt}
               onChange={(e) => setPrompt(e.target.value)}
               placeholder="Describe the scene you want Sora to render..." className="h-11" />
        <div className="flex flex-wrap items-center gap-3">
          <Select value={model} onValueChange={setModel}>
            <SelectTrigger className="w-36" data-testid="studio-video-model"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="sora-2">Sora 2</SelectItem>
              <SelectItem value="sora-2-pro">Sora 2 Pro</SelectItem>
            </SelectContent>
          </Select>
          <Select value={String(duration)} onValueChange={(v) => setDuration(parseInt(v))}>
            <SelectTrigger className="w-32" data-testid="studio-video-duration"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="4">4 seconds</SelectItem>
              <SelectItem value="8">8 seconds</SelectItem>
              <SelectItem value="12">12 seconds</SelectItem>
            </SelectContent>
          </Select>
          <Select value={size} onValueChange={setSize}>
            <SelectTrigger className="w-36" data-testid="studio-video-size"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="1280x720">1280×720 HD</SelectItem>
              <SelectItem value="1792x1024">1792×1024 wide</SelectItem>
              <SelectItem value="1024x1792">1024×1792 portrait</SelectItem>
              <SelectItem value="1024x1024">1024×1024 square</SelectItem>
            </SelectContent>
          </Select>
          <div className="text-xs text-muted-foreground flex-1">
            <span className="text-primary font-medium">{expectedCost}</span> credits · takes 2–5 min
          </div>
          <Button data-testid="studio-video-btn" onClick={run} disabled={loading || prompt.trim().length < 3}>
            {loading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <VideoIcon className="h-4 w-4 mr-2" />}
            Generate
          </Button>
        </div>
      </div>

      {loading && (
        <div className="text-sm text-muted-foreground text-center py-16 border border-dashed border-border rounded-lg">
          <Loader2 className="h-6 w-6 animate-spin inline mr-2" />
          Rendering your video with {model}. This usually takes 2&ndash;5 minutes &mdash; feel free to switch tabs, we&apos;ll finish in the background.
        </div>
      )}

      {video && (
        <div className="rounded-lg border border-border bg-card p-4 space-y-3" data-testid="studio-video-result">
          <video src={video.url} controls className="w-full rounded-md bg-black" />
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>{video.model} · {video.duration}s · {video.size}</span>
            <a href={video.url} download="iema-video.mp4" target="_blank" rel="noreferrer"
               className="inline-flex items-center gap-1 text-primary hover:underline">
              <Download className="h-3.5 w-3.5" /> Download
            </a>
          </div>
        </div>
      )}
    </div>
  );
}

