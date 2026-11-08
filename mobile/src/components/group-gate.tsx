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
            title="No homes yet"
            body={isAdmin ? 'Add a home on the Groups page to plan its menu.' : 'An admin needs to add a home first.'}
            action={isAdmin ? <Button title="Go to Groups" onPress={() => router.navigate('/groups')} /> : undefined}
          />
        </Card>
      </Screen>
    );
  }
  return <>{children}</>;
}

export function CommunitySetup({ title }: { title: string }) {
  const Colors = useColors();
  const styles = useStyles();
  const { displayName } = useAuth();
  const { createGroup, joinHome } = useGroups();
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState<'create' | 'join' | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run(kind: 'create' | 'join') {
    setBusy(kind);
    setError(null);
    try {
      if (kind === 'create') await createGroup(name, '');
      else await joinHome(code);
    } catch (e) {
      setError(friendlyError(e));
      setBusy(null);
    }
  }

  return (
    <Screen title={title}>
      <View style={styles.intro}>
        <T variant="heading">Welcome{displayName ? `, ${displayName}` : ''}!</T>
        <T variant="small">
          A community shares one recipe book, and each home in it has its own weekly menu, grocery list and pantry. Start a
          community, or join your home with the code or link from an admin.
        </T>
      </View>

      {/* Stacked on every screen size: start first, join below. */}
      <View style={styles.options}>
        <Card style={styles.option}>
          <View style={styles.optionHeader}>
            <View style={styles.optionIcon}>
              <Icon name="home-outline" size={20} color={Colors.onPrimary} />
            </View>
            <T variant="subheading">Start a community</T>
          </View>
          <T variant="small">
            {"You'll be its admin: you add homes, plan their menus, invite people and can make others admins. Your first home gets the same name; you can add more later."}
          </T>
          <Field label="Community name" value={name} onChangeText={setName} placeholder="e.g. Maple Street Home" />
          <Button title="Create community" icon="add" onPress={() => run('create')} loading={busy === 'create'} disabled={!name.trim() || !!busy} />
        </Card>

        <Card style={styles.option}>
          <View style={styles.optionHeader}>
            <View style={styles.optionIcon}>
              <Icon name="enter-outline" size={20} color={Colors.onPrimary} />
            </View>
            <T variant="subheading">Join your home</T>
          </View>
          <T variant="small">
            {
              "You'll join as a member: you can share and rate recipes, vote for the menu and use the grocery list. An admin can make you an admin later."
            }
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
          <Button
            title="Join home"
            icon="enter-outline"
            variant="secondary"
            onPress={() => run('join')}
            loading={busy === 'join'}
            disabled={code.trim().length < 6 || !!busy}
          />
        </Card>
      </View>
      <View style={{ marginTop: Spacing.md }}>
        <ErrorBanner message={error} />
      </View>
    </Screen>
  );
}

const useStyles = makeStyles((Colors) => ({
  intro: { gap: Spacing.xs, marginBottom: Spacing.lg },
  options: { gap: Spacing.md },
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
