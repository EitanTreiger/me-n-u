import Ionicons from '@expo/vector-icons/Ionicons';
import { BottomTabBar, Tabs, type BottomTabBarButtonProps } from 'expo-router/tabs';
import { useState, type ComponentProps } from 'react';
import { Pressable, View, type ColorValue } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Spacing } from '@/constants/theme';
import { makeStyles, useColors } from '@/providers/appearance';
import { Avatar, SettingsLogo, SettingsMenu, Wordmark } from '@/components/logo-menu';
import { useLayout } from '@/hooks/use-layout';
import { useGroups } from '@/providers/groups';

type IconName = ComponentProps<typeof Ionicons>['name'];

function tabIcon(active: IconName, inactive: IconName) {
  return function TabIcon({ color, focused, size }: { color: ColorValue; focused: boolean; size: number }) {
    return <Ionicons name={focused ? active : inactive} size={size - 2} color={color as string} />;
  };
}

/** Phones: a slim bar across the top with the logo in the middle. */
function MobileTopBar() {
  const styles = useStyles();
  return (
    <SafeAreaView edges={['top']} style={styles.topBar}>
      <View style={styles.topBarInner}>
        <Wordmark height={28} />
      </View>
    </SafeAreaView>
  );
}

// Open on Recipes, not the Profile tab that comes first in the bar.
export const unstable_settings = { initialRouteName: 'index' };

export default function TabsLayout() {
  const Colors = useColors();
  const styles = useStyles();
  // Computers and big tablets get a sidebar; phones keep the bottom tab bar.
  const { wide } = useLayout();
  // Groceries and the pantry are for the home's admins only.
  const { isAdmin } = useGroups();
  const [settingsOpen, setSettingsOpen] = useState(false);

  // Phones: the Profile tab is a real tab (so it lines up with the others),
  // but tapping it opens the Settings menu instead of a page.
  const profileButton = ({ children, style }: BottomTabBarButtonProps) => (
    <Pressable onPress={() => setSettingsOpen(true)} accessibilityRole="button" accessibilityLabel="Settings" style={style}>
      {children}
    </Pressable>
  );

  return (
    <>
    <Tabs
      // Computers: logo at the top of the sidebar, profile and settings at the
      // bottom. Phones: logo in the top bar, Profile as the first tab.
      tabBar={(props) =>
        wide ? (
          <View style={styles.sidebar}>
            <View style={styles.sidebarBrand}>
              <Wordmark height={36} />
            </View>
            <View style={{ flex: 1 }}>
              <BottomTabBar {...props} />
            </View>
            <View style={styles.sidebarFooter}>
              <SettingsLogo />
            </View>
          </View>
        ) : (
          <View style={styles.bottomBar}>
            <BottomTabBar {...props} />
          </View>
        )
      }
      screenOptions={{
        // Computers show the logo at the top of the sidebar instead.
        headerShown: !wide,
        header: () => <MobileTopBar />,
        tabBarPosition: wide ? 'left' : 'bottom',
        tabBarVariant: wide ? 'material' : 'uikit',
        tabBarLabelPosition: wide ? 'beside-icon' : 'below-icon',
        tabBarActiveTintColor: Colors.primaryStrong,
        tabBarInactiveTintColor: Colors.textMuted,
        tabBarActiveBackgroundColor: wide ? Colors.primarySoft : undefined,
        // Borders are drawn by the wrappers above.
        tabBarStyle: wide
          ? { backgroundColor: Colors.surface, borderRightWidth: 0, paddingTop: 16 }
          : { backgroundColor: Colors.surface, borderTopWidth: 0 },
        tabBarLabelStyle: { fontSize: wide ? 15 : 11, fontWeight: '600' },
      }}>
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profile',
          // Computers have the profile at the bottom of the sidebar instead.
          href: wide ? null : undefined,
          tabBarIcon: ({ size }) => <Avatar size={size} />,
          // Expo Router refuses `href` and `tabBarButton` together, so only phones get the button.
          tabBarButton: wide ? undefined : profileButton,
        }}
      />
      <Tabs.Screen name="index" options={{ title: 'Recipes', tabBarIcon: tabIcon('book', 'book-outline') }} />
      <Tabs.Screen name="menu" options={{ title: 'Menu', tabBarIcon: tabIcon('calendar', 'calendar-outline') }} />
      <Tabs.Screen
        name="groceries"
        options={{ title: 'Groceries', href: isAdmin ? undefined : null, tabBarIcon: tabIcon('cart', 'cart-outline') }}
      />
      <Tabs.Screen
        name="pantry"
        options={{ title: 'Pantry', href: isAdmin ? undefined : null, tabBarIcon: tabIcon('basket', 'basket-outline') }}
      />
      <Tabs.Screen name="groups" options={{ title: 'Homes', tabBarIcon: tabIcon('home', 'home-outline') }} />
    </Tabs>
    <SettingsMenu open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </>
  );
}

const useStyles = makeStyles((Colors) => ({
  sidebar: { height: '100%', backgroundColor: Colors.surface, borderRightWidth: 1, borderRightColor: Colors.border },
  sidebarBrand: { paddingHorizontal: Spacing.lg, paddingTop: Spacing.xl, paddingBottom: Spacing.sm },
  sidebarFooter: { borderTopWidth: 1, borderTopColor: Colors.border },
  topBar: { backgroundColor: Colors.surface, borderBottomWidth: 1, borderBottomColor: Colors.border },
  topBarInner: { height: 48, alignItems: 'center', justifyContent: 'center' },
  bottomBar: {
    backgroundColor: Colors.surface,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    paddingTop: 6,
  },
}));
