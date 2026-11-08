import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, View } from 'react-native';

import { HomePicker } from '@/components/home-picker';
import { Screen } from '@/components/screen';
import { Button, Card, Chip, Divider, ErrorBanner, Field, Icon, SectionHeader, T } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { makeStyles, useColors } from '@/providers/appearance';
import { listMembers, type Member } from '@/lib/api';
import { joinLink, shareInvite } from '@/lib/join-link';
import { friendlyError } from '@/lib/supabase';
import type { Home } from '@/lib/types';
import { useAuth } from '@/providers/auth';
import { useGroups } from '@/providers/groups';

type Panel = 'none' | 'create' | 'join';

export default function HomesTab() {
  const Colors = useColors();
  const styles = useStyles();
  const { session, displayName, signOut } = useAuth();
  const groups = useGroups();
  const { homes, activeHome, isAdmin } = groups;
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

  async function share(home: Home) {
    setError(null);
    try {
      const result = await shareInvite(home.name, home.invite_code);
      setNotice(result === 'copied' ? `Join link for ${home.name} copied: ${joinLink(home.invite_code)}` : null);
    } catch (e) {
      setError(friendlyError(e));
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
              const admin = h.role === 'admin';
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
                      <T variant="small">{admin ? 'You are an admin' : 'You are a member'}</T>
                    </View>
                    {viewing ? <Chip label="Viewing" selected /> : <T variant="small">View</T>}
                  </Pressable>
                  {/* A home's code is only shown to its own admins. */}
                  {admin && (
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
                  {/* Only the person who created the home is its admin. */}
                  {m.role === 'admin' && <Chip label="Admin" selected />}
                </View>
              </View>
            ))}
          </Card>
          {isAdmin && (
            <T variant="small" style={{ marginTop: Spacing.sm }}>
              {`You created ${activeHome.name}, so you're its admin: you plan its menu and grocery list and see its menu votes. It gives you nothing in other homes.`}
            </T>
          )}
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
          <T variant="small">{"You'll be its admin (only a home's creator is). People can then pick it from the list, or use its link."}</T>
          <Button
            title="Create home"
            icon="add"
            onPress={() => run(() => groups.createHome(homeName), `Created ${homeName.trim()}. Share its code or link so people can join.`)}
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
  inviteRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  code: { fontSize: 22, fontWeight: '700', letterSpacing: 4, fontFamily: 'monospace' },
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
