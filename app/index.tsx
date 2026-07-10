import { Redirect } from "expo-router";

// Root entry. For the bootstrap shell this lands on the default tab so `/` resolves.
// Auth-aware routing (sign-in vs. tabs, by active role) replaces this in the auth UoW.
export default function Index() {
  return <Redirect href="/feed" />;
}
