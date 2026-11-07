import { Redirect } from 'expo-router';

// The OAuth redirect deep link can also land here as a route. The sign-in
// screen already finished the session exchange, so just go home; the root
// layout's guards show the right screen.
export default function AuthCallback() {
  return <Redirect href="/" />;
}
