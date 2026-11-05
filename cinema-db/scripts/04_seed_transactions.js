// Dữ liệu giao dịch. Đơn đi qua đúng các hàm trong lib/flows.js nên các collection khớp nhau.
(function () {
  load('scripts/lib/random.js');
  load('scripts/lib/flows.js');
  const d = db.getSiblingDB('QLDatVeXemPhim');
  if (d.bookings.countDocuments() > 0) {
    throw new Error('Đã có dữ liệu giao dịch. Chạy scripts/00_reset.js trước khi seed lại.');
  }

  if (d.promotions.countDocuments() === 0) {
    throw new Error('Chưa có dữ liệu danh mục. Chạy scripts/03_seed_master.js trước.');
  }

  const r = createRandom(5112026);
  const now = new Date();
  const HOUR = 3600000;
  const DAY = 24 * HOUR;
  const VN = flows.config.VN_OFFSET_MS;
  const addMs = (date, ms) => new Date(date.getTime() + ms);

  // 1. Suất chiếu: mỗi phòng 2 suất/ngày, từ 30 ngày trước đến 7 ngày sau.
  const rooms = d.rooms.find().toArray();
  const nowShowing = d.movies.find({ status: 'now_showing' }).toArray();
  const SLOTS = [[10, 0], [13, 30], [17, 0], [20, 30]];
  const todayVn = new Date(now.getTime() + VN);
  for (let day = -30; day <= 7; day += 1) {
    for (let i = 0; i < rooms.length; i += 1) {
      const candidates = nowShowing.filter((m) => m.formats.includes(rooms[i].format));
      const slots = r.sample(SLOTS, 2);
      for (let s = 0; s < slots.length; s += 1) {
        const startTime = new Date(Date.UTC(
          todayVn.getUTCFullYear(), todayVn.getUTCMonth(), todayVn.getUTCDate() + day, slots[s][0] - 7, slots[s][1],
        ));
        flows.createShowtime({
          movieId: r.pick(candidates)._id, roomId: rooms[i]._id, startTime,
          language: r.chance(0.8) ? 'subtitle' : 'dubbed',
        });
      }
    }
  }
  print(`[04] Đã tạo ${d.showtimes.countDocuments()} suất chiếu.`);

  // 2. Đơn đặt vé theo thứ tự thời gian để hạng thành viên tăng dần tự nhiên.
  const users = d.users.find({ status: 'active' }, { _id: 1 }).toArray();
  const items = d.concession_items.find().toArray();
  const promoCodes = d.promotions.find().toArray().map((p) => p.code);
  const staffAll = d.staff.find().toArray();
  const METHODS = ['momo', 'momo', 'vnpay', 'vnpay', 'card', 'bank_transfer'];
  const REASONS = ['Khách đổi lịch', 'Khách đặt nhầm suất', 'Khách có việc đột xuất'];

  let txn = 0;
  const nextPayment = (id) => {
    txn += 1;
    return { transactionRef: `TXN${String(txn).padStart(8, '0')}`, idempotencyKey: `seed-${id.toHexString()}-${txn}` };
  };

  function pickSeats(showtime, taken, count) {
    const seats = showtime.seats;
    const start = r.int(0, seats.length - 1);
    const codes = [];
    for (let i = 0; i < seats.length && codes.length < count; i += 1) {
      const code = seats[(start + i) % seats.length].code;
      if (!taken.has(code)) codes.push(code);
    }
    return codes;
  }

  function randomBooking(showtime, taken, at) {
    const quantity = r.pick([1, 1, 2, 2, 2, 2, 2, 3, 3, 4]);
    const seatCodes = pickSeats(showtime, taken, quantity);
    const concessions = [];
    if (r.chance(0.4)) {
      const chosen = r.sample(items, r.int(1, 2));
      for (let i = 0; i < chosen.length; i += 1) concessions.push({ itemId: chosen[i]._id, quantity: r.int(1, 2) });
    }
    const userId = r.pick(users)._id;
    const balance = d.users.findOne({ _id: userId }, { pointsBalance: 1 }).pointsBalance;
    const pointsToUse = balance >= 30 && r.chance(0.15) ? r.int(10, 30) : 0;
    const promoCode = r.chance(0.2) ? r.pick(promoCodes) : undefined;
    const input = {
      userId, showtimeId: showtime._id, seatCodes, concessions, pointsToUse, now: at,
    };
    let booking;
    try {
      booking = flows.createBooking({ ...input, promoCode });
    } catch (error) {
      // Mã không dùng được thì khách đặt tiếp không có mã, giống hành vi thật.
      if (!error.bizCode || !error.bizCode.startsWith('PROMO')) throw error;
      booking = flows.createBooking(input);
    }
    seatCodes.forEach((code) => taken.add(code));
    return booking;
  }

  const showtimes = d.showtimes.find({}, { 'seats.code': 1, startTime: 1, endTime: 1, cinemaId: 1 })
    .sort({ startTime: 1 }).toArray();

  for (let i = 0; i < showtimes.length; i += 1) {
    const showtime = showtimes[i];
    const manager = staffAll.find((s) => s.position === 'manager' && s.cinemaId.equals(showtime.cinemaId));
    const checkers = staffAll.filter((s) => s.position === 'ticket_checker' && s.cinemaId.equals(showtime.cinemaId));
    const taken = new Set();
    const count = r.int(1, 4);

    for (let b = 0; b < count; b += 1) {
      const latest = Math.min(now.getTime() - 60000, showtime.startTime.getTime() - 4 * HOUR);
      const earliest = Math.min(showtime.startTime.getTime() - 7 * DAY, latest - HOUR);
      const createdAt = new Date(earliest + r.next() * (latest - earliest));
      const booking = randomBooking(showtime, taken, createdAt);
      const outcome = r.next();

      if (outcome < 0.03) {
        flows.releaseBooking({ bookingId: booking._id, status: 'expired', now: addMs(createdAt, 11 * 60000) });
      } else if (outcome < 0.045) {
        flows.releaseBooking({ bookingId: booking._id, status: 'cancelled', now: addMs(createdAt, 3 * 60000) });
      } else {
        const method = r.pick(METHODS);
        if (r.chance(0.08)) {
          flows.recordFailedPayment({ bookingId: booking._id, method, ...nextPayment(booking._id), now: addMs(createdAt, 60000) });
        }
        flows.payBooking({ bookingId: booking._id, method, ...nextPayment(booking._id), now: addMs(createdAt, 120000) });

        let tickets = d.tickets.find({ bookingId: booking._id }).toArray();
        const refundRoll = r.next();
        if (refundRoll < 0.05) {
          const chosen = r.chance(0.5) ? tickets : tickets.slice(0, 1);
          flows.refundTickets({
            bookingId: booking._id, ticketIds: chosen.map((t) => t._id), staffId: manager._id,
            reason: r.pick(REASONS), now: addMs(createdAt, HOUR),
          });
          tickets = d.tickets.find({ bookingId: booking._id, status: 'active' }).toArray();
        } else if (refundRoll < 0.06) {
          flows.rejectRefund({
            bookingId: booking._id, ticketIds: [tickets[0]._id], staffId: manager._id,
            reason: 'Yêu cầu sau hạn hoàn vé', now: addMs(createdAt, HOUR),
          });
        }

        if (showtime.endTime < now) {
          for (let t = 0; t < tickets.length; t += 1) {
            if (r.chance(0.92)) {
              flows.checkInTicket({
                qrCode: tickets[t].qrCode, staffId: r.pick(checkers)._id,
                now: addMs(showtime.startTime, -r.int(5, 40) * 60000),
              });
            }
          }
        }
      }
    }
    if ((i + 1) % 200 === 0) print(`[04] Đã xử lý ${i + 1}/${showtimes.length} suất, ${d.bookings.countDocuments()} đơn.`);
  }

  // 3. Một vài đơn đang chờ thanh toán ở thời điểm hiện tại.
  const upcoming = d.showtimes.find({ startTime: { $gt: addMs(now, DAY) } }).sort({ startTime: 1 }).limit(5).toArray();
  for (let i = 0; i < upcoming.length; i += 1) {
    const free = new Set(upcoming[i].seats.filter((s) => s.status !== 'available').map((s) => s.code));
    randomBooking(upcoming[i], free, now);
  }

  // 4. Đánh giá: chỉ người có vé đã soát mới có thể đánh giá.
  const COMMENTS = ['Phim hay, đáng xem.', 'Kịch bản ổn, diễn xuất tốt.', 'Hình ảnh đẹp.', 'Hơi dài nhưng cuốn.', 'Âm thanh rất tốt.', 'Phần cuối hơi hụt.', 'Sẽ xem lại lần nữa.'];
  const seen = d.tickets.aggregate([
    { $match: { status: 'used' } },
    { $group: { _id: { userId: '$userId', movieId: '$movieId' }, ticketId: { $first: '$_id' }, at: { $max: '$checkedInAt' } } },
  ]).toArray();
  const quality = {};
  const reviewers = r.sample(seen, Math.min(600, seen.length));
  for (let i = 0; i < reviewers.length; i += 1) {
    const row = reviewers[i];
    const key = row._id.movieId.toHexString();
    if (quality[key] === undefined) quality[key] = r.int(5, 9);
    const rating = Math.max(1, Math.min(10, quality[key] + r.int(-2, 1)));
    const at = new Date(Math.min(addMs(row.at, 5 * HOUR).getTime(), now.getTime()));
    flows.submitReview({
      ticketId: row.ticketId, userId: row._id.userId, rating,
      comment: r.chance(0.7) ? r.pick(COMMENTS) : undefined,
      status: r.chance(0.05) ? 'hidden' : 'visible', now: at, recalc: false,
    });
  }
  const movieIds = d.reviews.distinct('movieId');
  for (let i = 0; i < movieIds.length; i += 1) flows.recalcMovieRating(movieIds[i]);

  // 5. Suất đã qua không còn mở bán.
  d.showtimes.updateMany({ endTime: { $lt: now } }, { $set: { status: 'ended' } });

  print(`[04] Hoàn tất: ${d.bookings.countDocuments()} đơn, ${d.tickets.countDocuments()} vé, ${d.payments.countDocuments()} thanh toán, ${d.refunds.countDocuments()} hoàn tiền, ${d.reviews.countDocuments()} đánh giá.`);
})();
