import * as Linking from 'expo-linking';
import { Platform, Share } from 'react-native';

/**
 * Link that joins a home: https://<site>/join/<code>.
 * Set EXPO_PUBLIC_APP_URL to the website (e.g. the Vercel address) so links
 * shared from the phone app open the website too. Without it, the web app
 * uses its own address and phones use an app link.
 */
export function joinLink(code: string): string {
  const site = process.env.EXPO_PUBLIC_APP_URL || (Platform.OS === 'web' && typeof window !== 'undefined' ? window.location.origin : '');
  return site ? `${site.replace(/\/$/, '')}/join/${code}` : Linking.createURL(`/join/${code}`);
}

/**
 * Share a home's code and link through the share sheet. On web without a
 * share sheet, copies the link instead. Returns 'copied' in that case.
 */
export async function shareInvite(homeName: string, code: string): Promise<'shared' | 'copied'> {
  const link = joinLink(code);
  const message = `Join "${homeName}" on me-n-u: ${link}\n\nOr enter the home code ${code}.`;
  if (Platform.OS === 'web') {
    const nav = typeof navigator !== 'undefined' ? navigator : undefined;
    if (nav?.share) {
      await nav.share({ title: `Join ${homeName}`, text: message }).catch(() => {});
      return 'shared';
    }
    await nav?.clipboard?.writeText(link);
    return 'copied';
  }
  await Share.share({ message });
  return 'shared';
}
