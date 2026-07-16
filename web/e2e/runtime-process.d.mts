import type { EventEmitter } from "node:events";

type SupervisedChild = EventEmitter & {
  kill(signal: NodeJS.Signals): boolean;
};

export function superviseChildProcess(
  child: SupervisedChild,
  signalSource?: EventEmitter,
): Promise<number>;
