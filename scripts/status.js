// Reports everything the Play Developer API exposes about an app's release state.
const { google } = require('googleapis');

const pkg = process.argv[2];
const auth = new google.auth.GoogleAuth({
  credentials: JSON.parse(process.env.SERVICE_ACCOUNT_JSON),
  scopes: ['https://www.googleapis.com/auth/androidpublisher'],
});

(async () => {
  const ap = google.androidpublisher({ version: 'v3', auth: await auth.getClient() });
  const editId = (await ap.edits.insert({ packageName: pkg })).data.id;
  const q = { packageName: pkg, editId };

  const details = (await ap.edits.details.get(q)).data;
  console.log('=== APP DETAILS ===');
  console.log(JSON.stringify(details, null, 2));

  console.log('\n=== TRACKS ===');
  const tracks = (await ap.edits.tracks.list(q)).data.tracks || [];
  for (const t of tracks) {
    for (const r of t.releases || []) {
      console.log(`${t.track.padEnd(12)} status=${r.status} codes=${(r.versionCodes||[]).join(',')} name=${r.name||''} userFraction=${r.userFraction ?? '-'} countries=${r.countryTargeting ? JSON.stringify(r.countryTargeting) : 'all'}`);
    }
    if (!(t.releases||[]).length) console.log(`${t.track.padEnd(12)} (no releases)`);
  }

  console.log('\n=== BUNDLES ===');
  const bundles = (await ap.edits.bundles.list(q)).data.bundles || [];
  console.log(bundles.map(b => b.versionCode).join(', ') || '(none)');

  console.log('\n=== LISTINGS ===');
  const listings = (await ap.edits.listings.list(q)).data.listings || [];
  for (const l of listings) {
    const imgs = {};
    for (const type of ['phoneScreenshots','sevenInchScreenshots','tenInchScreenshots','icon','featureGraphic','tvBanner']) {
      const n = ((await ap.edits.images.list({ ...q, language: l.language, imageType: type })).data.images || []).length;
      if (n) imgs[type] = n;
    }
    console.log(`${l.language.padEnd(8)} title="${l.title}" short=${(l.shortDescription||'').length}ch full=${(l.fullDescription||'').length}ch video=${l.video?'yes':'no'} images=${JSON.stringify(imgs)}`);
  }

  await ap.edits.delete(q).catch(() => {});
  console.log('\nNote: content rating, data safety, target audience, app access, ads declaration,');
  console.log('and the closed-testing requirement are NOT exposed by the API - check Console UI.');
})().catch(e => { console.error(e.errors || e.message); process.exit(1); });
