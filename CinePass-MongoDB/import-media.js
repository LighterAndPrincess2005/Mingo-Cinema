const fs = require('fs');
const d = db.getSiblingDB('QLDatVeXemPhim');
const planPath = 'data/nguonc-films.json';
const plan = JSON.parse(fs.readFileSync(planPath, 'utf8').replace(/^\uFEFF/, ''));
const movies = d.movies.find().sort({ _id: 1 }).toArray();
if (plan.length !== 30 || movies.length !== 30) throw Error('Cần đúng 30 phim để đối chiếu danh mục.');
if (new Set(plan.map(item => item.slug)).size !== plan.length) throw Error('Trùng phim nguồn.');
const sourceIds = new Set();
for (let i = 0; i < plan.length; i++) {
  const item = plan[i];
  if (!item.movieId) item.movieId = movies[i]._id.toHexString();
  if (!movies.some(movie => movie._id.toHexString() === item.movieId)) throw Error('Sai mã phim đích.');
  if (sourceIds.has(item.movieId)) throw Error('Trùng mã phim đích.');
  sourceIds.add(item.movieId);
  if (!item.title || !item.synopsis || !item.directors.length || !item.genres.length ||
      item.durationMin < 30 || item.durationMin > 180) throw Error('Thiếu thông tin phim ' + item.slug);
  if (item.posterSize[0] >= item.posterSize[1] || item.backdropSize[0] <= item.backdropSize[1]) {
    throw Error('Sai chiều ảnh ' + item.slug);
  }
  for (const url of [item.posterUrl, item.backdropUrl]) {
    if (new URL(url).hostname !== 'img.nguonc.com') throw Error('Ảnh không cùng nguồn.');
  }
}
fs.writeFileSync(planPath, JSON.stringify(plan, null, 2));
const byMovie = new Map(plan.map(item => [item.movieId, item]));
const shows = d.showtimes.find().sort({ roomId: 1, startTime: 1 }).toArray();
const endTimeFor = show => new Date(show.startTime.getTime() + byMovie.get(show.movieId.toHexString()).durationMin * 60000);
for (let i = 1; i < shows.length; i++) {
  if (shows[i].roomId.equals(shows[i - 1].roomId) &&
      shows[i].startTime.getTime() - endTimeFor(shows[i - 1]).getTime() < 15 * 60000) {
    throw Error('Thời lượng mới làm chồng lịch phòng ' + shows[i].roomId);
  }
}
const before = {
  movies, genres: d.genres.find().toArray(), people: d.people.find().toArray(),
  showtimes: shows.map(show => ({ _id: show._id, endTime: show.endTime, snapshot: show.snapshot })),
  bookings: d.bookings.find({}, { _id: 1, snapshot: 1 }).toArray(),
  validator: d.getCollectionInfos({ name: 'movies' })[0].options.validator,
};
fs.mkdirSync('backups', { recursive: true });
const backupPath = 'backups/pre-nguonc-' + Date.now() + '.json';
fs.writeFileSync(backupPath, EJSON.stringify(before, null, 2, { relaxed: false }));
const validator = EJSON.parse(EJSON.stringify(before.validator));
const text = { bsonType: 'string', minLength: 1 };
const dimensions = { bsonType: 'array', minItems: 2, maxItems: 2,
  items: { bsonType: 'number', minimum: 1 } };
validator.$jsonSchema.properties.backdropUrl = text;
validator.$jsonSchema.properties.media = {
  bsonType: 'object', additionalProperties: false,
  required: ['provider', 'id', 'slug', 'title', 'originalTitle', 'apiUrl', 'year', 'posterUrl', 'backdropUrl', 'posterSize', 'backdropSize', 'syncedAt'],
  properties: {
    provider: { enum: ['NguonC'] }, id: text, slug: text, title: text, originalTitle: text, apiUrl: text,
    year: { bsonType: 'number', minimum: 1880, maximum: 2100 },
    posterUrl: text, backdropUrl: text, posterSize: dimensions, backdropSize: dimensions, syncedAt: { bsonType: 'date' },
  },
};
const slugify = name => name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd')
  .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const beforePeopleIds = new Set(before.people.map(person => person._id.toHexString()));
const beforeGenreIds = new Set(before.genres.map(genre => genre._id.toHexString()));
try {
  d.runCommand({ collMod: 'movies', validator, validationLevel: 'strict', validationAction: 'error' });
  for (const item of plan) {
    const _id = new ObjectId(item.movieId);
    const genreIds = item.genres.map(name => {
      const slug = slugify(name);
      let genre = d.genres.findOne({ slug });
      if (!genre) {
        genre = { _id: new ObjectId(), name, slug };
        d.genres.insertOne(genre);
      }
      return genre._id;
    });
    const credits = [
      ...item.directors.map(name => ({ name, role: 'director' })),
      ...item.actors.map(name => ({ name, role: 'actor' })),
    ].map(credit => {
      let person = d.people.findOne({ fullName: credit.name });
      if (!person) {
        person = { _id: new ObjectId(), fullName: credit.name, nationality: 'Chưa cập nhật' };
        d.people.insertOne(person);
      }
      return { ...credit, personId: person._id };
    });
    const media = {
      provider: 'NguonC', id: item.id, slug: item.slug, title: item.title,
      originalTitle: item.originalTitle || item.title, apiUrl: item.apiUrl, year: item.year,
      posterUrl: item.posterUrl, backdropUrl: item.backdropUrl,
      posterSize: item.posterSize, backdropSize: item.backdropSize, syncedAt: new Date(),
    };
    d.movies.updateOne({ _id }, { $set: {
      title: item.title, slug: item.slug, synopsis: item.synopsis,
      durationMin: item.durationMin, language: item.language, genreIds, credits,
      releaseDate: new Date(Date.UTC(item.year, 0, 1)),
      posterUrl: item.posterUrl, backdropUrl: item.backdropUrl, media,
    } });
    for (const show of shows.filter(show => show.movieId.equals(_id))) {
      d.showtimes.updateOne({ _id: show._id }, { $set: {
        'snapshot.movieTitle': item.title, endTime: endTimeFor(show),
      } });
    }
    const showIds = shows.filter(show => show.movieId.equals(_id)).map(show => show._id);
    d.bookings.updateMany({ showtimeId: { $in: showIds } }, { $set: { 'snapshot.movieTitle': item.title } });
    print('OK ' + item.title);
  }
  print('Imported 30 matching films. Backup: ' + backupPath);
} catch (error) {
  for (const movie of before.movies) d.movies.replaceOne({ _id: movie._id }, movie);
  for (const show of before.showtimes) d.showtimes.updateOne({ _id: show._id }, { $set: { endTime: show.endTime, snapshot: show.snapshot } });
  for (const booking of before.bookings) d.bookings.updateOne({ _id: booking._id }, { $set: { snapshot: booking.snapshot } });
  const addedPeople = d.people.find().toArray().filter(person => !beforePeopleIds.has(person._id.toHexString()));
  const addedGenres = d.genres.find().toArray().filter(genre => !beforeGenreIds.has(genre._id.toHexString()));
  if (addedPeople.length) d.people.deleteMany({ _id: { $in: addedPeople.map(person => person._id) } });
  if (addedGenres.length) d.genres.deleteMany({ _id: { $in: addedGenres.map(genre => genre._id) } });
  d.runCommand({ collMod: 'movies', validator: before.validator });
  throw error;
}
