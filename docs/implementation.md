# TheAnHR — kế hoạch và tiến độ

Kế hoạch được người dùng duyệt ngày 08/10/2026 trong cuộc trò chuyện.
Ứng dụng Windows offline; Electron/React/TypeScript; SQLite, ảnh local; một dự án hiện tại và lịch sử chuyển; OCR điền cả HKTT, tất cả trường sửa được, không có xác nhận riêng; portrait tải riêng; Word/PDF Letter ngang theo mẫu; cấu hình công ty/logo/chữ ký; sao lưu/khôi phục.

Các bước:
1. Nền tảng và API có kiểu dữ liệu.
2. SQLite, hồ sơ/dự án/lịch sử, ảnh và sao lưu (kiểm thử trước).
3. OCR offline và parser căn cước (kiểm thử trước).
4. Xuất Word/PDF chung snapshot và kiểm tra bố cục.
5. Giao diện tiếng Việt, chỉnh/cắt ảnh, các thao tác nghiệp vụ.
6. Tích hợp IPC, bảo vệ tài nguyên local, đóng gói, kiểm thử thực tế và rà soát.

Ruling: dùng node:sqlite tích hợp Node/Electron thay addon better-sqlite3 — giữ SQLite và tránh lệch native ABI khi đóng gói.
Ruling: dùng worktree do Codex quản lý để không thay đổi nhánh main hiện tại.
Ruling: dữ liệu thật của tài liệu mẫu không đưa vào mã nguồn hoặc fixtures; dữ liệu test là giả lập.

