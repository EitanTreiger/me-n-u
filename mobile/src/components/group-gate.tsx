import { router } from 'expo-router';
import { useState, type ReactNode } from 'react';
import { View } from 'react-native';

import { Radius, Spacing } from '@/constants/theme';
import { makeStyles, useColors } from '@/providers/appearance';
import { friendlyError } from '@/lib/supabase';
import { useAuth } from '@/providers/auth';
import { useGroups } from '@/providers/groups';

import { Screen } from './screen';
import { Button, Card, EmptyState, ErrorBanner, Field, Icon, Loading, T } from './ui';

/**
 * Renders children only when the user belongs to a community. Otherwise
 * (right after sign-up, or after leaving their only community) it shows the
 * create-or-join choice in place. With `needsHome` (menu, groceries, pantry)
 * the community must also have a home.
 */
export function GroupGate({ title, children, needsHome }: { title: string; children: ReactNode; needsHome?: boolean }) {
  const { active, activeHome, isAdmin, loading, homesLoading } = useGroups();
  if (loading) return <Loading />;
  if (!active) return <CommunitySetup title={title} />;
  if (needsHome && homesLoading) return <Loading />;
  if (needsHome && !activeHome) {
    return (
      <Screen title={title}>
        <Card>
          <EmptyState
            icon="home-outline"
            title={isAdmin ? 'No homes yet' : 'No home yet'}
            body={isAdmin ? 'Add a home on the Groups page to plan its menu.' : "You're not in a home yet. Ask an admin for your home's join link or code."}
            action={isAdmin ? <Button title="Go to Groups" onPress={() => router.navigate('/groups')} /> : undefined}
          />
        </Card>
      </Screen>
    );
  }
  return <>{children}</>;
}

/**
 * Signed in but not in a home yet. Communities (the company) aren't created in
 * the app, and only admins add homes, so the only step here is joining a home.
 */
export function CommunitySetup({ title }: { title: string }) {
  const Colors = useColors();
  const styles = useStyles();
  const { displayName } = useAuth();
  const { joinHome } = useGroups();
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function join() {
    setBusy(true);
    setError(null);
    try {
      await joinHome(code);
    } catch (e) {
      setError(friendlyError(e));
      setBusy(false);
    }
  }

  return (
    <Screen title={title}>
      <View style={styles.intro}>
        <T variant="heading">Welcome{displayName ? `, ${displayName}` : ''}!</T>
        <T variant="small">
          {"You're not in a home yet. Ask your manager for your home's join link, or enter its code below."}
        </T>
      </View>

      <Card style={styles.option}>
        <View style={styles.optionHeader}>
          <View style={styles.optionIcon}>
            <Icon name="enter-outline" size={20} color={Colors.onPrimary} />
          </View>
          <T variant="subheading">Join your home</T>
        </View>
        <T variant="small">
          {"You'll see your home's weekly menu, grocery list and pantry, and can share, rate and vote for recipes."}
        </T>
        <Field
          label="Home code"
          value={code}
          onChangeText={(v) => setCode(v.toUpperCase())}
          placeholder="ABC234"
          autoCapitalize="characters"
          autoCorrect={false}
          maxLength={6}
          style={styles.codeInput}
        />
        <Button title="Join home" icon="enter-outline" onPress={join} loading={busy} disabled={code.trim().length < 6 || busy} />
      </Card>
      <View style={{ marginTop: Spacing.md }}>
        <ErrorBanner message={error} />
      </View>
    </Screen>
  );
}

const useStyles = makeStyles((Colors) => ({
  intro: { gap: Spacing.xs, marginBottom: Spacing.lg },
  option: { gap: Spacing.md },
  optionHeader: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  optionIcon: {
    width: 36,
    height: 36,
    borderRadius: Radius.md,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  codeInput: { fontSize: 20, letterSpacing: 4, fontWeight: '600' },
}));
