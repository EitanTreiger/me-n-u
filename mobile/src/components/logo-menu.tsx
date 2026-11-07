import { Image } from 'expo-image';
import { useState } from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';

import { Colors, Radius, Spacing } from '@/constants/theme';
import { useAuth } from '@/providers/auth';

import { Divider, Icon, T } from './ui';

/** The me-n-u logo; tap it for a small menu with Sign out. */
export function LogoMenu() {
  const { session, displayName, signOut } = useAuth();
  const [open, setOpen] = useState(false);

  return (
    <>
      <Pressable
        onPress={() => setOpen(true)}
        accessibilityRole="button"
        accessibilityLabel="Account menu"
        hitSlop={6}
        style={({ pressed }) => [styles.logoButton, pressed && { opacity: 0.7 }]}>
        <Image source={require('@/assets/images/logo-mark.png')} style={styles.logo} contentFit="contain" />
      </Pressable>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        {/* Tap anywhere outside the menu to close it. */}
        <Pressable style={styles.backdrop} onPress={() => setOpen(false)} accessibilityLabel="Close menu">
          <View style={styles.menu} onStartShouldSetResponder={() => true}>
            <View style={styles.account}>
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
  logoButton: {
    width: 44,
    height: 44,
    borderRadius: Radius.md,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logo: { width: 30, height: 30 },
  backdrop: { flex: 1, backgroundColor: 'rgba(30,43,34,0.12)' },
  menu: {
    position: 'absolute',
    top: 70,
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
