import { CommunitySetup } from '@/components/group-gate';

/**
 * Shown to signed-in people who aren't in a community yet (new accounts, or
 * after leaving their last one). Nothing else in the app is reachable until
 * they create or join one.
 */
export default function Welcome() {
  return <CommunitySetup title="Welcome to me-n-u" />;
}
