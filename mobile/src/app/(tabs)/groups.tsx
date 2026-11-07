import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, Share, StyleSheet, View } from 'react-native';

import { Screen } from '@/components/screen';
import { Button, Card, Chip, Divider, ErrorBanner, Field, Icon, SectionHeader, T } from '@/components/ui';
import { Colors, Radius, Spacing } from '@/constants/theme';
import { listMembers, setMemberRole, type Member } from '@/lib/api';
import { friendlyError } from '@/lib/supabase';
import { useAuth } from '@/providers/auth';
import { useGroups } from '@/providers/groups';

type Panel = 'none' | 'create' | 'join';

export default function GroupsTab() {
  const { session, displayName, signOut } = useAuth();
  const groups = useGroups();
  const { active, isAdmin } = groups;
  const [panel, setPanel] = useState<Panel>(groups.memberships.length ? 'none' : 'join');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
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

  async function toggleRole(m: Member) {
    if (!active) return;
    const next = m.role === 'admin' ? 'member' : 'admin';
    if (next === 'member' && members.filter((x) => x.role === 'admin').length <= 1) {
      setError('A group needs at least one admin.');
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

  return (
    <Screen title="Groups" subtitle={`Signed in as ${displayName || session?.user.email}`}>
      {active && (
        <Card style={styles.activeCard}>
          <View style={styles.activeHeader}>
            <View style={styles.groupIcon}>
              <Icon name="home" size={22} color={Colors.onPrimary} />
            </View>
            <View style={{ flex: 1 }}>
              <T variant="heading" numberOfLines={1}>
                {active.name}
              </T>
              {!!active.description && <T variant="small">{active.description}</T>}
            </View>
            <Chip label={isAdmin ? 'Admin' : 'Member'} selected={isAdmin} />
          </View>
          <Divider />
          <View style={styles.inviteRow}>
            <View style={{ flex: 1, gap: 2 }}>
              <T variant="label">Invite code</T>
              <T style={styles.code} >{active.invite_code}</T>
            </View>
            <Button
              title="Share"
              icon="share-outline"
              variant="secondary"
              compact
              onPress={() =>
                Share.share({
                  message: `Join "${active.name}" on Shared Kitchen with invite code ${active.invite_code}`,
                })
              }
            />
          </View>
        </Card>
      )}

      {groups.memberships.length > 1 && (
        <>
          <SectionHeader title="Switch group" />
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
                  <T style={{ flex: 1 }}>
                    {m.display_name}
                    {m.user_id === session?.user.id ? ' (you)' : ''}
                  </T>
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
              Tap a role to make someone an admin. Admins plan the weekly menu and grocery list.
            </T>
          )}
        </>
      )}

      <SectionHeader title={groups.memberships.length ? 'Add another group' : 'Get started'} />
      <View style={styles.actions}>
        <Button
          title="Join with code"
          icon="enter-outline"
          variant={panel === 'join' ? 'primary' : 'secondary'}
          onPress={() => setPanel(panel === 'join' ? 'none' : 'join')}
          style={{ flex: 1 }}
        />
        <Button
          title="Create group"
          icon="add"
          variant={panel === 'create' ? 'primary' : 'secondary'}
          onPress={() => setPanel(panel === 'create' ? 'none' : 'create')}
          style={{ flex: 1 }}
        />
      </View>

      {panel === 'join' && (
        <Card style={styles.panel}>
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
          <Button title="Join group" onPress={() => run(() => groups.joinGroup(code))} loading={busy} disabled={code.trim().length < 6} />
        </Card>
      )}

      {panel === 'create' && (
        <Card style={styles.panel}>
          <Field label="Group name" value={name} onChangeText={setName} placeholder="e.g. Maple Street Home" />
          <Field label="Description (optional)" value={description} onChangeText={setDescription} placeholder="Who's in this group?" />
          <T variant="small">{"You'll be the admin. Share the invite code so others can join."}</T>
          <Button title="Create group" onPress={() => run(() => groups.createGroup(name, description))} loading={busy} disabled={!name.trim()} />
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

const styles = StyleSheet.create({
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
});
