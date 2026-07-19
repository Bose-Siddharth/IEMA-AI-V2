import React, { useState } from 'react';
import { View, Text, ScrollView, Image, TouchableOpacity, Alert, Linking } from 'react-native';
import { Sparkles, ImageIcon, FileText, Video as VideoIcon, ExternalLink } from 'lucide-react-native';
import api from '../api';
import ScreenHeader from '../components/ScreenHeader';
import { Card, Button, Input, Label } from '../components/UI';
import { colors, spacing, fontSize, radii } from '../theme';

export default function StudioScreen({ navigation }) {
  const [tab, setTab] = useState('sum');
  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }} testID="studio-screen">
      <ScreenHeader title="AI Studio" navigation={navigation} />
      <View style={{ flexDirection: 'row', paddingHorizontal: spacing.md, paddingTop: spacing.md, gap: 6 }}>
        <TabBtn label="Summarize" Icon={FileText} active={tab === 'sum'} onPress={() => setTab('sum')} />
        <TabBtn label="Image" Icon={ImageIcon} active={tab === 'img'} onPress={() => setTab('img')} />
        <TabBtn label="Video" Icon={VideoIcon} active={tab === 'vid'} onPress={() => setTab('vid')} />
      </View>
      <ScrollView contentContainerStyle={{ padding: spacing.md, gap: spacing.md }}>
        {tab === 'sum' && <Summarize />}
        {tab === 'img' && <ImageGen />}
        {tab === 'vid' && <VideoGen />}
      </ScrollView>
    </View>
  );
}

function TabBtn({ label, Icon, active, onPress }) {
  return (
    <TouchableOpacity onPress={onPress} style={{
      flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
      paddingVertical: 10, borderRadius: radii.md, borderWidth: 1,
      borderColor: active ? colors.primary : colors.border,
      backgroundColor: active ? colors.primaryDim : 'transparent',
    }}>
      <Icon color={active ? colors.primary : colors.textMuted} size={14} />
      <Text style={{ color: active ? colors.primary : colors.textMuted, fontSize: fontSize.sm, fontWeight: '500' }}>{label}</Text>
    </TouchableOpacity>
  );
}

function Summarize() {
  const [text, setText] = useState('');
  const [summary, setSummary] = useState('');
  const [loading, setLoading] = useState(false);
  const run = async () => {
    if (text.trim().length < 20) return;
    setLoading(true); setSummary('');
    try {
      const { data } = await api.post('/studio/summarize', { text, style: 'default' });
      setSummary(data.summary);
    } catch (e) {
      setSummary('Error: ' + (e.response?.data?.detail || 'failed'));
    } finally { setLoading(false); }
  };
  return (
    <>
      <Card>
        <Label>Text</Label>
        <Input value={text} onChangeText={setText} multiline placeholder="Paste content to summarize..." style={{ minHeight: 160, textAlignVertical: 'top', paddingTop: 10 }} />
        <Text style={{ color: colors.textDim, fontSize: fontSize.xs, marginTop: 6 }}>{text.length} chars · 2 credits</Text>
        <Button title="Summarize" onPress={run} loading={loading} disabled={text.trim().length < 20} style={{ marginTop: spacing.md }} testID="studio-summarize-btn" />
      </Card>
      {summary ? (
        <Card><Text style={{ color: colors.text, fontSize: fontSize.sm, lineHeight: 20 }}>{summary}</Text></Card>
      ) : null}
    </>
  );
}

function ImageGen() {
  const [prompt, setPrompt] = useState('');
  const [images, setImages] = useState([]);
  const [loading, setLoading] = useState(false);
  const run = async () => {
    if (prompt.trim().length < 3) return;
    setLoading(true); setImages([]);
    try {
      const { data } = await api.post('/studio/image', { prompt, quality: 'low', n: 1 });
      setImages(data.images);
    } catch (e) {
      setImages([]);
    } finally { setLoading(false); }
  };
  return (
    <>
      <Card>
        <Label>Prompt</Label>
        <Input value={prompt} onChangeText={setPrompt} placeholder="Describe the image..." />
        <Text style={{ color: colors.textDim, fontSize: fontSize.xs, marginTop: 6 }}>10 credits · low quality</Text>
        <Button title="Generate" onPress={run} loading={loading} disabled={prompt.trim().length < 3} style={{ marginTop: spacing.md }} testID="studio-image-btn" />
      </Card>
      {images.map((im, i) => (
        <Card key={i} style={{ padding: 0, overflow: 'hidden' }}>
          <Image source={{ uri: im.url }} style={{ width: '100%', aspectRatio: 1 }} resizeMode="cover" />
        </Card>
      ))}
    </>
  );
}

