import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, View } from 'react-native';

import { HomePicker } from '@/components/home-picker';
import { Screen } from '@/components/screen';
import { Button, Card, Chip, Divider, ErrorBanner, Field, Icon, SectionHeader, T } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { makeStyles, useColors } from '@/providers/appearance';
import { listMembers, setActingAdmin, type Member } from '@/lib/api';
import { friendlyError } from '@/lib/supabase';
import { useAuth } from '@/providers/auth';
import { useGroups } from '@/providers/groups';

type Panel = 'none' | 'create' | 'join';

export default function HomesTab() {
  const Colors = useColors();
  const styles = useStyles();
  const { session, displayName, signOut } = useAuth();
  const groups = useGroups();
  const { homes, activeHome, isAdmin, isOwner } = groups;
  const [panel, setPanel] = useState<Panel>(homes.length ? 'none' : 'join');
  const [picked, setPicked] = useState<{ id: string; name: string } | null>(null);
  const [homeName, setHomeName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [members, setMembers] = useState<Member[]>([]);

  // People in the home being viewed.
  const loadMembers = useCallback(async () => {
    if (!activeHome) return setMembers([]);
    try {
      setMembers(await listMembers(activeHome.id));
    } catch (e) {
      setError(friendlyError(e));
    }
  }, [activeHome]);

  useFocusEffect(
    useCallback(() => {
      loadMembers();
    }, [loadMembers]),
  );

  // The creator makes someone an acting admin, or back to a member.
  async function toggleActing(m: Member) {
    if (!activeHome) return;
    setError(null);
    const acting = m.role === 'member';
    // Update the list straight away, then save.
    setMembers((prev) => prev.map((x) => (x.user_id === m.user_id ? { ...x, role: acting ? 'acting_admin' : 'member' } : x)));
    try {
      await setActingAdmin(activeHome.id, m.user_id, acting);
    } catch (e) {
      setError(friendlyError(e));
      loadMembers();
    }
  }

  async function run(fn: () => Promise<unknown>, done?: string) {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await fn();
      setPanel('none');
      setPicked(null);
      setHomeName('');
      if (done) setNotice(done);
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen title="Homes" subtitle={`Signed in as ${displayName || session?.user.email}`}>
      {homes.length > 0 && (
        <>
          <SectionHeader title={`Your homes · ${homes.length}`} />
          <View style={{ gap: Spacing.sm }}>
            {homes.map((h) => {
              const viewing = h.id === activeHome?.id;
              const roleText = h.role === 'admin' ? 'You created it (admin)' : h.role === 'acting_admin' ? 'You are an acting admin' : 'You are a member';
              return (
                <Card key={h.id} style={[styles.homeCard, viewing && styles.homeCardActive]}>
                  {/* Tap a home to see its menu, groceries and pantry (also in Settings, bottom left). */}
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
                      <T variant="small">{roleText}</T>
                    </View>
                    {viewing ? <Chip label="Viewing" selected /> : <T variant="small">View</T>}
                  </Pressable>
                </Card>
              );
            })}
          </View>
          {notice && (
            <T variant="small" style={{ color: Colors.success, marginTop: Spacing.sm }}>
              {notice}
            </T>
          )}
        </>
      )}

      {activeHome && members.length > 0 && (
        <>
          <SectionHeader title={`People in ${activeHome.name} · ${members.length}`} />
          <Card style={{ paddingVertical: Spacing.xs }}>
            {members.map((m, i) => (
              <View key={m.user_id}>
                {i > 0 && <Divider />}
                <View style={styles.memberRow}>
                  <View style={styles.avatar}>
                    <T variant="small" style={styles.avatarText}>
                      {m.display_name.slice(0, 1).toUpperCase()}
                    </T>
                  </View>
                  <T style={{ flex: 1 }}>
                    {m.display_name}
                    {m.user_id === session?.user.id ? ' (you)' : ''}
                  </T>
                  {m.role === 'admin' ? (
                    <Chip label="Admin" selected />
                  ) : isOwner ? (
                    // Only the creator can make someone an acting admin, or undo it.
                    <Chip
                      label={m.role === 'acting_admin' ? 'Acting admin' : 'Make acting admin'}
                      icon={m.role === 'acting_admin' ? 'close' : 'add'}
                      selected={m.role === 'acting_admin'}
                      onPress={() => toggleActing(m)}
                    />
                  ) : (
                    m.role === 'acting_admin' && <Chip label="Acting admin" />
                  )}
                </View>
              </View>
            ))}
          </Card>
          {isOwner ? (
            <T variant="small" style={{ marginTop: Spacing.sm }}>
              {`You created ${activeHome.name}, so you're its admin. Make someone an acting admin to give them the same access (menu, groceries, pantry, menu votes, deleting recipes); they can't make others admins, and you can undo it any time.`}
            </T>
          ) : isAdmin ? (
            <T variant="small" style={{ marginTop: Spacing.sm }}>
              {`You're an acting admin of ${activeHome.name}: you plan its menu and grocery list, see its pantry and menu votes. Only its creator can change who's an admin.`}
            </T>
          ) : null}
        </>
      )}

      {/* To see another home's menu, join it (admins included). */}
      <SectionHeader title="Add a home" />
      <View style={styles.actions}>
        <Button
          title="Join a home"
          icon="enter-outline"
          variant={panel === 'join' ? 'primary' : 'secondary'}
          onPress={() => setPanel(panel === 'join' ? 'none' : 'join')}
          style={{ flex: 1 }}
        />
        <Button
          title="Create home"
          icon="add"
          variant={panel === 'create' ? 'primary' : 'secondary'}
          onPress={() => setPanel(panel === 'create' ? 'none' : 'create')}
          style={{ flex: 1 }}
        />
      </View>

      {panel === 'join' && (
        <Card style={styles.panel}>
          <T variant="label">Home</T>
          <HomePicker value={picked} onChange={setPicked} />
          <T variant="small">{"You'll join as a member. You can belong to several homes and switch between them in Settings."}</T>
          <Button
            title="Join home"
            icon="enter-outline"
            onPress={() => run(() => (picked ? groups.joinHomeById(picked.id) : Promise.reject(new Error('Choose a home from the list first.'))))}
            loading={busy}
          />
        </Card>
      )}

      {panel === 'create' && (
        <Card style={styles.panel}>
          <Field label="Home name (required)" value={homeName} onChangeText={setHomeName} placeholder="e.g. Oak Avenue Home" maxLength={80} />
          <T variant="small">{"You'll be its admin (only a home's creator is). People join by picking it from the list."}</T>
          <Button
            title="Create home"
            icon="add"
            onPress={() => run(() => groups.createHome(homeName), `Created ${homeName.trim()}. People can now pick it from the list to join.`)}
            loading={busy}
          />
        </Card>
      )}

      <View style={{ marginTop: Spacing.md }}>
        <ErrorBanner message={error} />
      </View>

      <SectionHeader title="Account" />
      <View style={{ gap: Spacing.sm }}>
        {activeHome && (
          <Button title={`Leave ${activeHome.name}`} variant="danger" icon="exit-outline" onPress={() => run(() => groups.leaveHome(activeHome.id))} />
        )}
        <Button title="Sign out" variant="secondary" icon="log-out-outline" onPress={signOut} />
      </View>
    </Screen>
  );
}

const useStyles = makeStyles((Colors) => ({
  homeCard: { gap: Spacing.md },
  homeCardActive: { borderColor: Colors.primary, borderWidth: 2 },
  homeHeader: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  memberRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, paddingVertical: Spacing.md },
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
}));
