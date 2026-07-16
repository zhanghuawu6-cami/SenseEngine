import { removeE2EState } from "./support/cleanup";
import { readE2EPaths } from "./support/test-paths";

export default async function globalTeardown(): Promise<void> {
  await removeE2EState(readE2EPaths());
}
