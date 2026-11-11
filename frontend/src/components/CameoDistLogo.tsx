interface CameoDistLogoProps {
  className?: string;
}

export function CameoDistLogo({ className = 'h-8 w-8' }: CameoDistLogoProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 64 64"
      fill="none"
      aria-hidden="true"
      className={className}
    >
      <rect
        x="2"
        y="2"
        width="60"
        height="60"
        rx="15"
        fill="#15171c"
        stroke="#2c313d"
        strokeWidth="2.5"
      />
      <path
        d="M47.6 19.6A18.2 18.2 0 1 0 48.5 39.7"
        stroke="#f97316"
        strokeWidth="3.5"
        strokeLinecap="round"
      />
      <circle cx="50" cy="28.8" r="2.8" fill="#fb923c" />
      <path d="M26.75 22.5L42.25 32L26.75 41.5V22.5Z" fill="#f3f4f6" />
    </svg>
  );
}
