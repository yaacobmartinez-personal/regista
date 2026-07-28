import { redirect } from "next/navigation";

/**
 * Dashboard root. Nothing renders here: this path is the same visible URL as
 * the marketing home (they differ only by subdomain), so it hands off to the
 * chooser rather than risking the router cache serving the landing page.
 */
export default function DashboardRoot() {
  redirect("/orgs");
}
