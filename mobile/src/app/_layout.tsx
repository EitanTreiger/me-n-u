import { DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';

import { Loading } from '@/components/ui';
import { Colors } from '@/constants/theme';
import { AuthProvider, useAuth } from '@/providers/auth';
import { GroupsProvider, useGroups } from '@/providers/groups';
import { PantryProvider } from '@/providers/pantry';

SplashScreen.preventAutoHideAsync();

const theme = {
  ...DefaultTheme,
  colors: {
    ...DefaultTheme.colors,
    primary: Colors.primaryStrong,
    background: Colors.background,
    card: Colors.surface,
    text: Colors.text,
    border: Colors.border,
  },
};

function RootNavigator() {
  const { session, loading } = useAuth();
  const groups = useGroups();
  // Signed in but not in any community yet: the only screen is create-or-join.
  const inCommunity = groups.memberships.length > 0;

  useEffect(() => {
    if (!loading) SplashScreen.hideAsync();
  }, [loading]);

  if (loading || (session && groups.loading)) return <Loading />;

  return (
    <Stack
      screenOptions={{
        headerTintColor: Colors.text,
        headerStyle: { backgroundColor: Colors.surface },
        headerShadowVisible: false,
        headerTitleStyle: { fontWeight: '600' },
        headerBackButtonDisplayMode: 'minimal',
        contentStyle: { backgroundColor: Colors.background },
      }}>
      <Stack.Protected guard={!!session && !inCommunity}>
        <Stack.Screen name="welcome" options={{ headerShown: false }} />
      </Stack.Protected>
      <Stack.Protected guard={!!session && inCommunity}>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="recipe/[id]" options={{ title: '' }} />
        <Stack.Screen name="recipe/new" options={{ title: 'New recipe', presentation: 'modal' }} />
        <Stack.Screen name="menu-pick" options={{ title: 'Add to menu', presentation: 'modal' }} />
      </Stack.Protected>
      <Stack.Protected guard={!session}>
        <Stack.Screen name="sign-in" options={{ headerShown: false }} />
      </Stack.Protected>
      <Stack.Screen name="auth-callback" options={{ headerShown: false }} />
    </Stack>
  );
}

export default function RootLayout() {
  return (
    <ThemeProvider value={theme}>
      <StatusBar style="dark" />
      <AuthProvider>
        <GroupsProvider>
          <PantryProvider>
            <RootNavigator />
          </PantryProvider>
        </GroupsProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}
