import { useState, type ReactNode } from 'react';
import { View } from 'react-native';

import { Radius, Spacing } from '@/constants/theme';
import { makeStyles, useColors } from '@/providers/appearance';
import { friendlyError } from '@/lib/supabase';
import { useAuth } from '@/providers/auth';
import { useGroups } from '@/providers/groups';

import { Screen } from './screen';
import { Button, Card, ErrorBanner, Field, Icon, Loading, T } from './ui';

/**
 * Renders children only when the user belongs to a home. Otherwise (right
 * after sign-up, or after leaving their last home) it shows the
 * create-or-join choice in place.
 */
export function GroupGate({ title, children }: { title: string; children: ReactNode }) {
  const { activeHome, loading } = useGroups();
  if (loading) return <Loading />;
  if (!activeHome) return <HomeSetup title={title} />;
  return <>{children}</>;
}

/**
 * Create a home (you become its admin) or join one with its code. Join
 * links (/join/<code>) skip this screen.
 */
export function HomeSetup({ title }: { title: string }) {
  const Colors = useColors();
  const styles = useStyles();
  const { displayName } = useAuth();
  const { createHome, joinHome } = useGroups();
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState<'create' | 'join' | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run(kind: 'create' | 'join') {
    setBusy(kind);
    setError(null);
    try {
      if (kind === 'create') await createHome(name);
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
          Each home has its own weekly menu, grocery list and pantry. Recipes, ratings and photos are shared by every home.
          Create your home, or join it with the code or link from its admin.
        </T>
      </View>

      {/* Stacked on every screen size: join first (most people), create below. */}
      <View style={styles.options}>
        <Card style={styles.option}>
          <View style={styles.optionHeader}>
            <View style={styles.optionIcon}>
              <Icon name="enter-outline" size={20} color={Colors.onPrimary} />
            </View>
            <T variant="subheading">Join a home</T>
          </View>
          <T variant="small">
            {"You'll join as a member: you'll see its menu, grocery list and pantry, and can vote for meals."}
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
            onPress={() => run('join')}
            loading={busy === 'join'}
            disabled={code.trim().length < 6 || !!busy}
          />
        </Card>

        <Card style={styles.option}>
          <View style={styles.optionHeader}>
            <View style={styles.optionIcon}>
              <Icon name="home-outline" size={20} color={Colors.onPrimary} />
            </View>
            <T variant="subheading">Create a home</T>
          </View>
          <T variant="small">
            {"You'll be its admin: you plan its menu and grocery list, see its menu votes, and share its link so others can join."}
          </T>
          <Field label="Home name (required)" value={name} onChangeText={setName} placeholder="e.g. Maple Street Home" maxLength={80} />
          <Button
            title="Create home"
            icon="add"
            variant="secondary"
            onPress={() => run('create')}
            loading={busy === 'create'}
            disabled={!!busy}
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
