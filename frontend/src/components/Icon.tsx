import type { IconName } from "../types/ui.js";

export function Icon({ name }: { name: IconName }) {
  const paths: Record<IconName, string> = {
    shield: "M12 3l7 3v5c0 5-3.5 8-7 10-3.5-2-7-5-7-10V6l7-3z",
    activity: "M3 12h4l3-7 4 14 3-7h4",
    folder: "M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z",
    scan: "M9 3H5a2 2 0 0 0-2 2v4M15 3h4a2 2 0 0 1 2 2v4M21 15v4a2 2 0 0 1-2 2h-4M3 15v4a2 2 0 0 0 2 2h4",
    history: "M12 8v5l3 2M3 12a9 9 0 1 0 3-6.7M3 4v5h5",
    settings: "M12 8.5a3.5 3.5 0 1 0 0 7a3.5 3.5 0 1 0 0-7zm0-5.5v2m0 14v2m9-9h-2M5 12H3m15.364 6.364-1.414-1.414M7.05 7.05 5.636 5.636m12.728 0L16.95 7.05M7.05 16.95l-1.414 1.414",
    alert: "M12 9v4M12 17h.01M10 3.5L2.8 18a2 2 0 0 0 1.8 3h14.8a2 2 0 0 0 1.8-3L14 3.5a2 2 0 0 0-4 0z",
    sparkles: "M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8L12 3z",
    play: "M8 5v14l11-7z",
    check: "M5 13l4 4L19 7",
    close: "M6 6l12 12M18 6l-12 12",
    clock: "M12 7v5l3 2M21 12a9 9 0 1 1-18 0a9 9 0 0 1 18 0z",
    chevron: "M9 18l6-6-6-6",
    rotate: "M20 11a8 8 0 1 0 2 5.3M20 4v7h-7",
    trash: "M4 7h16M9 7V4h6v3M7 7l1 13h8l1-13",
    save: "M5 4h11l3 3v13H5zM8 4v6h8M9 20v-6h6v6"
  };

  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d={paths[name]} />
    </svg>
  );
}
