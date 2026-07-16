import { cleanupE2EState } from "./support/cleanup";
import { readE2EPaths } from "./support/test-paths";

export default async function globalSetup(): Promise<void> {
  await cleanupE2EState(readE2EPaths());
}
