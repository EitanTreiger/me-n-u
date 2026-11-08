import { useState } from 'react';
import { Modal, Pressable, View } from 'react-native';

import { Radius, Spacing } from '@/constants/theme';
import { makeStyles, useColors } from '@/providers/appearance';
import { useGroups } from '@/providers/groups';

import { Divider, Icon, T } from './ui';

/**
 * Which home's menu and groceries are shown. A pill with the home's
 * name; tap it to switch between the homes you belong to.
 */
export function HomeSwitcher() {
  const Colors = useColors();
  const styles = useStyles();
  const { homes, activeHome, setActiveHome } = useGroups();
  const [open, setOpen] = useState(false);
  if (!activeHome) return null;
  const canSwitch = homes.length > 1;

  return (
    <>
      <Pressable
        onPress={() => setOpen(true)}
        disabled={!canSwitch}
        accessibilityRole="button"
        accessibilityLabel={canSwitch ? `Home: ${activeHome.name}. Switch home` : `Home: ${activeHome.name}`}
        style={({ pressed }) => [styles.pill, pressed && { opacity: 0.7 }]}>
        <Icon name="home-outline" size={14} color={Colors.primaryStrong} />
        <T variant="small" style={styles.pillText} numberOfLines={1}>
          {activeHome.name}
        </T>
        {canSwitch && <Icon name="chevron-down" size={14} color={Colors.primaryStrong} />}
      </Pressable>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setOpen(false)} accessibilityLabel="Close">
          <View style={styles.sheet} onStartShouldSetResponder={() => true}>
            <T variant="label" style={styles.sheetTitle}>
              Switch home
            </T>
            {homes.map((h, i) => {
              const selected = h.id === activeHome.id;
              return (
                <View key={h.id}>
                  {i > 0 && <Divider />}
                  <Pressable
                    onPress={() => {
                      setActiveHome(h.id);
                      setOpen(false);
                    }}
                    accessibilityRole="radio"
                    accessibilityState={{ selected }}
                    style={({ pressed }) => [styles.row, pressed && { backgroundColor: Colors.primarySoft }]}>
                    <Icon
                      name={selected ? 'radio-button-on' : 'radio-button-off'}
                      size={20}
                      color={selected ? Colors.primaryStrong : Colors.borderStrong}
                    />
                    <T style={{ flex: 1, fontWeight: selected ? '600' : '400' }} numberOfLines={1}>
                      {h.name}
                    </T>
                    {h.role !== 'member' && <T variant="small">{h.role === 'admin' ? 'Admin' : 'Acting admin'}</T>}
                  </Pressable>
                </View>
              );
            })}
          </View>
        </Pressable>
      </Modal>
    </>
  );
}

const useStyles = makeStyles((Colors) => ({
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    alignSelf: 'flex-start',
    paddingHorizontal: Spacing.sm + 2,
    paddingVertical: 4,
    borderRadius: Radius.pill,
    backgroundColor: Colors.primarySoft,
    marginTop: 2,
  },
  pillText: { color: Colors.primaryStrong, fontWeight: '600', maxWidth: 220 },
  backdrop: { flex: 1, backgroundColor: Colors.backdrop, justifyContent: 'center', padding: Spacing.lg },
  sheet: {
    width: '100%',
    maxWidth: 360,
    alignSelf: 'center',
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingVertical: Spacing.xs,
  },
  sheetTitle: { paddingHorizontal: Spacing.lg, paddingTop: Spacing.md, paddingBottom: Spacing.sm },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, paddingHorizontal: Spacing.lg, paddingVertical: Spacing.md },
}));
