import type { ReactNode } from 'react';
import { RefreshControl, ScrollView, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { SafeAreaView, type Edge } from 'react-native-safe-area-context';

import { Colors, Spacing } from '@/constants/theme';
import { useLayout } from '@/hooks/use-layout';

import { LogoMenu } from './logo-menu';
import { T } from './ui';

/** Scrollable page with a large title, centred on wide screens. */
export function Screen({
  title,
  subtitle,
  right,
  children,
  refreshing,
  onRefresh,
  edges = ['top'],
  contentStyle,
  scroll = true,
}: {
  title?: string;
  subtitle?: ReactNode;
  right?: ReactNode;
  children: ReactNode;
  refreshing?: boolean;
  onRefresh?: () => void;
  edges?: Edge[];
  contentStyle?: StyleProp<ViewStyle>;
  scroll?: boolean;
}) {
  const { contentWidth } = useLayout();
  const header = title ? (
    <View style={styles.header}>
      <LogoMenu />
      <View style={{ flex: 1, gap: 2 }}>
        <T variant="title">{title}</T>
        {typeof subtitle === 'string' ? <T variant="small">{subtitle}</T> : subtitle}
      </View>
      {right}
    </View>
  ) : null;

  return (
    <SafeAreaView style={styles.safe} edges={edges}>
      {scroll ? (
        <ScrollView
          contentContainerStyle={[styles.content, { maxWidth: contentWidth }, contentStyle]}
          keyboardShouldPersistTaps="handled"
          refreshControl={
            onRefresh ? (
              <RefreshControl refreshing={!!refreshing} onRefresh={onRefresh} tintColor={Colors.primaryStrong} />
            ) : undefined
          }>
          {header}
          {children}
        </ScrollView>
      ) : (
        <View style={[styles.content, { flex: 1, maxWidth: contentWidth }, contentStyle]}>
          {header}
          {children}
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },
  content: {
    padding: Spacing.lg,
    paddingBottom: Spacing.xxl * 2,
    width: '100%',
    alignSelf: 'center',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    marginBottom: Spacing.lg,
    marginTop: Spacing.sm,
  },
});
