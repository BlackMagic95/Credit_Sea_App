import React from "react";

export default function Header() {
  return (
    <header className="app-header">
      <div className="container header-inner">
        <div className="brand">
          <div className="logo">CS</div>
          <div>
            <h1 className="title">CreditSea</h1>
            <div className="subtitle">Soft-pull report parser • Experian XML</div>
          </div>
        </div>
        <nav className="nav">
          <a className="nav-link" href="#" onClick={(e) => e.preventDefault()}>
            Docs
          </a>
          <a className="nav-link" href="#" onClick={(e) => e.preventDefault()}>
            Demo
          </a>
        </nav>
      </div>
    </header>
  );
}
