import { View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { CommunitySetup } from '@/components/group-gate';
import { SettingsLogo } from '@/components/logo-menu';
import { useColors } from '@/providers/appearance';

/**
 * Shown to signed-in people who aren't in a community yet (new accounts, or
 * after leaving their last one). Nothing else in the app is reachable until
 * they create or join one. Settings (Sign out) sits bottom-left as elsewhere.
 */
export default function Welcome() {
  const Colors = useColors();
  return (
    <View style={{ flex: 1, backgroundColor: Colors.background }}>
      <CommunitySetup title="Welcome to me-n-u" />
      <SafeAreaView edges={['bottom']} style={{ borderTopWidth: 1, borderTopColor: Colors.border, backgroundColor: Colors.surface }}>
        <View style={{ alignSelf: 'flex-start' }}>
          <SettingsLogo />
        </View>
      </SafeAreaView>
    </View>
  );
}
