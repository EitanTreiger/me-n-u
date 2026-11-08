import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, View } from 'react-native';

import { Screen } from '@/components/screen';
import { Button, Card, Chip, Divider, ErrorBanner, Field, Icon, SectionHeader, T } from '@/components/ui';
import { Radius, Spacing } from '@/constants/theme';
import { makeStyles, useColors } from '@/providers/appearance';
import { listMembers, setMemberRole, type Member } from '@/lib/api';
import { joinLink, shareInvite } from '@/lib/join-link';
import { friendlyError } from '@/lib/supabase';
import type { Home } from '@/lib/types';
import { useAuth } from '@/providers/auth';
import { useGroups } from '@/providers/groups';

type Panel = 'none' | 'create' | 'join';

export default function GroupsTab() {
  const Colors = useColors();
  const styles = useStyles();
  const { session, displayName, signOut } = useAuth();
  const groups = useGroups();
  const { active, isAdmin, homes, activeHome } = groups;
  const [panel, setPanel] = useState<Panel>(groups.memberships.length ? 'none' : 'join');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [code, setCode] = useState('');
  const [homeName, setHomeName] = useState('');
  const [addingHome, setAddingHome] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [members, setMembers] = useState<Member[]>([]);

  const loadMembers = useCallback(async () => {
    if (!active) return setMembers([]);
    try {
      setMembers(await listMembers(active.id));
    } catch (e) {
      setError(friendlyError(e));
    }
  }, [active]);

  useFocusEffect(
    useCallback(() => {
      loadMembers();
    }, [loadMembers]),
  );

  async function run(fn: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await fn();
      setPanel('none');
      setName('');
      setDescription('');
      setCode('');
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setBusy(false);
    }
  }

  async function addHome() {
    setAddingHome(true);
    setError(null);
    try {
      const home = await groups.createHome(homeName);
      setHomeName('');
      setNotice(`Added ${home.name}. Share its code or link so people can join it.`);
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setAddingHome(false);
    }
  }

  async function share(home: Home) {
    setError(null);
    try {
      const result = await shareInvite(home.name, home.invite_code);
      setNotice(result === 'copied' ? `Join link for ${home.name} copied: ${joinLink(home.invite_code)}` : null);
    } catch (e) {
      setError(friendlyError(e));
    }
  }

  async function toggleRole(m: Member) {
    if (!active) return;
    const next = m.role === 'admin' ? 'member' : 'admin';
    if (next === 'member' && members.filter((x) => x.role === 'admin').length <= 1) {
      setError('A community needs at least one admin.');
      return;
    }
    try {
      await setMemberRole(active.id, m.user_id, next);
      await loadMembers();
      if (m.user_id === session?.user.id) await groups.refresh();
    } catch (e) {
      setError(friendlyError(e));
    }
  }

  // "Maple St Home, Oak Ave Home" for a member's homes.
  const homesOf = (userId: string) =>
    homes
      .filter((h) => h.members.includes(userId))
      .map((h) => h.name)
      .join(', ');

  return (
    <Screen title="Groups" subtitle={`Signed in as ${displayName || session?.user.email}`}>
      {active && (
        <Card style={styles.activeCard}>
          <View style={styles.activeHeader}>
            <View style={styles.groupIcon}>
              <Icon name="people" size={22} color={Colors.onPrimary} />
            </View>
            <View style={{ flex: 1 }}>
              <T variant="label">Community</T>
              <T variant="heading" numberOfLines={1}>
                {active.name}
              </T>
              {!!active.description && <T variant="small">{active.description}</T>}
            </View>
            <Chip label={isAdmin ? 'Admin' : 'Member'} selected={isAdmin} />
          </View>
          <T variant="small">Recipes are shared by every home in the community. Each home has its own menu, groceries and pantry.</T>
        </Card>
      )}

      {active && (
        <>
          <SectionHeader title={`Homes · ${homes.length}`} />
          <View style={{ gap: Spacing.sm }}>
            {homes.map((h) => {
              const viewing = h.id === activeHome?.id;
              const mine = !!session && h.members.includes(session.user.id);
              return (
                <Card key={h.id} style={[styles.homeCard, viewing && styles.homeCardActive]}>
                  {/* Tap a home to see its menu, groceries and pantry. */}
                  <Pressable
                    onPress={() => groups.setActiveHome(h.id)}
                    accessibilityRole="button"
                    accessibilityState={{ selected: viewing }}
                    style={({ pressed }) => [styles.homeHeader, pressed && { opacity: 0.6 }]}>
                    <Icon name={viewing ? 'home' : 'home-outline'} size={20} color={Colors.primaryStrong} />
                    <View style={{ flex: 1 }}>
                      <T variant="subheading" numberOfLines={1}>
                        {h.name}
                      </T>
                      <T variant="small">
                        {h.members.length} {h.members.length === 1 ? 'person' : 'people'}
                        {mine ? ' · your home' : ''}
                      </T>
                    </View>
                    {viewing ? <Chip label="Viewing" selected /> : <T variant="small">View</T>}
                  </Pressable>
                  {/* Only admins see and share a home's code. */}
                  {isAdmin && (
                    <>
                      <Divider />
                      <View style={styles.inviteRow}>
                        <View style={{ flex: 1, gap: 2 }}>
                          <T variant="label">Home code</T>
                          <T style={styles.code}>{h.invite_code}</T>
                        </View>
                        <Button title="Share link" icon="share-outline" variant="secondary" compact onPress={() => share(h)} />
                      </View>
                    </>
                  )}
                </Card>
              );
            })}
          </View>
          {isAdmin && (
            <Card style={styles.panel}>
              <Field label="Add a home" value={homeName} onChangeText={setHomeName} placeholder="e.g. Oak Avenue Home" />
              <Button title="Add home" icon="add" onPress={addHome} loading={addingHome} disabled={!homeName.trim()} />
            </Card>
          )}
          {notice && (
            <T variant="small" style={{ color: Colors.success, marginTop: Spacing.sm }}>
              {notice}
            </T>
          )}
        </>
      )}

      {groups.memberships.length > 1 && (
        <>
          <SectionHeader title="Switch community" />
          <Card style={{ paddingVertical: Spacing.xs }}>
            {groups.memberships.map((g, i) => {
              const selected = g.id === active?.id;
              return (
                <View key={g.id}>
                  {i > 0 && <Divider />}
                  <Pressable onPress={() => groups.setActive(g.id)} style={({ pressed }) => [styles.groupRow, pressed && { opacity: 0.6 }]}>
                    <Icon name={selected ? 'radio-button-on' : 'radio-button-off'} size={20} color={selected ? Colors.primaryStrong : Colors.borderStrong} />
                    <T style={{ flex: 1, fontWeight: selected ? '600' : '400' }}>{g.name}</T>
                    {g.role === 'admin' && <T variant="small">Admin</T>}
                  </Pressable>
                </View>
              );
            })}
          </Card>
        </>
      )}

      {active && members.length > 0 && (
        <>
          <SectionHeader title={`Members · ${members.length}`} />
          <Card style={{ paddingVertical: Spacing.xs }}>
            {members.map((m, i) => (
              <View key={m.user_id}>
                {i > 0 && <Divider />}
                <View style={styles.groupRow}>
                  <View style={styles.avatar}>
                    <T variant="small" style={styles.avatarText}>
                      {m.display_name.slice(0, 1).toUpperCase()}
                    </T>
                  </View>
                  <View style={{ flex: 1 }}>
                    <T>
                      {m.display_name}
                      {m.user_id === session?.user.id ? ' (you)' : ''}
                    </T>
                    {!!homesOf(m.user_id) && <T variant="small">{homesOf(m.user_id)}</T>}
                  </View>
                  {isAdmin ? (
                    <Chip label={m.role === 'admin' ? 'Admin' : 'Member'} selected={m.role === 'admin'} onPress={() => toggleRole(m)} />
                  ) : (
                    m.role === 'admin' && <T variant="small">Admin</T>
                  )}
                </View>
              </View>
            ))}
          </Card>
          {isAdmin && (
            <T variant="small" style={{ marginTop: Spacing.sm }}>
              Tap a role to make someone an admin. Admins add homes and plan each home&apos;s menu and grocery list.
            </T>
          )}
        </>
      )}

      <SectionHeader title={groups.memberships.length ? 'Join or start another' : 'Get started'} />
      <View style={styles.actions}>
        <Button
          title="Join a home"
          icon="enter-outline"
          variant={panel === 'join' ? 'primary' : 'secondary'}
          onPress={() => setPanel(panel === 'join' ? 'none' : 'join')}
          style={{ flex: 1 }}
        />
        <Button
          title="New community"
          icon="add"
          variant={panel === 'create' ? 'primary' : 'secondary'}
          onPress={() => setPanel(panel === 'create' ? 'none' : 'create')}
          style={{ flex: 1 }}
        />
      </View>

      {panel === 'join' && (
        <Card style={styles.panel}>
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
          <Button title="Join home" onPress={() => run(() => groups.joinHome(code))} loading={busy} disabled={code.trim().length < 6} />
        </Card>
      )}

      {panel === 'create' && (
        <Card style={styles.panel}>
          <Field label="Community name" value={name} onChangeText={setName} placeholder="e.g. Thresholds" />
          <Field label="Description (optional)" value={description} onChangeText={setDescription} placeholder="Who's in this community?" />
          <T variant="small">{"You'll be the admin. It starts with one home of the same name; add more homes and share each home's link."}</T>
          <Button title="Create community" onPress={() => run(() => groups.createGroup(name, description))} loading={busy} disabled={!name.trim()} />
        </Card>
      )}

      <View style={{ marginTop: Spacing.md }}>
        <ErrorBanner message={error} />
      </View>

      <SectionHeader title="Account" />
      <View style={{ gap: Spacing.sm }}>
        {active && (
          <Button title={`Leave ${active.name}`} variant="danger" icon="exit-outline" onPress={() => run(() => groups.leaveGroup(active.id))} />
        )}
        <Button title="Sign out" variant="secondary" icon="log-out-outline" onPress={signOut} />
      </View>
    </Screen>
  );
}

const useStyles = makeStyles((Colors) => ({
  activeCard: { gap: Spacing.md },
  activeHeader: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  groupIcon: {
    width: 44,
    height: 44,
    borderRadius: Radius.md,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  homeCard: { gap: Spacing.md },
  homeCardActive: { borderColor: Colors.primary, borderWidth: 2 },
  homeHeader: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  inviteRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  code: { fontSize: 22, fontWeight: '700', letterSpacing: 4, fontFamily: 'monospace' },
  groupRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, paddingVertical: Spacing.md },
  avatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: Colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { color: Colors.primaryStrong, fontWeight: '700' },
  actions: { flexDirection: 'row', gap: Spacing.sm },
  panel: { gap: Spacing.md, marginTop: Spacing.md },
  codeInput: { fontSize: 20, letterSpacing: 4, fontWeight: '600' },
}));
