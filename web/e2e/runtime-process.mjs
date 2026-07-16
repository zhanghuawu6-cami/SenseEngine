const signalExitCodes = {
  SIGINT: 130,
  SIGTERM: 143,
};

export function superviseChildProcess(child, signalSource = process) {
  return new Promise((resolve, reject) => {
    let forwardedSignal = null;
    let settled = false;

    const cleanupListeners = () => {
      signalSource.off("SIGINT", onSigint);
      signalSource.off("SIGTERM", onSigterm);
      child.off("error", onError);
      child.off("exit", onExit);
    };
    const settle = (callback) => {
      if (settled) return;
      settled = true;
      cleanupListeners();
      callback();
    };
    const forwardSignal = (signal) => {
      if (forwardedSignal !== null) return;
      forwardedSignal = signal;
      child.kill(signal);
    };
    const onSigint = () => forwardSignal("SIGINT");
    const onSigterm = () => forwardSignal("SIGTERM");
    const onError = (error) => settle(() => reject(error));
    const onExit = (code, signal) => {
      settle(() => {
        if (forwardedSignal !== null) {
          resolve(signalExitCodes[forwardedSignal]);
        } else if (code !== null) {
          resolve(code);
        } else {
          reject(new Error(`Playwright exited from signal ${signal ?? "unknown"}`));
        }
      });
    };

    signalSource.once("SIGINT", onSigint);
    signalSource.once("SIGTERM", onSigterm);
    child.once("error", onError);
    child.once("exit", onExit);
  });
}
