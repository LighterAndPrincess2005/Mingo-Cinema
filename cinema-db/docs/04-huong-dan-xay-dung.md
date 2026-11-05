# Hướng dẫn xây dựng database

Phần 1 tạo database bằng `mongosh`. Phần 2 trở đi thao tác trong Mingo.

Các bước Mingo viết theo tài liệu chính thức và **chưa thử trên giao diện thật**. Nhãn nút có thể khác đôi chút theo phiên bản, và những chỗ tài liệu không nêu rõ đều được ghi chú.

## Phần 1. Tạo database

### Bước 1. Kiểm tra môi trường

Cần MongoDB Server đang chạy ở `localhost:27017` và `mongosh`:

```bash
mongosh --quiet --eval "db.version()"
```

### Bước 2. Chạy script

Từ thư mục `cinema-db`:

```bash
mongosh --quiet --file scripts/run_all.js
```

Script chạy lần lượt:

1. `01_create_collections.js`: tạo 20 collection kèm validator.
2. `02_create_indexes.js`: tạo 55 index.
3. `03_seed_master.js`: seed danh mục.
4. `04_seed_transactions.js`: seed 1.140 suất chiếu và toàn bộ giao dịch.
5. `06_verify.js`: chạy 175 kiểm tra.

Dòng cuối phải là `[06] Kết quả: 175 PASS, 0 FAIL.`

### Bước 3. Làm lại từ đầu khi cần

```bash
mongosh --quiet --file scripts/00_reset.js
```

Sau đó chạy lại bước 2.

## Phần 2. Kết nối Mingo

1. Mở Mingo, bấm **Add new connection / Project** ở bộ chọn workspace góc trên bên trái.
2. Chọn **Create a connection**.
3. Điền **Name** là `Localhost`, **MongoDB URI** là `mongodb://localhost:27017`.
4. Bấm **Save**.
5. Mở kết nối, chọn database `QLDatVeXemPhim`. Phải thấy đủ 20 collection.

Tài liệu Mingo không mô tả nút kiểm tra kết nối, nên cách kiểm tra là mở kết nối sau khi lưu.

## Phần 3. Duyệt và kiểm tra dữ liệu

### Xem document

Mở collection `showtimes`, tab **Documents**. Nhập bộ lọc JSON vào ô lọc:

```json
{ "status": "open", "format": "IMAX" }
```

Bấm vào một document để xem mảng `seats` được embed.

Muốn thấy validator hoạt động, nhấp đúp vào `rating` của một document trong `reviews` và nhập `11`: MongoDB sẽ từ chối.

> Sửa tay trong Mingo sẽ lưu ngay. Validator chặn sai kiểu, nhưng không chặn dữ liệu lệch giữa các collection. Sau khi sửa tay, chạy lại `06_verify.js`.

### Xem index

Mở tab **Indexes** của `tickets`. Phải thấy index `qrCode` unique và index unique partial `showtimeId_1_seatCode_1`. Tab này cũng hiện kích thước và số lần dùng của từng index.

### Phân tích schema

Mở tab **Schema** của `movies`. Schema Analyzer lấy mẫu document và hiện trường, kiểu, tỷ lệ xuất hiện. Kết quả mong đợi:

- Các trường bắt buộc xuất hiện 100%.
- Mỗi trường chỉ có một kiểu dữ liệu.
- `credits.character` dưới 100%, vì đạo diễn và biên kịch không có vai diễn.

Với `showtimes`, các trường `seats.holdUntil`, `seats.holdToken` chỉ xuất hiện ở ghế đang giữ.

## Phần 4. Khai báo Data Relations

MongoDB không có khóa ngoại, nên phần này giúp mở nhanh document liên quan và tìm tham chiếu mồ côi. Vào mục **Data Relations** của database, khai báo các quan hệ sau:

| Collection nguồn | Trường | Collection đích | Trường đích | Trường xem trước |
|---|---|---|---|---|
| `showtimes` | `movieId` | `movies` | `_id` | `title` |
| `showtimes` | `cinemaId` | `cinemas` | `_id` | `name` |
| `showtimes` | `roomId` | `rooms` | `_id` | `name` |
| `bookings` | `userId` | `users` | `_id` | `fullName` |
| `bookings` | `showtimeId` | `showtimes` | `_id` | `startTime` |
| `tickets` | `bookingId` | `bookings` | `_id` | `bookingCode` |
| `payments` | `bookingId` | `bookings` | `_id` | `bookingCode` |
| `refunds` | `paymentId` | `payments` | `_id` | `transactionRef` |
| `reviews` | `movieId` | `movies` | `_id` | `title` |
| `reviews` | `userId` | `users` | `_id` | `fullName` |
| `users` | `tierId` | `membership_tiers` | `_id` | `name` |
| `rooms` | `cinemaId` | `cinemas` | `_id` | `name` |
| `staff` | `cinemaId` | `cinemas` | `_id` | `name` |
| `promotion_redemptions` | `promotionId` | `promotions` | `_id` | `code` |

