function waitForExit(child, timeoutMs) {
  if (!child || child.exitCode !== null || child.signalCode !== null) return Promise.resolve();
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, timeoutMs);
    child.once("exit", () => {
      clearTimeout(timer);
      resolve();
    });
  });
}

export async function shutdownChildrenInOrder({
  children,
  gateway,
  code,
  gatewayDrainMs = 11_000,
  privateDrainMs = 4_000,
  failSafeMs = 16_000,
  exit = process.exit,
}) {
  const force = setTimeout(() => {
    for (const child of children) child.kill("SIGKILL");
    setTimeout(() => exit(code || 1), 250);
  }, failSafeMs);

  if (gateway && gateway.exitCode === null && gateway.signalCode === null) {
    gateway.kill("SIGTERM");
    await waitForExit(gateway, gatewayDrainMs);
  }

  const privateChildren = children.filter((child) => child !== gateway);
  for (const child of privateChildren) {
    if (child.exitCode === null && child.signalCode === null) child.kill("SIGTERM");
  }
  await Promise.all(privateChildren.map((child) => waitForExit(child, privateDrainMs)));
  for (const child of children) {
    if (child.exitCode === null && child.signalCode === null) child.kill("SIGKILL");
  }
  clearTimeout(force);
  exit(code);
}