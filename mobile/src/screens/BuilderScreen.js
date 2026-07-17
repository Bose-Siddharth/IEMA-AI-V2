import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, Linking, Modal, RefreshControl } from 'react-native';
import { Code2, Plus, Share2, RefreshCcw, Sparkles, Trash2, Wand2 } from 'lucide-react-native';
import api from '../api';
import ScreenHeader from '../components/ScreenHeader';
import { Card, Button, Input, Label } from '../components/UI';
import { colors, spacing, fontSize, radii } from '../theme';

export default function BuilderScreen({ navigation }) {
  const [projects, setProjects] = useState([]);
  const [showCreate, setShowCreate] = useState(false);
  const [active, setActive] = useState(null);
  const [refineText, setRefineText] = useState('');
  const [busy, setBusy] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const load = async () => {
    setRefreshing(true);
    try { const { data } = await api.get('/builder/projects'); setProjects(data.items || []); }
    catch {} finally { setRefreshing(false); }
  };
  useEffect(() => { load(); }, []);

  const openProject = async (id) => {
    const { data } = await api.get(`/builder/projects/${id}`);
    setActive(data);
  };

  const share = async () => {
    if (!active) return;
    setBusy(true);
    try {
      const { data } = await api.post(`/builder/projects/${active.id}/share`);
      if (data.share_url) Linking.openURL(data.share_url);
    } catch {} finally { setBusy(false); }
  };

  const refine = async () => {
    if (!active || !refineText.trim()) return;
    setBusy(true);
    try {
      const { data } = await api.post(`/builder/projects/${active.id}/refine`, { instruction: refineText });
      setActive({ ...active, files: data.files });
      setRefineText('');
    } catch {} finally { setBusy(false); }
  };

  const del = async (id) => {
    await api.delete(`/builder/projects/${id}`);
    if (active?.id === id) setActive(null);
    load();
  };

  if (active) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg }}>
        <ScreenHeader title={active.name} navigation={navigation} onBack={() => setActive(null)} />
        <ScrollView contentContainerStyle={{ padding: spacing.md, gap: spacing.md }}>
          <Card>
            <Text style={{ color: colors.textDim, fontSize: fontSize.xs }}>{active.files.length} file(s)</Text>
            <Text style={{ color: colors.text, fontSize: fontSize.md, marginTop: 6 }}>{active.description}</Text>
            <Button title="Open Preview (share URL)" onPress={share} loading={busy} style={{ marginTop: spacing.md }} testID="builder-mobile-share-btn" />
          </Card>
          <Card>
            <Label>Refine with AI (8 credits)</Label>
            <Input value={refineText} onChangeText={setRefineText} placeholder="e.g. Add dark mode toggle" testID="builder-mobile-refine-input" />
            <Button title="Refine" onPress={refine} loading={busy} disabled={!refineText.trim()} style={{ marginTop: spacing.sm }} testID="builder-mobile-refine-btn" />
          </Card>
          {active.files.map((f, i) => (
            <Card key={i}>
              <Text style={{ color: colors.primary, fontSize: fontSize.sm, fontWeight: '500' }}>{f.path}</Text>
              <Text style={{ color: colors.textDim, fontSize: fontSize.xs, fontFamily: 'Menlo', marginTop: 6, lineHeight: 16 }} numberOfLines={20}>
                {f.content}
              </Text>
            </Card>
          ))}
        </ScrollView>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }} testID="builder-screen">
      <ScreenHeader title="Code Builder" navigation={navigation} />
      <ScrollView refreshControl={<RefreshControl refreshing={refreshing} onRefresh={load} tintColor={colors.primary} />} contentContainerStyle={{ padding: spacing.md, gap: spacing.md }}>
        <Button title="+ New Project" onPress={() => setShowCreate(true)} testID="builder-mobile-new-btn" />
        {projects.length === 0 && (
          <Card>
            <Text style={{ color: colors.textDim, fontSize: fontSize.sm, textAlign: 'center' }}>
              No projects yet. Create one to generate a working app.
            </Text>
          </Card>
        )}
        {projects.map((p) => (
          <TouchableOpacity key={p.id} onPress={() => openProject(p.id)}>
            <Card>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Code2 color={colors.primary} size={16} />
                <Text style={{ color: colors.text, fontSize: fontSize.md, fontWeight: '500', flex: 1 }} numberOfLines={1}>{p.name}</Text>
                <TouchableOpacity onPress={() => del(p.id)}><Trash2 color={colors.textDim} size={14} /></TouchableOpacity>
              </View>
              <Text style={{ color: colors.textDim, fontSize: fontSize.xs, marginTop: 4 }} numberOfLines={2}>{p.description}</Text>
            </Card>
          </TouchableOpacity>
        ))}
      </ScrollView>
      <CreateModal visible={showCreate} onClose={() => setShowCreate(false)} onCreated={(p) => { setShowCreate(false); load(); openProject(p.id); }} />
    </View>
  );
}

function CreateModal({ visible, onClose, onCreated }) {
  const [prompt, setPrompt] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    if (prompt.trim().length < 8) return;
    setBusy(true);
    try {
      const { data } = await api.post('/builder/projects', { prompt });
      onCreated(data.project);
      setPrompt('');
    } catch {} finally { setBusy(false); }
  };
  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.6)' }}>
        <View style={{ backgroundColor: colors.surface, padding: spacing.lg, borderTopLeftRadius: 20, borderTopRightRadius: 20, gap: 10 }}>
          <Text style={{ color: colors.text, fontSize: fontSize.lg, fontWeight: '600' }}>New Project</Text>
          <Text style={{ color: colors.textDim, fontSize: fontSize.xs }}>15 credits per project. Cache hits are free.</Text>
          <Input value={prompt} onChangeText={setPrompt} multiline placeholder="Describe what to build..." style={{ minHeight: 120, textAlignVertical: 'top', paddingTop: 10 }} testID="builder-mobile-create-prompt" />
          <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
            <Button title="Cancel" onPress={onClose} variant="outline" style={{ flex: 1 }} />
            <Button title="Generate" onPress={submit} loading={busy} disabled={prompt.trim().length < 8} style={{ flex: 1 }} testID="builder-mobile-create-submit" />
          </View>
        </View>
      </View>
    </Modal>
  );
}