Tài liệu Mingo không nêu nhãn nút tạo quan hệ. Sau khi khai báo, chạy chức năng phát hiện tham chiếu mồ côi: kết quả phải rỗng.

## Phần 5. Khai thác bằng Aggregator

File `scripts/05_sample_queries.js` có 10 pipeline:

1. Lịch chiếu sắp tới theo phim và rạp.
2. Số ghế theo trạng thái của suất sắp chiếu.
3. Doanh thu vé theo phim.
4. Doanh thu thực thu theo rạp và tháng, đã trừ hoàn tiền.
5. Tỷ lệ lấp đầy theo định dạng.
6. Hiệu quả khuyến mãi.
7. Doanh thu bắp nước theo sản phẩm.
8. Top phim theo đánh giá.
9. Rạp gần vị trí người dùng.
10. Số khách theo hạng thành viên.

### Ví dụ: doanh thu vé theo phim

Mở collection `tickets`, tab **Aggregator**. Bấm **Add Stage** cho từng stage dưới đây, chọn loại stage rồi dán nội dung vào ô soạn thảo.

`$match`:

```json
{ "status": { "$in": ["active", "used"] } }
```

`$group`:

```json
{ "_id": "$movieId", "soVe": { "$sum": 1 }, "doanhThu": { "$sum": "$price" } }
```

`$lookup`:

```json
{ "from": "movies", "localField": "_id", "foreignField": "_id", "as": "movie" }
```

`$project`:

```json
{ "_id": 0, "phim": { "$first": "$movie.title" }, "soVe": 1, "doanhThu": 1 }
```

`$sort`:

```json
{ "doanhThu": -1 }
```

Mỗi stage có phần xem trước, nên thấy được dữ liệu biến đổi qua từng bước. Có thể kéo để đổi thứ tự, tắt tạm một stage, bấm **Save** để lưu pipeline, **Copy pipeline** để lấy JSON đưa vào ứng dụng, hoặc tạo view từ pipeline bằng **Create View**.

Kết quả phải khớp truy vấn số 3 khi chạy:

```bash
mongosh --quiet --file scripts/05_sample_queries.js
```

## Phần 6. Dashboard

Mở **Dashboard**, bấm **Add Widget**, chọn database, collection, loại widget và điều kiện. Gợi ý:

| Tiêu đề | Collection | Loại | Nội dung |
|---|---|---|---|
| Số đơn đã trả | `bookings` | Number | Đếm với bộ lọc `{ "status": "paid" }` |
| Số vé đã soát | `tickets` | Number | Đếm với bộ lọc `{ "status": "used" }` |
| Đơn theo trạng thái | `bookings` | Chart | Nhóm theo `status` |
| Thanh toán theo phương thức | `payments` | Chart | Nhóm theo `method` |

## Phần 7. Sao lưu

**Dump & Restore** của Mingo cần `mongodump` và `mongorestore`, nên phải cài MongoDB Database Tools trước. Sau khi cài:

1. Mở Dump & Restore ở khu vực công cụ.
2. Chọn **Export to directory**, chọn database và nơi lưu.
3. Bấm **Run**.

Hai cách không cần cài thêm:

- Dùng tab **Export** của từng collection để xuất JSON, CSV hoặc BSON.
- Tạo lại toàn bộ bằng script ở phần 1. Dữ liệu cùng phân bố, nhưng `_id` và ngày tháng sẽ khác.

## Xử lý lỗi thường gặp

| Hiện tượng | Nguyên nhân | Cách xử lý |
|---|---|---|
| `Database đã có dữ liệu` | Chạy seed lần hai | Chạy `00_reset.js` trước |
| `load` không tìm thấy file | Không đứng ở thư mục `cinema-db` | Chuyển vào `cinema-db` rồi chạy lại |
| `Document failed validation` | Dữ liệu vi phạm `$jsonSchema` | Xem trường bị báo lỗi trong thông báo, đối chiếu từ điển dữ liệu |
| `E11000 duplicate key` | Trùng khóa unique | Đây thường là cơ chế chống trùng đang hoạt động đúng |
| `06_verify.js` báo FAIL sau khi sửa tay | Dữ liệu lệch giữa các collection | Sửa lại, hoặc chạy `00_reset.js` rồi `run_all.js` |
