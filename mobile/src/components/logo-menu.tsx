import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { useState } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, View } from 'react-native';

import { Radius, Spacing } from '@/constants/theme';
import { removeAvatar, uploadAvatar } from '@/lib/api';
import { avatarUrl, friendlyError } from '@/lib/supabase';
import { makeStyles, useAppearance, useColors, type AppearancePreference } from '@/providers/appearance';
import { useAuth } from '@/providers/auth';
import { useGroups } from '@/providers/groups';

import { Divider, Icon, T, type IconName } from './ui';

const WORDMARK = require('@/assets/images/logo-wordmark.png');

const SETTINGS_OPTIONS: { label: string; icon: IconName; value: string }[] = [
  { label: 'Change name', icon: 'person-outline', value: '' },
  { label: 'Notifications', icon: 'notifications-outline', value: 'On' },
  { label: 'Help & feedback', icon: 'help-circle-outline', value: '' },
];

const APPEARANCE_OPTIONS: { label: string; value: AppearancePreference }[] = [
  { label: 'System', value: 'system' },
  { label: 'Light', value: 'light' },
  { label: 'Dark', value: 'dark' },
];

/** The logo is one dark green, so in dark mode it's tinted light sage to stay readable. */
function useLogoTint() {
  const { scheme, colors } = useAppearance();
  return scheme === 'dark' ? colors.primaryStrong : undefined;
}

/**
 * The signed-in user's profile picture: the one they uploaded, else a plain
 * circle with a person icon until they add one (Settings → Add photo).
 */
export function Avatar({ size = 36 }: { size?: number }) {
  const Colors = useColors();
  const styles = useStyles();
  const { avatarPath } = useAuth();
  const photo = avatarUrl(avatarPath);
  const circle = { width: size, height: size, borderRadius: size / 2 };
  if (photo) {
    return <Image source={{ uri: photo }} style={[styles.avatar, circle]} contentFit="cover" accessibilityLabel="Your profile picture" />;
  }
  return (
    <View style={[styles.avatar, styles.avatarEmpty, circle]} accessibilityLabel="No profile picture yet">
      <Icon name="person" size={size * 0.55} color={Colors.textMuted} />
    </View>
  );
}

/** Logo with the "me-n-u" name beside it, as on the sign-in screen (top of the sidebar). */
export function Wordmark({ height = 40 }: { height?: number }) {
  const tint = useLogoTint();
  // Source is 773x240.
  return (
    <Image
      source={WORDMARK}
      style={{ width: (height * 773) / 240, height }}
      tintColor={tint}
      contentFit="contain"
      accessibilityLabel="me-n-u"
    />
  );
}

/**
 * Bottom-left profile picture under the tabs: opens the Settings menu (account and
 * Sign out). On phones `compact` keeps it small enough to sit in the tab bar.
 */
