import { redirect } from "next/navigation";

/**
 * Stable entry for sample data — redirects to the dashboard with demo query.
 * Use /demo in links (login, marketing) so demo mode survives as a bookmarkable path.
 */
export default function DemoPage() {
  redirect("/?demo=1");
}
