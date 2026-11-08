import Ionicons from '@expo/vector-icons/Ionicons';
import type { ComponentProps, ReactNode } from 'react';
import {
  ActivityIndicator,
  Pressable,
  Text,
  TextInput,
  View,
  type StyleProp,
  type TextInputProps,
  type TextStyle,
  type ViewStyle,
} from 'react-native';

import { InputText, Radius, Spacing, typeStyles, type TypeVariant } from '@/constants/theme';
import { makeStyles, useColors } from '@/providers/appearance';

export type IconName = ComponentProps<typeof Ionicons>['name'];

export function Icon({ name, size = 20, color }: { name: IconName; size?: number; color?: string }) {
  const Colors = useColors();
  return <Ionicons name={name} size={size} color={color ?? Colors.text} />;
}

const useType = makeStyles(typeStyles);

export function T({
  variant = 'body',
  style,
  children,
  numberOfLines,
}: {
  variant?: TypeVariant;
  style?: StyleProp<TextStyle>;
  children: ReactNode;
  numberOfLines?: number;
}) {
  const type = useType();
  return (
    <Text style={[type[variant], style]} numberOfLines={numberOfLines}>
      {children}
    </Text>
  );
}

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';

export function Button({
  title,
  onPress,
  variant = 'primary',
  icon,
  loading,
  disabled,
  style,
  compact,
}: {
  title: string;
  onPress?: () => void;
  variant?: ButtonVariant;
  icon?: IconName;
  loading?: boolean;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  compact?: boolean;
}) {
  const Colors = useColors();
  const styles = useStyles();
  const palette = {
    primary: { bg: Colors.primary, fg: Colors.onPrimary, border: Colors.primary },
    secondary: { bg: Colors.surface, fg: Colors.text, border: Colors.borderStrong },
    ghost: { bg: 'transparent', fg: Colors.primaryStrong, border: 'transparent' },
    danger: { bg: Colors.surface, fg: Colors.danger, border: Colors.dangerSoft },
  }[variant];
  const inactive = disabled || loading;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: !!inactive }}
      onPress={onPress}
      disabled={inactive}
      style={({ pressed }) => [
        styles.button,
        compact && styles.buttonCompact,
        { backgroundColor: palette.bg, borderColor: palette.border },
        pressed && styles.pressed,
        inactive && styles.disabled,
        style,
      ]}>
      {loading ? (
        <ActivityIndicator color={palette.fg} size="small" />
      ) : (
        <>
          {icon && <Icon name={icon} size={compact ? 16 : 18} color={palette.fg} />}
          <Text style={[styles.buttonText, compact && styles.buttonTextCompact, { color: palette.fg }]}>{title}</Text>
        </>
      )}
    </Pressable>
  );
}

export function IconButton({
  name,
  onPress,
  label,
  color,
  size = 22,
}: {
  name: IconName;
  onPress: () => void;
  label: string;
  color?: string;
  size?: number;
}) {
  const styles = useStyles();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={10}
      onPress={onPress}
      style={({ pressed }) => [styles.iconButton, pressed && styles.pressed]}>
      <Icon name={name} size={size} color={color} />
    </Pressable>
  );
}

export function Card({ children, style, onPress }: { children: ReactNode; style?: StyleProp<ViewStyle>; onPress?: () => void }) {
  const styles = useStyles();
  if (onPress) {
    return (
      <Pressable onPress={onPress} style={({ pressed }) => [styles.card, pressed && styles.cardPressed, style]}>
        {children}
      </Pressable>
    );
  }
  return <View style={[styles.card, style]}>{children}</View>;
}

export function Field({
  label,
  hint,
  style,
  ...props
}: TextInputProps & { label?: string; hint?: string; style?: StyleProp<TextStyle> }) {
  const Colors = useColors();
  const styles = useStyles();
  return (
    <View style={styles.field}>
      {label && <T variant="label">{label}</T>}
      <TextInput
        placeholderTextColor={Colors.textMuted}
        {...props}
        style={[styles.input, props.multiline && styles.inputMultiline, style]}
      />
      {hint && <T variant="small">{hint}</T>}
    </View>
  );
}

