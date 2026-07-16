import { cleanupE2EState } from "./support/cleanup";

export default async function globalSetup(): Promise<void> {
  await cleanupE2EState();
}
