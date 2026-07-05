const { spawnSync } = require("node:child_process");

spawnSync("git", ["config", "core.hooksPath", ".githooks"], {
  stdio: "ignore",
});
