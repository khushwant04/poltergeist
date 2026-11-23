export function Ghost({ size = 24 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true" className="ghost">
      <path d="M16 3c-6 0-10 4.5-10 10.5V28l3.3-2.4L12.7 28 16 25.6 19.3 28l3.4-2.4L26 28V13.5C26 7.5 22 3 16 3z" fill="currentColor" />
      <circle cx="12.5" cy="13" r="1.8" fill="var(--bg)" />
      <circle cx="19.5" cy="13" r="1.8" fill="var(--bg)" />
    </svg>
  );
}
