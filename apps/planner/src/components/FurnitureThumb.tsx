import type { CatalogItem, FurnitureVariant } from "@/types"
import { darken, lighten } from "@/scene/furniture/palette"

function boxFaces(x: number, y: number, w: number, d: number, h: number, color: string) {
  const top = lighten(color, 0.2)
  const left = darken(color, 0.16)
  const right = darken(color, 0.34)
  return {
    top: `${x},${y - h - d / 2} ${x + w / 2},${y - h} ${x},${y - h + d / 2} ${x - w / 2},${y - h}`,
    left: `${x - w / 2},${y - h} ${x},${y - h + d / 2} ${x},${y + d / 2} ${x - w / 2},${y}`,
    right: `${x + w / 2},${y - h} ${x},${y - h + d / 2} ${x},${y + d / 2} ${x + w / 2},${y}`,
    colors: { top, left, right },
  }
}

function Iso({
  x,
  y,
  w,
  d,
  h,
  color,
}: {
  x: number
  y: number
  w: number
  d: number
  h: number
  color: string
}) {
  const faces = boxFaces(x, y, w, d, h, color)
  return (
    <g>
      <polygon points={faces.left} fill={faces.colors.left} />
      <polygon points={faces.right} fill={faces.colors.right} />
      <polygon points={faces.top} fill={faces.colors.top} stroke="rgba(255,255,255,0.22)" strokeWidth="0.4" />
    </g>
  )
}

function Legs({ x, y, w, d, color }: { x: number; y: number; w: number; d: number; color: string }) {
  return (
    <g stroke={color} strokeWidth="1.6" strokeLinecap="round">
      <line x1={x - w / 2 + 3} y1={y - 1} x2={x - w / 2 + 3} y2={y + 3} />
      <line x1={x + w / 2 - 3} y1={y - 1} x2={x + w / 2 - 3} y2={y + 3} />
      <line x1={x - 2} y1={y + d / 2 - 1} x2={x - 2} y2={y + d / 2 + 3} />
      <line x1={x + 2} y1={y + d / 2 - 1} x2={x + 2} y2={y + d / 2 + 3} />
    </g>
  )
}

