// Placeholder art for dolls without a photo: a little skull with a bow.
export default function Skull({ className = '' }) {
  return (
    <svg className={`skull ${className}`} viewBox="0 0 100 100" aria-hidden="true">
      <path d="M50 14c-19 0-33 13-33 31 0 10 5 18 12 23v10c0 3 2 5 5 5h32c3 0 5-2 5-5V68c7-5 12-13 12-23 0-18-14-31-33-31z" fill="currentColor" opacity="0.9" />
      <ellipse cx="37" cy="47" rx="8" ry="9" fill="var(--bg)" />
      <ellipse cx="63" cy="47" rx="8" ry="9" fill="var(--bg)" />
      <path d="M50 57l-5 8h10z" fill="var(--bg)" />
      <path d="M40 74v8M50 74v8M60 74v8" stroke="var(--bg)" strokeWidth="3" />
      <path d="M62 16l14-9 2 15zM62 16l-4 12 14 2z" fill="var(--pink)" />
      <circle cx="66" cy="17" r="4" fill="var(--pink)" />
    </svg>
  );
}
