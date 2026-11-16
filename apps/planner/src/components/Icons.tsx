import type { SVGProps } from "react"

type IconProps = Omit<SVGProps<SVGSVGElement>, "size"> & { size?: number }

function Base({ size = 18, children, ...props }: IconProps & { children: React.ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      {children}
    </svg>
  )
}

export const HouseIcon = (props: IconProps) => (
  <Base {...props}>
    <path d="M3.5 11.2 12 4l8.5 7.2" />
    <path d="M5.5 10.4V20h13v-9.6" />
    <path d="M10 20v-5h4v5" />
  </Base>
)

export const UndoIcon = (props: IconProps) => (
  <Base {...props}>
    <path d="M9 7 5 11l4 4" />
    <path d="M5 11h8.2a5.8 5.8 0 0 1 0 11.6H10" transform="translate(0 -3.6)" />
  </Base>
)

export const RedoIcon = (props: IconProps) => (
  <Base {...props}>
    <path d="m15 7 4 4-4 4" />
    <path d="M19 11h-8.2a5.8 5.8 0 0 0 0 11.6H14" transform="translate(0 -3.6)" />
  </Base>
)

export const SearchIcon = (props: IconProps) => (
  <Base {...props}>
    <circle cx="10.8" cy="10.8" r="6.3" />
    <path d="m16 16 4.2 4.2" />
  </Base>
)

export const CloseIcon = (props: IconProps) => (
  <Base {...props}>
    <path d="m6 6 12 12M18 6 6 18" />
  </Base>
)

export const MoveIcon = (props: IconProps) => (
  <Base {...props}>
    <path d="M12 3v18M3 12h18" />
    <path d="m8.5 6.5 3.5-3.5 3.5 3.5M8.5 17.5 12 21l3.5-3.5M6.5 8.5 3 12l3.5 3.5M17.5 8.5 21 12l-3.5 3.5" />
  </Base>
)

export const RotateIcon = (props: IconProps) => (
  <Base {...props}>
    <path d="M20 12a8 8 0 1 1-2.3-5.6" />
    <path d="M20 4v4.4h-4.4" />
  </Base>
)

export const RulerIcon = (props: IconProps) => (
  <Base {...props}>
    <path d="m4 20 16-16 2 2L6 22z" transform="translate(-1 -1)" />
    <path d="m8 14 2 2M11 11l2 2M14 8l2 2M17 5l2 2" />
  </Base>
)

export const GridIcon = (props: IconProps) => (
  <Base {...props}>
    <rect x="4" y="4" width="16" height="16" rx="1.5" />
    <path d="M4 9.3h16M4 14.7h16M9.3 4v16M14.7 4v16" />
  </Base>
)

export const DoorIcon = (props: IconProps) => (
  <Base {...props}>
    <path d="M5 20V4.5h14V20" />
    <path d="M5 20h14" />
    <path d="M9 4.5v15.5" />
    <circle cx="15.8" cy="12" r="0.8" fill="currentColor" stroke="none" />
  </Base>
)

export const CameraIcon = (props: IconProps) => (
  <Base {...props}>
    <path d="M4.5 8.5h3l1.2-2h6.6l1.2 2h3a1.5 1.5 0 0 1 1.5 1.5v7a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 17v-7a1.5 1.5 0 0 1 1.5-1.5Z" />
    <circle cx="12" cy="13.2" r="3" />
  </Base>
)

export const DownloadIcon = (props: IconProps) => (
  <Base {...props}>
    <path d="M12 3v12" />
    <path d="m7.5 10.5 4.5 4.5 4.5-4.5" />
    <path d="M4 17v2.5h16V17" />
  </Base>
)

export const UploadIcon = (props: IconProps) => (
  <Base {...props}>
    <path d="M12 16V4" />
    <path d="m7.5 8.5 4.5-4.5 4.5 4.5" />
    <path d="M4 17v2.5h16V17" />
  </Base>
)

export const TrashIcon = (props: IconProps) => (
  <Base {...props}>
    <path d="M4.5 7h15M9 7V4.8h6V7M6.5 7l.9 13h9.2l.9-13M10 10.5v6M14 10.5v6" />
  </Base>
)

export const CopyIcon = (props: IconProps) => (
  <Base {...props}>
    <rect x="8" y="8" width="11" height="11" rx="1.5" />
    <path d="M16 8V5.5A1.5 1.5 0 0 0 14.5 4h-9A1.5 1.5 0 0 0 4 5.5v9A1.5 1.5 0 0 0 5.5 16H8" />
  </Base>
)

export const SunIcon = (props: IconProps) => (
  <Base {...props}>
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M19.1 4.9l-1.4 1.4M6.3 17.7l-1.4 1.4" />
  </Base>
)

export const MoonIcon = (props: IconProps) => (
  <Base {...props}>
    <path d="M20 15.4A8.2 8.2 0 0 1 8.6 4a8.4 8.4 0 1 0 11.4 11.4Z" />
  </Base>
)

