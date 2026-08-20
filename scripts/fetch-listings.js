// Dumps the store listings currently live for a package, so we can add
// locales without overwriting anything by accident.
// Usage: node scripts/fetch-listings.js <packageName>
// Env: SERVICE_ACCOUNT_JSON

const { google } = require('googleapis');

const pkg = process.argv[2];
if (!pkg) {
  console.error('usage: node fetch-listings.js <package>');
  process.exit(1);
}

async function main() {
  const auth = new google.auth.GoogleAuth({
    credentials: JSON.parse(process.env.SERVICE_ACCOUNT_JSON),
    scopes: ['https://www.googleapis.com/auth/androidpublisher'],
  });
  const play = google.androidpublisher({ version: 'v3', auth });

  const edit = await play.edits.insert({ packageName: pkg });
  const editId = edit.data.id;

  const res = await play.edits.listings.list({ packageName: pkg, editId });
  const listings = res.data.listings || [];
  console.log('LOCALES:', listings.map((l) => l.language).join(', ') || '(none)');
  for (const l of listings) {
    console.log(
      `[${l.language}] title=${JSON.stringify(l.title)} short=${JSON.stringify(
        l.shortDescription
      )} fullChars=${[...(l.fullDescription || '')].length}`
    );
  }

  const details = await play.edits.details.get({ packageName: pkg, editId });
  console.log('DETAILS:', JSON.stringify(details.data));

  await play.edits.delete({ packageName: pkg, editId });
  console.log('edit discarded (read-only)');
}

main().catch((e) => {
  console.error('FAILED:', e.message);
  process.exit(1);
});
