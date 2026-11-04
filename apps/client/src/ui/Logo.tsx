/** The Coilyard mark: a snake drawn as one stroke coiling into a head. */
export function Logo({ size = 44 }: { size?: number }) {
  return (
    <svg className="brand__mark" width={size} height={size} viewBox="0 0 48 48" aria-hidden="true" focusable="false">
      <rect width="48" height="48" rx="12" fill="#1a222b" />
      <path
        d="M36 12H15a6 6 0 0 0 0 12h18a6 6 0 0 1 0 12H13"
        fill="none"
        stroke="#f2b134"
        strokeWidth="6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="36" cy="12" r="1.6" fill="#1a222b" />
    </svg>
  );
}
