import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, ScrollView, Image, TouchableOpacity, Alert, Linking, ActivityIndicator, RefreshControl } from 'react-native';
import { Sparkles, ImageIcon, FileText, Video as VideoIcon, Download, Link as LinkIcon, History as HistoryIcon, Loader2 } from 'lucide-react-native';
import api from '../api';
import ScreenHeader from '../components/ScreenHeader';
import { Card, Button, Input, Label } from '../components/UI';
import { colors, spacing, fontSize, radii } from '../theme';
import { studioStore, useStudioStore } from '../services/studioStore';

/**
 * Studio screen — three modules that share a **module-level state store**
 * (`studioStore`) so an in-flight generation continues cleanly when the
 * user switches tabs, backgrounds the app, or drops the screen. We also
 * block launching a second generation until the first one finishes.
 */
export default function StudioScreen({ navigation }) {
  const [tab, setTab] = useState('sum');
  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }} testID="studio-screen">
      <ScreenHeader title="AI Studio" navigation={navigation} />
      <View style={{ flexDirection: 'row', paddingHorizontal: spacing.md, paddingTop: spacing.md, gap: 6 }}>
        <TabBtn label="Summarize" Icon={FileText} active={tab === 'sum'} onPress={() => setTab('sum')} />
        <TabBtn label="Image" Icon={ImageIcon} active={tab === 'img'} onPress={() => setTab('img')} />
        <TabBtn label="Video" Icon={VideoIcon} active={tab === 'vid'} onPress={() => setTab('vid')} />
        <TabBtn label="History" Icon={HistoryIcon} active={tab === 'hist'} onPress={() => setTab('hist')} />
      </View>
      <ScrollView contentContainerStyle={{ padding: spacing.md, gap: spacing.md }}>
        {tab === 'sum' && <Summarize />}
        {tab === 'img' && <ImageGen />}
        {tab === 'vid' && <VideoGen />}
        {tab === 'hist' && <HistoryList />}
      </ScrollView>
    </View>
  );
}

function TabBtn({ label, Icon, active, onPress }) {
  return (
    <TouchableOpacity onPress={onPress} style={{
      flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4,
      paddingVertical: 10, borderRadius: radii.md, borderWidth: 1,
      borderColor: active ? colors.primary : colors.border,
      backgroundColor: active ? colors.primaryDim : 'transparent',
    }}>
      <Icon color={active ? colors.primary : colors.textMuted} size={13} />
      <Text style={{ color: active ? colors.primary : colors.textMuted, fontSize: 11, fontWeight: '500' }}>{label}</Text>
    </TouchableOpacity>
  );
}

// -------------------- Summarize --------------------
function Summarize() {
  const state = useStudioStore('sum');
  const [text, setText] = useState(state.text || '');
  const [url, setUrl] = useState(state.url || '');
  const [style, setStyle] = useState(state.style || 'default');

  const busy = state.status === 'running';
  const isImageJob = studioStore.anyRunning() && !busy;

  const run = async () => {
    if (studioStore.anyRunning()) return;
    if (text.trim().length < 20 && !url) return;
    studioStore.begin('sum', { text, url, style });
    try {
      const { data } = await api.post('/studio/summarize', {
        text: text.trim() || undefined,
        url: url.trim() || undefined,
        style,
      });
      studioStore.complete('sum', { result: data.summary });
    } catch (e) {
      studioStore.fail('sum', e.response?.data?.detail || 'Summarize failed');
    }
  };

  return (
    <>
      <Card>
        <Label>Text or URL</Label>
        <Input value={text} onChangeText={setText} multiline
               placeholder="Paste content, article, notes..."
               style={{ minHeight: 140, textAlignVertical: 'top', paddingTop: 10 }} />
        <View style={{ height: 8 }} />
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <LinkIcon size={12} color={colors.textMuted} />
          <Text style={{ color: colors.textMuted, fontSize: fontSize.xs }}>Or a website link:</Text>
        </View>
        <Input value={url} onChangeText={setUrl}
               placeholder="https://example.com/article"
               autoCapitalize="none" keyboardType="url" />

        <View style={{ flexDirection: 'row', gap: 6, marginTop: spacing.md }}>
          {['default', 'eli5', 'executive'].map((s) => (
            <ChoicePill key={s} label={s === 'default' ? 'Default' : s === 'eli5' ? 'ELI5' : 'Executive'}
                        active={style === s} onPress={() => setStyle(s)} />
          ))}
        </View>

        <Button title={busy ? 'Summarising…' : 'Summarize'}
                onPress={run}
                loading={busy}
                disabled={busy || isImageJob || (text.trim().length < 20 && !url.trim())}
                style={{ marginTop: spacing.md }}
                testID="studio-summarize-btn" />
        {isImageJob && (
          <Text style={{ color: colors.textDim, fontSize: fontSize.xs, marginTop: 6, textAlign: 'center' }}>
            Another generation is running — finish it first.
          </Text>
        )}
      </Card>

      {state.status === 'running' && <SkeletonBlock lines={4} />}
      {state.status === 'done' && state.result && (
        <Card><Text style={{ color: colors.text, fontSize: fontSize.sm, lineHeight: 20 }}>{state.result}</Text></Card>
      )}
      {state.status === 'error' && (
        <Card><Text style={{ color: '#ef4444', fontSize: fontSize.sm }}>{state.error}</Text></Card>
      )}
    </>
  );
}

