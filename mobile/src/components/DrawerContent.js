import React from 'react';
import { View, Text, TouchableOpacity, ScrollView, Image } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useDispatch, useSelector } from 'react-redux';
import {
  MessageSquare, BarChart3, Wallet, CreditCard, Bell, User, Settings,
  LogOut, Sparkles, Lock, Briefcase, Rocket, FlaskConical, GraduationCap,
  FileText, MessagesSquare, Heart, Award, MapPin, Wrench, Code2
} from 'lucide-react-native';
import { colors, spacing, radii, fontSize } from '../theme';
import { logout } from '../store/slices/authSlice';

const primary = [
  { label: 'AI Workspace', Icon: MessageSquare, screen: 'AI Workspace' },
  { label: 'AI Studio', Icon: Sparkles, screen: 'AI Studio' },
  { label: 'Code Builder', Icon: Code2, screen: 'Code Builder' },
  { label: 'Counseling', Icon: Heart, screen: 'Counseling' },
  { label: 'Career Intelligence', Icon: Briefcase, screen: 'Career Intelligence' },
  { label: 'Usage', Icon: BarChart3, screen: 'Usage' },
  { label: 'Credit Wallet', Icon: Wallet, screen: 'Wallet' },
  { label: 'Billing', Icon: CreditCard, screen: 'Billing' },
  { label: 'Notifications', Icon: Bell, screen: 'Notifications' },
  { label: 'Profile', Icon: User, screen: 'Profile' },
  { label: 'Settings', Icon: Settings, screen: 'Settings' },
];

const comingSoon = [
  { label: 'Startup Intelligence', Icon: Rocket },
  { label: 'Research Intelligence', Icon: FlaskConical },
  { label: 'Dynamic Course Engine', Icon: GraduationCap },
  { label: 'Resume Intelligence', Icon: FileText },
  { label: 'Mock Interviews', Icon: MessagesSquare },
  { label: 'Scholarships', Icon: Award },
  { label: 'Internships', Icon: MapPin },
  { label: 'Freelance Intelligence', Icon: Wrench },
];

export default function DrawerContent({ navigation, state }) {
  const insets = useSafeAreaInsets();
  const dispatch = useDispatch();
  const user = useSelector((s) => s.auth.user);
  const wallet = useSelector((s) => s.ui.walletBalance);
  const active = state.routeNames[state.index];

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface, paddingTop: insets.top }}>
      {/* Logo */}
      <View style={{ paddingHorizontal: spacing.lg, paddingVertical: spacing.lg, borderBottomWidth: 1, borderColor: colors.border, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <View style={{ height: 28, width: 28, borderRadius: 6, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' }}>
          <Sparkles color="#fff" size={16} />
        </View>
        <Text style={{ color: colors.text, fontSize: fontSize.md, fontWeight: '600' }}>
          IEMA<Text style={{ color: colors.primary }}>.</Text>ai
        </Text>
      </View>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: spacing.sm }}>
        {primary.map(({ label, Icon, screen }) => {
          const isActive = active === screen;
          return (
            <TouchableOpacity
              key={label}
              onPress={() => navigation.navigate(screen)}
              style={{
                flexDirection: 'row', alignItems: 'center', gap: 12,
                paddingHorizontal: spacing.md, paddingVertical: spacing.md,
                borderRadius: radii.md,
                backgroundColor: isActive ? colors.surfaceElevated : 'transparent',
              }}
            >
              <Icon color={isActive ? colors.text : colors.textMuted} size={18} strokeWidth={1.75} />
              <Text style={{ color: isActive ? colors.text : colors.textMuted, fontSize: fontSize.md, fontWeight: isActive ? '500' : '400' }}>{label}</Text>
            </TouchableOpacity>
          );
        })}
        <Text style={{ color: colors.textDim, fontSize: fontSize.xs, textTransform: 'uppercase', letterSpacing: 1.2, marginTop: spacing.lg, paddingHorizontal: spacing.md, paddingBottom: spacing.sm }}>Coming Soon</Text>
        {comingSoon.map(({ label, Icon }) => (
          <View key={label} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: spacing.md, paddingVertical: spacing.md, opacity: 0.5 }}>
            <Icon color={colors.textDim} size={18} strokeWidth={1.5} />
            <Text style={{ color: colors.textDim, fontSize: fontSize.md, flex: 1 }}>{label}</Text>
            <Lock color={colors.textDim} size={12} />
          </View>
        ))}
      </ScrollView>

      {/* Footer */}
      <View style={{ borderTopWidth: 1, borderColor: colors.border, padding: spacing.md, paddingBottom: Math.max(insets.bottom, spacing.md) }}>
        {wallet !== null && (
          <View style={{ backgroundColor: colors.bg, borderWidth: 1, borderColor: colors.border, borderRadius: radii.md, padding: spacing.md, marginBottom: spacing.sm }}>
            <Text style={{ color: colors.textDim, fontSize: fontSize.xs, textTransform: 'uppercase', letterSpacing: 1 }}>Credits</Text>
            <Text style={{ color: colors.text, fontSize: fontSize.xl, fontWeight: '600' }}>{Math.floor(wallet).toLocaleString()}</Text>
          </View>
        )}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, padding: spacing.sm }}>
          <View style={{ height: 32, width: 32, borderRadius: 16, backgroundColor: colors.primaryDim, alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ color: colors.primary, fontWeight: '600' }}>{(user?.name || '?').charAt(0).toUpperCase()}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ color: colors.text, fontSize: fontSize.sm }} numberOfLines={1}>{user?.name}</Text>
            <Text style={{ color: colors.textDim, fontSize: fontSize.xs }} numberOfLines={1}>{user?.email}</Text>
          </View>
          <TouchableOpacity onPress={() => dispatch(logout())} style={{ padding: 6 }}>
            <LogOut color={colors.textMuted} size={16} />
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}
