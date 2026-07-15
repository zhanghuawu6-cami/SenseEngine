import { MediaManager } from "@/components/admin/MediaManager";
import { repository } from "@/lib/repository";

export const dynamic = "force-dynamic";

export default function AdminMediaPage() {
  return <main className="admin-content"><MediaManager initialMedia={repository.listMedia()} /></main>;
}
