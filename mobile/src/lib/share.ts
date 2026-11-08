import { Platform, Share } from 'react-native';

/**
 * Open the share sheet with some text. Browsers without one (e.g. Firefox,
 * many desktop browsers) get the text copied instead: returns 'copied'.
 */
export async function shareText(message: string, title?: string): Promise<'shared' | 'copied'> {
  if (Platform.OS === 'web') {
    const nav = typeof navigator !== 'undefined' ? navigator : undefined;
    if (nav?.share) {
      // Closing the sheet without sharing also rejects; that's fine.
      await nav.share({ title, text: message }).catch(() => {});
      return 'shared';
    }
    if (!nav?.clipboard) throw new Error("This browser can't share or copy. Select the text and copy it instead.");
    await nav.clipboard.writeText(message);
    return 'copied';
  }
  await Share.share({ message, title });
  return 'shared';
}