// -------------------- Image --------------------
function ImageGen() {
  const state = useStudioStore('img');
  const [prompt, setPrompt] = useState(state.prompt || '');
  const [style, setStyle] = useState(state.style || 'realistic');
  const [aspect, setAspect] = useState(state.aspect || 'square');
  const [quality, setQuality] = useState(state.quality || 'low');

  const busy = state.status === 'running';
  const otherBusy = studioStore.anyRunning() && !busy;

  const run = async () => {
    if (studioStore.anyRunning()) return;
    if (prompt.trim().length < 3) return;
    // Compose a richer prompt from aesthetic controls, without exposing them
    // in the UI as separate fields the user has to reason about.
    const fullPrompt = `${prompt.trim()}. Style: ${style}. Aspect: ${aspect}. High visual fidelity, clean composition.`;
    studioStore.begin('img', { prompt, style, aspect, quality });
    try {
      const { data } = await api.post('/studio/image', { prompt: fullPrompt, quality, n: 1 });
      studioStore.complete('img', { images: data.images });
    } catch (e) {
      studioStore.fail('img', e.response?.data?.detail || 'Image generation failed');
    }
  };

  return (
    <>
      <Card>
        <Label>Prompt</Label>
        <Input value={prompt} onChangeText={setPrompt}
               placeholder="A calm sunset over a mountain lake..." />

        <Text style={{ color: colors.textMuted, fontSize: fontSize.xs, marginTop: spacing.md }}>Style</Text>
        <View style={{ flexDirection: 'row', gap: 6, marginTop: 6, flexWrap: 'wrap' }}>
          {['realistic', 'cinematic', 'anime', 'watercolor', 'pixel-art', '3D render'].map((s) => (
            <ChoicePill key={s} label={s} active={style === s} onPress={() => setStyle(s)} />
          ))}
        </View>

        <Text style={{ color: colors.textMuted, fontSize: fontSize.xs, marginTop: spacing.md }}>Aspect</Text>
        <View style={{ flexDirection: 'row', gap: 6, marginTop: 6 }}>
          {[
            ['square', 'Square'], ['portrait', 'Portrait'], ['landscape', 'Landscape'],
          ].map(([v, l]) => (
            <ChoicePill key={v} label={l} active={aspect === v} onPress={() => setAspect(v)} />
          ))}
        </View>

        <Text style={{ color: colors.textMuted, fontSize: fontSize.xs, marginTop: spacing.md }}>Quality</Text>
        <View style={{ flexDirection: 'row', gap: 6, marginTop: 6 }}>
          {['low', 'medium', 'high'].map((q) => (
            <ChoicePill key={q} label={q} active={quality === q} onPress={() => setQuality(q)} />
          ))}
        </View>

        <Button title={busy ? 'Rendering…' : 'Generate image'}
                onPress={run} loading={busy}
                disabled={busy || otherBusy || prompt.trim().length < 3}
                style={{ marginTop: spacing.md }}
                testID="studio-image-btn" />
        {otherBusy && (
          <Text style={{ color: colors.textDim, fontSize: fontSize.xs, marginTop: 6, textAlign: 'center' }}>
            Another generation is running — finish it first.
          </Text>
        )}
      </Card>

      {state.status === 'running' && <SkeletonBox aspect={aspect === 'portrait' ? 3/4 : aspect === 'landscape' ? 16/9 : 1} />}
      {state.status === 'done' && (state.images || []).map((im, i) => (
        <Card key={i} style={{ padding: 0, overflow: 'hidden' }}>
          <Image source={{ uri: im.url }} style={{ width: '100%', aspectRatio: 1 }} resizeMode="cover" />
          <View style={{ padding: spacing.md, flexDirection: 'row', justifyContent: 'flex-end' }}>
            <Button title="Save / share" icon={<Download color="#fff" size={14} />}
                    onPress={() => Linking.openURL(im.url)} testID={`image-save-${i}`} />
          </View>
        </Card>
      ))}
      {state.status === 'error' && (
        <Card><Text style={{ color: '#ef4444', fontSize: fontSize.sm }}>{state.error}</Text></Card>
      )}
    </>
  );
}

