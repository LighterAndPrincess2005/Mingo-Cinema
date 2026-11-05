const fs = require('fs');
const d = db.getSiblingDB('QLDatVeXemPhim');
const records = JSON.parse(fs.readFileSync('data/nguonc-films.json', 'utf8'));
let checked = 0;
for (const source of records) {
  const movie = d.movies.findOne({ _id: new ObjectId(source.movieId) });
  if (!movie || movie.title !== source.title || movie.slug !== source.slug ||
      movie.media.id !== source.id || movie.posterUrl !== source.posterUrl ||
      movie.backdropUrl !== source.backdropUrl || movie.media.title !== movie.title) throw Error('Movie mismatch ' + source.title);
  const shows = d.showtimes.find({ movieId: movie._id }).toArray();
  for (const show of shows) {
    if (show.snapshot.movieTitle !== movie.title ||
        show.endTime.getTime() - show.startTime.getTime() !== movie.durationMin * 60000) throw Error('Showtime mismatch');
    const bad = d.bookings.countDocuments({ showtimeId: show._id, 'snapshot.movieTitle': { $ne: movie.title } });
    if (bad) throw Error('Booking mismatch');
  }
  checked++;
}
const backupFile = fs.readdirSync('backups').filter(name => name.startsWith('pre-nguonc-') && name.endsWith('.json')).sort()[0];
const before = EJSON.parse(fs.readFileSync('backups/' + backupFile, 'utf8'));
if (d.movies.countDocuments() !== before.movies.length ||
    d.showtimes.countDocuments() !== before.showtimes.length ||
    d.bookings.countDocuments() !== before.bookings.length) throw Error('Changed record identity count');
print('PASS ' + checked + ' movie identities, images, showtimes and booking titles.');

