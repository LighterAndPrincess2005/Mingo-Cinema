load('flows.js');
const cinemaDb = db.getSiblingDB('QLDatVeXemPhim');
const { action, input = {} } = JSON.parse(process.env.CINEPASS_REQUEST);
const rows = (collection, filter = {}, projection = {}, sort = {}, limit = 0) =>
  cinemaDb[collection].find(filter, projection).sort(sort).limit(limit).toArray();
const id = value => {
  if (typeof value !== 'string' || !/^[0-9a-f]{24}$/i.test(value)) throw Error('Mã không hợp lệ.');
  return new ObjectId(value);
};
const int = (value, min, max) => {
  if (!Number.isInteger(value) || value < min || value > max) throw Error('Số lượng không hợp lệ.');
  return value;
};
const publicUsers = () => rows('users', { status: 'active' }, { _id: 1 }, { _id: 1 }, 5);
const user = () => {
  const selected = id(input.user);
  if (!publicUsers().some(item => item._id.equals(selected))) throw Error('Chọn một hồ sơ khách demo.');
  return selected;
};
const ownedBooking = () => {
  const booking = cinemaDb.bookings.findOne({ _id: id(input.booking), userId: user() });
  if (!booking) throw Error('Không tìm thấy đơn của hồ sơ này.');
  return booking;
};
const grouped = (col, field, filter = {}, amount) => cinemaDb[col].aggregate([
  { $match: filter },
  { $group: { _id: field, count: { $sum: 1 }, total: { $sum: amount || 0 } } },
  { $sort: { count: -1, _id: 1 } },
]).toArray();
const publicBooking = booking => {
  const { holdToken, userId, ...visible } = booking;
  return visible;
};
const ticketFields = { qrCode: 1, seatCode: 1, status: 1, price: 1, movieId: 1, bookingId: 1 };
const handlers = {
  catalog() {
    return {
      movies: rows('movies', {}, { credits: 0 }, { releaseDate: -1, title: 1 }),
      genres: rows('genres', {}, {}, { name: 1 }),
      cinemas: rows('cinemas', { status: 'active' }, { phone: 0, location: 0 }, { city: 1, name: 1 }),
      concessions: rows('concession_items', { status: 'active' }, {}, { type: 1, name: 1 }),
      promotions: rows('promotions', { status: 'active', startAt: { $lte: new Date() }, endAt: { $gte: new Date() } }),
      users: publicUsers(),
    };
  },
  movie() {
    const movie = cinemaDb.movies.findOne({ _id: id(input.id) });
    if (!movie) throw Error('Không tìm thấy phim.');
    return { movie, people: rows('people', { _id: { $in: movie.credits.map(credit => credit.personId) } }),
      reviews: rows('reviews', { movieId: movie._id, status: 'visible' },
        { userId: 0, ticketId: 0 }, { createdAt: -1 }, 10) };
  },
  schedule() {
    const filter = { status: 'open', startTime: { $gt: new Date() } };
    if (input.movie) filter.movieId = id(input.movie);
    return rows('showtimes', filter, { seats: 0 }, { startTime: 1 });
  },
  seats() {
    const show = cinemaDb.showtimes.findOne({ _id: id(input.id), status: 'open', startTime: { $gt: new Date() } });
    if (!show) throw Error('Suất chiếu không còn mở bán.');
    const room = cinemaDb.rooms.findOne({ _id: show.roomId }, { seatMap: 1, capacity: 1, name: 1 });
    const types = rows('seat_types');
    const now = new Date();
    return { room, types, show: { ...show, seats: show.seats.map(seat => ({
      code: seat.code, seatTypeId: seat.seatTypeId, price: seat.price,
      status: seat.status === 'held' && seat.holdUntil <= now ? 'available' : seat.status,
    })) } };
  },
  account() {
    const _id = user();
    const profile = cinemaDb.users.findOne({ _id }, { pointsBalance: 1, lifetimeSpend: 1, tierId: 1 });
    const bookings = rows('bookings', { userId: _id }, { holdToken: 0, userId: 0 }, { createdAt: -1 }, 40);
    const bookingId = { $in: bookings.map(booking => booking._id) };
    return { profile, tier: cinemaDb.membership_tiers.findOne({ _id: profile.tierId }),
      bookings, tickets: rows('tickets', { bookingId }, ticketFields),
      payments: rows('payments', { bookingId }, { bookingId: 1, amount: 1, status: 1, method: 1 }),
      refunds: rows('refunds', { bookingId }, { bookingId: 1, amount: 1, reason: 1, status: 1 }),
      points: rows('loyalty_transactions', { userId: _id }, { points: 1, description: 1, createdAt: 1 }, { createdAt: -1 }, 12) };
  },
  dashboard() {
    const sold = { status: { $in: ['paid', 'partially_refunded', 'refunded'] } };
    const income = grouped('payments', '$method', { status: 'success' }, '$amount');
    const refunds = grouped('refunds', '$status', {}, '$amount');
    const revenue = cinemaDb.bookings.aggregate([
      { $match: sold }, { $group: { _id: '$snapshot.cinemaName', total: { $sum: '$totalAmount' }, count: { $sum: 1 } } },
      { $sort: { total: -1 } },
    ]).toArray();
    const capacity = cinemaDb.showtimes.aggregate([
      { $match: { status: { $in: ['open', 'ended'] }, startTime: { $lte: new Date() } } },
      { $project: { total: { $size: '$seats' }, sold: { $size: { $filter: {
        input: '$seats', as: 'seat', cond: { $eq: ['$$seat.status', 'booked'] },
      } } } } },
      { $group: { _id: null, total: { $sum: '$total' }, sold: { $sum: '$sold' } } },
    ]).toArray()[0];
    return { income, refunds, revenue, capacity,
      bookings: grouped('bookings', '$status'), tickets: grouped('tickets', '$status'),
      promos: grouped('promotion_redemptions', '$status', {}, '$discountAmount'),
      food: cinemaDb.bookings.aggregate([{ $match: sold }, { $unwind: '$concessions' },
        { $group: { _id: '$concessions.name', count: { $sum: '$concessions.quantity' }, total: { $sum: '$concessions.lineTotal' } } },
        { $sort: { total: -1 } }, { $limit: 5 }]).toArray(),
      prices: rows('price_rules', { status: 'active' }, {}, { price: 1 }),
      types: rows('seat_types'),
      counts: cinemaDb.getCollectionNames().sort().map(name => ({ name, total: cinemaDb[name].estimatedDocumentCount() })),
    };
  },
  staff() {
    return rows('staff', { status: 'active' }, { cinemaId: 1, position: 1, permissions: 1 }, { cinemaId: 1, position: 1 });
  },
  book() {
    flows.expireOverdueBookings();
    if (!Array.isArray(input.seats) || input.seats.length < 1 || input.seats.length > 8 ||
        input.seats.some(code => typeof code !== 'string' || !/^[A-Z][0-9]{2}$/.test(code)) ||
        new Set(input.seats).size !== input.seats.length) throw Error('Chọn từ 1 đến 8 ghế.');
    if (!Array.isArray(input.food) || input.food.length > 15) throw Error('Danh sách bắp nước không hợp lệ.');
    const concessions = input.food.map(line => ({ itemId: id(line.id), quantity: int(line.quantity, 1, 10) }));
    const promoCode = typeof input.promo === 'string' ? input.promo.trim().toUpperCase().slice(0, 40) : '';
    return publicBooking(flows.createBooking({ userId: user(), showtimeId: id(input.show), seatCodes: input.seats,
      concessions, promoCode, pointsToUse: int(input.points, 0, 100000) }));
  },
  pay() {
    const booking = ownedBooking();
    const method = input.method;
    if (!['momo', 'vnpay', 'card', 'bank_transfer'].includes(method)) throw Error('Chọn phương thức thanh toán.');
    const ref = 'CP' + booking._id.toHexString();
    flows.payBooking({ bookingId: booking._id, method, transactionRef: ref, idempotencyKey: ref });
    return { booking: publicBooking(cinemaDb.bookings.findOne({ _id: booking._id })),
      tickets: rows('tickets', { bookingId: booking._id }, ticketFields) };
  },
  cancel() {
    if (!flows.releaseBooking({ bookingId: ownedBooking()._id, status: 'cancelled' })) throw Error('Chỉ hủy được đơn đang giữ ghế.');
    return { ok: true };
  },
  review() {
    flows.submitReview({ userId: user(), ticketId: id(input.ticket), rating: int(input.rating, 1, 10),
      comment: String(input.comment || '').trim().slice(0, 500) });
    return { ok: true };
  },
  checkin() {
    if (typeof input.code !== 'string' || !input.code.trim() || input.code.length > 160) throw Error('Nhập mã vé hợp lệ.');
    flows.checkInTicket({ qrCode: input.code.trim(), staffId: id(input.staff) });
    return { ok: true };
  },
  refund() {
    if (typeof input.code !== 'string' || !input.code.trim() || input.code.length > 160) throw Error('Nhập mã vé hợp lệ.');
    const ticket = cinemaDb.tickets.findOne({ qrCode: input.code.trim() });
    if (!ticket) throw Error('Không có vé.');
    flows.refundTickets({ bookingId: ticket.bookingId, ticketIds: [ticket._id], staffId: id(input.staff),
      reason: String(input.reason || '').trim().slice(0, 250) || 'Hoàn vé demo' });
    return { ok: true };
  },
  expire() { return { expired: flows.expireOverdueBookings() }; },
};
try {
  print('CINEPASS:' + EJSON.stringify({ data: handlers[action]() }, { relaxed: true }));
} catch (error) {
  print('CINEPASS:' + JSON.stringify({ error: error.message }));
}


