type Props = { className?: string; tone?: 'dark' | 'light' };

// Courthouse facade with scales in the pediment. "dark" is drawn for navy backgrounds, "light" for paper.
export const Courthouse = ({ className = '', tone = 'dark' }: Props) => {
  const line = tone === 'dark' ? '#D8B56D' : '#14243A';
  const soft = tone === 'dark' ? 'rgba(216,181,109,.14)' : 'rgba(20,36,58,.07)';
  const cols = [60, 100, 140, 180, 220, 260];
  return (
    <svg viewBox="0 0 320 184" className={className} role="img" aria-label="Courthouse illustration" fill="none">
      <path d="M36 72 160 20l124 52Z" fill={soft} stroke={line} strokeWidth="2" strokeLinejoin="round" />
      <path d="M160 36v24M146 60h28M150 44l-8 10h16l-8-10Zm20 0-8 10h16l-8-10ZM160 36l-10 8m10-8 10 8" stroke={line} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      <rect x="40" y="72" width="240" height="9" rx="1" fill={soft} stroke={line} strokeWidth="2" />
      {cols.map((c) => (
        <g key={c}>
          <rect x={c - 11} y="81" width="22" height="5" fill={line} opacity=".9" />
          <rect x={c - 7} y="86" width="14" height="58" fill={soft} stroke={line} strokeWidth="1.8" />
          <path d={`M${c - 3} 90v50M${c + 3} 90v50`} stroke={line} strokeWidth="1" opacity=".45" />
          <rect x={c - 11} y="144" width="22" height="5" fill={line} opacity=".9" />
        </g>
      ))}
      <rect x="34" y="149" width="252" height="7" fill={soft} stroke={line} strokeWidth="1.8" />
      <rect x="26" y="156" width="268" height="7" fill={soft} stroke={line} strokeWidth="1.8" />
      <rect x="18" y="163" width="284" height="7" fill={soft} stroke={line} strokeWidth="1.8" />
      <path d="M8 176h304" stroke={line} strokeWidth="1.4" strokeLinecap="round" opacity=".5" />
    </svg>
  );
};

export const Logo = ({ className = 'w-9 h-9' }: { className?: string }) => (
  <img src="/logo.svg" alt="" className={`${className} rounded-[10px]`} />
);
