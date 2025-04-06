import js from '@eslint/js';
import globals from 'globals';
import eslintPluginPrettierRecommended from 'eslint-plugin-prettier/recommended';

export default [
  // Apply recommended ESLint rules
  js.configs.recommended,

  // Apply Prettier rules (must be last to override others)
  eslintPluginPrettierRecommended,

  {
    // Global configuration for all JS files
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: {
        ...globals.node, // Node.js globals for main, preload, server
      },
    },
    rules: {
      'prettier/prettier': 'warn', // Show Prettier violations as warnings
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_' }], // Warn about unused variables, ignore if prefixed with _
      'no-console': 'off', // Allow console.log for debugging/server logs
    },
    ignores: ['node_modules/', 'dist/', 'build/'], // Ignore build output and dependencies
  },
  {
    // Specific configuration for renderer.js
    files: ['renderer.js'],
    languageOptions: {
      globals: {
        ...globals.browser, // Add browser globals for renderer
      },
    },
  },
];