function VideoGen() {
  const [prompt, setPrompt] = useState('');
  const [model, setModel] = useState('sora-2');
  const [duration, setDuration] = useState(4);
  const [video, setVideo] = useState(null);
  const [loading, setLoading] = useState(false);

  // Client-side reference table so the user sees expected credit cost before
  // firing a job that takes 2–5 minutes.
  const CREDITS = {
    'sora-2':     { 4: 60,  8: 120, 12: 180 },
    'sora-2-pro': { 4: 180, 8: 360, 12: 540 },
  };
  const expected = (CREDITS[model] || {})[duration] || 0;

  const run = async () => {
    if (prompt.trim().length < 3) return;
    setLoading(true); setVideo(null);
    try {
      const { data } = await api.post('/studio/video', {
        prompt, model, duration, size: '1280x720',
      });
      setVideo(data);
    } catch (e) {
      Alert.alert('Video generation failed', e.response?.data?.detail || 'Try again in a minute.');
    } finally { setLoading(false); }
  };

  return (
    <>
      <Card>
        <Label>Prompt</Label>
        <Input value={prompt} onChangeText={setPrompt}
               placeholder="Describe the scene Sora should render..." />

        <View style={{ flexDirection: 'row', gap: 8, marginTop: spacing.md }}>
          <ChoicePill label="Sora 2" active={model === 'sora-2'} onPress={() => setModel('sora-2')} />
          <ChoicePill label="Sora 2 Pro" active={model === 'sora-2-pro'} onPress={() => setModel('sora-2-pro')} />
        </View>
        <View style={{ flexDirection: 'row', gap: 8, marginTop: spacing.sm }}>
          {[4, 8, 12].map((d) => (
            <ChoicePill key={d} label={`${d}s`} active={duration === d} onPress={() => setDuration(d)} />
          ))}
        </View>

        <Text style={{ color: colors.textDim, fontSize: fontSize.xs, marginTop: spacing.md }}>
          <Text style={{ color: colors.primary, fontWeight: '600' }}>{expected}</Text> credits · takes 2–5 min
        </Text>
        <Button title="Generate video" onPress={run} loading={loading}
                disabled={prompt.trim().length < 3}
                style={{ marginTop: spacing.md }} testID="studio-video-btn" />
      </Card>

      {loading && (
        <Card>
          <Text style={{ color: colors.textMuted, textAlign: 'center', paddingVertical: spacing.md }}>
            Rendering with {model}… Sora videos take 2–5 minutes. You can safely switch tabs — we'll finish in the background.
          </Text>
        </Card>
      )}

      {video && (
        <Card>
          <Text style={{ color: colors.text, fontSize: fontSize.md, fontWeight: '600' }}>
            Video ready
          </Text>
          <Text style={{ color: colors.textMuted, fontSize: fontSize.sm, marginTop: 4 }}>
            {video.model} · {video.duration}s · {video.size} · {video.credits_used} credits
          </Text>
          <Button
            title="Open / download video"
            icon={<ExternalLink color="#fff" size={14} />}
            onPress={() => Linking.openURL(video.url)}
            style={{ marginTop: spacing.md }}
            testID="studio-video-open-btn"
          />
        </Card>
      )}
    </>
  );
}

function ChoicePill({ label, active, onPress }) {
  return (
    <TouchableOpacity
      onPress={onPress}
      style={{
        paddingVertical: 8, paddingHorizontal: 14,
        borderRadius: 999, borderWidth: 1,
        borderColor: active ? colors.primary : colors.border,
        backgroundColor: active ? colors.primaryDim : 'transparent',
      }}
    >
      <Text style={{
        color: active ? colors.primary : colors.textMuted,
        fontSize: fontSize.sm, fontWeight: '500',
      }}>{label}</Text>
    </TouchableOpacity>
  );
}
