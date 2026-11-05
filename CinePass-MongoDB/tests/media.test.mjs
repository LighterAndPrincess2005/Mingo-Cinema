import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const records = JSON.parse(await readFile(new URL('../data/nguonc-films.json', import.meta.url), 'utf8'));
const script = await readFile(new URL('../public/movie-art.js', import.meta.url), 'utf8');
const context = vm.createContext({ URL, document: { addEventListener() {} } });
vm.runInContext(script, context);
const movieArt = context.movieArt;
const film = record => ({
  title: record.title, slug: record.slug,
  media: { ...record, provider: 'NguonC' },
});

test('30 movies have unique stable identities and two distinct image orientations', () => {
  assert.equal(records.length, 30);
  for (const field of ['id', 'slug', 'movieId', 'posterUrl', 'backdropUrl']) {
    assert.equal(new Set(records.map(record => record[field])).size, 30, field);
  }
  for (const record of records) {
    assert.ok(record.posterSize[1] > record.posterSize[0]);
    assert.ok(record.backdropSize[0] > record.backdropSize[1]);
    assert.equal(new URL(record.apiUrl).pathname, '/api/film/' + record.slug);
    assert.equal(new URL(record.posterUrl).hostname, 'img.nguonc.com');
    assert.equal(new URL(record.backdropUrl).hostname, 'img.nguonc.com');
  }
});

test('every card and landscape uses the URLs in that same movie record', () => {
  for (const record of records) {
    const movie = film(record);
    assert.ok(movieArt(movie).includes('src="' + record.posterUrl + '"'), record.title);
    assert.ok(movieArt(movie, true).includes('src="' + record.backdropUrl + '"'), record.title);
    assert.ok(movieArt(movie, true, true).includes('src="' + record.backdropUrl + '"'), record.title);
  }
});

test('reject unrelated movie names, slugs, sources, missing metadata, and reversed orientations', () => {
  const movie = film(records[0]);
  assert.equal(movieArt({ ...movie, title: records[1].title }), '');
  assert.equal(movieArt({ ...movie, slug: records[1].slug }), '');
  assert.equal(movieArt({ ...movie, media: null }), '');
  assert.equal(movieArt({ ...movie, media: { ...movie.media, provider: 'Other' } }), '');
  assert.equal(movieArt({ ...movie, media: { ...movie.media, posterSize: [1280, 720] } }), '');
  assert.equal(movieArt({ ...movie, media: { ...movie.media, backdropSize: [336, 504] } }, true), '');
  assert.equal(movieArt({ ...movie, media: { ...movie.media, posterUrl: 'https://example.com/a.jpg' } }), '');
});
