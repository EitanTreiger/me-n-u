import Ionicons from '@expo/vector-icons/Ionicons';
import { Tabs } from 'expo-router/tabs';
import type { ComponentProps } from 'react';
import type { ColorValue } from 'react-native';

import { Colors } from '@/constants/theme';
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
      screenOptions={{
        headerShown: false,
        tabBarPosition: wide ? 'left' : 'bottom',
        tabBarVariant: wide ? 'material' : 'uikit',
        tabBarLabelPosition: wide ? 'beside-icon' : 'below-icon',
        tabBarActiveTintColor: Colors.primaryStrong,
        tabBarInactiveTintColor: Colors.textMuted,
        tabBarActiveBackgroundColor: wide ? Colors.primarySoft : undefined,
        tabBarStyle: wide
          ? { backgroundColor: Colors.surface, borderRightColor: Colors.border, paddingTop: 16 }
          : { backgroundColor: Colors.surface, borderTopColor: Colors.border },
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