export const SparkleIcon = (props: IconProps) => (
  <Base {...props}>
    <path d="M12 3.2 13.7 9l5.8 1.7-5.8 1.7L12 18.2l-1.7-5.8L4.5 10.7 10.3 9 12 3.2Z" />
    <path d="M18.5 16.5 19.2 19l2.5.7-2.5.7-.7 2.5" transform="translate(0 -1.8)" />
  </Base>
)

export const LayersIcon = (props: IconProps) => (
  <Base {...props}>
    <path d="m12 3 9 5-9 5-9-5 9-5Z" />
    <path d="m3 12.5 9 5 9-5M3 16.5l9 5 9-5" />
  </Base>
)

export const EyeIcon = (props: IconProps) => (
  <Base {...props}>
    <path d="M2.5 12S6 5.8 12 5.8 21.5 12 21.5 12 18 18.2 12 18.2 2.5 12 2.5 12Z" />
    <circle cx="12" cy="12" r="3" />
  </Base>
)

export const EyeOffIcon = (props: IconProps) => (
  <Base {...props}>
    <path d="M3 3l18 18" />
    <path d="M10.6 6.1A10.9 10.9 0 0 1 12 6c6 0 9.5 6 9.5 6a16 16 0 0 1-2.1 2.8M6.4 7.3A16 16 0 0 0 2.5 12S6 18 12 18a9.6 9.6 0 0 0 4.2-1" />
    <path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" />
  </Base>
)

export const PlusIcon = (props: IconProps) => (
  <Base {...props}>
    <path d="M12 5v14M5 12h14" />
  </Base>
)

export const CheckIcon = (props: IconProps) => (
  <Base {...props}>
    <path d="m4.5 12.5 5 5 10-11" />
  </Base>
)

export const ChevronDownIcon = (props: IconProps) => (
  <Base {...props}>
    <path d="m6 9.5 6 6 6-6" />
  </Base>
)

export const ArrowLeftIcon = (props: IconProps) => (
  <Base {...props}>
    <path d="M19 12H5" />
    <path d="m11 6-6 6 6 6" />
  </Base>
)

export const InfoIcon = (props: IconProps) => (
  <Base {...props}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 10.5V17M12 7.2v.2" />
  </Base>
)

export const MenuIcon = (props: IconProps) => (
  <Base {...props}>
    <path d="M4 7h16M4 12h16M4 17h16" />
  </Base>
)

export const CompassIcon = (props: IconProps) => (
  <Base {...props}>
    <circle cx="12" cy="12" r="9" />
    <path d="m15.5 8.5-2 5-5 2 2-5 5-2Z" />
  </Base>
)

export const SofaIcon = (props: IconProps) => (
  <Base {...props}>
    <path d="M5 11V8.5A1.5 1.5 0 0 1 6.5 7h11A1.5 1.5 0 0 1 19 8.5V11" />
    <path d="M5 11a2 2 0 0 0-2 2v5h18v-5a2 2 0 0 0-4 0v1H7v-1a2 2 0 0 0-2-2Z" />
    <path d="M7 18v2M17 18v2" />
  </Base>
)

export const KitchenIcon = (props: IconProps) => (
  <Base {...props}>
    <rect x="4" y="5" width="16" height="14" rx="2" />
    <path d="M4 10h16M9 14h6M12 10v4" />
    <circle cx="8" cy="7.5" r=".6" fill="currentColor" />
    <circle cx="16" cy="7.5" r=".6" fill="currentColor" />
  </Base>
)

export const BedIcon = (props: IconProps) => (
  <Base {...props}>
    <path d="M3 18v-8M21 18v-5.5a2.5 2.5 0 0 0-2.5-2.5H12v5" />
    <path d="M3 14h18M3 18h18" />
    <path d="M5 10h4v4H5z" />
  </Base>
)

export const BathIcon = (props: IconProps) => (
  <Base {...props}>
    <path d="M4 12h16v3a4 4 0 0 1-4 4H8a4 4 0 0 1-4-4v-3Z" />
    <path d="M6 12V6.5A2.5 2.5 0 0 1 8.5 4c1.2 0 2.1.8 2.4 1.9M7 19v2M17 19v2" />
  </Base>
)

export const DecoIcon = (props: IconProps) => (
  <Base {...props}>
    <path d="M9 21h6M10 21v-5.5c0-1-.5-1.6-1.4-2.2A4.2 4.2 0 0 1 10.2 5h3.6a4.2 4.2 0 0 1 1.6 8.3c-.9.6-1.4 1.2-1.4 2.2V21" />
    <path d="M12 5V2.5M12 8h.1" />
  </Base>
)

export const GripIcon = (props: IconProps) => (
  <Base {...props}>
    <circle cx="9" cy="7" r="1" fill="currentColor" />
    <circle cx="15" cy="7" r="1" fill="currentColor" />
    <circle cx="9" cy="12" r="1" fill="currentColor" />
    <circle cx="15" cy="12" r="1" fill="currentColor" />
    <circle cx="9" cy="17" r="1" fill="currentColor" />
    <circle cx="15" cy="17" r="1" fill="currentColor" />
  </Base>
)
