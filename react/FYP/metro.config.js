// metro.config.js — bundle the .tflite model as an asset (react-native-fast-tflite).
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);
config.resolver.assetExts.push('tflite'); // so require('../assets/*.tflite') resolves

// Firebase JS SDK v12 has no root `main` field and its "exports" map lacks a
// `react-native` condition, so Metro (package exports ON in SDK 54) cannot resolve
// firebase/auth, firebase/firestore, etc. Disabling package exports falls back to
// the per-subpath package.json `react-native`/`main` fields (and .cjs entries).
// Every other dependency here still has a `main` field, so this is safe.
config.resolver.sourceExts.push('cjs');
config.resolver.unstable_enablePackageExports = false;

module.exports = config;
