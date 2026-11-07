import { Image } from 'expo-image';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button, ErrorBanner, Field, T } from '@/components/ui';
import { Colors, MaxContentWidth, Radius, Spacing } from '@/constants/theme';
import { signInWithGoogle } from '@/lib/oauth';
import { friendlyError, isSupabaseConfigured, supabase } from '@/lib/supabase';

export default function SignIn() {
  const [mode, setMode] = useState<'sign-in' | 'sign-up'>('sign-in');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [googleBusy, setGoogleBusy] = useState(false);

  async function google() {
    setGoogleBusy(true);
    setError(null);
    setNotice(null);
    try {
      const result = await signInWithGoogle();
      // On web the page navigates away; keep the spinner until it does.
      if (result !== 'redirecting') setGoogleBusy(false);
    } catch (e) {
      setError(friendlyError(e));
      setGoogleBusy(false);
    }
  }

  const isSignUp = mode === 'sign-up';
  const canSubmit = email.includes('@') && password.length >= 6 && (!isSignUp || name.trim().length > 0);

  async function submit() {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      if (isSignUp) {
        const { data, error } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: { data: { display_name: name.trim() } },
        });
        if (error) throw error;
        if (!data.session) setNotice('Check your email to confirm your account, then sign in.');
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
        if (error) throw error;
      }
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.flex}>
        <View style={styles.container}>
          <View style={styles.brand}>
            <Image
              source={require('@/assets/images/logo-wordmark.png')}
              style={styles.wordmark}
              contentFit="contain"
              accessibilityLabel="me-n-u"
            />
            <T variant="small" style={styles.center}>
              {"Share recipes, plan the week's menu and shop together across every home."}
            </T>
          </View>

          {!isSupabaseConfigured && (
            <ErrorBanner message="Supabase isn't configured. Add EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY to mobile/.env.local." />
          )}

          <View style={styles.form}>
            <Button title="Continue with Google" icon="logo-google" variant="secondary" onPress={google} loading={googleBusy} />
            <View style={styles.or}>
              <View style={styles.orLine} />
              <T variant="small">or with email</T>
              <View style={styles.orLine} />
            </View>
            {isSignUp && (
              <Field label="Your name" value={name} onChangeText={setName} placeholder="e.g. Jordan" autoComplete="name" />
            )}
            <Field
              label="Email"
              value={email}
              onChangeText={setEmail}
              placeholder="you@example.com"
              autoCapitalize="none"
              autoComplete="email"
              keyboardType="email-address"
            />
            <Field
              label="Password"
              value={password}
              onChangeText={setPassword}
              placeholder="At least 6 characters"
              secureTextEntry
              autoComplete={isSignUp ? 'new-password' : 'current-password'}
              onSubmitEditing={() => canSubmit && submit()}
            />
            <ErrorBanner message={error} />
            {notice && (
              <View style={styles.notice}>
                <T variant="small" style={{ color: Colors.success }}>
                  {notice}
                </T>
              </View>
            )}
            <Button title={isSignUp ? 'Create account' : 'Sign in'} onPress={submit} loading={busy} disabled={!canSubmit} />
          </View>

          <Pressable
            onPress={() => {
              setMode(isSignUp ? 'sign-in' : 'sign-up');
              setError(null);
              setNotice(null);
            }}
            style={styles.switch}>
            <T variant="small">
              {isSignUp ? 'Already have an account? ' : 'New here? '}
              <T variant="small" style={styles.link}>
                {isSignUp ? 'Sign in' : 'Create an account'}
              </T>
            </T>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },
  flex: { flex: 1 },
  container: {
    flex: 1,
    justifyContent: 'center',
    padding: Spacing.xl,
    gap: Spacing.xl,
    width: '100%',
    maxWidth: MaxContentWidth / 1.6,
    alignSelf: 'center',
  },
  brand: { alignItems: 'center', gap: Spacing.sm },
  // Source is 773x240.
  wordmark: { width: 232, height: 72, marginBottom: Spacing.sm },
  center: { textAlign: 'center', maxWidth: 300 },
  form: { gap: Spacing.lg },
  or: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  orLine: { flex: 1, height: 1, backgroundColor: Colors.border },
  notice: { backgroundColor: Colors.primarySoft, borderRadius: Radius.md, padding: Spacing.md },
  switch: { alignItems: 'center', padding: Spacing.sm },
  link: { color: Colors.primaryStrong, fontWeight: '600' },
});
