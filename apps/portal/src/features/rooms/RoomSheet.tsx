import type { ProjectProfile, Room } from "@casarenous/shared"
import { Badge, Sheet } from "@/aura/react"

const LEVEL_LABEL: Record<Room["level"], string> = {
  rdc: "Rez-de-chaussée",
  etage: "Étage",
  exterieur: "Extérieur",
}

export function RoomSheet({
  open,
  onClose,
  room,
  project,
}: {
  open: boolean
  onClose: () => void
  room: Room | null
  project: ProjectProfile | undefined
}) {
  if (!room) return null
  const kitchen = room.slug === "piece-de-vie" ? project?.kitchenSpecs : undefined

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={room.name}
      description={`${LEVEL_LABEL[room.level]}${room.areaM2 ? ` · ${room.areaM2.toLocaleString("fr-FR")} m²` : ""}`}
    >
      <div className="aura-stack" style={{ gap: 18 }}>
        <div className="aura-row-flex" style={{ flexWrap: "wrap", gap: 6 }}>
          <Badge tone="accent">{LEVEL_LABEL[room.level]}</Badge>
          {room.features.map((feature) => (
            <Badge key={feature} tone="neutral">
              {feature}
            </Badge>
          ))}
        </div>

        {room.description ? <p className="app-small">{room.description}</p> : null}

        <dl className="app-spec-list">
          {room.areaM2 ? (
            <div>
              <dt>Surface</dt>
              <dd className="app-num">{room.areaM2.toLocaleString("fr-FR")} m²</dd>
            </div>
          ) : null}
          {room.dimensions ? (
            <div>
              <dt>Dimensions</dt>
              <dd>{room.dimensions}</dd>
            </div>
          ) : null}
          {room.ceilingHeightM ? (
            <div>
              <dt>Hauteur sous plafond</dt>
              <dd className="app-num">{room.ceilingHeightM.toLocaleString("fr-FR")} m</dd>
            </div>
          ) : null}
          <div>
            <dt>Emprise de la maison</dt>
            <dd className="app-num">
              {project
                ? `${project.footprintWidthM.toLocaleString("fr-FR")} × ${project.footprintDepthM.toLocaleString("fr-FR")} m · R+${project.levels - 1}`
                : "—"}
            </dd>
          </div>
        </dl>

        {kitchen ? (
          <section>
            <p className="app-kicker" style={{ marginBottom: 8 }}>
              Cuisine validée
            </p>
            <dl className="app-spec-list">
              <div>
                <dt>Façades</dt>
                <dd>{kitchen.facades}</dd>
              </div>
              <div>
                <dt>Plan de travail & crédence</dt>
                <dd>
                  {kitchen.worktop} · {kitchen.credence}
                </dd>
              </div>
              <div>
                <dt>Îlot central</dt>
                <dd>
                  Retour {kitchen.island.return.toLowerCase()}, {kitchen.island.seats} places
                </dd>
              </div>
              <div>
                <dt>Équipements</dt>
                <dd>{kitchen.appliances.join(" · ")}</dd>
              </div>
              <div>
                <dt>Cave à vin</dt>
                <dd>{kitchen.wineCellar ? "Intégrée" : "Non prévue"}</dd>
              </div>
              <div>
                <dt>Lumière</dt>
                <dd>{kitchen.lighting}</dd>
              </div>
            </dl>
          </section>
        ) : null}

        {project ? (
          <section>
            <p className="app-kicker" style={{ marginBottom: 6 }}>
              Enveloppe
            </p>
            <p className="app-small">
              {project.exteriorSpecs.finish} · {project.exteriorSpecs.roof} ·{" "}
              {project.exteriorSpecs.joinery} · {project.exteriorSpecs.shutters}.
            </p>
          </section>
        ) : null}
      </div>
    </Sheet>
  )
}