export function Chip({
  label,
  selected,
  onPress,
  tone = 'neutral',
  icon,
}: {
  label: string;
  selected?: boolean;
  onPress?: () => void;
  tone?: 'neutral' | 'warning' | 'success';
  icon?: IconName;
}) {
  const Colors = useColors();
  const styles = useStyles();
  const toneStyle =
    tone === 'warning'
      ? { backgroundColor: Colors.warningSoft, borderColor: Colors.warningSoft, color: Colors.warning }
      : tone === 'success'
        ? { backgroundColor: Colors.primarySoft, borderColor: Colors.primarySoft, color: Colors.success }
        : selected
          ? { backgroundColor: Colors.primary, borderColor: Colors.primary, color: Colors.onPrimary }
          : { backgroundColor: Colors.surface, borderColor: Colors.border, color: Colors.textSecondary };
  const content = (
    <>
      {icon && <Icon name={icon} size={13} color={toneStyle.color} />}
      <Text style={[styles.chipText, { color: toneStyle.color }]} numberOfLines={2}>
        {label}
      </Text>
    </>
  );
  const style = [styles.chip, { backgroundColor: toneStyle.backgroundColor, borderColor: toneStyle.borderColor }];
  if (!onPress) return <View style={style}>{content}</View>;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: !!selected }}
      onPress={onPress}
      style={({ pressed }) => [...style, pressed && styles.pressed]}>
      {content}
    </Pressable>
  );
}

export function Stars({
  value,
  size = 14,
  onChange,
}: {
  value: number;
  size?: number;
  onChange?: (score: number) => void;
}) {
  const Colors = useColors();
  const styles = useStyles();
  return (
    <View style={styles.stars} accessibilityLabel={`${value.toFixed(1)} out of 5 stars`}>
      {[1, 2, 3, 4, 5].map((n) => {
        const name: IconName = value >= n - 0.25 ? 'star' : value >= n - 0.75 ? 'star-half' : 'star-outline';
        const star = <Icon name={name} size={size} color={value >= n - 0.75 ? Colors.star : Colors.borderStrong} />;
        if (!onChange) return <View key={n}>{star}</View>;
        return (
          <Pressable
            key={n}
            hitSlop={6}
            accessibilityRole="button"
            accessibilityLabel={`Rate ${n} star${n > 1 ? 's' : ''}`}
            onPress={() => onChange(n)}
            style={({ pressed }) => pressed && styles.pressed}>
            {star}
          </Pressable>
        );
      })}
    </View>
  );
}

