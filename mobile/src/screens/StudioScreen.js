import React, { useState } from 'react';
import { View, Text, ScrollView, Image, TouchableOpacity } from 'react-native';
import { Sparkles, ImageIcon, FileText } from 'lucide-react-native';
import api from '../api';
import ScreenHeader from '../components/ScreenHeader';
import { Card, Button, Input, Label } from '../components/UI';
import { colors, spacing, fontSize, radii } from '../theme';

export default function StudioScreen({ navigation }) {
  const [tab, setTab] = useState('sum');
  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }} testID="studio-screen">
      <ScreenHeader title="AI Studio" navigation={navigation} />
      <View style={{ flexDirection: 'row', paddingHorizontal: spacing.md, paddingTop: spacing.md, gap: 8 }}>
        <TabBtn label="Summarize" Icon={FileText} active={tab === 'sum'} onPress={() => setTab('sum')} />
        <TabBtn label="Image" Icon={ImageIcon} active={tab === 'img'} onPress={() => setTab('img')} />
      </View>
      <ScrollView contentContainerStyle={{ padding: spacing.md, gap: spacing.md }}>
        {tab === 'sum' ? <Summarize /> : <ImageGen />}
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
