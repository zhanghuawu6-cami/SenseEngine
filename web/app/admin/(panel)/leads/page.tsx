import { LeadsManager } from "@/components/admin/LeadsManager";
import { repository } from "@/lib/repository";

export const dynamic = "force-dynamic";

export default function AdminLeadsPage() {
  return <main className="admin-content"><LeadsManager initialLeads={repository.listLeads()} /></main>;
}
