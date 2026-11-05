# CSDL Quản lý đặt vé xem phim trực tuyến

Database MongoDB `QLDatVeXemPhim` gồm 20 collection, 55 index, có validator cho mọi collection và dữ liệu mẫu. Mingo dùng để quản trị và khai thác.

## Chạy nhanh

Cần MongoDB đang chạy ở `localhost:27017` và `mongosh`. Mọi lệnh chạy từ thư mục `cinema-db`.

Tạo database, seed dữ liệu và tự kiểm tra (khoảng 1,5 phút):

```bash
mongosh --quiet --file scripts/run_all.js
```

Xem kết quả các truy vấn khai thác mẫu:

```bash
mongosh --quiet --file scripts/05_sample_queries.js
```

Kiểm tra lại database bất cứ lúc nào:

```bash
mongosh --quiet --file scripts/06_verify.js
```

Xóa database này để làm lại. Lệnh chỉ xóa `QLDatVeXemPhim`, không đụng database khác:

```bash
mongosh --quiet --file scripts/00_reset.js
```

## Tài liệu

| File | Nội dung |
|---|---|
| [01-gioi-thieu-mingo.md](docs/01-gioi-thieu-mingo.md) | Mingo là gì, tính năng dùng cho đề tài, giới hạn |
| [02-phan-tich-nghiep-vu.md](docs/02-phan-tich-nghiep-vu.md) | Tác nhân, quy trình, quy tắc nghiệp vụ, 11 vấn đề cốt lõi |
| [03-thiet-ke-database.md](docs/03-thiet-ke-database.md) | ERD, quy tắc thiết kế, từ điển dữ liệu 20 collection |
| [04-huong-dan-xay-dung.md](docs/04-huong-dan-xay-dung.md) | Hướng dẫn từng bước, gồm thao tác trong Mingo |
| [05-ke-hoach-ung-dung.md](docs/05-ke-hoach-ung-dung.md) | Kế hoạch ứng dụng minh họa, chưa bắt đầu |
| [06-viec-con-lai.md](docs/06-viec-con-lai.md) | Đã kiểm chứng gì, còn lại việc gì |
| [class-diagram.puml](docs/class-diagram.puml) | Sơ đồ lớp PlantUML, dùng được với Astah |

## Script

| File | Vai trò |
|---|---|
| `scripts/00_reset.js` | Xóa database của đề tài |
| `scripts/01_create_collections.js` | Tạo 20 collection kèm `$jsonSchema` |
| `scripts/02_create_indexes.js` | Tạo 55 index |
| `scripts/03_seed_master.js` | Seed danh mục |
| `scripts/04_seed_transactions.js` | Seed suất chiếu, đơn, vé, thanh toán, hoàn tiền, điểm, đánh giá |
| `scripts/05_sample_queries.js` | 10 pipeline khai thác mẫu |
| `scripts/06_verify.js` | 175 kiểm tra tự động, in PASS/FAIL |
| `scripts/lib/flows.js` | Hàm nghiệp vụ, làm mẫu cho ứng dụng ở bước sau |
| `scripts/lib/random.js` | Bộ sinh số ngẫu nhiên có seed cố định |
| `scripts/run_all.js` | Chạy 01 → 04 rồi 06 |

Seed từ chối chạy khi database đã có dữ liệu, nên muốn làm lại phải chạy `00_reset.js` trước. Dữ liệu sinh theo ngày chạy: suất chiếu trải từ 30 ngày trước đến 7 ngày sau.

## Nhập database có sẵn

Thư mục `database/` chứa bản xuất đầy đủ: 20 collection, 17.584 document, kèm validator và index. Không cần cài `mongodump`.

```bash
mongosh --quiet --file scripts/import_data.js
```

Script từ chối chạy khi `QLDatVeXemPhim` đã có dữ liệu. Muốn nhập lại thì chạy `00_reset.js` trước.

Có hai cách dựng database, chọn một:

| Cách | Lệnh | Khi nào dùng |
|---|---|---|
| Nhập bản có sẵn | `scripts/import_data.js` | Cần đúng dữ liệu đã kiểm tra |
| Sinh dữ liệu mới | `scripts/run_all.js` | Cần suất chiếu sắp tới tính theo ngày hiện tại |

Bản xuất được seed ngày 05/11/2026, nên suất chiếu chỉ kéo dài đến 12/11/2026. Sau ngày đó sẽ không còn suất để đặt vé, cần dùng `run_all.js`.

Xuất lại dữ liệu hiện tại ra `database/`:

```bash
mongosh --quiet --file scripts/export_data.js
```