export function FurnitureThumb({
  item,
  variant,
  size = 58,
}: {
  item: CatalogItem
  variant: FurnitureVariant
  size?: number
}) {
  const primary = variant.primary
  const secondary = variant.secondary
  const wood = variant.wood
  const metal = variant.metal
  const cx = 32
  const baseline = 40
  let content: React.ReactNode = null

  switch (item.kind) {
    case "sofa":
    case "sofaCorner":
      content = (
        <>
          <Legs x={cx} y={baseline} w={38} d={18} color={darken(wood, 0.35)} />
          <Iso x={cx} y={baseline} w={38} d={18} h={6} color={primary} />
          <Iso x={cx} y={baseline - 6} w={38} d={6} h={16} color={primary} />
          <Iso x={cx - 11} y={baseline - 6} w={15} d={11} h={3} color={secondary} />
          <Iso x={cx + 5} y={baseline - 6} w={15} d={11} h={3} color={secondary} />
        </>
      )
      break
    case "armchair":
      content = (
        <>
          <Legs x={cx} y={baseline} w={26} d={15} color={darken(wood, 0.35)} />
          <Iso x={cx} y={baseline} w={26} d={15} h={6} color={primary} />
          <Iso x={cx} y={baseline - 6} w={26} d={6} h={15} color={primary} />
          <Iso x={cx} y={baseline - 6} w={14} d={10} h={3} color={secondary} />
        </>
      )
      break
    case "pouf":
      content = (
        <>
          <ellipse cx={cx} cy={baseline + 3} rx="14" ry="4" fill="rgba(25,30,24,0.12)" />
          <ellipse cx={cx} cy={baseline - 9} rx="14" ry="7" fill={lighten(primary, 0.16)} />
          <path d={`M18 ${baseline - 9} v7 a14 7 0 0 0 28 0 v-7`} fill={darken(primary, 0.16)} />
          <ellipse cx={cx} cy={baseline - 9} rx="9" ry="4" fill="none" stroke={darken(primary, 0.25)} strokeWidth="0.8" />
        </>
      )
      break
    case "coffeeTable":
    case "roundTable":
    case "diningTable":
      content = (
        <>
          <Legs x={cx} y={baseline} w={item.kind === "diningTable" ? 36 : 30} d={14} color={darken(wood, 0.3)} />
          <Iso x={cx} y={baseline} w={item.kind === "roundTable" ? 26 : 34} d={16} h={5} color={wood} />
          {item.kind === "coffeeTable" ? <Iso x={cx} y={baseline - 2} w={22} d={10} h={2} color={darken(wood, 0.2)} /> : null}
        </>
      )
      break
    case "tvUnit":
      content = (
        <>
          <Legs x={cx} y={baseline} w={40} d={13} color={metal} />
          <Iso x={cx} y={baseline} w={40} d={13} h={10} color={wood} />
          <line x1={cx - 12} y1={baseline - 1} x2={cx - 12} y2={baseline - 9} stroke={darken(wood, 0.25)} strokeWidth="0.7" />
          <line x1={cx + 12} y1={baseline - 1} x2={cx + 12} y2={baseline - 9} stroke={darken(wood, 0.25)} strokeWidth="0.7" />
        </>
      )
      break
    case "tv":
      content = (
        <>
          <Iso x={cx} y={baseline} w={34} d={3} h={21} color={primary === "#b8b9b4" ? "#2c2e2c" : primary} />
          <polygon points={`${cx - 15},${baseline - 20} ${cx + 15},${baseline - 20} ${cx + 15},${baseline - 8} ${cx - 15},${baseline - 8}`} fill="#101816" opacity="0.9" />
          <rect x={cx - 1} y={baseline + 1} width="2" height="4" fill={metal} />
        </>
      )
      break
    case "rug":
      content = (
        <>
          <polygon
            points={`${cx},${baseline - 4} ${cx + 26},${baseline} ${cx},${baseline + 4} ${cx - 26},${baseline}`}
            fill={lighten(primary, 0.08)}
            stroke={darken(primary, 0.2)}
            strokeWidth="0.7"
          />
          <polygon
            points={`${cx},${baseline - 2} ${cx + 20},${baseline} ${cx},${baseline + 2} ${cx - 20},${baseline}`}
            fill="none"
            stroke={secondary}
            strokeWidth="0.7"
          />
        </>
      )
      break
    case "plant":
      content = (
        <>
          <ellipse cx={cx} cy={baseline + 3} rx="9" ry="2.6" fill="rgba(25,30,24,0.12)" />
          <path d={`M23 ${baseline - 7} h18 l-2.5 8 h-13 z`} fill={secondary} />
          <path d={`M23 ${baseline - 7} h18`} stroke={darken(secondary, 0.2)} strokeWidth="1" />
          <line x1={cx} y1={baseline - 7} x2={cx + 1} y2={baseline - 23} stroke={darken(wood, 0.2)} strokeWidth="1.5" />
          {[0, 1, 2, 3, 4].map((index) => (
            <ellipse
              key={index}
              cx={cx + Math.cos(index * 2.2) * 8}
              cy={baseline - 17 - index * 2.2}
              rx="6.5"
              ry="3.2"
              transform={`rotate(${index * 38} ${cx} ${baseline - 17})`}
              fill={index % 2 ? lighten(primary, 0.12) : primary}
            />
          ))}
        </>
      )
      break
    case "floorLamp":
    case "tableLamp":
    case "pendant":
      content = (
        <>
          <ellipse cx={cx} cy={baseline + 3} rx="10" ry="3" fill="rgba(25,30,24,0.12)" />
          <ellipse cx={cx} cy={baseline - 1} rx="7" ry="2.4" fill={metal} />
          <line x1={cx} y1={baseline - 2} x2={cx} y2={baseline - 20} stroke={metal} strokeWidth="1.6" />
          <path d={`M22 ${baseline - 19} h20 l-4 -10 h-12 z`} fill={lighten(primary === "#2e2f2c" ? "#efe4cf" : primary, 0.18)} stroke={darken(primary, 0.2)} strokeWidth="0.6" />
          <ellipse cx={cx} cy={baseline - 19} rx="10" ry="2.4" fill={darken(primary, 0.12)} opacity="0.5" />
        </>
      )
      break
    case "shelf":
      content = (
        <>
          <Iso x={cx} y={baseline} w={30} d={10} h={34} color={wood} />
          {[7, 16, 25].map((h) => (
            <line key={h} x1={cx - 14} y1={baseline - h} x2={cx + 14} y2={baseline - h} stroke={darken(wood, 0.28)} strokeWidth="0.8" />
          ))}
          <rect x={cx - 11} y={baseline - 30} width="4" height="10" fill={primary} opacity="0.75" />
          <rect x={cx - 6} y={baseline - 30} width="3" height="9" fill={secondary} opacity="0.8" />
          <rect x={cx + 1} y={baseline - 30} width="4" height="11" fill={darken(primary, 0.18)} opacity="0.75" />
        </>
      )
      break
    case "kitchenIsland":
    case "counter":
      content = (
        <>
          <Iso x={cx} y={baseline} w={42} d={16} h={20} color={primary} />
          <Iso x={cx} y={baseline - 20} w={44} d={17} h={3} color={variant.stone ?? "#ded9cf"} />
          <line x1={cx - 16} y1={baseline} x2={cx - 16} y2={baseline - 16} stroke={darken(primary, 0.25)} strokeWidth="0.7" />
          <line x1={cx + 2} y1={baseline} x2={cx + 2} y2={baseline - 16} stroke={darken(primary, 0.25)} strokeWidth="0.7" />
        </>
      )
      break
    case "fridge":
      content = (
        <>
          <Iso x={cx} y={baseline} w={22} d={14} h={38} color={primary} />
          <line x1={cx - 8} y1={baseline - 2} x2={cx - 8} y2={baseline - 16} stroke={secondary} strokeWidth="1" />
          <line x1={cx + 8} y1={baseline - 2} x2={cx + 8} y2={baseline - 16} stroke={secondary} strokeWidth="1" />
          <line x1={cx - 11} y1={baseline - 21} x2={cx + 11} y2={baseline - 21} stroke={darken(primary, 0.3)} strokeWidth="0.8" />
        </>
      )
      break
    case "hood":
      content = (
        <>
          <Iso x={cx} y={baseline - 8} w={30} d={14} h={5} color={metal} />
          <Iso x={cx} y={baseline - 13} w={10} d={7} h={16} color={metal} />
        </>
      )
      break
    case "bed":
      content = (
        <>
          <Legs x={cx} y={baseline} w={38} d={18} color={darken(wood, 0.35)} />
          <Iso x={cx} y={baseline} w={38} d={22} h={6} color={wood} />
          <Iso x={cx} y={baseline - 6} w={36} d={20} h={4} color={lighten(primary, 0.08)} />
          <Iso x={cx} y={baseline - 10} w={36} d={12} h={3} color={primary} />
          <Iso x={cx} y={baseline - 8} w={38} d={5} h={18} color={secondary} />
          <Iso x={cx - 8} y={baseline - 12} w={12} d={6} h={3} color="#f2eee6" />
          <Iso x={cx + 8} y={baseline - 12} w={12} d={6} h={3} color="#f2eee6" />
        </>
      )
      break
    case "diningChair":
    case "officeChair":
      content = (
        <>
          <Legs x={cx} y={baseline} w={18} d={10} color={metal} />
          <Iso x={cx} y={baseline} w={20} d={12} h={3} color={primary} />
          <Iso x={cx} y={baseline - 3} w={20} d={4} h={17} color={secondary} />
        </>
      )
      break
    case "shower":
      content = (
        <>
          <Iso x={cx} y={baseline} w={30} d={20} h={4} color="#e8e5dc" />
          <polygon points={`${cx - 15},${baseline - 4} ${cx - 15},${baseline - 32} ${cx + 4},${baseline - 25} ${cx + 4},${baseline - 4}`} fill="#cfe3e4" opacity="0.55" stroke="#8faeb2" strokeWidth="0.6" />
          <circle cx={cx + 8} cy={baseline - 26} r="3" fill={metal} />
        </>
      )
      break
    case "toilet":
      content = (
        <>
          <ellipse cx={cx} cy={baseline + 2} rx="10" ry="3" fill="rgba(25,30,24,0.1)" />
          <ellipse cx={cx} cy={baseline - 8} rx="11" ry="6" fill={lighten(primary, 0.1)} />
          <path d={`M${cx - 11} ${baseline - 8} v5 a11 6 0 0 0 22 0 v-5`} fill={primary} />
          <Iso x={cx + 8} y={baseline - 9} w={13} d={8} h={14} color={primary} />
          <ellipse cx={cx} cy={baseline - 8} rx="6" ry="3" fill="#d9e0dd" />
        </>
      )
      break
    case "bathtub":
      content = (
        <>
          <ellipse cx={cx} cy={baseline + 2} rx="19" ry="4" fill="rgba(25,30,24,0.1)" />
          <ellipse cx={cx} cy={baseline - 8} rx="20" ry="9" fill={lighten(primary, 0.1)} />
          <path d={`M${cx - 20} ${baseline - 8} v5 a20 9 0 0 0 40 0 v-5`} fill={primary} />
          <ellipse cx={cx} cy={baseline - 8} rx="15" ry="6" fill="#bcd5d7" />
        </>
      )
      break
    case "vanity":
      content = (
        <>
          <Iso x={cx} y={baseline} w={34} d={14} h={18} color={wood} />
          <Iso x={cx} y={baseline - 18} w={36} d={15} h={3} color={variant.stone ?? "#ded9cf"} />
          <ellipse cx={cx} cy={baseline - 21} rx="9" ry="4" fill="#eceae3" stroke="#b8bdb8" strokeWidth="0.5" />
        </>
      )
      break
    case "wardrobe":
      content = (
        <>
          <Iso x={cx} y={baseline} w={30} d={13} h={40} color={wood} />
          <line x1={cx} y1={baseline - 2} x2={cx} y2={baseline - 38} stroke={darken(wood, 0.3)} strokeWidth="0.8" />
          <circle cx={cx - 2} cy={baseline - 18} r="0.9" fill={metal} />
          <circle cx={cx + 2} cy={baseline - 18} r="0.9" fill={metal} />
        </>
      )
      break
    case "desk":
      content = (
        <>
          <Legs x={cx} y={baseline} w={34} d={14} color={metal} />
          <Iso x={cx} y={baseline} w={38} d={16} h={4} color={wood} />
          <Iso x={cx - 5} y={baseline - 4} w={8} d={5} h={10} color={primary} />
          <line x1={cx - 9} y1={baseline - 9} x2={cx - 1} y2={baseline - 11} stroke="#2f3836" strokeWidth="1.4" />
        </>
      )
      break
    case "art":
      content = (
        <>
          <Iso x={cx} y={baseline - 14} w={30} d={4} h={24} color={wood} />
          <polygon points={`${cx - 12},${baseline - 22} ${cx + 12},${baseline - 22} ${cx + 12},${baseline - 10} ${cx - 12},${baseline - 10}`} fill={lighten(secondary, 0.15)} />
          <circle cx={cx - 4} cy={baseline - 13} r="3.4" fill="#b86f50" opacity="0.8" />
          <rect x={cx + 2} y={baseline - 16} width="7" height="5" fill="#71816c" opacity="0.8" />
        </>
      )
      break
    case "mirror":
      content = (
        <>
          <Iso x={cx} y={baseline - 14} w={22} d={4} h={30} color={wood} />
          <polygon points={`${cx - 9},${baseline - 25} ${cx + 9},${baseline - 19} ${cx + 9},${baseline - 7} ${cx - 9},${baseline - 13}`} fill="#c9d8db" opacity="0.85" />
        </>
      )
      break
    case "curtain":
      content = (
        <>
          <line x1={cx - 20} y1={baseline - 32} x2={cx + 20} y2={baseline - 32} stroke={metal} strokeWidth="1.2" />
          {[-15, -5, 5, 15].map((offset) => (
            <path key={offset} d={`M${cx + offset - 3} ${baseline - 31} q2 15 0 30 h6 q-2 -15 0 -30 z`} fill={offset % 10 === 0 ? primary : secondary} opacity="0.9" />
          ))}
        </>
      )
      break
    case "radiator":
      content = (
        <>
          <rect x={cx - 18} y={baseline - 28} width="36" height="22" rx="2" fill="none" />
          {Array.from({ length: 9 }).map((_, index) => (
            <line key={index} x1={cx - 16 + index * 4} y1={baseline - 26} x2={cx - 16 + index * 4} y2={baseline - 8} stroke={primary} strokeWidth="1.5" />
          ))}
          <line x1={cx - 18} y1={baseline - 27} x2={cx + 18} y2={baseline - 27} stroke={primary} strokeWidth="1.7" />
          <line x1={cx - 18} y1={baseline - 7} x2={cx + 18} y2={baseline - 7} stroke={primary} strokeWidth="1.7" />
        </>
      )
      break
    case "vase":
      content = (
        <>
          <ellipse cx={cx} cy={baseline + 3} rx="8" ry="2.4" fill="rgba(25,30,24,0.12)" />
          <path d={`M${cx - 5} ${baseline - 18} c-6 8 -5 18 5 18 s11 -10 5 -18 l-2 -3 h-6 z`} fill={primary} />
          <path d={`M${cx} ${baseline - 21} q-3 -8 -7 -10 M${cx} ${baseline - 21} q4 -9 9 -11`} stroke={darken(wood, 0.1)} strokeWidth="1" fill="none" />
          <ellipse cx={cx} cy={baseline - 21} rx="3" ry="1.4" fill={darken(primary, 0.2)} />
        </>
      )
      break
    case "cushion":
      content = (
        <>
          <path d={`M${cx - 14} ${baseline - 18} q14 -10 28 0 q-2 18 -14 18 q-12 0 -14 -18 z`} fill={primary} />
          <path d={`M${cx - 9} ${baseline - 16} q9 -6 18 0`} stroke={lighten(primary, 0.25)} strokeWidth="1" fill="none" />
        </>
      )
      break
    case "carport":
      content = (
        <>
          <ellipse cx={cx} cy={baseline + 3} rx="25" ry="4" fill="rgba(25,30,24,0.1)" />
          {[-18, 0, 18].map((offset) => (
            <g key={offset} stroke={darken(wood, 0.3)} strokeWidth="1.8" strokeLinecap="round">
              <line x1={cx + offset - 9} y1={baseline - 2} x2={cx + offset - 9} y2={baseline - 21} />
              <line x1={cx + offset + 9} y1={baseline - 2} x2={cx + offset + 9} y2={baseline - 21} />
            </g>
          ))}
          <polygon
            points={`${cx - 27},${baseline - 19} ${cx + 27},${baseline - 19} ${cx + 19},${baseline - 29} ${cx - 19},${baseline - 29}`}
            fill={lighten(metal, 0.2)}
            stroke={darken(metal, 0.28)}
            strokeWidth="0.7"
          />
          <line x1={cx - 27} y1={baseline - 19} x2={cx + 27} y2={baseline - 19} stroke={darken(metal, 0.32)} strokeWidth="1" />
        </>
      )
      break
    case "porsche996":
      content = (
        <>
          <ellipse cx={cx} cy={baseline + 3} rx="23" ry="3" fill="rgba(25,30,24,0.14)" />
          {/* profil 911 : pont arrière à gauche, capot plongeant à droite */}
          <path
            d={`M${cx - 21} ${baseline - 2} L${cx - 20} ${baseline - 9} L${cx - 13} ${baseline - 12} L${cx - 3} ${baseline - 21} L${cx + 7} ${baseline - 21} L${cx + 15} ${baseline - 12} L${cx + 21} ${baseline - 10} L${cx + 22} ${baseline - 2} Z`}
            fill={primary}
            stroke={darken(primary, 0.28)}
            strokeWidth="0.6"
          />
          <path d={`M${cx - 3} ${baseline - 21} L${cx + 2} ${baseline - 26} L${cx + 8} ${baseline - 26} L${cx + 13} ${baseline - 21} Z`} fill="#27343a" opacity="0.88" />
          <line x1={cx - 20} y1={baseline - 12} x2={cx - 14} y2={baseline - 12} stroke={darken(primary, 0.3)} strokeWidth="1.6" />
          <ellipse cx={cx + 19} cy={baseline - 11} rx="2.6" ry="1.8" fill="#e8eee2" opacity="0.9" />
          {[-12, 13].map((offset) => (
            <g key={offset}>
              <circle cx={cx + offset} cy={baseline - 1} r="5.4" fill="#17191a" />
              <circle cx={cx + offset} cy={baseline - 1} r="3" fill={metal} />
              <circle cx={cx + offset} cy={baseline - 1} r="0.9" fill={darken(metal, 0.2)} />
            </g>
          ))}
        </>
      )
      break
    // --- Extension du catalogue -------------------------------------------
    case "consoleTable":
      content = (
        <>
          <Legs x={cx} y={baseline} w={36} d={10} color={darken(wood, 0.35)} />
          <Iso x={cx} y={baseline} w={40} d={13} h={4} color={wood} />
          <line x1={cx - 15} y1={baseline - 5} x2={cx + 15} y2={baseline - 5} stroke={darken(wood, 0.25)} strokeWidth="0.8" />
          <circle cx={cx} cy={baseline - 6} r="1" fill={metal} />
        </>
      )
      break
    case "sideTable":
      content = (
        <>
          <ellipse cx={cx} cy={baseline + 2} rx="12" ry="3.4" fill="rgba(25,30,24,0.12)" />
          <line x1={cx} y1={baseline - 2} x2={cx} y2={baseline - 16} stroke={metal} strokeWidth="2.2" />
          <ellipse cx={cx} cy={baseline - 1} rx="7" ry="2.5" fill={darken(metal, 0.25)} />
          <ellipse cx={cx} cy={baseline - 16} rx="13" ry="5" fill={lighten(wood, 0.14)} stroke={darken(wood, 0.28)} strokeWidth="0.7" />
        </>
      )
      break
    case "dishwasher":
      content = (
        <>
          <Iso x={cx} y={baseline} w={26} d={15} h={30} color={lighten(primary, 0.45)} />
          <line x1={cx - 10} y1={baseline - 27} x2={cx + 10} y2={baseline - 27} stroke={darken(primary, 0.28)} strokeWidth="0.8" />
          <line x1={cx - 10} y1={baseline - 4} x2={cx + 10} y2={baseline - 4} stroke={darken(primary, 0.28)} strokeWidth="1.2" />
          <circle cx={cx + 8} cy={baseline - 11} r="1" fill={metal} />
        </>
      )
      break
    case "microwave":
      content = (
        <>
          <Iso x={cx} y={baseline - 12} w={36} d={16} h={18} color={darken(primary, 0.35)} />
          <polygon points={`${cx - 14},${baseline - 16} ${cx + 3},${baseline - 16} ${cx + 3},${baseline - 26} ${cx - 14},${baseline - 26}`} fill="#2c3336" stroke={metal} strokeWidth="0.6" />
          <rect x={cx + 7} y={baseline - 26} width="7" height="10" fill={darken(primary, 0.5)} />
          <circle cx={cx + 10.5} cy={baseline - 20} r="1.5" fill={metal} />
        </>
      )
      break
    case "kitchenBin":
      content = (
        <>
          <ellipse cx={cx} cy={baseline + 2} rx="10" ry="3" fill="rgba(25,30,24,0.12)" />
          <path d={`M${cx - 10} ${baseline - 2} L${cx - 9} ${baseline - 25} Q${cx} ${baseline - 29} ${cx + 9} ${baseline - 25} L${cx + 10} ${baseline - 2} Q${cx} ${baseline + 1} ${cx - 10} ${baseline - 2} Z`} fill={primary} />
          <ellipse cx={cx} cy={baseline - 25} rx="9" ry="3" fill={lighten(primary, 0.22)} stroke={darken(primary, 0.28)} strokeWidth="0.6" />
          <line x1={cx - 6} y1={baseline + 1} x2={cx + 6} y2={baseline + 1} stroke={metal} strokeWidth="1.6" />
        </>
      )
      break
    case "crib":
      content = (
        <>
          <Legs x={cx} y={baseline} w={30} d={16} color={darken(wood, 0.35)} />
          <Iso x={cx} y={baseline} w={32} d={18} h={4} color={wood} />
          <Iso x={cx} y={baseline - 4} w={28} d={15} h={4} color={lighten(primary, 0.22)} />
          {[-12, -8, -4, 0, 4, 8, 12].map((dx) => (
            <line key={dx} x1={cx + dx} y1={baseline - 8} x2={cx + dx} y2={baseline - 26} stroke={lighten(wood, 0.28)} strokeWidth="1.2" />
          ))}
          <line x1={cx - 14} y1={baseline - 26} x2={cx + 14} y2={baseline - 26} stroke={wood} strokeWidth="2" />
        </>
      )
      break
    case "chestOfDrawers":
      content = (
        <>
          <Iso x={cx} y={baseline} w={34} d={15} h={28} color={wood} />
          {[8, 15, 22].map((h) => (
            <g key={h}>
              <line x1={cx - 15} y1={baseline - h} x2={cx + 15} y2={baseline - h} stroke={darken(wood, 0.3)} strokeWidth="0.8" />
              <line x1={cx - 4} y1={baseline - h + 3} x2={cx + 4} y2={baseline - h + 3} stroke={metal} strokeWidth="1.2" />
            </g>
          ))}
        </>
      )
      break
    case "changingTable":
      content = (
        <>
          <Legs x={cx} y={baseline} w={32} d={14} color={darken(wood, 0.35)} />
          <Iso x={cx} y={baseline} w={36} d={16} h={4} color={wood} />
          <Iso x={cx} y={baseline - 4} w={32} d={14} h={4} color={lighten(primary, 0.22)} />
          <line x1={cx - 13} y1={baseline - 10} x2={cx + 13} y2={baseline - 10} stroke={darken(wood, 0.28)} strokeWidth="0.8" />
          <rect x={cx - 10} y={baseline - 25} width="20" height="10" rx="3" fill={secondary} opacity="0.85" />
        </>
      )
      break
    case "filingCabinet":
      content = (
        <>
          <Iso x={cx} y={baseline} w={26} d={16} h={38} color={lighten(primary, 0.12)} />
          {[12, 25, 37].map((h) => (
            <g key={h}>
              <line x1={cx - 11} y1={baseline - h} x2={cx + 11} y2={baseline - h} stroke={darken(primary, 0.32)} strokeWidth="0.9" />
              <rect x={cx - 6} y={baseline - h + 4} width="12" height="3" fill={lighten(primary, 0.5)} opacity="0.9" />
            </g>
          ))}
        </>
      )
      break
    case "deskLamp":
      content = (
        <>
          <ellipse cx={cx} cy={baseline + 3} rx="9" ry="2.6" fill="rgba(25,30,24,0.12)" />
          <ellipse cx={cx} cy={baseline - 1} rx="6" ry="2" fill={metal} />
          <line x1={cx} y1={baseline - 2} x2={cx + 3} y2={baseline - 20} stroke={metal} strokeWidth="1.6" />
          <line x1={cx + 3} y1={baseline - 20} x2={cx + 11} y2={baseline - 26} stroke={metal} strokeWidth="1.6" />
          <path d={`M${cx + 4} ${baseline - 24} l14 -4 l-3 9 l-11 3 z`} fill={lighten(primary, 0.22)} stroke={darken(primary, 0.2)} strokeWidth="0.6" />
        </>
      )
      break
    case "roundRug":
      content = (
        <>
          <ellipse cx={cx} cy={baseline} rx="26" ry="10" fill={lighten(primary, 0.12)} stroke={darken(primary, 0.24)} strokeWidth="0.8" />
          <ellipse cx={cx} cy={baseline} rx="20" ry="7" fill="none" stroke={secondary} strokeWidth="1.2" />
          <ellipse cx={cx} cy={baseline} rx="13" ry="4" fill={darken(primary, 0.1)} opacity="0.45" />
        </>
      )
      break
    case "candle":
      content = (
        <>
          <ellipse cx={cx} cy={baseline + 2} rx="8" ry="2.5" fill="rgba(25,30,24,0.12)" />
          <rect x={cx - 5} y={baseline - 18} width="10" height="19" rx="1.5" fill={lighten(primary, 0.28)} stroke={darken(primary, 0.18)} strokeWidth="0.6" />
          <line x1={cx} y1={baseline - 18} x2={cx} y2={baseline - 22} stroke={darken(primary, 0.45)} strokeWidth="1" />
          <path d={`M${cx} ${baseline - 23} q4 4 0 7 q-4 -3 0 -7 z`} fill="#ffb454" />
        </>
      )
      break
    case "parasol":
      content = (
        <>
          <ellipse cx={cx} cy={baseline + 3} rx="12" ry="3" fill="rgba(25,30,24,0.12)" />
          <line x1={cx} y1={baseline} x2={cx} y2={baseline - 30} stroke={metal} strokeWidth="1.8" />
          <path d={`M${cx - 26} ${baseline - 19} Q${cx} ${baseline - 41} ${cx + 26} ${baseline - 19} Z`} fill={lighten(primary, 0.14)} stroke={darken(primary, 0.22)} strokeWidth="0.7" />
          <line x1={cx - 26} y1={baseline - 19} x2={cx + 26} y2={baseline - 19} stroke={darken(primary, 0.28)} strokeWidth="0.8" />
        </>
      )
      break
    case "bbq":
      content = (
        <>
          <ellipse cx={cx} cy={baseline + 3} rx="17" ry="3.5" fill="rgba(25,30,24,0.12)" />
          <Iso x={cx} y={baseline - 4} w={32} d={16} h={14} color={darken(primary, 0.45)} />
          <Iso x={cx} y={baseline - 18} w={34} d={17} h={3} color={lighten(primary, 0.3)} />
          <line x1={cx + 18} y1={baseline - 21} x2={cx + 24} y2={baseline - 21} stroke={metal} strokeWidth="1.5" />
          {[-10, 10].map((dx) => <circle key={dx} cx={cx + dx} cy={baseline} r="3.5" fill="#1f211f" />)}
        </>
      )
      break
    case "planter":
      content = (
        <>
          <ellipse cx={cx} cy={baseline + 2} rx="16" ry="3" fill="rgba(25,30,24,0.12)" />
          <Iso x={cx} y={baseline} w={32} d={12} h={13} color={variant.stone ?? "#d6cbb9"} />
          {[-9, 0, 9].map((dx) => (
            <g key={dx}>
              <path d={`M${cx + dx} ${baseline - 13} q-6 -9 -2 -15 q5 4 2 15`} fill="#6f8560" />
              <path d={`M${cx + dx} ${baseline - 13} q6 -9 2 -15 q-5 4 -2 15`} fill="#5e7351" />
            </g>
          ))}
        </>
      )
      break
    case "gardenLight":
      content = (
        <>
          <ellipse cx={cx} cy={baseline + 3} rx="9" ry="2.6" fill="rgba(25,30,24,0.12)" />
          <ellipse cx={cx} cy={baseline - 1} rx="6" ry="2" fill={variant.stone ?? "#d6cbb9"} />
          <line x1={cx} y1={baseline - 2} x2={cx} y2={baseline - 26} stroke={darken(metal, 0.25)} strokeWidth="2.4" />
          <rect x={cx - 6} y={baseline - 34} width="12" height="10" rx="2" fill={lighten(primary, 0.45)} stroke={darken(primary, 0.18)} strokeWidth="0.6" />
          <circle cx={cx} cy={baseline - 29} r="2.5" fill="#ffe1a0" />
        </>
      )
      break
    case "bike":
      content = (
        <>
          <ellipse cx={cx} cy={baseline + 3} rx="23" ry="3" fill="rgba(25,30,24,0.1)" />
          {[-15, 15].map((dx) => (
            <g key={dx}>
              <circle cx={cx + dx} cy={baseline - 7} r="7.5" fill="none" stroke="#1f211f" strokeWidth="2" />
              <circle cx={cx + dx} cy={baseline - 7} r="1" fill={metal} />
            </g>
          ))}
          <path
            d={`M${cx - 15} ${baseline - 7} L${cx - 5} ${baseline - 20} L${cx + 7} ${baseline - 20} L${cx + 15} ${baseline - 7} M${cx - 5} ${baseline - 20} L${cx + 15} ${baseline - 7} M${cx + 7} ${baseline - 20} L${cx - 15} ${baseline - 7}`}
            fill="none"
            stroke={metal}
            strokeWidth="1.8"
            strokeLinejoin="round"
          />
          <line x1={cx + 4} y1={baseline - 20} x2={cx + 6} y2={baseline - 24} stroke={metal} strokeWidth="1.4" />
          <line x1={cx - 8} y1={baseline - 22} x2={cx - 1} y2={baseline - 22} stroke="#1f211f" strokeWidth="1.8" />
        </>
      )
      break
    case "garageShelf":
      content = (
        <>
          {[-15, 15].map((dx) => (
            <line key={dx} x1={cx + dx} y1={baseline} x2={cx + dx} y2={baseline - 38} stroke={darken(metal, 0.18)} strokeWidth="2" />
          ))}
          {[0, 12, 25, 37].map((h) => (
            <line key={h} x1={cx - 17} y1={baseline - h} x2={cx + 17} y2={baseline - h} stroke={metal} strokeWidth="2.2" />
          ))}
        </>
      )
      break
    case "evCharger":
      content = (
        <>
          <Iso x={cx} y={baseline - 8} w={16} d={8} h={30} color={lighten(primary, 0.45)} />
          <rect x={cx - 5} y={baseline - 31} width="10" height="7" rx="1" fill="#27343a" />
          <circle cx={cx} cy={baseline - 22} r="1.2" fill="#71816c" />
          <path d={`M${cx + 7} ${baseline - 14} q10 6 5 16`} fill="none" stroke="#1f211f" strokeWidth="1.8" />
        </>
      )
      break
    case "floatingShelf":
      content = (
        <>
          <Iso x={cx} y={baseline - 22} w={38} d={13} h={3} color={wood} />
          <rect x={cx - 14} y={baseline - 31} width="4" height="9" fill={primary} opacity="0.8" />
          <rect x={cx - 7} y={baseline - 30} width="3.5" height="8" fill={secondary} opacity="0.85" />
          <rect x={cx + 2} y={baseline - 32} width="4" height="10" fill={darken(primary, 0.2)} opacity="0.8" />
        </>
      )
      break
    case "kitchenUpper":
      content = (
        <>
          <Iso x={cx} y={baseline - 12} w={36} d={15} h={26} color={primary} />
          <line x1={cx} y1={baseline - 13} x2={cx} y2={baseline - 37} stroke={darken(primary, 0.3)} strokeWidth="0.9" />
          <circle cx={cx - 3} cy={baseline - 25} r="0.9" fill={metal} />
          <circle cx={cx + 3} cy={baseline - 25} r="0.9" fill={metal} />
        </>
      )
      break
    default:
      content = (
        <>
          <Legs x={cx} y={baseline} w={32} d={14} color={darken(wood, 0.3)} />
          <Iso x={cx} y={baseline} w={34} d={16} h={14} color={primary} />
        </>
      )
  }

  return (
    <svg width={size} height={size * 0.92} viewBox="0 0 64 58" role="img" aria-label={item.name}>
      <ellipse cx="32" cy="48" rx="25" ry="7" fill="rgba(53,45,33,0.07)" />
      {content}
    </svg>
  )
}
