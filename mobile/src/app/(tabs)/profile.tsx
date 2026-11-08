import { Redirect } from 'expo-router';

// The Profile tab opens the Settings menu rather than a page (see the tabs
// layout). Opening /profile directly just goes to Recipes.
export default function Profile() {
  return <Redirect href="/" />;
}
