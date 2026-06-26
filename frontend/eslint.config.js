import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{js,jsx}'],
    extends: [
      js.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      globals: globals.browser,
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    rules: {
      // Nuestro patrón intencional de carga al montar — `useEffect(() => { load() }, [load])`
      // donde `load` es un useCallback que hace `setLoading(true)` antes del await — es el
      // caso idiomático de data-fetching-on-mount que la propia doc de React acepta. La regla
      // (nueva en react-hooks v6) lo marca como error; la dejamos como aviso para no romper CI
      // ni contorsionar 11 efectos correctos. Sigue visible para no abusarla.
      'react-hooks/set-state-in-effect': 'warn',
    },
  },
])
