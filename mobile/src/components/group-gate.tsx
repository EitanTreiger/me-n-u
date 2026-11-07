import { useState, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { Colors, Radius, Spacing } from '@/constants/theme';
import { useLayout } from '@/hooks/use-layout';
import { friendlyError } from '@/lib/supabase';
import { useAuth } from '@/providers/auth';
import { useGroups } from '@/providers/groups';

import { Screen } from './screen';
import { Button, Card, ErrorBanner, Field, Icon, Loading, T } from './ui';

/**
 * Renders children only when the user belongs to a community. Otherwise
 * (right after sign-up, or after leaving their only community) it shows the
 * create-or-join choice in place.
 */
export function GroupGate({ title, children }: { title: string; children: ReactNode }) {
  const { active, loading } = useGroups();
  if (loading) return <Loading />;
  if (!active) return <CommunitySetup title={title} />;
  return <>{children}</>;
}

function CommunitySetup({ title }: { title: string }) {
  const { displayName } = useAuth();
  const { createGroup, joinGroup } = useGroups();
  const { wide } = useLayout();
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState<'create' | 'join' | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run(kind: 'create' | 'join') {
    setBusy(kind);
    setError(null);
    try {
      if (kind === 'create') await createGroup(name, '');
      else await joinGroup(code);
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
          Recipes, weekly menus and grocery lists are shared inside a community, like your home. Start one, or join one with
          an invite code from its admin.
        </T>
      </View>

      <View style={[styles.options, wide && styles.optionsWide]}>
        <Card style={styles.option}>
          <View style={styles.optionHeader}>
            <View style={styles.optionIcon}>
              <Icon name="home-outline" size={20} color={Colors.onPrimary} />
            </View>
            <T variant="subheading">Start a community</T>
          </View>
          <T variant="small">
            {"You'll be its admin: you plan the weekly menu, invite people and can make others admins."}
          </T>
          <Field label="Community name" value={name} onChangeText={setName} placeholder="e.g. Maple Street Home" />
          <Button title="Create community" icon="add" onPress={() => run('create')} loading={busy === 'create'} disabled={!name.trim() || !!busy} />
        </Card>

        <Card style={styles.option}>
          <View style={styles.optionHeader}>
            <View style={styles.optionIcon}>
              <Icon name="enter-outline" size={20} color={Colors.onPrimary} />
            </View>
            <T variant="subheading">Join with a code</T>
          </View>
          <T variant="small">
            {
              "You'll join as a member: you can share and rate recipes, vote for the menu and use the grocery list. An admin can make you an admin later."
            }
          </T>
          <Field
            label="Invite code"
            value={code}
            onChangeText={(v) => setCode(v.toUpperCase())}
            placeholder="ABC234"
            autoCapitalize="characters"
            autoCorrect={false}
            maxLength={6}
            style={styles.codeInput}
          />
          <Button
            title="Join community"
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

const styles = StyleSheet.create({
  intro: { gap: Spacing.xs, marginBottom: Spacing.lg },
  options: { gap: Spacing.md },
  optionsWide: { flexDirection: 'row', alignItems: 'stretch' },
  option: { flex: 1, gap: Spacing.md },
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
});
