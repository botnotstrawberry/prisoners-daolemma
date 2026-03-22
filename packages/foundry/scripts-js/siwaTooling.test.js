import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "child_process";

test("authCli help documents permissionless ERC-8004 flow only", () => {
  const result = spawnSync("node", ["scripts-js/authCli.js", "help"], {
    cwd: new URL("..", import.meta.url),
    encoding: "utf8",
  });

  assert.equal(result.status, 0);
  assert.match(result.stdout, /Permissionless ERC-8004 admission tooling/);
  assert.match(result.stdout, /No verifier-backed permits/);
  assert.doesNotMatch(result.stdout, /siwa-sign/i);
});

test("authCli permit command is retired", () => {
  const result = spawnSync("node", ["scripts-js/authCli.js", "permit"], {
    cwd: new URL("..", import.meta.url),
    encoding: "utf8",
  });

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /permit flow has been retired/i);
});
