// Tạo 20 collection kèm $jsonSchema. Chạy lại được: collection đã có thì cập nhật validator bằng collMod.
(function () {
  const d = db.getSiblingDB('QLDatVeXemPhim');

  const str = (extra = {}) => ({ bsonType: 'string', minLength: 1, ...extra });
  const int = (minimum = 0, maximum) => ({
    bsonType: 'number', multipleOf: 1, minimum, ...(maximum === undefined ? {} : { maximum }),
  });
  const money = () => int(0);
  const oid = () => ({ bsonType: 'objectId' });
  const date = () => ({ bsonType: 'date' });
  const en = (...values) => ({ enum: values });
  const arr = (items, minItems = 0) => ({ bsonType: 'array', items, minItems });
  const obj = (required, properties) => ({
    bsonType: 'object', ...(required.length ? { required } : {}), additionalProperties: false, properties,
  });
  const doc = (required, properties) => obj(required, { _id: oid(), ...properties });
  const hhmm = () => str({ pattern: '^([01][0-9]|2[0-3]):[0-5][0-9]$' });
  const email = () => str({ pattern: '^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$' });
  const phone = () => str({ pattern: '^0[0-9]{9}$' });
  const FORMATS = ['2D', '3D', 'IMAX'];

  const schemas = {
    // Nhóm 1. Khách hàng và thành viên
    users: doc(
      ['fullName', 'email', 'phone', 'passwordHash', 'tierId', 'pointsBalance', 'lifetimeSpend', 'status', 'createdAt'],
      {
        fullName: str(), email: email(), phone: phone(), passwordHash: str(), dateOfBirth: date(),
        tierId: oid(), pointsBalance: int(0), lifetimeSpend: money(),
        status: en('active', 'locked'), createdAt: date(),
      },
    ),
    membership_tiers: doc(
      ['code', 'name', 'rank', 'minSpend', 'pointMultiplier', 'benefits'],
      {
        code: str(), name: str(), rank: int(1), minSpend: money(),
        pointMultiplier: { bsonType: 'number', minimum: 1 }, benefits: arr(str()),
      },
    ),
    loyalty_transactions: doc(
      ['userId', 'type', 'points', 'refType', 'refId', 'createdAt'],
      {
        userId: oid(), type: en('earn', 'redeem', 'expire', 'adjust'),
        points: { bsonType: 'number', multipleOf: 1 },
        refType: en('booking', 'refund', 'manual'), refId: oid(),
        description: str(), createdAt: date(),
      },
    ),

    // Nhóm 2. Nội dung phim
    genres: doc(['name', 'slug'], { name: str(), slug: str({ pattern: '^[a-z0-9-]+$' }) }),
    people: doc(
      ['fullName', 'nationality'],
      { fullName: str(), nationality: str(), birthYear: int(1900, 2030), bio: str() },
    ),
    movies: doc(
      ['title', 'slug', 'genreIds', 'credits', 'durationMin', 'ageRating', 'formats', 'language', 'releaseDate', 'status', 'synopsis', 'ratingSummary'],
      {
        title: str(), slug: str({ pattern: '^[a-z0-9-]+$' }),
        genreIds: arr(oid(), 1),
        credits: arr(obj(['personId', 'name', 'role'], {
          personId: oid(), name: str(), role: en('director', 'actor', 'writer'), character: str(),
        }), 1),
        durationMin: int(30, 300), ageRating: en('P', 'K', 'T13', 'T16', 'T18'),
        formats: arr(en(...FORMATS), 1), language: str(), releaseDate: date(),
        status: en('coming_soon', 'now_showing', 'ended'), synopsis: str(), posterUrl: str(), backdropUrl: str(),
        media: obj(
          ['provider', 'id', 'slug', 'title', 'originalTitle', 'apiUrl', 'year', 'posterUrl', 'backdropUrl', 'posterSize', 'backdropSize', 'syncedAt'],
          {
            provider: en('NguonC'), id: str(), slug: str(), title: str(), originalTitle: str(), apiUrl: str(),
            year: int(1880, 2100), posterUrl: str(), backdropUrl: str(),
            posterSize: { bsonType: 'array', minItems: 2, maxItems: 2, items: int(1) },
            backdropSize: { bsonType: 'array', minItems: 2, maxItems: 2, items: int(1) },
            syncedAt: date(),
          },
        ),
        ratingSummary: obj(['avg', 'count'], {
          avg: { bsonType: 'number', minimum: 0, maximum: 10 }, count: int(0),
        }),
      },
    ),
    reviews: doc(
      ['movieId', 'userId', 'ticketId', 'rating', 'status', 'createdAt'],
      {
        movieId: oid(), userId: oid(), ticketId: oid(), rating: int(1, 10), comment: str(),
        status: en('visible', 'hidden'), createdAt: date(),
      },
    ),

    // Nhóm 3. Rạp và nhân sự
    cinemas: doc(
      ['code', 'name', 'city', 'address', 'location', 'phone', 'openTime', 'closeTime', 'status'],
      {
        code: str(), name: str(), city: str(), address: str(),
        location: obj(['type', 'coordinates'], {
          type: en('Point'),
          coordinates: { bsonType: 'array', minItems: 2, maxItems: 2, items: { bsonType: 'number' } },
        }),
        phone: phone(), openTime: hhmm(), closeTime: hhmm(), status: en('active', 'closed'),
      },
    ),
    rooms: doc(
      ['cinemaId', 'name', 'format', 'seatMap', 'capacity', 'status'],
      {
        cinemaId: oid(), name: str(), format: en(...FORMATS),
        seatMap: arr(obj(['row', 'seatCount', 'seatTypeId'], {
          row: str({ pattern: '^[A-Z]$' }), seatCount: int(1, 40), seatTypeId: oid(),
        }), 1),
        capacity: int(1), status: en('active', 'maintenance', 'closed'),
      },
    ),
    seat_types: doc(
      ['code', 'name', 'personsPerSeat'],
      { code: str(), name: str(), personsPerSeat: int(1, 2) },
    ),
    staff: doc(
      ['cinemaId', 'fullName', 'email', 'position', 'permissions', 'status', 'hiredAt'],
      {
        cinemaId: oid(), fullName: str(), email: email(),
        position: en('manager', 'cashier', 'ticket_checker'),
        permissions: arr(en('ticket_check', 'refund_approve', 'showtime_manage', 'sell_counter')),
        status: en('active', 'inactive'), hiredAt: date(),
      },
    ),

    // Nhóm 4. Lịch chiếu và giá
    showtimes: doc(
      ['movieId', 'cinemaId', 'roomId', 'startTime', 'endTime', 'format', 'language', 'seats', 'status', 'snapshot'],
      {
        movieId: oid(), cinemaId: oid(), roomId: oid(), startTime: date(), endTime: date(),
        format: en(...FORMATS), language: en('subtitle', 'dubbed'),
        seats: arr(obj(['code', 'seatTypeId', 'price', 'status'], {
          code: str({ pattern: '^[A-Z][0-9]{2}$' }), seatTypeId: oid(), price: money(),
          status: en('available', 'held', 'booked'),
          holdUntil: date(), holdToken: str(), bookingId: oid(),
        }), 1),
        status: en('open', 'ended', 'cancelled'),
        snapshot: obj(['movieTitle', 'cinemaName', 'roomName'], {
          movieTitle: str(), cinemaName: str(), roomName: str(),
        }),
      },
    ),
    price_rules: doc(
      ['name', 'format', 'seatTypeId', 'dayType', 'timeFrom', 'timeTo', 'price', 'priority', 'validFrom', 'status'],
      {
        name: str(), format: en(...FORMATS), seatTypeId: oid(),
        dayType: en('all', 'weekday', 'weekend'), timeFrom: hhmm(), timeTo: hhmm(),
        cinemaId: oid(), price: money(), priority: int(1),
        validFrom: date(), validTo: date(), status: en('active', 'inactive'),
      },
    ),

    // Nhóm 5. Bán vé và thanh toán
    bookings: doc(
      ['bookingCode', 'userId', 'showtimeId', 'seatCodes', 'holdToken', 'concessions', 'ticketAmount', 'concessionAmount',
        'subtotal', 'discountAmount', 'pointsUsed', 'pointsDiscount', 'totalAmount', 'status', 'expiresAt', 'createdAt', 'snapshot'],
      {
        bookingCode: str({ pattern: '^BK[0-9A-F]{10}$' }), userId: oid(), showtimeId: oid(),
        seatCodes: arr(str(), 1), holdToken: str(),
        concessions: arr(obj(['itemId', 'name', 'unitPrice', 'quantity', 'lineTotal'], {
          itemId: oid(), name: str(), unitPrice: money(), quantity: int(1, 20), lineTotal: money(),
        })),
        ticketAmount: money(), concessionAmount: money(), subtotal: money(), discountAmount: money(),
        pointsUsed: int(0), pointsDiscount: money(), totalAmount: money(),
        promotionId: oid(), promotionCode: str(),
        status: en('pending', 'paid', 'cancelled', 'expired', 'partially_refunded', 'refunded'),
        expiresAt: date(), paidAt: date(), createdAt: date(),
        snapshot: obj(['movieTitle', 'cinemaName', 'roomName', 'startTime'], {
          movieTitle: str(), cinemaName: str(), roomName: str(), startTime: date(),
        }),
      },
    ),
    tickets: doc(
      ['bookingId', 'showtimeId', 'movieId', 'userId', 'seatCode', 'seatTypeId', 'price', 'qrCode', 'status', 'createdAt'],
      {
        bookingId: oid(), showtimeId: oid(), movieId: oid(), userId: oid(),
        seatCode: str(), seatTypeId: oid(), price: money(), qrCode: str(),
        status: en('active', 'used', 'refunded', 'void'),
        checkedInAt: date(), checkedInBy: oid(), refundId: oid(), createdAt: date(),
      },
    ),
    payments: doc(
      ['bookingId', 'userId', 'amount', 'method', 'status', 'transactionRef', 'idempotencyKey', 'createdAt'],
      {
        bookingId: oid(), userId: oid(), amount: money(),
        method: en('momo', 'vnpay', 'card', 'bank_transfer'),
        status: en('success', 'failed', 'requires_refund'),
        transactionRef: str(), idempotencyKey: str(), paidAt: date(), createdAt: date(),
      },
    ),
    refunds: doc(
      ['paymentId', 'bookingId', 'userId', 'ticketIds', 'amount', 'reason', 'status', 'approvedBy', 'createdAt'],
      {
        paymentId: oid(), bookingId: oid(), userId: oid(), ticketIds: arr(oid(), 1),
        amount: money(), reason: str(), status: en('completed', 'rejected'),
        approvedBy: oid(), createdAt: date(),
      },
    ),

    // Nhóm 6. Bắp nước và khuyến mãi
    concession_items: doc(
      ['name', 'type', 'components', 'price', 'status'],
      {
        name: str(), type: en('single', 'combo'),
        components: arr(obj(['itemId', 'quantity'], { itemId: oid(), quantity: int(1, 10) })),
        price: money(), status: en('active', 'inactive'),
      },
    ),
    promotions: doc(
      ['code', 'name', 'discountType', 'discountValue', 'minOrder', 'maxUses', 'usedCount', 'perUserLimit', 'startAt', 'endAt', 'status'],
      {
        code: str({ pattern: '^[A-Z0-9]+$' }), name: str(), discountType: en('percent', 'fixed'),
        discountValue: money(), maxDiscount: money(), minOrder: money(),
        maxUses: int(1), usedCount: int(0), perUserLimit: int(1),
        startAt: date(), endAt: date(), status: en('active', 'inactive'),
        conditions: obj([], {
          formats: arr(en(...FORMATS)), daysOfWeek: arr(int(0, 6)), tierCodes: arr(str()),
        }),
      },
    ),
    promotion_redemptions: doc(
      ['promotionId', 'userId', 'bookingId', 'useNo', 'discountAmount', 'status', 'createdAt'],
      {
        promotionId: oid(), userId: oid(), bookingId: oid(), useNo: int(1), discountAmount: money(),
        status: en('reserved', 'applied', 'reversed'), createdAt: date(),
      },
    ),
  };

  const existing = new Set(d.getCollectionNames());
  const names = Object.keys(schemas);
  for (let i = 0; i < names.length; i += 1) {
    const name = names[i];
    const options = {
      validator: { $jsonSchema: schemas[name] }, validationLevel: 'strict', validationAction: 'error',
    };
    if (existing.has(name)) d.runCommand({ collMod: name, ...options });
    else d.createCollection(name, options);
  }
  print(`[01] Đã tạo/cập nhật ${names.length} collection có validator.`);
})();
