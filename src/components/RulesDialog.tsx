'use client';

import { Belt, Card, MaskIcon } from './Card.js';

/** A one-screen summary of the rules, in the same terms the table uses. */
export function RulesDialog({ onClose }: { onClose: () => void }) {
  return (
    <div className="overlay" onClick={onClose}>
      <div className="rules" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Luật chơi">
        <button className="rules-close" onClick={onClose} aria-label="Đóng">
          ×
        </button>
        <h2>Luật chơi nhanh</h2>

        <div className="rules-cards" aria-hidden>
          {[1, 0, 2, 3, 4, 5].map((w, i) => (
            <Card key={w} wrestler={w} size="sm" style={{ transform: `rotate(${(i - 2.5) * 6}deg)` }} />
          ))}
        </div>

        <p>
          6 đô vật đeo mặt nạ, chưa ai biết ai mạnh hơn ai. Mục tiêu: <strong>đánh hết bài trên tay trước</strong>.
          Sức mạnh không cố định — nó được <em>xác lập dần</em> trong mỗi mùa.
        </p>

        <h3>Mỗi vòng</h3>
        <ul>
          <li>
            <strong>Chủ vòng</strong> ra 1–3 lá cùng một đô vật (đô vật chưa ra sân mùa này: chỉ 1 lá). Chủ vòng không được bỏ lượt.
          </li>
          <li>
            Người tiếp theo phải đánh <strong>một đô vật khác</strong>:
            <ul>
              <li>
                Đô vật <strong>chưa so sánh</strong> với lá trên bàn → đánh <strong>thêm 1 lá</strong> so với số lá trên bàn (tối
                đa 3). Từ đó đô vật này được ghi nhận là mạnh hơn.
              </li>
              <li>
                Đô vật <strong>đã biết mạnh hơn</strong> → đánh <strong>đúng bằng</strong> số lá.
              </li>
              <li>Đô vật đã biết yếu hơn thì không được đánh.</li>
            </ul>
          </li>
          <li>
            Không đánh được hoặc không muốn đánh → <strong>Bỏ lượt</strong>, bạn ngồi ngoài tới hết vòng.
          </li>
          <li>Khi mọi người khác đều bỏ lượt, người đánh sau cùng thắng vòng và mở vòng mới.</li>
        </ul>

        <h3>Xếp hạng sức mạnh</h3>
        <p className="rules-row">
          <MaskIcon wrestler={1} size={28} /> <span className="strength-arrow">›</span> <MaskIcon wrestler={3} size={28} />
          <span className="strength-arrow">›</span> <MaskIcon wrestler={5} size={28} />
          <span>Mỗi hàng trên bàn đọc từ trái (mạnh) sang phải (yếu). Hai đô vật ở hai hàng khác nhau là chưa so sánh.</span>
        </p>

        <h3>Tính điểm mỗi mùa</h3>
        <div className="rules-belts">
          <span>
            <Belt delta={2} height={30} /> Hết bài đầu tiên
          </span>
          <span>
            <Belt delta={1} height={30} /> Hết bài thứ hai
          </span>
          <span>
            <Belt delta={-1} height={30} /> Người cuối cùng còn bài
          </span>
        </div>
        <p>
          Chơi 4 mùa (2 người: ai thắng 3 mùa trước). Hoà điểm thì xét số lần về nhất, rồi người thắng mùa gần nhất.
        </p>

        <p className="rules-shortcuts">
          Mẹo: bấm lá để chọn/bỏ chọn, <kbd>nhấp đúp</kbd> để chọn nhanh đúng số lá, <kbd>Enter</kbd> để đánh, <kbd>Esc</kbd> để bỏ chọn.
        </p>
      </div>
    </div>
  );
}
