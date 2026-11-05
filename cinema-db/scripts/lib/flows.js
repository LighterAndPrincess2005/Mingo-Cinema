// Các hàm nghiệp vụ dùng chung cho seed, verify và làm mẫu cho ứng dụng.
// MongoDB standalone không có multi-document transaction, nên mỗi bước đều idempotent:
// chạy lại không sinh dữ liệu trùng, và mỗi thay đổi tranh chấp là một lệnh update nguyên tử có điều kiện.
(function () {
  const d = db.getSiblingDB('QLDatVeXemPhim');

  const config = {
    HOLD_MINUTES: 10,
    MAX_SEATS_PER_BOOKING: 8,
    CLEANING_MINUTES: 15,
    REFUND_CUTOFF_HOURS: 2,
    CHECKIN_OPEN_MINUTES: 60,
    POINT_VALUE: 1000, // 1 điểm = 1.000 VND khi dùng
    SPEND_PER_POINT: 10000, // 10.000 VND = 1 điểm gốc khi tích
    VN_OFFSET_MS: 7 * 3600 * 1000,
  };

  function fail(bizCode, message) {
    const error = new Error(`${bizCode}: ${message}`);
    error.bizCode = bizCode;
    throw error;
  }

  const isDuplicate = (error) => error.code === 11000;
  const addMinutes = (date, minutes) => new Date(date.getTime() + minutes * 60000);

  // Giờ Việt Nam để xét ngày thường/cuối tuần và khung giờ. Dữ liệu vẫn lưu UTC.
  function vnParts(date) {
    const t = new Date(date.getTime() + config.VN_OFFSET_MS);
    const pad = (n) => String(n).padStart(2, '0');
    return { dayOfWeek: t.getUTCDay(), hhmm: `${pad(t.getUTCHours())}:${pad(t.getUTCMinutes())}` };
  }

  // Vấn đề 4: chọn quy tắc khớp có priority cao nhất.
  function resolvePrice({ format, seatTypeId, cinemaId, startTime }) {
    const { dayOfWeek, hhmm } = vnParts(startTime);
    const weekend = dayOfWeek === 0 || dayOfWeek === 6;
    const rules = d.price_rules
      .find({ format, seatTypeId, status: 'active', validFrom: { $lte: startTime } })
      .sort({ priority: -1 })
      .toArray();
    for (let i = 0; i < rules.length; i += 1) {
      const r = rules[i];
      const dayOk = r.dayType === 'all' || (r.dayType === 'weekend') === weekend;
      const timeOk = r.timeFrom <= hhmm && hhmm <= r.timeTo;
      const cinemaOk = !r.cinemaId || r.cinemaId.equals(cinemaId);
      const validOk = !r.validTo || r.validTo >= startTime;
      if (dayOk && timeOk && cinemaOk && validOk) return r.price;
    }
    return fail('NO_PRICE_RULE', `Không có giá cho ${format} lúc ${hhmm}`);
  }

  // Vấn đề 3: index không chặn được khoảng thời gian giao nhau nên kiểm tra bằng truy vấn.
  function createShowtime({ movieId, roomId, startTime, language = 'subtitle' }) {
    const room = d.rooms.findOne({ _id: roomId });
    if (!room || room.status !== 'active') fail('ROOM_UNAVAILABLE', 'Phòng không hoạt động');
    const movie = d.movies.findOne({ _id: movieId });
    if (!movie) fail('MOVIE_NOT_FOUND', 'Không có phim');
    if (!movie.formats.includes(room.format)) fail('FORMAT_MISMATCH', 'Phim không có định dạng của phòng');
    if (startTime < movie.releaseDate) fail('BEFORE_RELEASE', 'Suất chiếu trước ngày khởi chiếu');

    const endTime = addMinutes(startTime, movie.durationMin);
    const conflict = d.showtimes.findOne({
      roomId,
      status: { $ne: 'cancelled' },
      startTime: { $lt: addMinutes(endTime, config.CLEANING_MINUTES) },
      endTime: { $gt: addMinutes(startTime, -config.CLEANING_MINUTES) },
    }, { _id: 1 });
    if (conflict) fail('ROOM_OVERLAP', 'Phòng đã có suất chiếu trong khoảng này');

    const cinema = d.cinemas.findOne({ _id: room.cinemaId });
    const prices = {};
    const seats = [];
    for (let i = 0; i < room.seatMap.length; i += 1) {
      const row = room.seatMap[i];
      const key = row.seatTypeId.toHexString();
      if (prices[key] === undefined) {
        prices[key] = resolvePrice({
          format: room.format, seatTypeId: row.seatTypeId, cinemaId: room.cinemaId, startTime,
        });
      }
      for (let n = 1; n <= row.seatCount; n += 1) {
        seats.push({
          code: `${row.row}${String(n).padStart(2, '0')}`,
          seatTypeId: row.seatTypeId,
          price: prices[key],
          status: 'available',
        });
      }
    }

    const _id = new ObjectId();
    try {
      d.showtimes.insertOne({
        _id, movieId, cinemaId: room.cinemaId, roomId, startTime, endTime,
        format: room.format, language, seats, status: 'open',
        snapshot: { movieTitle: movie.title, cinemaName: cinema.name, roomName: room.name },
      });
    } catch (error) {
      if (isDuplicate(error)) fail('ROOM_OVERLAP', 'Phòng đã có suất chiếu đúng giờ này');
      throw error;
    }
    return _id;
  }

  // Vấn đề 1 và 2: một lệnh update nguyên tử, chỉ thành công khi TẤT CẢ ghế còn trống.
  // Ghế held đã quá holdUntil được coi là trống.
  function holdSeats({ showtimeId, seatCodes, holdToken, holdUntil, now }) {
    const result = d.showtimes.updateOne(
      {
        _id: showtimeId,
        status: 'open',
        'seats.code': { $all: seatCodes },
        seats: {
          $not: {
            $elemMatch: {
              code: { $in: seatCodes },
              $or: [{ status: 'booked' }, { status: 'held', holdUntil: { $gt: now } }],
            },
          },
        },
      },
      { $set: { 'seats.$[s].status': 'held', 'seats.$[s].holdUntil': holdUntil, 'seats.$[s].holdToken': holdToken } },
      { arrayFilters: [{ 's.code': { $in: seatCodes } }] },
    );
    return result.modifiedCount === 1;
  }

  function releaseHold(showtimeId, holdToken) {
    d.showtimes.updateOne(
      { _id: showtimeId },
      {
        $set: { 'seats.$[s].status': 'available' },
        $unset: { 'seats.$[s].holdUntil': '', 'seats.$[s].holdToken': '' },
      },
      { arrayFilters: [{ 's.holdToken': holdToken }] },
    );
  }

  function calcDiscount(promo, subtotal) {
    const raw = promo.discountType === 'percent'
      ? Math.floor((subtotal * promo.discountValue) / 100)
      : promo.discountValue;
    const capped = promo.maxDiscount === undefined ? raw : Math.min(raw, promo.maxDiscount);
    return Math.min(capped, subtotal);
  }

  // Vấn đề 6: giữ suất dùng mã ngay khi tạo đơn, để hai đơn song song không vượt maxUses.
  function reservePromotion({ code, user, showtime, bookingId, subtotal, now }) {
    const promo = d.promotions.findOne({ code });
    if (!promo || promo.status !== 'active') fail('PROMO_INVALID', 'Mã không tồn tại');
    if (now < promo.startAt || now > promo.endAt) fail('PROMO_INVALID', 'Mã ngoài thời hạn');
    if (subtotal < promo.minOrder) fail('PROMO_MIN_ORDER', 'Đơn chưa đạt giá trị tối thiểu');
    const cond = promo.conditions || {};
    if (cond.formats && cond.formats.length && !cond.formats.includes(showtime.format)) {
      fail('PROMO_CONDITION', 'Mã không áp dụng cho định dạng này');
    }
    if (cond.daysOfWeek && cond.daysOfWeek.length
      && !cond.daysOfWeek.includes(vnParts(showtime.startTime).dayOfWeek)) {
      fail('PROMO_CONDITION', 'Mã không áp dụng cho ngày này');
    }
    if (cond.tierCodes && cond.tierCodes.length) {
      const tier = d.membership_tiers.findOne({ _id: user.tierId });
      if (!cond.tierCodes.includes(tier.code)) fail('PROMO_CONDITION', 'Mã không áp dụng cho hạng này');
    }

    const claimed = d.promotions.updateOne(
      { _id: promo._id, $expr: { $lt: ['$usedCount', '$maxUses'] } },
      { $inc: { usedCount: 1 } },
    );
    if (claimed.modifiedCount !== 1) fail('PROMO_EXHAUSTED', 'Mã đã hết lượt');

    const discountAmount = calcDiscount(promo, subtotal);
    for (let useNo = 1; useNo <= promo.perUserLimit; useNo += 1) {
      try {
        d.promotion_redemptions.insertOne({
          promotionId: promo._id, userId: user._id, bookingId, useNo, discountAmount,
          status: 'reserved', createdAt: now,
        });
        return { promo, discountAmount };
      } catch (error) {
        if (!isDuplicate(error)) throw error;
      }
    }
    d.promotions.updateOne({ _id: promo._id }, { $inc: { usedCount: -1 } });
    return fail('PROMO_USER_LIMIT', 'Bạn đã dùng hết lượt của mã này');
  }

  function reversePromotion(bookingId) {
    const r = d.promotion_redemptions.findOneAndUpdate(
      { bookingId, status: 'reserved' },
      { $set: { status: 'reversed' } },
    );
    if (r) d.promotions.updateOne({ _id: r.promotionId }, { $inc: { usedCount: -1 } });
  }

  // Vấn đề 9: unique {refType, refId, type} làm cho mỗi bút toán chỉ ghi được một lần.
  function addLedger(entry) {
    try {
      d.loyalty_transactions.insertOne(entry);
      return true;
    } catch (error) {
      if (isDuplicate(error)) return false;
      throw error;
    }
  }

  function redeemPoints({ userId, bookingId, points, now }) {
    const taken = d.users.updateOne(
      { _id: userId, pointsBalance: { $gte: points } },
      { $inc: { pointsBalance: -points } },
    );
    if (taken.modifiedCount !== 1) fail('POINTS_NOT_ENOUGH', 'Không đủ điểm');
    addLedger({
      userId, type: 'redeem', points: -points, refType: 'booking', refId: bookingId,
      description: 'Dùng điểm cho đơn đặt vé', createdAt: now,
    });
  }

  function restorePoints({ userId, bookingId, points, now }) {
    const added = addLedger({
      userId, type: 'adjust', points, refType: 'booking', refId: bookingId,
      description: 'Trả lại điểm do đơn không hoàn tất', createdAt: now,
    });
    if (added) d.users.updateOne({ _id: userId }, { $inc: { pointsBalance: points } });
  }

  function updateTier(userId) {
    const user = d.users.findOne({ _id: userId }, { lifetimeSpend: 1, tierId: 1 });
    const tier = d.membership_tiers.find({ minSpend: { $lte: user.lifetimeSpend } })
      .sort({ minSpend: -1 }).limit(1).toArray()[0];
    if (!tier._id.equals(user.tierId)) d.users.updateOne({ _id: userId }, { $set: { tierId: tier._id } });
  }

  // Tính lại toàn bộ số computed của user từ nguồn gốc. Dùng khi một luồng bị đứt giữa chừng.
  function syncUser(userId) {
    const points = d.loyalty_transactions.aggregate([
      { $match: { userId } }, { $group: { _id: null, total: { $sum: '$points' } } },
    ]).toArray()[0];
    const paid = d.payments.aggregate([
      { $match: { userId, status: 'success' } }, { $group: { _id: null, total: { $sum: '$amount' } } },
    ]).toArray()[0];
    const refunded = d.refunds.aggregate([
      { $match: { userId, status: 'completed' } }, { $group: { _id: null, total: { $sum: '$amount' } } },
    ]).toArray()[0];
    d.users.updateOne({ _id: userId }, {
      $set: {
        pointsBalance: points ? points.total : 0,
        lifetimeSpend: (paid ? paid.total : 0) - (refunded ? refunded.total : 0),
      },
    });
    updateTier(userId);
  }

  function createBooking({
    userId, showtimeId, seatCodes, concessions = [], promoCode, pointsToUse = 0, now = new Date(),
  }) {
    const user = d.users.findOne({ _id: userId });
    if (!user || user.status !== 'active') fail('USER_INVALID', 'Tài khoản không hợp lệ');
    const showtime = d.showtimes.findOne({ _id: showtimeId });
    if (!showtime || showtime.status !== 'open') fail('SHOWTIME_CLOSED', 'Suất chiếu không mở bán');
    if (showtime.startTime <= now) fail('SHOWTIME_STARTED', 'Suất chiếu đã bắt đầu');
    const codes = [...new Set(seatCodes)];
    if (codes.length === 0 || codes.length > config.MAX_SEATS_PER_BOOKING) fail('SEAT_COUNT', 'Số ghế không hợp lệ');

    const seatByCode = {};
    for (let i = 0; i < showtime.seats.length; i += 1) seatByCode[showtime.seats[i].code] = showtime.seats[i];
    let ticketAmount = 0;
    for (let i = 0; i < codes.length; i += 1) {
      if (!seatByCode[codes[i]]) fail('SEAT_NOT_FOUND', `Không có ghế ${codes[i]}`);
      ticketAmount += seatByCode[codes[i]].price;
    }

    const lines = [];
    let concessionAmount = 0;
    for (let i = 0; i < concessions.length; i += 1) {
      const item = d.concession_items.findOne({ _id: concessions[i].itemId, status: 'active' });
      if (!item) fail('ITEM_UNAVAILABLE', 'Sản phẩm không còn bán');
      const lineTotal = item.price * concessions[i].quantity;
      lines.push({
        itemId: item._id, name: item.name, unitPrice: item.price, quantity: concessions[i].quantity, lineTotal,
      });
      concessionAmount += lineTotal;
    }

    const subtotal = ticketAmount + concessionAmount;
    const _id = new ObjectId();
    const holdToken = new ObjectId().toHexString();
    const expiresAt = addMinutes(now, config.HOLD_MINUTES);
    if (!holdSeats({ showtimeId, seatCodes: codes, holdToken, holdUntil: expiresAt, now })) {
      fail('SEAT_TAKEN', 'Có ghế đã được người khác giữ hoặc mua');
    }

    let promo = null;
    let discountAmount = 0;
    let pointsDiscount = 0;
    try {
      if (promoCode) {
        const reserved = reservePromotion({
          code: promoCode, user, showtime, bookingId: _id, subtotal, now,
        });
        promo = reserved.promo;
        discountAmount = reserved.discountAmount;
      }
      if (pointsToUse > 0) {
        pointsDiscount = pointsToUse * config.POINT_VALUE;
        if (pointsDiscount > subtotal - discountAmount) fail('POINTS_TOO_MANY', 'Số điểm vượt giá trị đơn');
        redeemPoints({ userId, bookingId: _id, points: pointsToUse, now });
      }
      const booking = {
        _id,
        bookingCode: `BK${_id.toHexString().slice(-10).toUpperCase()}`,
        userId, showtimeId, seatCodes: codes, holdToken, concessions: lines,
        ticketAmount, concessionAmount, subtotal, discountAmount,
        pointsUsed: pointsToUse, pointsDiscount,
        totalAmount: subtotal - discountAmount - pointsDiscount,
        status: 'pending', expiresAt, createdAt: now,
        snapshot: { ...showtime.snapshot, startTime: showtime.startTime },
      };
      if (promo) {
        booking.promotionId = promo._id;
        booking.promotionCode = promo.code;
      }
      d.bookings.insertOne(booking);
      return booking;
    } catch (error) {
      reversePromotion(_id);
      if (pointsDiscount > 0 && d.loyalty_transactions.findOne({ refType: 'booking', refId: _id, type: 'redeem' })) {
        restorePoints({ userId, bookingId: _id, points: pointsToUse, now });
      }
      releaseHold(showtimeId, holdToken);
      throw error;
    }
  }

  function recordFailedPayment({ bookingId, method, transactionRef, idempotencyKey, now = new Date() }) {
    const booking = d.bookings.findOne({ _id: bookingId });
    d.payments.insertOne({
      bookingId, userId: booking.userId, amount: booking.totalAmount, method, status: 'failed',
      transactionRef, idempotencyKey, createdAt: now,
    });
  }

  // Vấn đề 5: gửi lại cùng idempotencyKey thì chạy lại các bước còn thiếu, không tạo bản ghi mới.
  function payBooking({ bookingId, method, transactionRef, idempotencyKey, now = new Date() }) {
    const booking = d.bookings.findOne({ _id: bookingId });
    if (!booking) fail('BOOKING_NOT_FOUND', 'Không có đơn');
    const earlier = d.payments.findOne({ idempotencyKey });
    if (earlier && !earlier.bookingId.equals(bookingId)) fail('KEY_REUSED', 'Khóa đã dùng cho đơn khác');
    const duplicate = Boolean(earlier);
    if (!duplicate) {
      if (booking.status !== 'pending') fail('BOOKING_NOT_PENDING', `Đơn đang ở trạng thái ${booking.status}`);
      if (booking.expiresAt <= now) fail('BOOKING_EXPIRED', 'Đơn đã hết hạn giữ ghế');
    }

    try {
      d.payments.updateOne(
        { idempotencyKey },
        {
          $setOnInsert: {
            bookingId, userId: booking.userId, amount: booking.totalAmount, method, status: 'success',
            transactionRef, idempotencyKey, paidAt: now, createdAt: now,
          },
        },
        { upsert: true },
      );
    } catch (error) {
      if (isDuplicate(error)) fail('DUPLICATE_TRANSACTION', 'Mã giao dịch đã được ghi nhận');
      throw error;
    }

    const claimed = d.bookings.updateOne(
      { _id: bookingId, status: 'pending', expiresAt: { $gt: now } },
      { $set: { status: 'paid', paidAt: now } },
    );
    const fresh = d.bookings.findOne({ _id: bookingId });
    if (claimed.modifiedCount !== 1 && !['paid', 'partially_refunded', 'refunded'].includes(fresh.status)) {
      // Tiền đã về nhưng đơn vừa hết hạn: đánh dấu để hoàn tiền thủ công.
      d.payments.updateOne({ idempotencyKey }, { $set: { status: 'requires_refund' } });
      fail('BOOKING_EXPIRED', 'Đơn hết hạn trong lúc thanh toán');
    }

    const showtime = d.showtimes.findOne({ _id: booking.showtimeId });
    const ops = [];
    for (let i = 0; i < booking.seatCodes.length; i += 1) {
      const code = booking.seatCodes[i];
      const seat = showtime.seats.find((s) => s.code === code);
      ops.push({
        updateOne: {
          filter: { qrCode: `${booking.bookingCode}-${code}` },
          update: {
            $setOnInsert: {
              bookingId, showtimeId: booking.showtimeId, movieId: showtime.movieId, userId: booking.userId,
              seatCode: code, seatTypeId: seat.seatTypeId, price: seat.price,
              qrCode: `${booking.bookingCode}-${code}`, status: 'active', createdAt: now,
            },
          },
          upsert: true,
        },
      });
    }
    d.tickets.bulkWrite(ops, { ordered: true });

    d.showtimes.updateOne(
      { _id: booking.showtimeId },
      {
        $set: { 'seats.$[s].status': 'booked', 'seats.$[s].bookingId': bookingId },
        $unset: { 'seats.$[s].holdUntil': '', 'seats.$[s].holdToken': '' },
      },
      { arrayFilters: [{ 's.holdToken': booking.holdToken }] },
    );

    d.promotion_redemptions.updateOne({ bookingId, status: 'reserved' }, { $set: { status: 'applied' } });

    const user = d.users.findOne({ _id: booking.userId });
    const tier = d.membership_tiers.findOne({ _id: user.tierId });
    const points = Math.floor((booking.totalAmount / config.SPEND_PER_POINT) * tier.pointMultiplier);
    const earned = points > 0 && addLedger({
      userId: booking.userId, type: 'earn', points, refType: 'booking', refId: bookingId,
      description: `Tích điểm đơn ${booking.bookingCode}`, createdAt: now,
    });
    if (duplicate) {
      syncUser(booking.userId);
    } else {
      d.users.updateOne(
        { _id: booking.userId },
        { $inc: { lifetimeSpend: booking.totalAmount, pointsBalance: earned ? points : 0 } },
      );
      updateTier(booking.userId);
    }
    return { duplicate };
  }

  // Vấn đề 2: nhận đơn pending bằng update có điều kiện để không tranh với payBooking.
  function releaseBooking({ bookingId, status, now = new Date() }) {
    const booking = d.bookings.findOneAndUpdate(
      { _id: bookingId, status: 'pending' },
      { $set: { status } },
    );
    if (!booking) return false;
    releaseHold(booking.showtimeId, booking.holdToken);
    reversePromotion(bookingId);
    if (booking.pointsUsed > 0) {
      restorePoints({ userId: booking.userId, bookingId, points: booking.pointsUsed, now });
    }
    return true;
  }

  function expireOverdueBookings(now = new Date()) {
    const overdue = d.bookings.find({ status: 'pending', expiresAt: { $lte: now } }, { _id: 1 }).toArray();
    let count = 0;
    for (let i = 0; i < overdue.length; i += 1) {
      if (releaseBooking({ bookingId: overdue[i]._id, status: 'expired', now })) count += 1;
    }
    return count;
  }

  // Vấn đề 8: chuyển active sang used bằng một lệnh nguyên tử.
  function checkInTicket({ qrCode, staffId, now = new Date() }) {
    const ticket = d.tickets.findOne({ qrCode });
    if (!ticket) fail('TICKET_NOT_FOUND', 'Không có vé');
    const showtime = d.showtimes.findOne({ _id: ticket.showtimeId }, { seats: 0 });
    const staff = d.staff.findOne({ _id: staffId });
    if (!staff || staff.status !== 'active' || !staff.permissions.includes('ticket_check')) {
      fail('STAFF_FORBIDDEN', 'Nhân viên không có quyền soát vé');
    }
    if (!staff.cinemaId.equals(showtime.cinemaId)) fail('WRONG_CINEMA', 'Vé không thuộc rạp này');
    if (now < addMinutes(showtime.startTime, -config.CHECKIN_OPEN_MINUTES) || now > showtime.endTime) {
      fail('CHECKIN_WINDOW', 'Ngoài thời gian soát vé');
    }
    const result = d.tickets.updateOne(
      { _id: ticket._id, status: 'active' },
      { $set: { status: 'used', checkedInAt: now, checkedInBy: staffId } },
    );
    if (result.modifiedCount !== 1) fail('TICKET_NOT_ACTIVE', `Vé đang ở trạng thái ${ticket.status}`);
  }

  // Vấn đề 7: nhận vé bằng update có điều kiện nên một vé không thể hoàn hai lần.
  function refundTickets({ bookingId, ticketIds, staffId, reason, now = new Date() }) {
    const booking = d.bookings.findOne({ _id: bookingId });
    if (!booking || !['paid', 'partially_refunded'].includes(booking.status)) {
      fail('BOOKING_NOT_REFUNDABLE', 'Đơn không ở trạng thái hoàn được');
    }
    const showtime = d.showtimes.findOne({ _id: booking.showtimeId }, { seats: 0 });
    const staff = d.staff.findOne({ _id: staffId });
    if (!staff || !staff.permissions.includes('refund_approve') || !staff.cinemaId.equals(showtime.cinemaId)) {
      fail('STAFF_FORBIDDEN', 'Nhân viên không có quyền hoàn tiền');
    }
    if (now > addMinutes(showtime.startTime, -config.REFUND_CUTOFF_HOURS * 60)) {
      fail('REFUND_TOO_LATE', 'Đã quá hạn hoàn tiền trước giờ chiếu');
    }

    const tickets = d.tickets.find({ _id: { $in: ticketIds }, bookingId, status: 'active' }).toArray();
    if (tickets.length !== ticketIds.length) fail('TICKET_NOT_ACTIVE', 'Có vé không còn hiệu lực');

    // Phần giảm giá được chia đều theo giá vé, bắp nước không hoàn.
    let amount = 0;
    for (let i = 0; i < tickets.length; i += 1) {
      amount += Math.floor((tickets[i].price * booking.totalAmount) / booking.subtotal);
    }
    const payment = d.payments.findOne({ bookingId, status: 'success' });
    const previous = d.refunds.aggregate([
      { $match: { bookingId, status: 'completed' } }, { $group: { _id: null, total: { $sum: '$amount' } } },
    ]).toArray()[0];
    if ((previous ? previous.total : 0) + amount > payment.amount) fail('REFUND_OVER_LIMIT', 'Vượt số tiền đã trả');

    const refundId = new ObjectId();
    const claimed = d.tickets.updateMany(
      { _id: { $in: ticketIds }, status: 'active' },
      { $set: { status: 'refunded', refundId } },
    );
    if (claimed.modifiedCount !== ticketIds.length) {
      d.tickets.updateMany({ refundId }, { $set: { status: 'active' }, $unset: { refundId: '' } });
      fail('TICKET_NOT_ACTIVE', 'Có vé vừa bị xử lý ở nơi khác');
    }

    d.refunds.insertOne({
      _id: refundId, paymentId: payment._id, bookingId, userId: booking.userId, ticketIds, amount, reason,
      status: 'completed', approvedBy: staffId, createdAt: now,
    });

    const codes = tickets.map((t) => t.seatCode);
    d.showtimes.updateOne(
      { _id: booking.showtimeId },
      { $set: { 'seats.$[s].status': 'available' }, $unset: { 'seats.$[s].bookingId': '' } },
      { arrayFilters: [{ 's.code': { $in: codes }, 's.bookingId': bookingId }] },
    );

    const remaining = d.tickets.countDocuments({ bookingId, status: 'active' });
    d.bookings.updateOne({ _id: bookingId }, { $set: { status: remaining === 0 ? 'refunded' : 'partially_refunded' } });

    // Thu hồi điểm đã tích theo tỷ lệ tiền hoàn, không để số dư âm.
    const earn = d.loyalty_transactions.findOne({ refType: 'booking', refId: bookingId, type: 'earn' });
    const user = d.users.findOne({ _id: booking.userId });
    const share = booking.totalAmount > 0 ? amount / booking.totalAmount : 0;
    const clawback = earn ? Math.min(Math.floor(earn.points * share), user.pointsBalance) : 0;
    const clawed = clawback > 0 && addLedger({
      userId: booking.userId, type: 'adjust', points: -clawback, refType: 'refund', refId: refundId,
      description: `Thu hồi điểm do hoàn vé đơn ${booking.bookingCode}`, createdAt: now,
    });
    d.users.updateOne(
      { _id: booking.userId },
      { $inc: { lifetimeSpend: -amount, pointsBalance: clawed ? -clawback : 0 } },
    );
    updateTier(booking.userId);
    return { refundId, amount };
  }

  // Yêu cầu bị từ chối vẫn được lưu để tra cứu, không ảnh hưởng vé và tiền.
  function rejectRefund({ bookingId, ticketIds, staffId, reason, now = new Date() }) {
    const booking = d.bookings.findOne({ _id: bookingId });
    const payment = d.payments.findOne({ bookingId, status: 'success' });
    if (!payment) fail('BOOKING_NOT_REFUNDABLE', 'Đơn chưa thanh toán');
    const tickets = d.tickets.find({ _id: { $in: ticketIds }, bookingId }).toArray();
    let amount = 0;
    for (let i = 0; i < tickets.length; i += 1) amount += tickets[i].price;
    d.refunds.insertOne({
      paymentId: payment._id, bookingId, userId: booking.userId, ticketIds, amount, reason,
      status: 'rejected', approvedBy: staffId, createdAt: now,
    });
  }

  function recalcMovieRating(movieId) {
    const stats = d.reviews.aggregate([
      { $match: { movieId, status: 'visible' } },
      { $group: { _id: null, avg: { $avg: '$rating' }, count: { $sum: 1 } } },
    ]).toArray()[0];
    d.movies.updateOne({ _id: movieId }, {
      $set: {
        ratingSummary: stats
          ? { avg: Math.round(stats.avg * 10) / 10, count: stats.count }
          : { avg: 0, count: 0 },
      },
    });
  }

  // Vấn đề 10: chỉ người đã xem (vé used của chính họ) mới được đánh giá.
  function submitReview({ ticketId, userId, rating, comment, status = 'visible', now = new Date(), recalc = true }) {
    const ticket = d.tickets.findOne({ _id: ticketId });
    if (!ticket || !ticket.userId.equals(userId)) fail('REVIEW_FORBIDDEN', 'Vé không thuộc người dùng này');
    if (ticket.status !== 'used') fail('REVIEW_FORBIDDEN', 'Chỉ đánh giá sau khi đã xem phim');
    const review = {
      movieId: ticket.movieId, userId, ticketId, rating, status, createdAt: now,
    };
    if (comment) review.comment = comment;
    try {
      d.reviews.insertOne(review);
    } catch (error) {
      if (isDuplicate(error)) fail('REVIEW_DUPLICATE', 'Mỗi người chỉ đánh giá một phim một lần');
      throw error;
    }
    if (recalc) recalcMovieRating(ticket.movieId);
  }

  globalThis.flows = {
    config, resolvePrice, createShowtime, holdSeats, createBooking, recordFailedPayment, payBooking,
    releaseBooking, expireOverdueBookings, checkInTicket, refundTickets, rejectRefund, submitReview,
    recalcMovieRating, syncUser,
  };
})();
