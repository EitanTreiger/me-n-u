import { router } from 'expo-router';
import type { ReactNode } from 'react';

import { useGroups } from '@/providers/groups';

import { Screen } from './screen';
import { Button, EmptyState, Loading } from './ui';

/** Renders children only when the user has an active group; otherwise nudges them to join one. */
export function GroupGate({ title, children }: { title: string; children: ReactNode }) {
  const { active, loading } = useGroups();
  if (loading) return <Loading />;
  if (!active) {
    return (
      <Screen title={title}>
        <EmptyState
          icon="people-outline"
          title="Join your home's group"
          body="Recipes, menus and grocery lists are shared inside a group. Create one for your home, or join with an invite code."
          action={<Button title="Create or join a group" icon="add" onPress={() => router.navigate('/groups')} />}
        />
      </Screen>
    );
  }
  return <>{children}</>;
}
