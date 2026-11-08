import { Redirect, router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { View } from 'react-native';

import { Button, ErrorBanner, Loading, T } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { friendlyError } from '@/lib/supabase';
import { useAuth } from '@/providers/auth';
import { rememberJoinCode, useGroups } from '@/providers/groups';

/**
 * A home's join link: /join/<code>. Signed in: join the home straight away.
 * Signed out: keep the code, sign in, and the home is joined right after.
 */
export default function JoinHome() {
  const { code } = useLocalSearchParams<{ code: string }>();
  const { session } = useAuth();
  const { joinHome } = useGroups();
  const [state, setState] = useState<'joining' | 'done' | 'saved'>('joining');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!code) return;
    if (!session) {
      rememberJoinCode(code).then(() => setState('saved'));
      return;
    }
    let alive = true;
    joinHome(code)
      .then(() => alive && setState('done'))
      .catch((e) => alive && setError(friendlyError(e)));
    return () => {
      alive = false;
    };
  }, [code, session, joinHome]);

  if (state === 'saved' || state === 'done') return <Redirect href="/" />;
  if (error) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', padding: Spacing.xl, gap: Spacing.md, maxWidth: 480, width: '100%', alignSelf: 'center' }}>
        <T variant="heading">{"Couldn't join that home"}</T>
        <ErrorBanner message={error} />
        <T variant="small">Check the link, or ask an admin for a new one.</T>
        <Button title="Go to the app" onPress={() => router.replace('/')} />
      </View>
    );
  }
  return <Loading />;
}
