import { resolve } from 'node:path'
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

const alias = {
  '@': resolve('src/renderer'),
  '@shared': resolve('src/shared'),
  '@main': resolve('src/main')
}

export default defineConfig({
  resolve: { alias },
  test: {
    // faz-02 kabul ölçütü: business rules and services ≥ 85 % (npm run test:coverage); Faz 16 madde 1: the pure
    // business rules (src/shared/domain) ≥ 90 %.
    coverage: {
      provider: 'v8',
      include: ['src/shared/domain/**/*.ts', 'src/main/services/**/*.ts'],
      exclude: ['**/*.test.ts', '**/index.ts'],
      reporter: ['text-summary', 'text'],
      thresholds: {
        statements: 85,
        lines: 85,
        functions: 85,
        branches: 75,
        'src/shared/domain/**/*.ts': { statements: 90, lines: 90, functions: 90, branches: 85 }
      }
    },
    projects: [
      {
        resolve: { alias },
        test: {
          name: 'node',
          environment: 'node',
          // Services read the hotel's wall clock (business day, task due times): run them in the hotel's zone
          // whatever the developer's or CI machine's zone is.
          env: { TZ: 'Europe/Istanbul' },
          // Password hashing (scrypt) and full service flows: generous on a busy machine (several agents build and
          // test in parallel on 4 cores), still catches hangs.
          testTimeout: 60_000,
          include: ['src/shared/**/*.test.ts', 'src/main/**/*.test.ts', 'tests/unit/**/*.test.ts']
        }
      },
      {
        resolve: { alias },
        plugins: [react()],
        test: {
          name: 'dom',
          environment: 'jsdom',
          include: ['src/renderer/**/*.test.{ts,tsx}'],
          setupFiles: ['tests/unit/setup-dom.ts'],
          // Screens format the hotel's "today" with the local clock: same zone as the node project.
          env: { TZ: 'Europe/Istanbul' },
          // Screens with many Radix controls render slowly in jsdom when every file runs in parallel, and slower
          // still when parallel agents share the machine.
          testTimeout: 60_000
        }
      }
    ]
  }
})
