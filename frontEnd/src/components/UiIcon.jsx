import React from 'react';

const ICONS = {
  download: <><path d="M12 3v12"/><path d="m7 10 5 5 5-5"/><path d="M5 21h14"/></>,
  upload: <><path d="M12 16V4"/><path d="m7 9 5-5 5 5"/><path d="M5 20h14"/></>,
  plus: <><path d="M12 5v14"/><path d="M5 12h14"/></>,
  search: <><circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/></>,
  eye: <><path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Z"/><circle cx="12" cy="12" r="2.5"/></>,
  edit: <><path d="M4 20h4l11-11-4-4L4 16v4Z"/><path d="m13.5 6.5 4 4"/></>,
  trash: <><path d="M4 7h16"/><path d="M9 7V4h6v3"/><path d="m6 7 1 14h10l1-14"/><path d="M10 11v6M14 11v6"/></>,
  file: <><path d="M6 3h8l4 4v14H6z"/><path d="M14 3v5h5"/><path d="M9 13h6M9 17h6"/></>,
  users: <><circle cx="9" cy="8" r="3"/><path d="M3.5 19a5.5 5.5 0 0 1 11 0"/><path d="M16 8h5M18.5 5.5v5"/></>,
  clipboard: <><rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 4V2h6v2"/><path d="m9 13 2 2 4-5"/></>,
  history: <><path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/><path d="M12 7v5l3 2"/></>,
  refresh: <><path d="M20 7V3h-4"/><path d="M19 4a9 9 0 1 0 2 9"/></>,
  chart: <><path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/></>,
  close: <><path d="M6 6l12 12M18 6 6 18"/></>,
  check: <><circle cx="12" cy="12" r="9"/><path d="m8 12 3 3 5-6"/></>,
  user: <><circle cx="12" cy="8" r="3.5"/><path d="M5 20a7 7 0 0 1 14 0"/></>,
  laptop: <><rect x="4" y="5" width="16" height="11" rx="1.5"/><path d="M2 19h20"/></>,
  mouse: <><rect x="7" y="3" width="10" height="18" rx="5"/><path d="M12 3v5"/></>,
  truck: <><path d="M3 6h11v10H3z"/><path d="M14 9h4l3 3v4h-7z"/><circle cx="7" cy="18" r="2"/><circle cx="18" cy="18" r="2"/></>,
  alert: <><path d="M12 3 2.7 20h18.6L12 3Z"/><path d="M12 9v5"/><path d="M12 17.5h.01"/></>,
  tablet: <><rect x="6" y="2.5" width="12" height="19" rx="2"/><path d="M10 5h4"/><path d="M11.9 18.5h.2"/></>,
  radio: <><rect x="3" y="7" width="18" height="13" rx="2"/><path d="m7 7 8-4"/><circle cx="8" cy="13.5" r="2.5"/><path d="M14 12h4M14 15h4"/></>,
  camera: <><rect x="3" y="6" width="18" height="14" rx="2"/><path d="M8 6l1.5-2h5L16 6"/><circle cx="12" cy="13" r="4"/></>,
  arrows: <><path d="m8 7 4-4 4 4"/><path d="M12 3v18"/><path d="m8 17 4 4 4-4"/></>,
};

export function UiIcon({ name, size = 18, className = '' }) {
  return (
    <svg
      className={`ui-icon ${className}`.trim()}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {ICONS[name]}
    </svg>
  );
}
