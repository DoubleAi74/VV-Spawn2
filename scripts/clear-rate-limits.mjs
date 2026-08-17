/**
 * scripts/clear-rate-limits.mjs
 *
 * Clears rate-limit windows, so a locked-out address or IP can try again
 * immediately instead of waiting out the window. Windows expire on their own
 * via the TTL index; this is the "let me back in now" lever.
 *
 *   node scripts/clear-rate-limits.mjs                 # dry run, lists every live window
 *   node scripts/clear-rate-limits.mjs --commit        # delete them all
 *   node scripts/clear-rate-limits.mjs --key login-ip  # only keys containing "login-ip"
 *
 * Follows the same shape as scripts/normalize-order.mjs: dry run by default,
 * prints exactly what it would change, and writes only with --commit.
 */
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import mongoose from 'mongoose';

const __dirname = dirname(fileURLToPath(import.meta.url));
const COMMIT = process.argv.includes('--commit');

function argValue(name) {
  const index = process.argv.indexOf(name);
  return index === -1 ? null : process.argv[index + 1] || null;
}

const KEY_FILTER = argValue('--key');

function loadMongoUri() {
  if (process.env.MONGODB_URI) return process.env.MONGODB_URI;
  const env = readFileSync(resolve(__dirname, '..', '.env.local'), 'utf8');
  const match = env.match(/^MONGODB_URI=(.*)$/m);
  if (!match) throw new Error('MONGODB_URI not found in environment or .env.local');
  return match[1].trim().replace(/^["']|["']$/g, '');
}

async function main() {
  await mongoose.connect(loadMongoUri(), { bufferCommands: false });
  const rateLimits = mongoose.connection.db.collection('ratelimits');

  console.log(COMMIT ? '\n=== APPLYING CHANGES ===\n' : '\n=== DRY RUN (no writes) ===\n');

  const filter = KEY_FILTER ? { key: { $regex: KEY_FILTER } } : {};
  const docs = await rateLimits.find(filter).sort({ key: 1 }).toArray();

  const now = Date.now();
  for (const doc of docs) {
    const secondsLeft = Math.round((new Date(doc.expiresAt).getTime() - now) / 1000);
    console.log(
      `   ${doc.key}  hits=${doc.hits}  ${
        secondsLeft > 0 ? `${secondsLeft}s left` : 'expired (TTL will sweep it)'
      }`
    );
  }

  if (COMMIT && docs.length) {
    const result = await rateLimits.deleteMany(filter);
    console.log(`\nApplied: ${result.deletedCount} rate-limit windows deleted.`);
  } else {
    console.log(
      `\n${COMMIT ? 'Applied' : 'Would apply'}: ${docs.length} rate-limit window deletions.`
    );
    if (!COMMIT && docs.length > 0) {
      console.log('Re-run with --commit to apply.\n');
    }
  }

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
