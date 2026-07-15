import { ContentManager } from "@/components/admin/ContentManager";
import { repository } from "@/lib/repository";

export const dynamic = "force-dynamic";

export default function AdminContentPage() {
  return <main className="admin-content"><ContentManager initialPosts={repository.listPosts()} /></main>;
}
