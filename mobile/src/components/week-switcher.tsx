import { Pressable, View } from 'react-native';

import { Radius, Spacing } from '@/constants/theme';
import { makeStyles } from '@/providers/appearance';
import { addWeeks, weekLabel, weekStart } from '@/lib/week';

import { IconButton, T } from './ui';

export function WeekSwitcher({ week, onChange }: { week: string; onChange: (week: string) => void }) {
  const styles = useStyles();
  const current = weekStart();
  return (
    <View style={styles.bar}>
      <IconButton name="chevron-back" label="Previous week" onPress={() => onChange(addWeeks(week, -1))} />
      <View style={styles.center}>
        <T variant="subheading">{weekLabel(week)}</T>
        {week !== current && (
          <Pressable onPress={() => onChange(current)} hitSlop={6} accessibilityRole="button">
            <T variant="small" style={styles.todayLink}>
              Back to this week
            </T>
          </Pressable>
        )}
      </View>
      <IconButton name="chevron-forward" label="Next week" onPress={() => onChange(addWeeks(week, 1))} />
    </View>
  );
}

const useStyles = makeStyles((Colors) => ({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.sm,
    marginBottom: Spacing.lg,
  },
  center: { flex: 1, alignItems: 'center', gap: 2 },
  todayLink: { color: Colors.primaryStrong, fontWeight: '600' },
}));
