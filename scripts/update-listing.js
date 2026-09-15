// Pushes store listing text, graphics, screenshots, and contact details for
// one app via the Play Developer API. Runs inside GitHub Actions.
// Usage: node scripts/update-listing.js <packageName> <listingDir>
// Env: SERVICE_ACCOUNT_JSON (key file contents)

const fs = require('fs');
const path = require('path');
const { google } = require('googleapis');

const [pkg, dir] = process.argv.slice(2);
if (!pkg || !dir) {
  console.error('usage: node update-listing.js <package> <listingDir>');
  process.exit(1);
}

const IMAGE_TYPES = {
  'graphics/app_icon_512x512.png': 'icon',
  'graphics/feature_graphic_1024x500.png': 'featureGraphic',
};
const SCREENSHOT_DIRS = {
  'screenshots/phone': 'phoneScreenshots',
  'screenshots/tablet_7in': 'sevenInchScreenshots',
  'screenshots/tablet_10in': 'tenInchScreenshots',
};

async function main() {
  const auth = new google.auth.GoogleAuth({
    credentials: JSON.parse(process.env.SERVICE_ACCOUNT_JSON),
    scopes: ['https://www.googleapis.com/auth/androidpublisher'],
  });
  const play = google.androidpublisher({ version: 'v3', auth });

  const edit = await play.edits.insert({ packageName: pkg });
  const editId = edit.data.id;
  console.log('edit', editId);

  // Every subdirectory holding a title.txt is a locale listing (en-US, fr-FR, ...).
  const locales = fs
    .readdirSync(dir)
    .filter((d) => fs.existsSync(path.join(dir, d, 'title.txt')));
  for (const locale of locales) {
    const read = (f) =>
      fs.readFileSync(path.join(dir, locale, f), 'utf8').trim();
    await play.edits.listings.update({
      packageName: pkg,
      editId,
      language: locale,
      requestBody: {
        language: locale,
        title: read('title.txt'),
        shortDescription: read('short.txt'),
        fullDescription: read('full.txt'),
      },
    });
    console.log('listing text set:', locale);
  }

  await play.edits.details.update({
    packageName: pkg,
    editId,
    requestBody: {
      contactEmail: 'najat.adlani.dev@gmail.com',
      contactWebsite: fs.existsSync(path.join(dir, 'website.txt'))
        ? fs.readFileSync(path.join(dir, 'website.txt'), 'utf8').trim()
        : 'https://www.playreels.app',
      defaultLanguage: 'en-US',
    },
  });
  console.log('contact details set');

  // Graphics are optional: a text-only listing directory leaves whatever is
  // already live in the console untouched.
  for (const [file, imageType] of Object.entries(IMAGE_TYPES)) {
    if (!fs.existsSync(path.join(dir, file))) {
      console.log('skipping', imageType, '(not in this listing dir)');
      continue;
    }
    await play.edits.images.deleteall({ packageName: pkg, editId, language: 'en-US', imageType });
    await play.edits.images.upload({
      packageName: pkg,
      editId,
      language: 'en-US',
      imageType,
      media: { mimeType: 'image/png', body: fs.createReadStream(path.join(dir, file)) },
    });
    console.log('uploaded', imageType);
  }

  for (const [subdir, imageType] of Object.entries(SCREENSHOT_DIRS)) {
    const full = path.join(dir, subdir);
    if (!fs.existsSync(full)) continue;
    const files = fs.readdirSync(full).filter((f) => /\.(png|jpg|jpeg)$/i.test(f)).sort();
    if (!files.length) continue;
    await play.edits.images.deleteall({ packageName: pkg, editId, language: 'en-US', imageType });
    for (const f of files) {
      await play.edits.images.upload({
        packageName: pkg,
        editId,
        language: 'en-US',
        imageType,
        media: { mimeType: 'image/png', body: fs.createReadStream(path.join(full, f)) },
      });
    }
    console.log('uploaded', files.length, imageType);
  }

  // Unpublished apps with outstanding declarations often refuse a normal
  // commit; changesNotSentForReview parks the changes until the human forms
  // are answered in the console.
  if (process.env.NOTSENT === 'true') {
    await play.edits.commit({ packageName: pkg, editId, changesNotSentForReview: true });
    console.log('COMMITTED (changesNotSentForReview, forced)');
    return;
  }
  try {
    await play.edits.commit({ packageName: pkg, editId });
    console.log('COMMITTED (sent for review)');
  } catch (e) {
    console.log('normal commit refused:', e.message);
    await play.edits.commit({ packageName: pkg, editId, changesNotSentForReview: true });
    console.log('COMMITTED (changesNotSentForReview)');
  }
}

main().catch((e) => {
  console.error('FAILED:', e.message);
  process.exit(1);
});
