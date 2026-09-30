import js from '@eslint/js';
import ts from 'typescript-eslint';
export default ts.config({ignores:['dist/**','node_modules/**','.local/**','test-results/**','playwright-report/**']},js.configs.recommended,...ts.configs.recommended,{files:['scripts/*.mjs'],languageOptions:{globals:{process:'readonly',console:'readonly',URL:'readonly'}}},{files:['**/*.ts'],rules:{'@typescript-eslint/no-explicit-any':'off'}});