export function SettingsLogo({ compact = false }: { compact?: boolean }) {
  const Colors = useColors();
  const styles = useStyles();
  const { session, displayName, avatarPath, refreshProfile, signOut } = useAuth();
  const { homes, activeHome, setActiveHome } = useGroups();
  const { preference, setPreference } = useAppearance();
  const [open, setOpen] = useState(false);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const userId = session?.user.id;

  // Pick a picture, crop it square, and make it the profile picture.
  async function changePhoto() {
    if (!userId) return;
    setPhotoError(null);
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) return setPhotoError('Allow photo access to choose a profile picture.');
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: true, aspect: [1, 1], quality: 0.7 });
    const asset = result.canceled ? null : result.assets[0];
    if (!asset) return;
    setPhotoBusy(true);
    try {
      await uploadAvatar(userId, asset.uri, asset.mimeType ?? 'image/jpeg', avatarPath);
      await refreshProfile();
    } catch (e) {
      setPhotoError(friendlyError(e));
    } finally {
      setPhotoBusy(false);
    }
  }

  async function deletePhoto() {
    if (!userId || !avatarPath) return;
    setPhotoError(null);
    setPhotoBusy(true);
    try {
      await removeAvatar(userId, avatarPath);
      await refreshProfile();
    } catch (e) {
      setPhotoError(friendlyError(e));
    } finally {
      setPhotoBusy(false);
    }
  }

  return (
    <>
      <Pressable
        onPress={() => setOpen(true)}
        accessibilityRole="button"
        accessibilityLabel="Settings"
        hitSlop={6}
        style={({ pressed }) => [styles.button, compact && styles.buttonCompact, pressed && { opacity: 0.7 }]}>
        <Avatar size={compact ? 30 : 36} />
        {!compact && (
          <T variant="small" numberOfLines={1} style={styles.name}>
            {displayName || session?.user.email}
          </T>
        )}
      </Pressable>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        {/* Tap anywhere outside the menu to close it. */}
        <Pressable style={styles.backdrop} onPress={() => setOpen(false)} accessibilityLabel="Close settings">
          <View style={styles.menu} onStartShouldSetResponder={() => true}>
            <View style={styles.account}>
              <T variant="label">Settings</T>
              <View style={styles.accountRow}>
                {/* Tap the picture to change it. */}
                <Pressable
                  onPress={changePhoto}
                  disabled={photoBusy}
                  accessibilityRole="button"
                  accessibilityLabel="Change profile picture"
                  style={({ pressed }) => pressed && { opacity: 0.7 }}>
                  <Avatar size={48} />
                  <View style={styles.cameraBadge}>
                    {photoBusy ? (
                      <ActivityIndicator size="small" color={Colors.onPrimary} />
                    ) : (
                      <Icon name="camera" size={12} color={Colors.onPrimary} />
                    )}
                  </View>
                </Pressable>
                <View style={{ flex: 1, gap: 2 }}>
                  <T variant="subheading" numberOfLines={1}>
                    {displayName || 'Signed in'}
                  </T>
                  {!!session?.user.email && (
                    <T variant="small" numberOfLines={1}>
                      {session.user.email}
                    </T>
                  )}
                  <View style={styles.photoLinks}>
                    <Pressable onPress={changePhoto} disabled={photoBusy} accessibilityRole="button" hitSlop={4}>
                      <T variant="small" style={styles.photoLink}>
                        {avatarPath ? 'Change photo' : 'Add photo'}
                      </T>
                    </Pressable>
                    {!!avatarPath && (
                      <Pressable onPress={deletePhoto} disabled={photoBusy} accessibilityRole="button" hitSlop={4}>
                        <T variant="small" style={[styles.photoLink, { color: Colors.danger }]}>
                          Remove
                        </T>
                      </Pressable>
                    )}
                  </View>
                </View>
              </View>
              {photoError && (
                <T variant="small" style={{ color: Colors.danger }}>
                  {photoError}
                </T>
              )}
            </View>
            {/* Switch between the homes you belong to. */}
            {homes.length > 0 && (
              <>
                <Divider />
                <View style={styles.homes} accessibilityRole="radiogroup">
                  <T variant="label" style={styles.homesLabel}>
                    Your homes
                  </T>
                  <ScrollView style={styles.homesList}>
                  {homes.map((h) => {
                    const selected = h.id === activeHome?.id;
                    return (
                      <Pressable
                        key={h.id}
                        onPress={() => {
                          setActiveHome(h.id);
                          setOpen(false);
                        }}
                        accessibilityRole="radio"
                        accessibilityState={{ selected }}
                        style={({ pressed }) => [styles.item, styles.homeItem, pressed && { backgroundColor: Colors.primarySoft }]}>
                        <Icon
                          name={selected ? 'radio-button-on' : 'radio-button-off'}
                          size={18}
                          color={selected ? Colors.primaryStrong : Colors.borderStrong}
                        />
                        <T style={{ flex: 1, fontWeight: selected ? '600' : '400' }} numberOfLines={1}>
                          {h.name}
                        </T>
                        {h.role === 'admin' && (
                          <T variant="small" style={{ color: Colors.textMuted }}>
                            Admin
                          </T>
                        )}
                      </Pressable>
                    );
                  })}
                  </ScrollView>
                </View>
              </>
            )}
            <Divider />
            <View style={styles.appearance}>
              <View style={styles.appearanceLabel}>
                <Icon name="contrast-outline" size={18} color={Colors.textSecondary} />
                <T>Appearance</T>
              </View>
              <View style={styles.segments} accessibilityRole="radiogroup">
                {APPEARANCE_OPTIONS.map((o) => {
                  const selected = preference === o.value;
                  return (
                    <Pressable
                      key={o.value}
                      onPress={() => setPreference(o.value)}
                      accessibilityRole="radio"
                      accessibilityState={{ selected }}
                      style={({ pressed }) => [styles.segment, selected && styles.segmentSelected, pressed && { opacity: 0.7 }]}>
                      <T variant="small" style={[styles.segmentText, selected && { color: Colors.onPrimary }]}>
                        {o.label}
                      </T>
                    </Pressable>
                  );
                })}
              </View>
            </View>
            {/* Placeholders for now: they show the option but don't do anything yet. */}
            {SETTINGS_OPTIONS.map((o) => (
              <Pressable
                key={o.label}
                accessibilityRole="button"
                accessibilityHint="Coming soon"
                style={({ pressed }) => [styles.item, pressed && { backgroundColor: Colors.primarySoft }]}>
                <Icon name={o.icon} size={18} color={Colors.textSecondary} />
                <T style={{ flex: 1 }}>{o.label}</T>
                <T variant="small" style={{ color: Colors.textMuted }}>
                  {o.value}
                </T>
              </Pressable>
            ))}
            <Divider />
            <Pressable
              onPress={() => {
                setOpen(false);
                signOut();
              }}
              accessibilityRole="button"
              style={({ pressed }) => [styles.item, pressed && { backgroundColor: Colors.dangerSoft }]}>
              <Icon name="log-out-outline" size={18} color={Colors.danger} />
              <T style={{ color: Colors.danger, fontWeight: '600' }}>Sign out</T>
            </Pressable>
          </View>
        </Pressable>
      </Modal>
    </>
  );
}

