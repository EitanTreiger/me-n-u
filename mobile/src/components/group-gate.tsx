import { router } from 'expo-router';
import { useState, type ReactNode } from 'react';
import { View } from 'react-native';

import { Radius, Spacing } from '@/constants/theme';
import { makeStyles, useColors } from '@/providers/appearance';
import { friendlyError } from '@/lib/supabase';
import { useAuth } from '@/providers/auth';
import { useGroups } from '@/providers/groups';

import { Screen } from './screen';
import { HomePicker } from './home-picker';
import { Button, Card, EmptyState, ErrorBanner, Field, Icon, Loading, T, type IconName } from './ui';

/**
 * Renders children only when the user belongs to a home. Otherwise (right
 * after sign-up, or after leaving their last home) it shows the
 * create-or-join choice in place. `adminOnly` pages (groceries) are
 * for the home's admins; their tabs are hidden from everyone else, and this
 * covers opening them another way (a link, or switching homes).
 */
export function GroupGate({ title, children, adminOnly }: { title: string; children: ReactNode; adminOnly?: boolean }) {
  const { activeHome, isAdmin, loading } = useGroups();
  if (loading) return <Loading />;
  if (!activeHome) return <HomeSetup title={title} />;
  if (adminOnly && !isAdmin) {
    return (
      <Screen title={title}>
        <Card>
          <EmptyState
            icon="lock-closed-outline"
            title="For admins only"
            body={`Only the admins of ${activeHome.name} can see its ${title.toLowerCase()}.`}
            action={<Button title="Go to recipes" onPress={() => router.navigate('/')} />}
          />
        </Card>
      </Screen>
    );
  }
  return <>{children}</>;
}

/**
 * First step after signing in: choose to join an existing home (picked from
 * the list, as a member) or create one (you name it and become its admin;
 * creating a home is the only way to be an admin).
 */
export function HomeSetup({ title }: { title: string }) {
  const Colors = useColors();
  const styles = useStyles();
  const { displayName } = useAuth();
  const { createHome, joinHomeById } = useGroups();
  const [choice, setChoice] = useState<'join' | 'create' | null>(null);
  const [name, setName] = useState('');
  const [picked, setPicked] = useState<{ id: string; name: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function choose(next: 'join' | 'create' | null) {
    setChoice(next);
    setError(null);
  }

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      if (choice === 'create') await createHome(name);
      else if (picked) await joinHomeById(picked.id);
      else throw new Error('Choose your home from the list first.');
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
          Each home has its own weekly menu and grocery list. Recipes, ratings and photos are shared by every home.
        </T>
      </View>

      {choice === null ? (
        // Step 1: join or create.
        <View style={styles.options}>
          <T variant="subheading">Are you joining a home or creating one?</T>
          <ChoiceCard
            icon="enter-outline"
            title="Join a home"
            body="Pick your home from the list. You'll be a member: you'll see its weekly menu, and can vote for meals and rate recipes."
            onPress={() => choose('join')}
          />
          <ChoiceCard
            icon="home-outline"
            title="Create a home"
            body="Name a new home. You'll be its admin: you plan its menu and grocery list and see its menu votes."
            onPress={() => choose('create')}
          />
        </View>
      ) : (
        // Step 2: the form for that choice.
        <Card style={styles.option}>
          <View style={styles.optionHeader}>
            <View style={styles.optionIcon}>
              <Icon name={choice === 'join' ? 'enter-outline' : 'home-outline'} size={20} color={Colors.onPrimary} />
            </View>
            <T variant="subheading">{choice === 'join' ? 'Join a home' : 'Create a home'}</T>
          </View>
          {choice === 'join' ? (
            <>
              <T variant="label">Your home</T>
              <HomePicker value={picked} onChange={setPicked} />
              <T variant="small">{"You'll join as a member."}</T>
            </>
          ) : (
            <>
              <Field label="Home name (required)" value={name} onChangeText={setName} placeholder="e.g. Maple Street Home" maxLength={80} onSubmitEditing={submit} />
              <T variant="small">{"You'll be its admin: you plan its menu, run its grocery list and can make others acting admins."}</T>
            </>
          )}
          <ErrorBanner message={error} />
          <View style={styles.formActions}>
            <Button title="Back" variant="secondary" onPress={() => choose(null)} disabled={busy} style={{ flex: 1 }} />
            <Button
              title={choice === 'join' ? 'Join home' : 'Create home'}
              icon={choice === 'join' ? 'enter-outline' : 'add'}
              onPress={submit}
              loading={busy}
              style={{ flex: 2 }}
            />
          </View>
        </Card>
      )}
    </Screen>
  );
}

function ChoiceCard({ icon, title, body, onPress }: { icon: IconName; title: string; body: string; onPress: () => void }) {
  const Colors = useColors();
  const styles = useStyles();
  return (
    <Card onPress={onPress} style={styles.option}>
      <View style={styles.optionHeader}>
        <View style={styles.optionIcon}>
          <Icon name={icon} size={20} color={Colors.onPrimary} />
        </View>
        <T variant="subheading" style={{ flex: 1 }}>
          {title}
        </T>
        <Icon name="chevron-forward" size={20} color={Colors.textMuted} />
      </View>
      <T variant="small">{body}</T>
    </Card>
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
  formActions: { flexDirection: 'row', gap: Spacing.sm },
}));
