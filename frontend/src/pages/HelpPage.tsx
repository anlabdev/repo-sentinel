import type { UiLanguage } from "../../../shared/src/index.js";
import type { CopySet } from "../data/ui.js";

export function HelpPage({ copy, language }: { copy: CopySet; language: UiLanguage }) {
  const sections = language === "vi"
    ? [
        {
          title: "Web này dùng để làm gì?",
          points: [
            "RepoSentinel quét repo Git hoặc file ZIP để phát hiện dấu hiệu mã độc, secret, encoded blob, artifact nhị phân và các pattern rủi ro khác.",
            "Hệ thống ưu tiên detector rule-based trước, AI chỉ dùng để giải thích, triage sâu hơn và hỗ trợ đọc kết quả dễ hơn.",
            "Bạn vẫn dùng được app ngay cả khi chưa cấu hình OpenAI."
          ]
        },
        {
          title: "Các màn hình chính",
          points: [
            "Tổng quan: xem KPI tổng, scan gần nhất, lịch sử nhanh và cài đặt rút gọn.",
            "Quét mới: nhập URL repo hoặc tải ZIP để bắt đầu scan.",
            "Quét trực tiếp: xem findings, AI analysis, tệp lớn nhất và export report.",
            "Thống kê: xem tổng token, breakdown theo từng project và từng pha AI.",
            "Lịch sử: tìm lại các lần scan cũ, quét lại hoặc mở report chi tiết.",
            "Cài đặt: chỉnh threshold, model và API key OpenAI."
          ]
        },
        {
          title: "Lệnh nhanh",
          points: [
            copy.helpCommandHint,
            "/h: mở màn trợ giúp.",
            "/hs: hiện danh sách lịch sử scan gần đây trong command palette.",
            "/hs repo: lọc lịch sử theo tên repo / URL / branch, chọn một item để mở thẳng report ở Quét trực tiếp."
          ]
        }
      ]
    : [
        {
          title: "What is this app for?",
          points: [
            "RepoSentinel scans Git repositories or ZIP uploads for suspicious code, secrets, encoded blobs, binary artifacts, and other risky patterns.",
            "The system uses deterministic detectors first, while AI is only used for explanation and deeper triage.",
            "The app remains useful even if OpenAI is not configured."
          ]
        },
        {
          title: "Main screens",
          points: [
            "Overview: high-level KPIs, latest scan, compact history, and compact settings.",
            "New Scan: enter a repository URL or upload a ZIP to start scanning.",
            "Live Scan: inspect findings, AI analysis, largest files, and exports.",
            "Analytics: inspect total token usage and per-project AI token breakdown.",
            "History: reopen old scans, rescan, or delete reports.",
            "Settings: configure thresholds, model, and OpenAI API key."
          ]
        },
        {
          title: "Quick commands",
          points: [
            copy.helpCommandHint,
            "/h: open the help screen.",
            "/hs: list recent scan history entries in the command palette.",
            "/hs repo: filter history by repo name / URL / branch, then select one to open its report in Live Scan."
          ]
        }
      ];

  return (
    <section className="rs-help-shell">
      <div className="rs-panel">
        <div className="rs-panel-header">
          <span>{copy.helpTitle}</span>
        </div>
        <div className="rs-help-body">
          {sections.map((section) => (
            <article key={section.title} className="rs-help-card">
              <strong>{section.title}</strong>
              <ul>
                {section.points.map((point) => (
                  <li key={point}>{point}</li>
                ))}
              </ul>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

