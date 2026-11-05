# Phân tích nghiệp vụ

## Tác nhân

| Tác nhân | Việc chính |
|---|---|
| Khách hàng | Xem phim và lịch chiếu, chọn ghế, mua bắp nước, áp mã, dùng điểm, thanh toán, đánh giá |
| Thu ngân | Bán tại quầy |
| Nhân viên soát vé | Quét QR tại cửa phòng chiếu |
| Quản lý rạp | Lập lịch chiếu, duyệt hoàn tiền, soát vé |
| Cổng thanh toán | Gửi kết quả giao dịch về hệ thống, có thể gửi lặp lại |

## Quy trình chính

### Đặt vé

1. Khách chọn suất chiếu và ghế, tối đa 8 ghế mỗi đơn.
2. Hệ thống giữ ghế 10 phút, giữ lượt dùng mã và trừ điểm nếu có, rồi tạo đơn `pending`.
3. Khách thanh toán. Thất bại thì được thử lại trong thời gian giữ ghế.
4. Thanh toán thành công: đơn chuyển `paid`, sinh vé có QR, ghế chuyển `booked`, khách được tích điểm.
5. Quá 10 phút chưa trả: đơn chuyển `expired`, ghế, lượt mã và điểm được trả lại.

### Vào rạp và đánh giá

1. Nhân viên quét QR, trong khoảng từ 60 phút trước giờ chiếu đến khi phim kết thúc.
2. Vé chuyển từ `active` sang `used`.
3. Khách có vé `used` được đánh giá phim, mỗi phim một lần.

### Hoàn vé

1. Khách yêu cầu hoàn vé, chậm nhất 2 giờ trước giờ chiếu.
2. Quản lý của đúng rạp duyệt hoặc từ chối. Yêu cầu bị từ chối vẫn được lưu.
3. Khi duyệt: vé chuyển `refunded`, ghế mở bán lại, điểm đã tích bị thu hồi theo tỷ lệ tiền hoàn.

## Quy tắc nghiệp vụ

| Nhóm | Quy tắc |
|---|---|
| Lịch chiếu | Mỗi phòng có 15 phút dọn phòng giữa hai suất. Không xếp suất trước ngày khởi chiếu. Định dạng phim phải khớp định dạng phòng |
| Giá vé | Theo định dạng, loại ghế, ngày thường/cuối tuần, khung giờ, rạp. Quy tắc `priority` cao hơn thắng. Xét theo giờ Việt Nam |
| Khuyến mãi | Mỗi đơn dùng một mã. Có đơn tối thiểu, giảm tối đa, hạn mức tổng và hạn mức theo người. Có thể giới hạn theo định dạng, thứ trong tuần, hạng thành viên |
| Điểm | Tích 1 điểm gốc cho mỗi 10.000đ, nhân hệ số của hạng. 1 điểm dùng trị giá 1.000đ |
| Hạng | Xét theo chi tiêu thực, tức tiền đã trả trừ tiền đã hoàn: Thành viên 0đ, Bạc 2,5 triệu, Vàng 4 triệu, Bạch kim 5,5 triệu |
| Hoàn tiền | Chỉ hoàn tiền vé, phần giảm giá chia theo tỷ lệ giá vé, không hoàn bắp nước. Mã đã dùng không được trả lượt |

## 11 vấn đề nghiệp vụ cốt lõi

| # | Vấn đề | Cách giải | Vị trí |
|---|---|---|---|
| 1 | Bán trùng ghế | Một lệnh `updateOne` nguyên tử, chỉ thành công khi mọi ghế còn trống. Chốt thứ hai là unique partial index trên `tickets` | `holdSeats` |
| 2 | Giữ ghế rồi bỏ | Ghế quá `holdUntil` được coi là trống. Đơn quá hạn chuyển `expired`. Không dùng TTL vì TTL không trả ghế và làm mất lịch sử | `expireOverdueBookings`, `releaseBooking` |
| 3 | Chồng lịch phòng | Index không chặn được khoảng thời gian giao nhau nên kiểm tra bằng truy vấn trước khi tạo. Unique `{roomId, startTime}` chặn trùng giờ tuyệt đối | `createShowtime` |
| 4 | Tính đúng giá | Chọn quy tắc khớp có `priority` cao nhất, ghi giá vào ghế khi mở bán | `resolvePrice` |
| 5 | Ghi nhận thanh toán hai lần | Unique `idempotencyKey` và `transactionRef`. Callback lặp lại chỉ bổ sung bước còn thiếu | `payBooking` |
| 6 | Vượt hạn mức khuyến mãi | `$inc` có điều kiện `usedCount < maxUses` ngay khi tạo đơn. Unique `{promotionId, userId, useNo}` chặn hạn mức theo người | `reservePromotion` |
| 7 | Hoàn tiền sai | Nhận vé bằng update có điều kiện `status: active`, kiểm tra hạn hoàn, quyền nhân viên, tổng hoàn | `refundTickets` |
| 8 | Soát vé hai lần | Update nguyên tử từ `active` sang `used` | `checkInTicket` |
| 9 | Sai điểm thành viên | Sổ điểm chỉ ghi thêm. Unique `{refType, refId, type}` chặn bút toán trùng | `addLedger` |
| 10 | Đánh giá ảo | Đánh giá phải gắn với vé `used` của đúng người. Unique `{movieId, userId}` và unique `ticketId` | `submitReview` |
| 11 | Lịch sử bị đổi theo dữ liệu gốc | Snapshot tên phim, rạp, giá vé, tên và giá sản phẩm trong đơn và vé | `createBooking`, `payBooking` |

Các hàm nằm trong `scripts/lib/flows.js`.

## Ghi vào nhiều collection khi không có transaction

MongoDB trên máy chạy standalone nên không có multi-document transaction. Đề tài không đổi cấu hình service, vì service này còn phục vụ các database khác. Thay vào đó, mỗi bước đều idempotent và chạy theo thứ tự cố định.

**Khi tạo đơn:** giữ ghế → giữ lượt mã → trừ điểm → tạo đơn `pending`. Bước nào lỗi thì hoàn tác các bước trước đó.

**Khi thanh toán:**

1. Ghi `payments` theo `idempotencyKey`.
2. Chuyển đơn sang `paid` bằng update có điều kiện, để không tranh với việc hết hạn đơn.
3. Tạo `tickets` theo `qrCode`.
4. Chuyển ghế sang `booked`.
5. Chuyển redemption sang `applied`, ghi sổ điểm, cập nhật số tổng của khách.

Đứt ở bất kỳ bước nào thì gửi lại cùng `idempotencyKey` sẽ hoàn tất các bước còn thiếu mà không sinh dữ liệu trùng. Khi đó `syncUser` tính lại số tổng của khách từ dữ liệu gốc.

Nếu tiền về đúng lúc đơn vừa hết hạn, payment được đánh dấu `requires_refund` để xử lý thủ công.

Nếu sau này cần transaction thật thì phải chuyển MongoDB sang replica set. Việc này nằm ngoài phạm vi đề tài.
