import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect, type ReactNode } from 'react';

import { Loading } from '@/components/ui';
import { AppearanceProvider, useAppearance, useColors } from '@/providers/appearance';
import { AuthProvider, useAuth } from '@/providers/auth';
import { GroupsProvider, useGroups } from '@/providers/groups';
import { PantryProvider } from '@/providers/pantry';

SplashScreen.preventAutoHideAsync();

/** Navigation theme and status bar follow the Light/Dark setting. */
function Themed({ children }: { children: ReactNode }) {
  const { scheme, colors: Colors } = useAppearance();
  const base = scheme === 'dark' ? DarkTheme : DefaultTheme;
  const theme = {
    ...base,
    colors: {
      ...base.colors,
      primary: Colors.primaryStrong,
      background: Colors.background,
      card: Colors.surface,
      text: Colors.text,
      border: Colors.border,
    },
  };
  return (
    <ThemeProvider value={theme}>
      <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
      {children}
    </ThemeProvider>
  );
}

function RootNavigator() {
  const Colors = useColors();
  const { session, loading } = useAuth();
  const groups = useGroups();
  // Signed in but not in any home yet: the only screen is create-or-join.
  const inHome = groups.homes.length > 0;

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
      <Stack.Protected guard={!!session && !inHome}>
        <Stack.Screen name="welcome" options={{ headerShown: false }} />
      </Stack.Protected>
      <Stack.Protected guard={!!session && inHome}>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="recipe/[id]" options={{ headerShown: false }} />
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
    <AppearanceProvider>
      <Themed>
        <AuthProvider>
          <GroupsProvider>
            <PantryProvider>
              <RootNavigator />
            </PantryProvider>
          </GroupsProvider>
        </AuthProvider>
      </Themed>
    </AppearanceProvider>
  );
}
