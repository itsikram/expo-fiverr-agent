// Learn more https://docs.expo.io/guides/customizing-metro
const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(__dirname);

// Exclude Android build directories from being watched
config.watchFolders = config.watchFolders || [];
config.resolver = config.resolver || {};
config.resolver.blockList = config.resolver.blockList || [];

// Block Android build directories and other build artifacts
config.resolver.blockList.push(
  /android\/app\/build\/.*/,
  /android\/app\/\.cxx\/.*/,
  /android\/build\/.*/,
  /android\/\.gradle\/.*/,
  /\.cxx\/.*/,
);

// Filter out problematic directories from watchFolders
const projectRoot = __dirname;
config.watchFolders = config.watchFolders.filter((folder) => {
  const normalizedFolder = path.normalize(folder);
  return (
    !normalizedFolder.includes(path.join('android', 'app', '.cxx')) &&
    !normalizedFolder.includes(path.join('android', 'build')) &&
    !normalizedFolder.includes(path.join('android', '.gradle'))
  );
});

// Add watcher ignore patterns
config.watcher = config.watcher || {};
config.watcher.ignored = [
  ...(config.watcher.ignored || []),
  '**/android/app/.cxx/**',
  '**/android/app/build/**',
  '**/android/build/**',
  '**/android/.gradle/**',
];

module.exports = config;
