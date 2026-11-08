import { ScrollView, View } from 'react-native';

import { T } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { makeStyles } from '@/providers/appearance';

// Public privacy policy (no sign-in needed), linked from Google's sign-in
// consent screen. Keep it in plain words and in step with what the app does.
const SECTIONS: { title: string; body: string[] }[] = [
  {
    title: 'What me-n-u is',
    body: [
      'me-n-u is a prototype app for group homes to share recipes, plan weekly menus, build grocery lists and share photos of the food they make.',
    ],
  },
  {
    title: 'What we collect',
    body: [
      'When you sign in with Google we receive your name, email address and profile picture. We use them only to create your account and show your name to the members of your own home.',
      'We store what you add to the app: recipes, ratings, menu plans, menu votes, grocery list items, photos, and which homes you belong to.',
    ],
  },
  {
    title: 'Who can see it',
    body: [
      'Recipes, ratings and gallery photos are shared with everyone who uses the app. Gallery photos are labelled with the home they came from, never with your name, and recipes do not show who shared them.',
      "Each home's weekly menu, menu votes and grocery list are only visible to that home's members.",
    ],
  },
  {
    title: 'Services we use',
    body: [
      'Supabase stores the app data and photos and handles sign-in. Vercel hosts the website.',
      'When you convert a recipe from a photo or a YouTube video, that photo or link is sent to Google Gemini to read the recipe. When you listen to a recipe, the text of its steps is sent to ElevenLabs to turn it into speech.',
      'We do not sell your information or use it for advertising.',
    ],
  },
  {
    title: 'Keeping or deleting your data',
    body: [
      'You can delete your own photos in the app. To have your account and everything you added removed, ask an admin of your home or contact the me-n-u team, and we will delete it.',
    ],
  },
  {
    title: 'Please do not share',
    body: ['Do not post photos of people or any personal or health information. Photos are meant to show food.'],
  },
];

export default function Privacy() {
  const styles = useStyles();
  return (
    <ScrollView contentContainerStyle={styles.page}>
      <T variant="title">Privacy policy</T>
      <T variant="small">Last updated 8 November 2026</T>
      {SECTIONS.map((s) => (
        <View key={s.title} style={styles.section}>
          <T variant="subheading">{s.title}</T>
          {s.body.map((p, i) => (
            <T key={i}>{p}</T>
          ))}
        </View>
      ))}
    </ScrollView>
  );
}

const useStyles = makeStyles(() => ({
  page: { padding: Spacing.lg, gap: Spacing.lg, width: '100%', maxWidth: 720, alignSelf: 'center', paddingBottom: Spacing.xxl },
  section: { gap: Spacing.sm },
}));
