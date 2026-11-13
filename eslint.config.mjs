// Bismuth ESLint (flat config). Rules mirror CLAUDE.md:
//  - user-visible text only via t() (yasak 8) → i18next/no-literal-string in the renderer
//  - logical CSS classes (ms-/me-/ps-/pe-/start-/end-) so an RTL language can be added later
//  - network APIs only in src/main/network, src/main/server, src/renderer/lib/transport (yasak 1)
import js from '@eslint/js'
import tseslint from 'typescript-eslint'
import react from 'eslint-plugin-react'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import i18next from 'eslint-plugin-i18next'
import prettier from 'eslint-config-prettier'
import globals from 'globals'

const physicalClass =
  '(?:^|\\s)-?(?:ml|mr|pl|pr|left|right|rounded-l|rounded-r|border-l|border-r|text-left|text-right)(?:-|\\s|$)'

const networkMessage =
  'Ağ kodu yalnız src/main/network, src/main/server, src/renderer/lib/transport (CLAUDE.md yasak 1).'

const moneyName = '/(minor|amount|price)/i'
const moneyMessage =
  'Para tutarında * / % yok: src/shared/money.ts (multiplyRatio, allocate) kullanın (CLAUDE.md yasak 6, G-131).'

export default tseslint.config(
  {
    ignores: [
      '**/node_modules/**',
      'out/**',
      'release/**',
      'dist/**',
      'coverage/**',
      'drizzle/**',
      'docs/**',
      'tools/**',
      '.claude/**',
      'playwright-report/**',
      'test-results/**',
      '.tmp/**'
    ]
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: { globals: { ...globals.node } },
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      '@typescript-eslint/consistent-type-imports': ['error', { fixStyle: 'inline-type-imports' }],
      'no-restricted-globals': [
        'error',
        {
          name: 'fetch',
          message:
            'Ağ kodu yalnız src/main/network, src/main/server, src/renderer/lib/transport (CLAUDE.md yasak 1).'
        },
        { name: 'XMLHttpRequest', message: 'Ağ kodu yalnız izinli klasörlerde (CLAUDE.md yasak 1).' },
        { name: 'WebSocket', message: 'Ağ kodu yalnız izinli klasörlerde (CLAUDE.md yasak 1).' },
        { name: 'EventSource', message: 'Ağ kodu yalnız izinli klasörlerde (CLAUDE.md yasak 1).' }
      ],
      // The same rule for network modules (Faz 16 P16a): sockets, HTTP clients and servers, mDNS.
      'no-restricted-imports': [
        'error',
        {
          paths: [
            ...['http', 'https', 'http2', 'net', 'tls', 'dgram', 'dns'].flatMap((m) =>
              [m, `node:${m}`].map((name) => ({ name, message: networkMessage }))
            ),
            ...['undici', 'axios', 'ws', 'got', 'node-fetch', 'bonjour-service', '@hono/node-server'].map(
              (name) => ({ name, message: networkMessage })
            ),
            { name: 'electron', importNames: ['net'], message: networkMessage }
          ]
        }
      ]
    }
  },
  {
    // The three network folders of CLAUDE.md yasak 1; src/main/discovery is the server mode's local-network
    // announcement (mDNS, never the internet, faz-13 madde 1). Tests and scripts start fake servers.
    files: [
      'src/main/network/**',
      'src/main/server/**',
      'src/main/discovery/**',
      'src/renderer/lib/transport/**',
      'tests/**',
      'scripts/**'
    ],
    rules: { 'no-restricted-globals': 'off', 'no-restricted-imports': 'off' }
  },
  {
    files: ['src/renderer/**/*.{ts,tsx}', 'tests/unit/setup-dom.ts'],
    languageOptions: { globals: { ...globals.browser } },
    settings: { react: { version: 'detect' } },
    plugins: { react, 'react-hooks': reactHooks, 'react-refresh': reactRefresh, i18next },
    rules: {
      ...react.configs.flat.recommended.rules,
      ...react.configs.flat['jsx-runtime'].rules,
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
      'react/prop-types': 'off',
      'i18next/no-literal-string': [
        'error',
        {
          mode: 'jsx-only',
          'jsx-attributes': { include: ['title', 'placeholder', 'aria-label', 'alt', 'label'] },
          callees: {
            exclude: [
              't',
              'i18n.t',
              'cn',
              'cva',
              'console.*',
              'Error',
              'require',
              'register',
              'form.register',
              'useApiQuery',
              // Formatting calls take style names ('full', 'short'), never text (hooks/use-format.ts).
              'f.date',
              'f.dayMonth',
              'f.weekday',
              'f.monthYear',
              'f.time',
              'f.money',
              'f.number',
              'f.percent',
              'startsWith',
              'endsWith',
              // Permission checks take permission keys (shared/permissions.ts), never text.
              'can'
            ]
          }
        }
      ],
      'no-restricted-syntax': [
        'error',
        {
          selector: `JSXAttribute[name.name='className'] Literal[value=/${physicalClass}/]`,
          message:
            'Mantıksal sınıf kullanın (ms-/me-/ps-/pe-/start-/end-/text-start); fiziksel yön yalnız takvim ızgarasında (CLAUDE.md yasak 8).'
        },
        {
          selector: `JSXAttribute[name.name='className'] TemplateElement[value.raw=/${physicalClass}/]`,
          message:
            'Mantıksal sınıf kullanın (ms-/me-/ps-/pe-/start-/end-/text-start); fiziksel yön yalnız takvim ızgarasında (CLAUDE.md yasak 8).'
        }
      ]
    }
  },
  {
    // Vendored shadcn/ui primitives keep upstream class names (they are direction-aware via rtl: variants).
    files: ['src/renderer/components/ui/**'],
    rules: {
      'no-restricted-syntax': 'off',
      'react-refresh/only-export-components': 'off',
      'react-hooks/purity': 'off'
    }
  },
  {
    // The tape chart is the calendar grid: a `dir="ltr"` island where days run left to right in every language
    // (.claude/rules/ui.md), so physical left/right classes are its geometry, not text direction.
    files: ['src/renderer/components/tape-chart/**'],
    rules: { 'no-restricted-syntax': 'off' }
  },
  {
    // lib/ mixes providers and hooks on purpose; shared components export their pure helpers next to them so
    // the helper and the component are tested together (fast refresh is a dev-only convenience).
    files: [
      'src/renderer/lib/**',
      'src/renderer/components/**',
      'src/renderer/mocks/**',
      'src/renderer/test/**'
    ],
    rules: { 'react-refresh/only-export-components': 'off' }
  },
  {
    // Scripts run code inside the app's page (Playwright page.evaluate) as well as in Node.
    files: ['scripts/**', 'tests/e2e/**'],
    languageOptions: { globals: { ...globals.node, ...globals.browser } }
  },
  {
    // Money is integer minor units; multiplication/division only in src/shared/money.ts (CLAUDE.md yasak 6, G-131).
    files: ['src/main/**/*.ts', 'src/shared/**/*.ts'],
    ignores: ['src/shared/money.ts', '**/*.test.ts'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector: `BinaryExpression[operator=/^[*/%]$/] > Identifier[name=${moneyName}]`,
          message: moneyMessage
        },
        {
          selector: `BinaryExpression[operator=/^[*/%]$/] > MemberExpression[property.name=${moneyName}]`,
          message: moneyMessage
        },
        {
          selector: `CallExpression[callee.name='parseFloat'], CallExpression[callee.property.name=/^(parseFloat|toFixed)$/]`,
          message: 'Para için kayan sayı yok: parseMoney / formatMoney kullanın (CLAUDE.md yasak 6).'
        }
      ]
    }
  },
  {
    files: ['**/*.test.{ts,tsx}', 'tests/**'],
    rules: { 'i18next/no-literal-string': 'off' }
  },
  prettier
)
