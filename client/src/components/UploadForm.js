import React, { useState } from "react";

export default function UploadForm({ onUploadSuccess }) {
  const [file, setFile] = useState(null);
  const [error, setError] = useState("");
  const [uploading, setUploading] = useState(false);

  const onFileChange = (e) => {
    setError("");
    setFile(e.target.files[0]);
  };

  const handleUpload = async (e) => {
    e.preventDefault();
    if (!file) return setError("Please choose an XML file to upload.");
    setError("");
    setUploading(true);

    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("http://localhost:5000/upload", {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        let body = {};
        try { body = await res.json(); } catch (_) {}
        throw new Error(body.error || `Upload failed (${res.status})`);
      }
      const data = await res.json();
      onUploadSuccess(data);
      setFile(null);
    } catch (err) {
      console.error(err);
      setError(err.message || "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="card upload-card">
      <h3>Upload Experian XML</h3>
      <form onSubmit={handleUpload} className="upload-form">
        <label className="file-input">
          <input type="file" accept=".xml,application/xml,text/xml" onChange={onFileChange} />
          <div className="file-placeholder">
            <div className="drop-icon">📄</div>
            <div className="file-text">{file ? file.name : "Choose or drop an XML file"}</div>
            <div className="muted small">Supports Experian soft-pull XML</div>
          </div>
        </label>

        <div className="upload-row">
          <button className="btn primary" type="submit" disabled={uploading}>
            {uploading ? "Uploading..." : "Upload & Parse"}
          </button>
          <button
            type="button"
            className="btn ghost"
            onClick={() => {
              setFile(null);
              setError("");
            }}
          >
            Clear
          </button>
        </div>

        {error && <div className="error">{error}</div>}
      </form>
      <div className="foot muted small">Tip: Upload Sagar_Ugle1.xml (sample) to test.</div>
    </div>
  );
}
