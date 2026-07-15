import { SettingsManager } from "@/components/admin/SettingsManager";
import { repository } from "@/lib/repository";

export const dynamic = "force-dynamic";

export default function AdminSettingsPage() {
  return <main className="admin-content"><SettingsManager initialSettings={repository.getSettings()} /></main>;
}
