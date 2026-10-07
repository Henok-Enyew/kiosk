module.exports = {
  preset: '@react-native/jest-preset',
  // The preset's pattern misses pnpm's `node_modules/.pnpm/<pkg>@<version>/...` paths.
  transformIgnorePatterns: [
    'node_modules/(?!(?:\\.pnpm/)?((jest-)?react-native|@react-native(-community)?))',
  ],
};
