// Removes all store images from every non-default locale so Google Play falls
// back to the default (en-US) graphics/screenshots. Fixes stale per-locale
// images left over from an app's previous identity.
// Usage: node scripts/sync-images.js <packageName>
const { google } = require('googleapis');

const [pkg] = process.argv.slice(2);
if (!pkg) { console.error('usage: node sync-images.js <package>'); process.exit(1); }

const IMAGE_TYPES = ['phoneScreenshots', 'sevenInchScreenshots', 'tenInchScreenshots',
  'icon', 'featureGraphic', 'promoGraphic', 'tvBanner', 'tvScreenshots', 'wearScreenshots'];

async function main() {
  const auth = new google.auth.GoogleAuth({
    credentials: JSON.parse(process.env.SERVICE_ACCOUNT_JSON),
    scopes: ['https://www.googleapis.com/auth/androidpublisher'],
  });
  const play = google.androidpublisher({ version: 'v3', auth });
  const editId = (await play.edits.insert({ packageName: pkg })).data.id;
  const details = (await play.edits.details.get({ packageName: pkg, editId })).data;
  const def = details.defaultLanguage || 'en-US';
  const listings = (await play.edits.listings.list({ packageName: pkg, editId })).data.listings || [];
  console.log('default', def, '| locales:', listings.map((l) => l.language).join(' '));
  let removed = 0;
  for (const l of listings) {
    if (l.language === def) continue;
    for (const imageType of IMAGE_TYPES) {
      const r = await play.edits.images.list({ packageName: pkg, editId, language: l.language, imageType });
      const n = (r.data.images || []).length;
      if (!n) continue;
      await play.edits.images.deleteall({ packageName: pkg, editId, language: l.language, imageType });
      console.log('removed', n, imageType, 'from', l.language);
      removed += n;
    }
  }
  console.log('total removed:', removed);
  if (!removed) { await play.edits.delete({ packageName: pkg, editId }); console.log('nothing to commit'); return; }
  try {
    await play.edits.commit({ packageName: pkg, editId });
    console.log('COMMITTED (sent for review)');
  } catch (e) {
    console.log('normal commit refused:', e.message);
    await play.edits.commit({ packageName: pkg, editId, changesNotSentForReview: true });
    console.log('COMMITTED (changesNotSentForReview)');
  }
}
main().catch((e) => { console.error('FAILED:', e.message); process.exit(1); });
