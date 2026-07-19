import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator, Platform, Alert } from 'react-native';
import * as AuthSession from 'expo-auth-session';
import * as WebBrowser from 'expo-web-browser';
import * as AppleAuthentication from 'expo-apple-authentication';
import { useDispatch } from 'react-redux';
import api from '../api';
import { setAuth } from '../store/slices/authSlice';
import { colors, spacing, radii, fontSize } from '../theme';

WebBrowser.maybeCompleteAuthSession();

const GOOGLE_DISCOVERY = {
  authorizationEndpoint: 'https://accounts.google.com/o/oauth2/v2/auth',
  tokenEndpoint: 'https://oauth2.googleapis.com/token',
};
const GITHUB_DISCOVERY = {
  authorizationEndpoint: 'https://github.com/login/oauth/authorize',
  tokenEndpoint: 'https://github.com/login/oauth/access_token',
};
const LINKEDIN_DISCOVERY = {
  authorizationEndpoint: 'https://www.linkedin.com/oauth/v2/authorization',
  tokenEndpoint: 'https://www.linkedin.com/oauth/v2/accessToken',
};

/**
 * Mobile social sign-in. Google, GitHub and LinkedIn all use the plain
 * OAuth 2.0 code flow — we forward the `code` to the same backend endpoints
 * used by the web app (`/api/auth/{google-verify|github|linkedin}`), which
 * already know how to complete the exchange. Apple stays on the native
 * StoreKit flow via `expo-apple-authentication` (App Store required on iOS).
 *
 * Microsoft and Facebook are intentionally excluded — Microsoft's flow has
 * not been stabilised behind our reverse proxy and Facebook is not
 * whitelisted in Meta for Developers.
 */
