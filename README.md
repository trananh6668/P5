# Caro Master AI — Cờ Caro (Gomoku) đấu với AI

React 19 + TypeScript + Tailwind CSS 4 + Vite. AI chạy trong Web Worker, **không cần mạng**.

## Chạy

```bash
npm install
npm run dev          # http://localhost:5173
npm run build        # bản tĩnh nằm trong dist/
npm run test:engine  # kiểm thử AI (chặn 4, 3 mở, bẫy 3-3, 4-3, VCF, luật chặn 2 đầu)
node scripts/selfPlay.ts  # máy tự đánh với máy trên 19x19 / luật chặn 2 đầu
```

### Deploy lên XAMPP / web server tĩnh

1. Chạy `npm run build`.
2. Copy **toàn bộ nội dung** thư mục `dist/` vào `C:\xampp\htdocs\caro\`.
3. Mở `http://localhost/caro/`.

Asset dùng đường dẫn tương đối (`base: './'`) nên đặt ở thư mục con nào cũng được.
Lưu ý: phải mở qua `http://` vì trình duyệt chặn Web Worker khi mở bằng `file://`.

## Kiến trúc

| File | Vai trò |
|---|---|
| `src/types/caro.ts` | Kiểu dữ liệu, mã thế cờ, cấu hình cấp độ AI, giao thức với worker |
| `src/utils/caroRules.ts` | Kiểm tra thắng/hoà theo luật Tự do và luật Chặn 2 đầu |
| `src/workers/caroAi.worker.ts` | Bảng pattern, cập nhật gia tăng, sinh nước ứng viên, Negamax α-β, Zobrist TT, VCF |
| `src/hooks/useCaroGame.ts` | Reducer ván cờ (undo/redo), đồng bộ với worker, huỷ tác vụ |
| `src/components/CaroBoard.tsx` | Bàn cờ SVG, hover, nước cuối, số thứ tự, đường thắng |
| `src/components/ScoreBoard.tsx` | Trạng thái ván, chỉ số AI (thời gian, node, độ sâu, n/s, đánh giá), thống kê |
| `src/components/GameControls.tsx` | Thanh công cụ và cài đặt |

### AI Engine

- **Bảng pattern** (2^20 khoá, tính lười bằng quy hoạch động có nhớ): phân loại thế cờ theo từng hướng
  trong cửa sổ ±5 ô: `5 / 4 mở / 4 chặn / 3 mở / 3 chặn / 2 mở / 2 chặn`, nhận cả thế gãy như `X_XX`, `XX_XX`.
  Mỗi luật có một bảng riêng (luật Chặn 2 đầu không tính chuỗi 5 bị kẹp hai đầu là 5).
- **Cập nhật gia tăng**: đặt hoặc gỡ một quân chỉ tính lại 40 ô trên 4 đường đi qua nó
  (thế cờ, cờ hiệu đe doạ, điểm sắp xếp, tổng điểm đánh giá).
- **Sinh nước ứng viên**: chỉ xét ô trống trong bán kính 2, chấm điểm tấn công + 0.85 × phòng thủ, lấy Top-K.
  Các trường hợp bắt buộc được xử lý trước khi tìm kiếm: thắng ngay → chặn 4 → tạo 4 mở/tứ kép →
  khi đối thủ có 3 mở thì chỉ xét nước chặn và nước phản tứ.
- **Negamax + Alpha-Beta + Iterative Deepening**. Nước chặn bắt buộc không bị trừ độ sâu, nên AI nhìn được hết chuỗi tứ.
- **Zobrist Hashing + Transposition Table** gồm 1M entry trên typed array, điểm thắng được điều chỉnh theo ply.
- **Threat-Space Search (VCF)**: tìm chuỗi tứ liên hoàn ở gốc, ở nút lá (cấp Siêu khó), và **kiểm tra bẫy**:
  bỏ các nước để đối thủ có VCF sau đó. Nhờ vậy AI chống được bẫy 3-3, 4-3, 4-4.
- **Huỷ tác vụ**: mỗi yêu cầu mang `requestId`. Khi bấm Undo, Ván mới, đổi luật hay đổi bên, worker bị
  `terminate()` và tạo lại ngay; kết quả mang id cũ bị bỏ qua.

| Cấp độ | Độ sâu | Top-K | Thời gian | Threat search |
|---|---|---|---|---|
| Dễ | 2 | 8 | 0.5 s | — (có chọn ngẫu nhiên) |
| Trung bình | 4 | 12 | 1.5 s | — |
| Cao thủ | 6 | 12 | 3 s | VCF ở gốc + kiểm tra bẫy |
| Siêu khó | 8 | 15 | 6 s | VCF ở gốc + nút lá + kiểm tra bẫy |

Phím tắt: `Ctrl+Z` đi lại, `Ctrl+Y` đánh lại, `N` ván mới.
