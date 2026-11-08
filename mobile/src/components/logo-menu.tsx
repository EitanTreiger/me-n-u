import { Image } from 'expo-image';
import { useState } from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';

import { Colors, Radius, Spacing } from '@/constants/theme';
import { useAuth } from '@/providers/auth';

import { Divider, Icon, T, type IconName } from './ui';

const LOGO = require('@/assets/images/logo-mark.png');

const SETTINGS_OPTIONS: { label: string; icon: IconName; value: string }[] = [
  { label: 'Change name', icon: 'person-outline', value: '' },
  { label: 'Appearance', icon: 'contrast-outline', value: 'Light' },
  { label: 'Notifications', icon: 'notifications-outline', value: 'On' },
  { label: 'Help & feedback', icon: 'help-circle-outline', value: '' },
];

/** The me-n-u logo on its own (top of each page). */
export function Logo({ size = 40 }: { size?: number }) {
  return <Image source={LOGO} style={{ width: size, height: size }} contentFit="contain" accessibilityLabel="me-n-u" />;
}

/**
 * Bottom-left logo under the tabs: opens the Settings menu (account and
 * Sign out). On phones `compact` keeps it small enough to sit in the tab bar.
 */
export function SettingsLogo({ compact = false }: { compact?: boolean }) {
  const { session, displayName, signOut } = useAuth();
  const [open, setOpen] = useState(false);

  return (
    <>
      <Pressable
        onPress={() => setOpen(true)}
        accessibilityRole="button"
        accessibilityLabel="Settings"
        hitSlop={6}
        style={({ pressed }) => [styles.button, compact && styles.buttonCompact, pressed && { opacity: 0.7 }]}>
        <Logo size={compact ? 30 : 36} />
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
              <T variant="subheading" numberOfLines={1}>
                {displayName || 'Signed in'}
              </T>
              {!!session?.user.email && (
                <T variant="small" numberOfLines={1}>
                  {session.user.email}
                </T>
              )}
            </View>
            <Divider />
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

const styles = StyleSheet.create({
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
  },
  buttonCompact: { paddingHorizontal: Spacing.md, paddingVertical: 0, justifyContent: 'center' },
  name: { flex: 1, color: Colors.text, fontWeight: '600' },
  backdrop: { flex: 1, backgroundColor: 'rgba(30,43,34,0.12)' },
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
  account: { paddingHorizontal: Spacing.lg, paddingVertical: Spacing.md, gap: 2 },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
  },
});
