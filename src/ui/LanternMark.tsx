// TOMOSHIBI の印（提灯）。元データは design/icon/build.py
export function LanternMark({ size = 18, className }: { size?: number; className?: string }) {
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 256 256" aria-hidden="true" focusable="false">
      <path fill="currentColor" d="M90 12 H146 V30 H90 Z M90 226 H146 V244 H90 Z M116.6 36 H119.4 A92 92 0 0 1 189.4 70 H46.6 A92 92 0 0 1 116.6 36 Z M38.3 82 H197.7 A92 92 0 0 1 207.3 106 H28.7 A92 92 0 0 1 38.3 82 Z M28.7 150 H207.3 A92 92 0 0 1 199.9 170 H36.1 A92 92 0 0 1 28.7 150 Z M43.5 182 H192.5 A92 92 0 0 1 119.4 220 H116.6 A92 92 0 0 1 43.5 182 Z " />
      <path fill="#F2B544" d="M48.5 118 H231.5 A92 92 0 0 1 231.5 138 H48.5 A92 92 0 0 1 48.5 118 Z " />
    </svg>
  )
}