const useStyles = makeStyles((Colors) => ({
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
  },
  buttonCompact: { paddingHorizontal: Spacing.md, paddingVertical: 0, justifyContent: 'center' },
  name: { flex: 1, color: Colors.text, fontWeight: '600' },
  backdrop: { flex: 1, backgroundColor: Colors.backdrop },
  // Opens from the bottom-left corner, above the logo.
  menu: {
    position: 'absolute',
    bottom: 80,
    left: 16,
    width: 260,
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingVertical: Spacing.xs,
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  account: { paddingHorizontal: Spacing.lg, paddingVertical: Spacing.md, gap: Spacing.sm },
  accountRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  avatar: { backgroundColor: Colors.primary, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  // Placeholder circle before a picture is added.
  avatarEmpty: { backgroundColor: Colors.primarySoft, borderWidth: 1, borderColor: Colors.border },
  cameraBadge: {
    position: 'absolute',
    right: -2,
    bottom: -2,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: Colors.primary,
    borderWidth: 2,
    borderColor: Colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  photoLinks: { flexDirection: 'row', gap: Spacing.md, marginTop: 2 },
  photoLink: { color: Colors.primaryStrong, fontWeight: '600' },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
  },
  homes: { paddingVertical: Spacing.xs },
  homesLabel: { paddingHorizontal: Spacing.lg, paddingTop: Spacing.sm, paddingBottom: 2 },
  homesList: { maxHeight: 180 },
  homeItem: { paddingVertical: Spacing.sm },
  appearance: { paddingHorizontal: Spacing.lg, paddingVertical: Spacing.md, gap: Spacing.sm },
  appearanceLabel: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  // System / Light / Dark segmented control.
  segments: {
    flexDirection: 'row',
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radius.sm,
    padding: 2,
    gap: 2,
  },
  segment: { flex: 1, alignItems: 'center', paddingVertical: 6, borderRadius: Radius.sm - 2 },
  segmentSelected: { backgroundColor: Colors.primary },
  segmentText: { color: Colors.textSecondary, fontWeight: '600' },
}));