export default function SocialAuthButtons() {
  const dispatch = useDispatch();
  const [loading, setLoading] = useState(null);
  const [oauthCfg, setOauthCfg] = useState({ google: {}, apple: {}, github: {}, linkedin: {} });

  useEffect(() => {
    api.get('/auth/oauth-config').then((r) => setOauthCfg(r.data || {})).catch(() => {});
  }, []);

  const redirectUri = AuthSession.makeRedirectUri({ scheme: 'iemaai', path: 'auth' });
  const finish = (data) => { dispatch(setAuth(data)); };

  const withProvider = async (provider, run) => {
    if (loading) return;
    setLoading(provider);
    try { await run(); }
    catch (e) {
      if (e?.code === 'ERR_CANCELED' || e?.type === 'cancel') return;
      Alert.alert(`${provider} sign-in failed`, e?.response?.data?.detail || e?.message || 'Try again');
    } finally { setLoading(null); }
  };

  const signInGoogle = () => withProvider('google', async () => {
    if (!oauthCfg.google?.enabled) throw new Error('Google not configured');
    const request = new AuthSession.AuthRequest({
      clientId: oauthCfg.google.client_id,
      redirectUri,
      responseType: AuthSession.ResponseType.IdToken,
      scopes: ['openid', 'profile', 'email'],
      extraParams: { nonce: Math.random().toString(36).slice(2) },
    });
    const result = await request.promptAsync(GOOGLE_DISCOVERY);
    if (result.type !== 'success') return;
    const idToken = result.params?.id_token;
    if (!idToken) throw new Error('No id_token from Google');
    const { data } = await api.post('/auth/google-verify', { credential: idToken });
    finish(data);
  });

  const signInGithub = () => withProvider('github', async () => {
    if (!oauthCfg.github?.enabled) throw new Error('GitHub not configured');
    const request = new AuthSession.AuthRequest({
      clientId: oauthCfg.github.client_id,
      redirectUri,
      responseType: AuthSession.ResponseType.Code,
      scopes: ['read:user', 'user:email'],
    });
    const result = await request.promptAsync(GITHUB_DISCOVERY);
    if (result.type !== 'success') return;
    const code = result.params?.code;
    if (!code) throw new Error('No code from GitHub');
    // Backend handles the client_secret + code exchange (GitHub disallows
    // exchanging the code from a public client).
    const { data } = await api.post('/auth/github', { code, redirect_uri: redirectUri });
    finish(data);
  });

  const signInLinkedIn = () => withProvider('linkedin', async () => {
    if (!oauthCfg.linkedin?.enabled) throw new Error('LinkedIn not configured');
    const request = new AuthSession.AuthRequest({
      clientId: oauthCfg.linkedin.client_id,
      redirectUri,
      responseType: AuthSession.ResponseType.Code,
      scopes: ['openid', 'profile', 'email'],
    });
    const result = await request.promptAsync(LINKEDIN_DISCOVERY);
    if (result.type !== 'success') return;
    const code = result.params?.code;
    if (!code) throw new Error('No code from LinkedIn');
    const { data } = await api.post('/auth/linkedin', { code, redirect_uri: redirectUri });
    finish(data);
  });

  const signInApple = () => withProvider('apple', async () => {
    const credential = await AppleAuthentication.signInAsync({
      requestedScopes: [
        AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
        AppleAuthentication.AppleAuthenticationScope.EMAIL,
      ],
    });
    const idToken = credential.identityToken;
    if (!idToken) throw new Error('No identity token from Apple');
    const { data } = await api.post('/auth/apple', { id_token: idToken });
    finish(data);
  });

  const chip = (label, onPress, key, testID, disabled) => (
    <TouchableOpacity
      testID={testID}
      onPress={onPress}
      disabled={disabled || loading !== null}
      activeOpacity={0.85}
      style={{
        flex: 1, height: 44, borderRadius: radii.md,
        borderWidth: 1, borderColor: colors.border,
        backgroundColor: colors.surface,
        alignItems: 'center', justifyContent: 'center',
        opacity: disabled ? 0.5 : 1,
      }}
    >
      {loading === key
        ? <ActivityIndicator size="small" color={colors.text} />
        : <Text style={{ color: colors.text, fontSize: fontSize.sm, fontWeight: '500' }}>{label}</Text>}
    </TouchableOpacity>
  );

  return (
    <View style={{ gap: spacing.sm }}>
      <TouchableOpacity
        testID="social-google"
        onPress={signInGoogle}
        disabled={loading !== null || !oauthCfg.google?.enabled}
        activeOpacity={0.85}
        style={{
          height: 46, borderRadius: radii.md,
          borderWidth: 1, borderColor: colors.border,
          backgroundColor: colors.surface,
          flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
          opacity: oauthCfg.google?.enabled ? 1 : 0.5,
        }}
      >
        {loading === 'google'
          ? <ActivityIndicator size="small" color={colors.text} />
          : <Text style={{ color: colors.text, fontSize: fontSize.md, fontWeight: '500' }}>Continue with Google</Text>}
      </TouchableOpacity>
      <View style={{ flexDirection: 'row', gap: spacing.sm }}>
        {Platform.OS === 'ios'
          ? chip('Apple', signInApple, 'apple', 'social-apple', !oauthCfg.apple?.enabled)
          : chip('Apple', () => Alert.alert('Apple Sign-In', 'Apple Sign-In requires iOS.'), 'apple', 'social-apple', true)}
        {chip('GitHub', signInGithub, 'github', 'social-github', !oauthCfg.github?.enabled)}
        {chip('LinkedIn', signInLinkedIn, 'linkedin', 'social-linkedin', !oauthCfg.linkedin?.enabled)}
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginVertical: spacing.md }}>
        <View style={{ flex: 1, height: 1, backgroundColor: colors.border }} />
        <Text style={{ color: colors.textDim, fontSize: fontSize.xs }}>or continue with email</Text>
        <View style={{ flex: 1, height: 1, backgroundColor: colors.border }} />
      </View>
    </View>
  );
}
