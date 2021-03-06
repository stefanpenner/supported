module.exports = {
  root: true,
  parserOptions: {
    ecmaVersion: 2021,
    sourceType: 'module',
  },
  ignorePatterns: ['**/package-is-folder/', '**/package-is-not-json/'],
  plugins: ['node', 'prettier'],
  extends: ['eslint:recommended', 'plugin:node/recommended', 'plugin:prettier/recommended'],
  env: {
    node: true,
  },
  rules: {
    'node/shebang': 'off',
  },
  overrides: [
    {
      env: { mocha: true },
      files: '**/*-test.js',
      plugins: ['mocha'],
      extends: ['plugin:mocha/recommended'],
      rules: {
        'node/no-unpublished-require': 'off',
        'mocha/no-setup-in-describe': 'off',
        'mocha/no-hooks-for-single-case': 'off',
      },
    },
  ],
};
