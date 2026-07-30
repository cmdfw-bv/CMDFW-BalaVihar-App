import { useRoleGuard } from "../../lib/auth/useRoleGuard";
import HomeFeedScreen from "../../features/teacher/class-update-and-home-feed/components/HomeFeedScreen";

export default function FeedScreen() {
  useRoleGuard("feed");
  return <HomeFeedScreen />;
}
