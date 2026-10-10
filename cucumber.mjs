export default {
    paths: ['tests/bdd/features/**/*.feature'],
    import: ['tests/bdd/support/hooks.ts', 'tests/bdd/steps/**/*.ts'],
    format: [
      './node_modules/@serenity-js/cucumber/lib/index.js',
      'summary:reports/bdd/summary.txt',
      'html:reports/bdd/cucumber.html',
      'json:reports/bdd/cucumber.json',
    ],
    formatOptions: { specDirectory: 'tests/bdd/features' },
    parallel: 0,
    retry: 0,
    strict: true,
};
