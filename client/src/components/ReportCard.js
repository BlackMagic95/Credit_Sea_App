import React from "react";

function Metric({ label, value }) {
  return (
    <div className="metric">
      <div className="metric-value">{value}</div>
      <div className="metric-label">{label}</div>
    </div>
  );
}

export default function ReportCard({ report, onDelete }) {
  if (!report) return null;
  const accounts = Array.isArray(report.accounts) ? report.accounts : [];

  const handleDelete = async () => {
    if (!report._id) return;
    try {
      const res = await fetch(`http://localhost:5000/reports/${report._id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Delete failed");
      if (onDelete) onDelete(report._id);
    } catch (err) {
      console.error("Delete error", err);
      alert("Failed to delete report");
    }
  };

  return (
    <article className="card report-card">
      <div className="report-header">
        <div>
          <h2 className="report-name">{report.name} {report.pan ? <span className="pan">({report.pan})</span> : null}</h2>
          <div className="muted">{report.phone ? `Phone: ${report.phone}` : "Phone: —"}</div>
        </div>
        <div className="report-actions">
          <button className="btn danger" onClick={handleDelete}>Delete</button>
        </div>
      </div>

      <div className="score-row">
        <div className="score">Credit Score: <strong>{report.creditScore ?? "—"}</strong></div>
        <div className="tiny muted">Uploaded: {new Date(report.createdAt).toLocaleString()}</div>
      </div>

      <div className="metrics-grid">
        <Metric label="Total Accounts" value={report.totalAccounts ?? 0} />
        <Metric label="Active" value={report.activeAccounts ?? 0} />
        <Metric label="Closed" value={report.closedAccounts ?? 0} />
        <Metric label="Current Balance" value={`₹${(report.currentBalance ?? 0).toLocaleString()}`} />
        <Metric label="Secured" value={`₹${(report.securedBalance ?? 0).toLocaleString()}`} />
        <Metric label="Unsecured" value={`₹${(report.unsecuredBalance ?? 0).toLocaleString()}`} />
        <Metric label="Enquiries (7d)" value={report.recentEnquiries ?? 0} />
      </div>

      <div className="accounts-section">
        <h4>Credit Accounts</h4>

        {accounts.length === 0 ? (
          <p className="muted">No account details available.</p>
        ) : (
          <div className="accounts-table-wrap">
            <table className="accounts-table">
              <thead>
                <tr>
                  <th>Bank</th>
                  <th>Account #</th>
                  <th>Type</th>
                  <th>Current Balance</th>
                  <th>Amount Overdue</th>
                  <th>Address</th>
                </tr>
              </thead>
              <tbody>
                {accounts.map((acc, i) => (
                  <tr key={i}>
                    <td>{acc.bank || "—"}</td>
                    <td>{acc.accountNumber || "—"}</td>
                    <td>{acc.type || "—"}</td>
                    <td>₹{(acc.currentBalance ?? 0).toLocaleString()}</td>
                    <td>₹{(acc.amountOverdue ?? 0).toLocaleString()}</td>
                    <td>{acc.address || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div className="accounts-cards">
              {accounts.map((acc, i) => (
                <div className="acc-card" key={i}>
                  <div className="acc-row"><strong>{acc.bank || "—"}</strong> <span className="muted small">{acc.type || ""}</span></div>
                  <div className="muted small">Account #: {acc.accountNumber || "—"}</div>
                  <div className="acc-stats">Balance: ₹{(acc.currentBalance ?? 0).toLocaleString()} · Overdue: ₹{(acc.amountOverdue ?? 0).toLocaleString()}</div>
                  <div className="muted small">{acc.address || "—"}</div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </article>
  );
}
