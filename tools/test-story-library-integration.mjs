import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const css = readFileSync(new URL('../app.css', import.meta.url), 'utf8');
const app = readFileSync(new URL('../app.js', import.meta.url), 'utf8');

for (const marker of [
  'onclick="openAiedueLibrary()"',
  'id="aiedue-library-modal"',
  'id="aiedue-library-create-btn"',
  'id="aiedue-library-characters-btn"',
  'id="aiedue-library-content"'
]) assert.ok(html.includes(marker), `index.html marker missing: ${marker}`);

for (const marker of [
  'id="settings-image-test-tab"',
  'id="settings-image-prompt"',
  'id="settings-image-status"',
  'id="settings-image-result-img"',
  'onclick="generateSettingsTestImage()"'
]) assert.ok(html.includes(marker), `teacher image-test marker missing: ${marker}`);

for (const marker of [
  '.aiedue-library-modal',
  '.aiedue-library-grid',
  '.aiedue-character-card',
  '.aiedue-book-spread',
  'grid-template-columns: 1fr 1fr',
  '.aiedue-book-page-right img'
]) assert.ok(css.includes(marker), `app.css marker missing: ${marker}`);

for (const marker of [
  '.settings-tabs',
  '.settings-image-spinner',
  '.settings-image-result'
]) assert.ok(css.includes(marker), `settings image-test CSS missing: ${marker}`);

for (const marker of [
  "collectionGroup(db, 'storyCharacters')",
  "creatorName: currentUserName",
  'isStoryCharacterCreator',
  "collection(db, 'Book')",
  "appType: STORY_LIBRARY_APP_TYPE",
  "isPublic: true",
  "fetchStoryResource('/korean-ai/api/image-jobs'",
  "'X-Image-Job-Token': job.token",
  'normalizeImageJobStatusUrl',
  'normalizeImageJobUrl(image.url, job.id)',
  'cancelStoryBookGeneration',
  'retryStoryBookImages',
  'generateMissingStoryImages',
  'page.imageBlob',
  'published = true',
  'callKoreanAiGenerate(prompt',
  'buildStoryImagePrompt',
  'uploadBytes(storageRef(storage, path)',
  'window.saveGeneratedStoryBook',
  'window.turnStoryBookPage'
]) assert.ok(app.includes(marker), `app.js marker missing: ${marker}`);

for (const marker of [
  "currentUserRole === 'teacher'",
  'window.generateSettingsTestImage',
  'createStoryImageJob(prompt, controller.signal, aspectRatio)',
  'waitForStoryImageJob(job, controller.signal)',
  'downloadStoryImage(job, image, controller.signal)',
  'settingsImageTestController !== controller',
  'URL.createObjectURL(blob)'
]) assert.ok(app.includes(marker), `settings image-test flow missing: ${marker}`);

assert.match(html, /id="settings-image-test-tab"[^>]*class="[^"]*hidden/, 'image-test tab must be hidden until a teacher session enables it');

assert.ok(css.includes('.aiedue-book-cover-title'), 'book title must be presented on the cover artwork');
assert.ok(css.includes('.aiedue-book-caption'), 'book description must be presented below the cover');
assert.ok(html.indexOf('aiedue-library-button') < html.indexOf('lesson-photo-button'), 'library button must appear left of the photo button');

assert.match(app, /Array\.from\(\{ length: Math\.min\(2, pendingIndexes\.length\) \}/, 'image generation must respect the server owner-active limit of two jobs');
assert.ok(app.indexOf('isPublic: false') < app.indexOf('isPublic: true'), 'book metadata must be private until all images are uploaded');
assert.match(app, /if \(!published && publicationConfirmedPrivate\) \{[\s\S]*deleteObject[\s\S]*deleteDoc/, 'cleanup must run only after publication is confirmed not public');
assert.ok(html.includes('id="aiedue-library-cancel-btn"'), 'generation cancel button must exist');

console.log('story-library-integration: all checks passed');
