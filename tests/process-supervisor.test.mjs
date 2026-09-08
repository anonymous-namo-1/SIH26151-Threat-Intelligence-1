import test from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { shutdownChildrenInOrder } from "../artifacts/api-server/processSupervisor.mjs";

class FakeChild extends EventEmitter {
  exitCode = null;
  signalCode = null;

  constructor(name, events, exitOnTerm = true) {
    super();
    this.name = name;
    this.events = events;
    this.exitOnTerm = exitOnTerm;
  }

  kill(signal) {
    this.events.push(`${this.name}:${signal}`);
    if (signal === "SIGTERM" && this.exitOnTerm) {
      setTimeout(() => {
        this.signalCode = signal;
        this.emit("exit", null, signal);
      }, 1);
    }
    if (signal === "SIGKILL") this.signalCode = signal;
    return true;
  }
}

test("gateway drains before private API and cache terminate", async () => {
  const events = [];
  const gateway = new FakeChild("gateway", events);
  const python = new FakeChild("python", events);
  const redis = new FakeChild("redis", events);
  await shutdownChildrenInOrder({
    children: [redis, python, gateway],
    gateway,
    code: 0,
    gatewayDrainMs: 20,
    privateDrainMs: 20,
    failSafeMs: 100,
    exit: (code) => events.push(`exit:${code}`),
  });
  assert.deepEqual(events, [
    "gateway:SIGTERM",
    "redis:SIGTERM",
    "python:SIGTERM",
    "exit:0",
  ]);
});

test("stuck children are killed without becoming orphans", async () => {
  const events = [];
  const gateway = new FakeChild("gateway", events, false);
  const python = new FakeChild("python", events, false);
  await shutdownChildrenInOrder({
    children: [python, gateway],
    gateway,
    code: 0,
    gatewayDrainMs: 2,
    privateDrainMs: 2,
    failSafeMs: 50,
    exit: (code) => events.push(`exit:${code}`),
  });
  assert.deepEqual(events, [
    "gateway:SIGTERM",
    "python:SIGTERM",
    "python:SIGKILL",
    "gateway:SIGKILL",
    "exit:0",
  ]);
});