window.STUDIES = [
  {
    name: "CT Abdomen/Pelvis with contrast",
    short: "CT A/P +C",
    recent: 378,
    prev: 420,
    reads: 65,
    maturity: "Established",
  },
  {
    name: "CT Chest + Abdomen/Pelvis with contrast",
    short: "CT C/A/P +C",
    recent: 492,
    prev: 535,
    reads: 51,
    maturity: "Established",
  },
  {
    name: "MRI Abdomen with & without contrast",
    short: "MRI Abd W/WO",
    recent: 760,
    prev: 810,
    reads: 13,
    maturity: "Building",
  },
  {
    name: "MRI Abdomen + Pelvis with & without contrast",
    short: "MRI A/P W/WO",
    recent: 1025,
    prev: 1045,
    reads: 11,
    maturity: "Building",
  },
  {
    name: "CT Chest with contrast",
    short: "CT Chest +C",
    recent: 287,
    prev: null,
    reads: 6,
    maturity: "Building",
  },
  {
    name: "CT Abdomen/Pelvis without contrast",
    short: "CT A/P −C",
    recent: 360,
    prev: null,
    reads: 5,
    maturity: "Early",
  },
];
window.fmt = (s) => {
  const m = Math.floor(s / 60),
    r = Math.round(s % 60);
  return String(m).padStart(2, "0") + ":" + String(r).padStart(2, "0");
};
window.pct = (st) =>
  st.prev ? Math.round((1 - st.recent / st.prev) * 100) : null;
// deterministic pseudo-random recent reads drifting faster
window.reads = (st, n = 18) => {
  let x = st.reads * 9301 + 49297;
  const out = [];
  const start = (st.prev || st.recent) * 1.06;
  for (let i = 0; i < n; i++) {
    x = (x * 9301 + 49297) % 233280;
    const noise = (x / 233280 - 0.5) * 0.16;
    const t = i / (n - 1);
    out.push((start + (st.recent - start) * t) * (1 + noise));
  }
  return out;
};
