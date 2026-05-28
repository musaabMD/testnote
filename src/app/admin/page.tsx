import AdminDashboard from "./AdminDashboard";
import { getAdminClerkSnapshot } from "@/lib/admin-clerk-metrics.server";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const clerkSnapshot = await getAdminClerkSnapshot();
  return <AdminDashboard clerkSnapshot={clerkSnapshot} />;
}
