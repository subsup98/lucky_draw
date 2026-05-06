module.exports = function (api) {
  api.cache(true);
  return {
    presets: [
      ["babel-preset-expo", { jsxImportSource: "nativewind" }],
      "nativewind/babel",
    ],
    plugins: [
      // expo-router 가 의존하는 react-native-reanimated 플러그인은 항상 마지막에.
      "react-native-reanimated/plugin",
    ],
  };
};
