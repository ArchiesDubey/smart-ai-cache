// Non-blocking install notice. We deliberately do NOT prompt: npm/pnpm/yarn
// installs are usually non-interactive (CI, no TTY), and a blocking prompt
// would hang those. Semantic caching is opt-in; this just points the way.
//
// Never throw — a postinstall must not break the consumer's install.
try {
  // Skip noise during this package's own dev install (running inside its repo).
  const initCwd = process.env.INIT_CWD || '';
  const here = process.cwd();
  const isSelfInstall = initCwd === here || initCwd === '';

  if (!isSelfInstall && !process.env.CI) {
    const msg = [
      '',
      'smart-ai-cache installed.',
      '',
      '  • Exact-match caching works out of the box — no setup needed.',
      '  • Semantic caching (recommended) matches paraphrased prompts. To enable',
      '    it with the default local, zero-API-key model, run:',
      '',
      '        npx smart-ai-cache setup',
      '',
      '    Then: new AIResponseCache({ semantic: { enabled: true } })',
      '',
    ].join('\n');
    console.log(msg);
  }
} catch {
  // ignore — never fail an install over a notice
}
