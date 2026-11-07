import Ionicons from '@expo/vector-icons/Ionicons';
import { BottomTabBar, Tabs } from 'expo-router/tabs';
import type { ComponentProps } from 'react';
import { StyleSheet, View, type ColorValue } from 'react-native';

import { Colors } from '@/constants/theme';
import { SettingsLogo } from '@/components/logo-menu';
import { useLayout } from '@/hooks/use-layout';

type IconName = ComponentProps<typeof Ionicons>['name'];

function tabIcon(active: IconName, inactive: IconName) {
  return function TabIcon({ color, focused, size }: { color: ColorValue; focused: boolean; size: number }) {
    return <Ionicons name={focused ? active : inactive} size={size - 2} color={color as string} />;
  };
}

export default function TabsLayout() {
  // Computers and big tablets get a sidebar; phones keep the bottom tab bar.
  const { wide } = useLayout();
  return (
    <Tabs
      // The usual tab bar plus the settings logo in the bottom-left corner:
      // under the sidebar on computers, at the left end of the tab bar on phones.
      tabBar={(props) =>
        wide ? (
          <View style={styles.sidebar}>
            <View style={{ flex: 1 }}>
              <BottomTabBar {...props} />
            </View>
            <View style={styles.sidebarFooter}>
              <SettingsLogo />
            </View>
          </View>
        ) : (
          <View style={styles.bottomBar}>
            <SettingsLogo compact />
            <View style={{ flex: 1 }}>
              <BottomTabBar {...props} />
            </View>
          </View>
        )
      }
      screenOptions={{
        headerShown: false,
        tabBarPosition: wide ? 'left' : 'bottom',
        tabBarVariant: wide ? 'material' : 'uikit',
        tabBarLabelPosition: wide ? 'beside-icon' : 'below-icon',
        tabBarActiveTintColor: Colors.primaryStrong,
        tabBarInactiveTintColor: Colors.textMuted,
        tabBarActiveBackgroundColor: wide ? Colors.primarySoft : undefined,
        // Borders are drawn by the wrappers below so the settings logo shares them.
        tabBarStyle: wide
          ? { backgroundColor: Colors.surface, borderRightWidth: 0, paddingTop: 16 }
          : { backgroundColor: Colors.surface, borderTopWidth: 0 },
        tabBarLabelStyle: { fontSize: wide ? 15 : 11, fontWeight: '600' },
      }}>
      <Tabs.Screen name="index" options={{ title: 'Recipes', tabBarIcon: tabIcon('book', 'book-outline') }} />
      <Tabs.Screen name="menu" options={{ title: 'Menu', tabBarIcon: tabIcon('calendar', 'calendar-outline') }} />
      <Tabs.Screen name="groceries" options={{ title: 'Groceries', tabBarIcon: tabIcon('cart', 'cart-outline') }} />
      <Tabs.Screen name="pantry" options={{ title: 'Pantry', tabBarIcon: tabIcon('basket', 'basket-outline') }} />
      <Tabs.Screen name="groups" options={{ title: 'Groups', tabBarIcon: tabIcon('people', 'people-outline') }} />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  sidebar: { height: '100%', backgroundColor: Colors.surface, borderRightWidth: 1, borderRightColor: Colors.border },
  sidebarFooter: { borderTopWidth: 1, borderTopColor: Colors.border },
  bottomBar: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: Colors.surface,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    paddingTop: 6,
  },
});
