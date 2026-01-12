# 🌱 Hướng Dẫn Seed Database - Tránh Bị Trừ Điểm

## ❗ Vấn Đề
Bạn đang thiếu **seed data/sample emails** → Bị trừ **-1 điểm**

## ✅ Giải Pháp (Tôi Đã Làm Xong)

Tôi đã tạo sẵn cho bạn:

### 1. Script Seed Database (`src/seed/seed.ts`)
Tự động tạo:
- **3 tài khoản test** (demo@example.com, alice@example.com, bob@example.com)
- **45 email mẫu** (15 email/người, phân bổ vào Inbox, Sent, Drafts, Spam, Archive, Trash)
- **Kanban board** (4 cột: Inbox, To Do, In Progress, Done)

### 2. Lệnh Chạy Seed
Thêm vào `package.json`:
```bash
npm run seed
```

### 3. Tài Liệu
- `ACTION_CHECKLIST.md` - Checklist cần làm (ĐỌC FILE NÀY!)
- `SEED_SETUP.md` - Hướng dẫn setup MongoDB
- `src/seed/README.md` - Tài liệu chi tiết
- `DATABASE_MOCK_DATA_SUMMARY.md` - Tóm tắt cho giáo viên

## 🚨 QUAN TRỌNG: Bạn Cần Làm Gì?

### Bước 1: Sửa Kết Nối MongoDB

File `.env` của bạn đang dùng MongoDB Atlas (cloud) nhưng chưa config đúng.

**Giải pháp nhanh nhất:**

1. Mở file `.env` trong thư mục `backend`
2. Tìm dòng `MONGODB_URI=...`
3. Đổi thành:
   ```
   MONGODB_URI=mongodb://localhost:27017/mail-project
   ```
4. Save file

### Bước 2: Chạy Seed Script

```bash
cd backend
npm run seed
```

Nếu thành công, bạn sẽ thấy:
```
🌱 Starting database seeding...
✅ Created 3 users
✅ Created 45 total emails
✅ Created 3 Kanban configurations
🎉 Seeding completed successfully!

📝 Sample credentials:
  - demo@example.com / Demo123!
  - alice@example.com / Alice123!
  - bob@example.com / Bob123!
```

### Bước 3: Test Thử

```bash
# 1. Chạy backend (nếu chưa chạy)
npm run dev

# 2. Mở terminal khác, chạy frontend
cd ../frontend
npm run dev

# 3. Mở trình duyệt: http://localhost:3000

# 4. Đăng nhập:
Email: demo@example.com
Password: Demo123!

# 5. Kiểm tra:
- Có 15 emails trong các folder khác nhau
- Kanban board có 4 cột
- Emails được phân bổ vào các cột
```

## 🐛 Nếu Gặp Lỗi

### Lỗi: "Unable to connect to the database"

**Nguyên nhân:** MongoDB chưa chạy hoặc connection string sai

**Giải pháp:**

1. Kiểm tra MongoDB có chạy không:
   ```bash
   mongosh --eval "db.version()"
   ```

2. Nếu thấy số version (vd: `7.0.25`) → MongoDB đang chạy ✅
   → Chỉ cần sửa `.env` như Bước 1 ở trên

3. Nếu báo lỗi → MongoDB chưa cài:
   ```bash
   # Ubuntu/Debian
   sudo apt-get update
   sudo apt-get install -y mongodb-org
   sudo systemctl start mongod
   ```

### Lỗi: "Duplicate key error"

Database đã có data. Xóa đi và chạy lại:
```bash
mongosh
use mail-project
db.users.deleteMany({})
db.emailmetadata.deleteMany({})
db.kanbanconfigs.deleteMany({})
exit

# Rồi chạy lại
npm run seed
```

## 📊 Kết Quả Mong Đợi

Sau khi seed xong:
- ✅ 3 tài khoản test
- ✅ 45 emails mẫu
- ✅ 3 Kanban boards
- ✅ Có thể login và xem emails ngay

## 🎓 Nộp Cho Giáo Viên

Để chứng minh bạn có seed data, show cho giáo viên:

1. **File code:** `backend/src/seed/seed.ts` (script seed)
2. **Tài liệu:** `backend/DATABASE_MOCK_DATA_SUMMARY.md` (tóm tắt)
3. **Demo:** Chạy `npm run seed` trước mặt giáo viên
4. **Kết quả:** Login vào app và show 15 emails + Kanban board

## 📝 Thông Tin Tài Khoản Test

```
Email: demo@example.com
Password: Demo123!

Email: alice@example.com  
Password: Alice123!

Email: bob@example.com
Password: Bob123!
```

## ⚡ TL;DR (Tóm Tắt Siêu Ngắn)

```bash
# 1. Sửa file .env
MONGODB_URI=mongodb://localhost:27017/mail-project

# 2. Chạy seed
cd backend
npm run seed

# 3. Test
npm run dev
# (terminal khác)
cd ../frontend
npm run dev
# Mở http://localhost:3000
# Login: demo@example.com / Demo123!
```

## 🎯 Mục Tiêu

- ✅ Tránh bị trừ -1 điểm
- ✅ Có sample data để demo
- ✅ Có tài liệu đầy đủ
- ✅ Dễ dàng test và phát triển

---

**Cần giúp thêm?** Đọc file `ACTION_CHECKLIST.md` (tiếng Anh, chi tiết hơn)

**Gặp lỗi?** Đọc file `SEED_SETUP.md` (hướng dẫn troubleshooting)
