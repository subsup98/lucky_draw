// Expo + pnpm workspace + NativeWind 통합 Metro 설정.
// - watchFolders: 모노레포 루트까지 감시 (workspace: 패키지 변경 감지).
// - nodeModulesPaths: 앱 로컬 + 워크스페이스 루트 양쪽 탐색.
// - disableHierarchicalLookup: pnpm symlink 환경에서 잘못된 상위 디렉토리 탐색 방지.
const path = require("path");
const { getDefaultConfig } = require("expo/metro-config");
const { withNativeWind } = require("nativewind/metro");

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, "../..");

const config = getDefaultConfig(projectRoot);

config.watchFolders = [workspaceRoot];
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, "node_modules"),
  path.resolve(workspaceRoot, "node_modules"),
];
config.resolver.disableHierarchicalLookup = true;

module.exports = withNativeWind(config, { input: "./global.css" });
