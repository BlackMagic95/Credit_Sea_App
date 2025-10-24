import React, { useState, useEffect } from "react";
import "./App.css";
import Header from "./components/Header";
import UploadForm from "./components/UploadForm";
import ReportCard from "./components/ReportCard";

function App() {
  const [reports, setReports] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch("http://localhost:5000/reports");
        const data = await res.json();
        setReports(Array.isArray(data) ? data : []);
      } catch (err) {
        console.error("Failed to fetch reports:", err);
        setReports([]);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  const addReport = (report) => setReports((prev) => (prev ? [report, ...prev] : [report]));
  const removeReportFromUI = (id) => setReports((prev) => prev.filter((r) => r._id !== id));

  return (
    <div className="app-root">
      <Header />
      <main className="container">
        <div className="top-row">
          <UploadForm onUploadSuccess={addReport} />
          <div className="recent-box">
            <h3 className="recent-title">Recent Reports</h3>
            {loading ? (
              <p className="muted">Loading...</p>
            ) : reports && reports.length > 0 ? (
              <ul className="recent-list">
                {reports.slice(0, 6).map((r) => (
                  <li key={r._id} className="recent-item">
                    <div>
                      <strong>{r.name || "—"}</strong>
                      <div className="muted small">{r.pan || ""} · {r.creditScore}</div>
                    </div>
                    <div className="recent-actions">
                      <button className="link" onClick={() => window.scrollTo({ top: 9999, behavior: "smooth" })}>
                        view
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="muted">No saved reports. Upload an XML to begin.</p>
            )}
          </div>
        </div>

        <section className="reports-section">
          {loading ? null : reports && reports.length > 0 ? (
            reports.map((report) => (
              <ReportCard key={report._id} report={report} onDelete={removeReportFromUI} />
            ))
          ) : (
            <div className="empty-state">
              <p className="muted">No reports yet — upload a soft-pull XML to see a parsed credit report.</p>
            </div>
          )}
        </section>
      </main>
      <footer className="footer">
        <small>CreditSea demo • MERN • Dark theme</small>
      </footer>
    </div>
  );
}

export default App;