/** − [ 10 ] + number picker; the middle can also be typed into. */
export function Stepper({
  value,
  onChange,
  min = 1,
  max = 500,
  step = 1,
  label,
}: {
  value: number;
  onChange: (n: number) => void;
  min?: number;
  max?: number;
  /** e.g. 0.5 for half pounds */
  step?: number;
  label: string;
}) {
  const Colors = useColors();
  const styles = useStyles();
  const clamp = (n: number) => Math.min(max, Math.max(min, Math.round(n / step) * step));
  return (
    <View style={styles.stepper}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Fewer ${label}`}
        disabled={value <= min}
        onPress={() => onChange(clamp(value - step))}
        hitSlop={6}
        style={({ pressed }) => [styles.stepperButton, (pressed || value <= min) && styles.disabled]}>
        <Icon name="remove" size={18} color={Colors.text} />
      </Pressable>
      <TextInput
        accessibilityLabel={label}
        value={String(value)}
        onChangeText={(t) => {
          const n = Number(t.replace(step < 1 ? /[^0-9.]/g : /[^0-9]/g, ''));
          if (n) onChange(clamp(n));
        }}
        keyboardType={step < 1 ? 'decimal-pad' : 'number-pad'}
        selectTextOnFocus
        style={styles.stepperInput}
      />
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`More ${label}`}
        disabled={value >= max}
        onPress={() => onChange(clamp(value + step))}
        hitSlop={6}
        style={({ pressed }) => [styles.stepperButton, (pressed || value >= max) && styles.disabled]}>
        <Icon name="add" size={18} color={Colors.text} />
      </Pressable>
    </View>
  );
}

export function EmptyState({
  icon,
  title,
  body,
  action,
}: {
  icon: IconName;
  title: string;
  body?: string;
  action?: ReactNode;
}) {
  const Colors = useColors();
  const styles = useStyles();
  return (
    <View style={styles.empty}>
      <View style={styles.emptyIcon}>
        <Icon name={icon} size={28} color={Colors.primaryStrong} />
      </View>
      <T variant="subheading" style={styles.center}>
        {title}
      </T>
      {body && (
        <T variant="small" style={styles.center}>
          {body}
        </T>
      )}
      {action && <View style={{ marginTop: Spacing.sm }}>{action}</View>}
    </View>
  );
}

export function SectionHeader({ title, action }: { title: string; action?: ReactNode }) {
  const styles = useStyles();
  return (
    <View style={styles.sectionHeader}>
      <T variant="label">{title}</T>
      {action}
    </View>
  );
}

export function Divider() {
  const styles = useStyles();
  return <View style={styles.divider} />;
}

export function Loading() {
  const Colors = useColors();
  const styles = useStyles();
  return (
    <View style={styles.loading}>
      <ActivityIndicator color={Colors.primaryStrong} />
    </View>
  );
}

export function ErrorBanner({ message }: { message: string | null }) {
  const Colors = useColors();
  const styles = useStyles();
  if (!message) return null;
  return (
    <View style={styles.errorBanner}>
      <Icon name="alert-circle-outline" size={18} color={Colors.danger} />
      <Text style={styles.errorText}>{message}</Text>
    </View>
  );
}

const useStyles = makeStyles((Colors) => ({
  button: {
    minHeight: 48,
    paddingHorizontal: Spacing.lg,
    borderRadius: Radius.md,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
  },
  buttonCompact: { minHeight: 36, paddingHorizontal: Spacing.md, borderRadius: Radius.sm },
  buttonText: { fontSize: 16, fontWeight: '600' },
  buttonTextCompact: { fontSize: 14 },
  pressed: { opacity: 0.6 },
  disabled: { opacity: 0.45 },
  iconButton: { padding: Spacing.xs },
  card: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: Spacing.lg,
  },
  cardPressed: { backgroundColor: Colors.primarySoft },
  field: { gap: Spacing.xs + 2 },
  input: {
    ...InputText,
    minHeight: 48,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.md + 2,
    paddingVertical: Spacing.md,
    fontSize: 16,
    color: Colors.text,
  },
  inputMultiline: { minHeight: 96, textAlignVertical: 'top' },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: Spacing.md,
    paddingVertical: 6,
    borderRadius: Radius.pill,
    borderWidth: 1,
    maxWidth: '100%',
    flexShrink: 1,
  },
  // flexShrink lets long chip labels wrap inside narrow cards instead of overflowing.
  chipText: { fontSize: 13, fontWeight: '600', flexShrink: 1 },
  stars: { flexDirection: 'row', gap: 2, alignItems: 'center' },
  stepper: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radius.md,
    backgroundColor: Colors.surface,
    overflow: 'hidden',
  },
  stepperButton: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.primarySoft },
  stepperInput: { ...InputText, width: 52, height: 40, textAlign: 'center', fontSize: 17, fontWeight: '700', color: Colors.text },
  empty: { alignItems: 'center', gap: Spacing.sm, paddingVertical: Spacing.xxl, paddingHorizontal: Spacing.xl },
  emptyIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: Colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.sm,
  },
  center: { textAlign: 'center' },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: Spacing.xl,
    marginBottom: Spacing.sm,
  },
  divider: { height: 1, backgroundColor: Colors.border },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: Spacing.xxl },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    backgroundColor: Colors.dangerSoft,
    borderRadius: Radius.md,
    padding: Spacing.md,
  },
  errorText: { color: Colors.danger, fontSize: 14, flex: 1 },
}));