// -------------------- Video --------------------
function VideoGen() {
  const state = useStudioStore('vid');
  const [prompt, setPrompt] = useState(state.prompt || '');
  const [style, setStyle] = useState(state.style || 'cinematic');
  const [motion, setMotion] = useState(state.motion || 'medium');
  const [model, setModel] = useState(state.model || 'sora-2');
  const [duration, setDuration] = useState(state.duration || 4);

  const busy = state.status === 'running';
  const otherBusy = studioStore.anyRunning() && !busy;

  const run = async () => {
    if (studioStore.anyRunning()) return;
    if (prompt.trim().length < 3) return;
    // Roll aesthetic controls into the prompt — Sora reads free-form English.
    const fullPrompt = `${prompt.trim()}. Style: ${style}. Camera motion: ${motion}. Cohesive, detailed, high production value.`;
    studioStore.begin('vid', { prompt, style, motion, model, duration });
    try {
      const { data } = await api.post('/studio/video', {
        prompt: fullPrompt, model, duration, size: '1280x720',
      });
      studioStore.complete('vid', { result: data });
    } catch (e) {
      studioStore.fail('vid', e.response?.data?.detail || 'Video generation failed');
    }
  };

  return (
    <>
      <Card>
        <Label>Prompt</Label>
        <Input value={prompt} onChangeText={setPrompt}
               placeholder="A drone shot of a rainforest at dawn..." />

        <Text style={{ color: colors.textMuted, fontSize: fontSize.xs, marginTop: spacing.md }}>Style</Text>
        <View style={{ flexDirection: 'row', gap: 6, marginTop: 6, flexWrap: 'wrap' }}>
          {['cinematic', 'documentary', 'animation', 'noir', 'commercial', 'dreamlike'].map((s) => (
            <ChoicePill key={s} label={s} active={style === s} onPress={() => setStyle(s)} />
          ))}
        </View>

        <Text style={{ color: colors.textMuted, fontSize: fontSize.xs, marginTop: spacing.md }}>Camera motion</Text>
        <View style={{ flexDirection: 'row', gap: 6, marginTop: 6 }}>
          {['still', 'medium', 'dynamic'].map((m) => (
            <ChoicePill key={m} label={m} active={motion === m} onPress={() => setMotion(m)} />
          ))}
        </View>

        <Text style={{ color: colors.textMuted, fontSize: fontSize.xs, marginTop: spacing.md }}>Model</Text>
        <View style={{ flexDirection: 'row', gap: 6, marginTop: 6 }}>
          <ChoicePill label="Sora 2" active={model === 'sora-2'} onPress={() => setModel('sora-2')} />
          <ChoicePill label="Sora 2 Pro" active={model === 'sora-2-pro'} onPress={() => setModel('sora-2-pro')} />
        </View>

        <Text style={{ color: colors.textMuted, fontSize: fontSize.xs, marginTop: spacing.md }}>Duration</Text>
        <View style={{ flexDirection: 'row', gap: 6, marginTop: 6 }}>
          {[4, 8, 12].map((d) => (
            <ChoicePill key={d} label={`${d}s`} active={duration === d} onPress={() => setDuration(d)} />
          ))}
        </View>

        <Button title={busy ? 'Rendering…' : 'Generate video'}
                onPress={run} loading={busy}
                disabled={busy || otherBusy || prompt.trim().length < 3}
                style={{ marginTop: spacing.md }}
                testID="studio-video-btn" />
        {otherBusy && (
          <Text style={{ color: colors.textDim, fontSize: fontSize.xs, marginTop: 6, textAlign: 'center' }}>
            Another generation is running — finish it first.
          </Text>
        )}
      </Card>

      {busy && (
        <Card>
          <View style={{ alignItems: 'center', paddingVertical: spacing.md }}>
            <ActivityIndicator color={colors.primary} />
            <Text style={{ color: colors.textMuted, fontSize: fontSize.sm, marginTop: 12, textAlign: 'center' }}>
              Rendering with {model}. Sora usually takes 2–5 minutes.{'\n'}
              You can switch tabs or lock your phone — we'll finish in the background.
            </Text>
          </View>
        </Card>
      )}

      {state.status === 'done' && state.result && (
        <Card>
          <Text style={{ color: colors.text, fontSize: fontSize.md, fontWeight: '600' }}>Video ready</Text>
          <Text style={{ color: colors.textMuted, fontSize: fontSize.sm, marginTop: 4 }}>
            {state.result.model} · {state.result.duration}s · {state.result.size}
          </Text>
          <View style={{ flexDirection: 'row', gap: 8, marginTop: spacing.md }}>
            <Button title="Open" icon={<LinkIcon color="#fff" size={14} />}
                    onPress={() => Linking.openURL(state.result.url)} style={{ flex: 1 }} />
            <Button title="Save / share" icon={<Download color="#fff" size={14} />}
                    variant="outline"
                    onPress={() => Linking.openURL(state.result.url)} style={{ flex: 1 }}
                    testID="studio-video-save-btn" />
          </View>
        </Card>
      )}
      {state.status === 'error' && (
        <Card><Text style={{ color: '#ef4444', fontSize: fontSize.sm }}>{state.error}</Text></Card>
      )}
    </>
  );
}

