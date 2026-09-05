/*
 * The mistakes a parser can see and a table check cannot.
 *
 * Eleven scripts reached for "overworld" without ever being handed it, and a
 * twelfth was defined twice so the second quietly replaced the first. Every
 * table those scripts used was correct; the fault was in the code around the
 * tables, and only a parser walking scopes finds a free variable or a repeated
 * key. Bug rules only - nothing about style - so a red result is always worth
 * reading.
 *
 *   npm run lint      (needs eslint on the PATH; not part of the build)
 */
export default [{
  files: ['src/**/*.js', 'tools/**/*.mjs', 'gba/export.mjs'],
  languageOptions: {
    ecmaVersion: 2024,
    sourceType: 'module',
    globals: {
      window: 'readonly', document: 'readonly', console: 'readonly', performance: 'readonly',
      requestAnimationFrame: 'readonly', cancelAnimationFrame: 'readonly',
      setTimeout: 'readonly', clearTimeout: 'readonly', setInterval: 'readonly', clearInterval: 'readonly',
      localStorage: 'readonly', navigator: 'readonly', location: 'readonly', fetch: 'readonly',
      AudioContext: 'readonly', Audio: 'readonly', Image: 'readonly', OffscreenCanvas: 'readonly',
      ImageData: 'readonly', Path2D: 'readonly', URL: 'readonly', Blob: 'readonly',
      process: 'readonly', Buffer: 'readonly', globalThis: 'readonly', structuredClone: 'readonly',
      queueMicrotask: 'readonly', CustomEvent: 'readonly', Event: 'readonly', KeyboardEvent: 'readonly',
      TextEncoder: 'readonly', TextDecoder: 'readonly', crypto: 'readonly', devicePixelRatio: 'readonly',
      getComputedStyle: 'readonly', ResizeObserver: 'readonly', FileReader: 'readonly',
      DOMParser: 'readonly', XMLSerializer: 'readonly', Worker: 'readonly',
      HTMLCanvasElement: 'readonly', HTMLElement: 'readonly', Element: 'readonly',
      CanvasRenderingContext2D: 'readonly', MouseEvent: 'readonly', TouchEvent: 'readonly',
      alert: 'readonly', confirm: 'readonly', prompt: 'readonly',
    },
  },
  rules: {
    /* A name nobody defined. This is the one that found the eleven. */
    'no-undef': 'error',
    /* A key written twice in one literal: the second wins and the first is
       gone without a word. This is the one that found the two innkeeps. */
    'no-dupe-keys': 'error',
    'no-dupe-args': 'error',
    'no-dupe-else-if': 'error',
    'no-dupe-class-members': 'error',
    'no-duplicate-case': 'error',
    'no-unreachable': 'error',
    'no-fallthrough': 'error',
    'no-constant-condition': ['error', { checkLoops: false }],
    'no-self-assign': 'error',
    'no-self-compare': 'error',
    'use-isnan': 'error',
    'valid-typeof': 'error',
    'no-unsafe-negation': 'error',
    'no-cond-assign': 'error',
    'no-empty-pattern': 'error',
    'no-loss-of-precision': 'error',
    'no-async-promise-executor': 'error',
    'no-compare-neg-zero': 'error',
    'no-sparse-arrays': 'error',
    'no-unsafe-finally': 'error',
    'no-func-assign': 'error',
    'no-import-assign': 'error',
    'no-const-assign': 'error',
    'no-class-assign': 'error',
    'no-setter-return': 'error',
    'getter-return': 'error',
    'no-obj-calls': 'error',
    'no-redeclare': 'error',
    'no-shadow-restricted-names': 'error',
    'for-direction': 'error',
    'no-unmodified-loop-condition': 'error',
    'no-unused-private-class-members': 'error',
    'array-callback-return': 'error',
    'no-template-curly-in-string': 'error',
    'no-useless-backreference': 'error',
    'no-misleading-character-class': 'error',
    'no-invalid-regexp': 'error',
  },
}];
