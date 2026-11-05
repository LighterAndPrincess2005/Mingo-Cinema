# Trạng thái và việc còn lại

Tài liệu này ghi đúng những gì đã làm và chưa làm tính đến 05/11/2026.

## Đã kiểm chứng

- `run_all.js` chạy trọn từ database trống, mất khoảng 1,5 phút.
- `06_verify.js` đạt 175/175: cấu trúc, validator, tham chiếu, đồng bộ dữ liệu, `IXSCAN`, và ca thử cho cả 11 vấn đề cốt lõi.
- Script kiểm tra bắt được lỗi thật: cố ý phá dữ liệu ở 4 chỗ thì báo 5 FAIL và trả exit code 1.
- Ca thử 20 yêu cầu song song giữ cùng một ghế: đúng 1 yêu cầu thành công.
- `05_sample_queries.js` chạy được cả 10 pipeline.

Số liệu sau khi seed:

| Collection | Số lượng | Collection | Số lượng |
|---|---|---|---|
| `users` | 200 | `showtimes` | 1.140 |
| `membership_tiers` | 4 | `price_rules` | 13 |
| `loyalty_transactions` | 3.230 | `bookings` | 2.859 |
| `genres` | 12 | `tickets` | 5.968 |
| `people` | 80 | `payments` | 2.943 |
| `movies` | 30 | `refunds` | 177 |
| `reviews` | 600 | `concession_items` | 15 |
| `cinemas` | 5 | `promotions` | 6 |
| `rooms` | 15 | `promotion_redemptions` | 254 |
| `seat_types` | 3 | `staff` | 30 |

## Chưa kiểm chứng

| Vấn đề | Chi tiết |
|---|---|
| Thao tác Mingo | Viết theo tài liệu của Mingo, chưa thử trên giao diện thật |
| Dump & Restore | Cần cài MongoDB Database Tools, chưa chạy thử |
| Đứt giữa luồng thanh toán | Đã thử gửi lại callback và `syncUser`, chưa thử dừng tiến trình giữa từng bước |

## Việc cần làm

### A. Chuẩn bị database cho ứng dụng

- [ ] **Sửa `flows.js` để Express dùng được.** Bản hiện tại viết kiểu đồng bộ, chỉ chạy trong mongosh. Nên chuyển thành factory async `createFlows(col, ObjectId)`, mọi lệnh có `await`, để mongosh và Express dùng chung một bản. Nếu mongosh không chạy ổn thì chuyển seed sang Node.
- [ ] **Sửa projection khi chuyển sang driver.** Code đang viết `findOne(q, { seats: 0 })`, cách này chỉ đúng trong mongosh. Node driver cần `{ projection: { seats: 0 } }`, nếu không sẽ bị bỏ qua mà không báo lỗi.
- [ ] **Tách `lib/pipelines.js`** để `05_sample_queries.js` và dashboard dùng chung aggregation.
- [ ] **Sửa schema và seed cho đăng nhập:**
  - Thêm `passwordHash` bắt buộc cho `staff`, hiện chưa có.
  - `users.passwordHash` đang là chuỗi giả, thay bằng hash bcrypt của mật khẩu demo.
  - Thêm chức vụ `admin`, quyền `report_all`, cho phép `cinemaId` trống với `admin`, seed 1 tài khoản. Hiện không ai xem được số liệu toàn chuỗi.
- [ ] **Cho script nhận tên database** qua `globalThis.DB_NAME`, mặc định `QLDatVeXemPhim`, để test chạy trên database riêng.

Sau mỗi thay đổi, chạy lại `00_reset.js`, `run_all.js` và giữ `06_verify.js` đạt hết.

### B. Ứng dụng

Xem [05-ke-hoach-ung-dung.md](05-ke-hoach-ung-dung.md).

### C. Mingo

- [ ] Đi qua hướng dẫn trong [04-huong-dan-xay-dung.md](04-huong-dan-xay-dung.md) trên Mingo thật và sửa lại nhãn nếu khác.
- [ ] Chụp màn hình cho báo cáo.

## Quyết định thiết kế cần giữ

Hai điểm sau cố ý khác thứ tự đơn giản nhất, không nên "sửa lại":

- **Mã khuyến mãi được giữ chỗ khi tạo đơn**, không phải sau khi thanh toán, để hai đơn song song không vượt `maxUses`.
- **Đơn chuyển `paid` trước khi tạo vé**, để tiến trình hết hạn không tranh được với thanh toán.