// -------------------- History --------------------
function HistoryList() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/studio/history');
      setItems(data.items || []);
    } catch { /* silent */ }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  if (loading && items.length === 0) {
    return <ActivityIndicator color={colors.primary} style={{ marginTop: 40 }} />;
  }
  if (items.length === 0) {
    return <Card><Text style={{ color: colors.textMuted, textAlign: 'center' }}>No Studio activity yet.</Text></Card>;
  }
  return items.map((it) => (
    <Card key={it.id}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        <Text style={{ color: colors.primary, fontSize: fontSize.xs, fontWeight: '600', textTransform: 'uppercase' }}>{it.kind}</Text>
        <Text style={{ color: colors.textDim, fontSize: fontSize.xs }}>{(it.created_at || '').slice(0, 16).replace('T', ' ')}</Text>
      </View>
      {it.kind === 'image' && it.urls && it.urls[0] && (
        <Image source={{ uri: it.urls[0] }} style={{ width: '100%', aspectRatio: 1, borderRadius: radii.md, marginTop: 8 }} resizeMode="cover" />
      )}
      {it.kind === 'video' && it.url && (
        <TouchableOpacity onPress={() => Linking.openURL(it.url)} style={{ marginTop: 8 }}>
          <View style={{ padding: spacing.md, borderRadius: radii.md, backgroundColor: colors.bg, alignItems: 'center' }}>
            <VideoIcon color={colors.primary} size={20} />
            <Text style={{ color: colors.primary, fontSize: fontSize.sm, marginTop: 6 }}>Open video</Text>
          </View>
        </TouchableOpacity>
      )}
      {it.kind === 'summarize' && it.summary_preview && (
        <Text style={{ color: colors.textMuted, fontSize: fontSize.sm, marginTop: 6 }}>
          {it.summary_preview}
        </Text>
      )}
      {it.prompt ? (
        <Text style={{ color: colors.textDim, fontSize: fontSize.xs, marginTop: 6 }} numberOfLines={2}>
          {it.prompt}
        </Text>
      ) : null}
    </Card>
  ));
}

// -------------------- Shared UI --------------------
function ChoicePill({ label, active, onPress }) {
  return (
    <TouchableOpacity onPress={onPress}
      style={{
        paddingVertical: 6, paddingHorizontal: 12,
        borderRadius: 999, borderWidth: 1,
        borderColor: active ? colors.primary : colors.border,
        backgroundColor: active ? colors.primaryDim : 'transparent',
      }}
    >
      <Text style={{
        color: active ? colors.primary : colors.textMuted,
        fontSize: fontSize.xs, fontWeight: '500',
        textTransform: 'capitalize',
      }}>{label}</Text>
    </TouchableOpacity>
  );
}

function SkeletonBox({ aspect = 1 }) {
  return (
    <View style={{ width: '100%', aspectRatio: aspect, borderRadius: radii.md, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' }}>
      <ActivityIndicator color={colors.primary} />
    </View>
  );
}
function SkeletonBlock({ lines = 3 }) {
  return (
    <Card>
      {[...Array(lines)].map((_, i) => (
        <View key={i} style={{ height: 12, borderRadius: 6, backgroundColor: colors.border, marginTop: i === 0 ? 0 : 8, width: i === lines - 1 ? '60%' : '100%' }} />
      ))}
    </Card>
  );
}
