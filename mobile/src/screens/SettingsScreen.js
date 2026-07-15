import React, { useState } from 'react';
import { View, Text, ScrollView, Alert } from 'react-native';
import { useDispatch } from 'react-redux';
import api from '../api';
import { logout } from '../store/slices/authSlice';
import ScreenHeader from '../components/ScreenHeader';
import { Card, Button, Input, Label } from '../components/UI';
import { colors, spacing, fontSize } from '../theme';

export default function SettingsScreen({ navigation }) {
  const dispatch = useDispatch();
  const [confirmText, setConfirmText] = useState('');
  const [deleting, setDeleting] = useState(false);

  const doDelete = () => {
    if (confirmText !== 'DELETE') { Alert.alert('Type DELETE', 'Please type DELETE to confirm'); return; }
    Alert.alert('Confirm account deletion', 'This action cannot be undone. All your data will be permanently removed.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete permanently', style: 'destructive', onPress: async () => {
        setDeleting(true);
        try {
          await api.delete('/auth/me');
          dispatch(logout());
        } catch { Alert.alert('Error', 'Failed to delete account'); } finally { setDeleting(false); }
      }},
    ]);
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScreenHeader title="Settings" navigation={navigation} />
      <ScrollView contentContainerStyle={{ padding: spacing.md, gap: spacing.md }}>
        <Card>
          <Text style={{ color: colors.text, fontSize: fontSize.lg, fontWeight: '600' }}>Appearance</Text>
          <Text style={{ color: colors.textMuted, fontSize: fontSize.sm, marginTop: 4 }}>
            IEMA.ai mobile uses your device's system theme (dark by default). You can change this in your device settings.
          </Text>
        </Card>

        <Card style={{ borderColor: colors.destructive + '80', backgroundColor: colors.destructiveDim }}>
          <Text style={{ color: colors.destructive, fontSize: fontSize.lg, fontWeight: '600' }}>Danger zone</Text>
          <Text style={{ color: colors.textMuted, fontSize: fontSize.sm, marginTop: 4 }}>
            Deleting your account is permanent. Your conversations, credits and payment history will be erased.
          </Text>
          <View style={{ marginTop: spacing.md, gap: 8 }}>
            <Label>Type DELETE to confirm</Label>
            <Input value={confirmText} onChangeText={setConfirmText} placeholder="DELETE" autoCapitalize="characters" testID="delete-confirm" />
            <Button title="Permanently delete account" variant="outline" onPress={doDelete} loading={deleting} testID="delete-account" />
          </View>
        </Card>

        <Button title="Sign out" variant="outline" onPress={() => dispatch(logout())} testID="sign-out" />

        <Text style={{ color: colors.textDim, fontSize: 11, textAlign: 'center', marginTop: 20 }}>IEMA.ai v2.0 · Build 1</Text>
      </ScrollView>
    </View>
  );
}
