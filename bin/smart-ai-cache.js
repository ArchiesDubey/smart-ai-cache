#!/usr/bin/env node
import { spawnSync } from 'node:child_process';

const EMBEDDINGS_PKG = '@xenova/transformers';

function detectInstaller() {
  const ua = process.env.npm_config_user_agent || '';
  if (ua.startsWith('pnpm')) return ['pnpm', 'add'];
  if (ua.startsWith('yarn')) return ['yarn', 'add'];
  return ['npm', 'install'];
}

function setup() {
  const [cmd, addArg] = detectInstaller();
  console.log(`\nInstalling local embedding model dependency (${EMBEDDINGS_PKG}) with ${cmd}...\n`);
  const result = spawnSync(cmd, [addArg, EMBEDDINGS_PKG], { stdio: 'inherit', shell: process.platform === 'win32' });
  if (result.status !== 0) {
    console.error(`\nFailed to install ${EMBEDDINGS_PKG}. You can install it manually:\n  ${cmd} ${addArg} ${EMBEDDINGS_PKG}\n`);
    process.exit(result.status ?? 1);
  }
  console.log('\n✅ Semantic caching is ready. Enable it with:\n');
  console.log("  const cache = new AIResponseCache({ semantic: { enabled: true } });\n");
}

function help() {
  console.log(`smart-ai-cache

Usage:
  npx smart-ai-cache setup    Install the local embedding model (${EMBEDDINGS_PKG})
                              needed for semantic caching with the default provider.
  npx smart-ai-cache help     Show this message.

Semantic caching is OFF by default. The exact-match cache needs no setup.
If you bring your own embeddings (e.g. OpenAIEmbeddingProvider), you do not
need to run setup.`);
}

const command = process.argv[2];
switch (command) {
  case 'setup':
    setup();
    break;
  case 'help':
  case '--help':
  case '-h':
  case undefined:
    help();
    break;
  default:
    console.error(`Unknown command: ${command}\n`);
    help();
    process.exit(1);
}
