import type { CSSProperties } from "react"
import { getCatalogItem, getItemSize, getVariant } from "@/catalog/catalog"
import { HOUSE, getLevel, roomAt } from "@/config/house"
import { formatDimensions } from "@/lib/format"
import { formatHour, timeOfDay } from "@/lib/sun"
import { applyRotation, isFootprintValid, moveFootprint } from "@/lib/place"
import { usePlanner, useSelectedItem } from "@/store/planner"
import type { AmbienceConfig } from "@/types"
import { NumberField } from "./NumberField"
import { Switch } from "./Switch"
import {
  CopyIcon,
  MoonIcon,
  RotateIcon,
  SofaIcon,
  SparkleIcon,
  SunIcon,
  TrashIcon,
} from "./Icons"

function ToggleRow({
  label,
  description,
  checked,
  onChange,
  disabled,
}: {
  label: string
  description?: string
  checked: boolean
  onChange: (value: boolean) => void
  disabled?: boolean
}) {
  return (
    <div className={`toggle-row${disabled ? " toggle-row--disabled" : ""}`}>
      <div className="toggle-row__text">
        <span className="toggle-row__label">{label}</span>
        {description ? <span className="toggle-row__desc">{description}</span> : null}
      </div>
      <Switch checked={checked} onChange={onChange} label={label} disabled={disabled} />
    </div>
  )
}

function property<T extends keyof AmbienceConfig>(key: T, value: AmbienceConfig[T]) {
  return { [key]: value } as Pick<AmbienceConfig, T>
}

function centimeters(value: number): number {
  return Number((value * 100).toFixed(1))
}

function centimeterDigits(value: number): number {
  return Math.abs(value * 100 - Math.round(value * 100)) < 1e-6 ? 0 : 1
}

export function InspectorPanel() {
  const selected = useSelectedItem()
  const view = usePlanner((state) => state.view)
  const level = usePlanner((state) => state.level)
  const ambience = usePlanner((state) => state.ambience)
  const furniture = usePlanner((state) => state.furniture)
  const rotationStep = usePlanner((state) => state.rotationStep)
  const select = usePlanner((state) => state.select)
  const updateLive = usePlanner((state) => state.updateLive)
  const updateItem = usePlanner((state) => state.updateItem)
  const beginTransaction = usePlanner((state) => state.beginTransaction)
  const commitTransaction = usePlanner((state) => state.commitTransaction)
  const setVariant = usePlanner((state) => state.setVariant)
  const duplicate = usePlanner((state) => state.duplicate)
  const remove = usePlanner((state) => state.remove)
  const setAmbience = usePlanner((state) => state.setAmbience)
  const setRotationStep = usePlanner((state) => state.setRotationStep)
  const loadExample = usePlanner((state) => state.loadExample)

  const catalog = selected ? getCatalogItem(selected.catalogId) : null
  const variant = selected && catalog ? getVariant(catalog, selected.variantId) : null
  const size = selected ? getItemSize(selected) : null
  const room = selected ? roomAt(selected.level, [selected.x, selected.z]) : null
  const levelConfig = selected ? getLevel(selected.level) : getLevel(level)
  const isValid = selected ? isFootprintValid(selected) : true

  function resize(dimension: "w" | "d" | "h", centimeters: number) {
    if (!selected || !catalog) return
    const current = getItemSize(selected)
    const next = {
      ...current,
      [dimension]: Math.max(1, centimeters) / 100,
    }
    const catalogSize =
      Math.abs(next.w - catalog.w) < 0.001 &&
      Math.abs(next.d - catalog.d) < 0.001 &&
      Math.abs(next.h - catalog.h) < 0.001
    updateLive(selected.id, { size: catalogSize ? undefined : next })
  }

  const hourPercent = ((ambience.hour - 5) / 18) * 100
  const sliderStyle = { "--hour-progress": `${Math.min(100, Math.max(0, hourPercent))}%` } as CSSProperties

  return (
    <aside className="panel inspector">
      <div className="panel__head inspector__head">
        <div className="panel__title-row">
          <div>
            <p className="eyebrow">Propriétés</p>
            <h2 className="panel__title">{selected && catalog ? catalog.name : "Aucune sélection"}</h2>
          </div>
          {selected && catalog ? (
            <div className="icon-actions">
              <button
                type="button"
                className="icon-button"
                onClick={() => duplicate(selected.id)}
                title="Dupliquer (Ctrl+D)"
                aria-label="Dupliquer le meuble"
              >
                <CopyIcon size={16} />
              </button>
              <button
                type="button"
                className="icon-button icon-button--danger"
                onClick={() => {
                  remove(selected.id)
                  select(null)
                }}
                title="Supprimer (Suppr)"
                aria-label="Supprimer le meuble"
              >
                <TrashIcon size={16} />
              </button>
            </div>
          ) : null}
        </div>
        {selected && catalog ? (
          <div className="inspector__meta">
            <span className="meta-pill">{catalog.category}</span>
            <span className="meta-pill">{levelConfig.shortName}</span>
            {room ? <span className="meta-pill">{room.name}</span> : null}
            {!isValid ? <span className="meta-pill meta-pill--warn">Collision</span> : null}
          </div>
        ) : (
          <p className="panel__subtitle">
            Sélectionnez un meuble dans la scène ou dans le catalogue.
          </p>
        )}
      </div>

      <div className="panel__scroll">
        {selected && catalog && variant && size ? (
          <>
            <section className="inspector-section">
              <div className="section-head">
                <h3>Placement</h3>
                <span className="section-hint">accroche 5 cm</span>
              </div>
              <div className="field-grid">
                <NumberField
                  label="Position X"
                  value={selected.x}
                  suffix="m"
                  onChange={(value) => {
                    const result = moveFootprint(selected, [value, selected.z])
                    if (result.valid) updateLive(selected.id, { x: result.x, z: result.z })
                  }}
                  onFocus={beginTransaction}
                  onBlur={commitTransaction}
                />
                <NumberField
                  label="Position Y"
                  value={selected.z}
                  suffix="m"
                  onChange={(value) => {
                    const result = moveFootprint(selected, [selected.x, value])
                    if (result.valid) updateLive(selected.id, { x: result.x, z: result.z })
                  }}
                  onFocus={beginTransaction}
                  onBlur={commitTransaction}
                />
              </div>
              <div className="field-grid">
                <NumberField
                  label="Rotation"
                  value={selected.rotation}
                  suffix="°"
                  digits={0}
                  step={rotationStep}
                  min={0}
                  max={359}
                  onChange={(value) => applyRotation(selected, value, true)}
                  onFocus={beginTransaction}
                  onBlur={commitTransaction}
                />
                <div className="readout-field">
                  <span className="number-field__label">Emprise</span>
                  <span className="readout-field__value">
                    {formatDimensions(size!.w, size!.d)}
                  </span>
                </div>
              </div>
              <div className="rotation-row">
                <span className="rotation-row__label">Pas de rotation</span>
                <div className="mini-segmented" role="group" aria-label="Pas de rotation">
                  <button
                    type="button"
                    className={rotationStep === 15 ? "is-active" : ""}
                    onClick={() => setRotationStep(15)}
                  >
                    15°
                  </button>
                  <button
                    type="button"
                    className={rotationStep === 90 ? "is-active" : ""}
                    onClick={() => setRotationStep(90)}
                  >
                    90°
                  </button>
                </div>
                <button
                  type="button"
                  className="icon-button"
                  onClick={() => applyRotation(selected, selected.rotation - rotationStep)}
                  aria-label={`Pivoter de ${rotationStep} degrés vers la gauche`}
                  title={`Pivoter de ${rotationStep}°`}
                >
                  <RotateIcon size={15} style={{ transform: "scaleX(-1)" }} />
                </button>
                <button
                  type="button"
                  className="icon-button"
                  onClick={() => applyRotation(selected, selected.rotation + rotationStep)}
                  aria-label={`Pivoter de ${rotationStep} degrés vers la droite`}
                  title={`Pivoter de ${rotationStep}°`}
                >
                  <RotateIcon size={15} />
                </button>
              </div>
            </section>

            <section className="inspector-section">
              <div className="section-head">
                <h3>Dimensions</h3>
                <span className="section-hint">
                  {selected.size ? "sur mesure" : "cotes catalogue"}
                </span>
              </div>
              <div className="field-grid field-grid--three">
                <NumberField
                  label="Largeur"
                  value={centimeters(size!.w)}
                  suffix="cm"
                  digits={centimeterDigits(size!.w)}
                  step={1}
                  min={1}
                  max={1200}
                  onChange={(value) => resize("w", value)}
                  onFocus={beginTransaction}
                  onBlur={commitTransaction}
                />
                <NumberField
                  label="Profondeur"
                  value={centimeters(size!.d)}
                  suffix="cm"
                  digits={centimeterDigits(size!.d)}
                  step={1}
                  min={1}
                  max={1200}
                  onChange={(value) => resize("d", value)}
                  onFocus={beginTransaction}
                  onBlur={commitTransaction}
                />
                <NumberField
                  label="Hauteur"
                  value={centimeters(size!.h)}
                  suffix="cm"
                  digits={centimeterDigits(size!.h)}
                  step={1}
                  min={1}
                  max={1200}
                  onChange={(value) => resize("h", value)}
                  onFocus={beginTransaction}
                  onBlur={commitTransaction}
                />
              </div>
              <div className="dimension-row">
                <span>Surface au sol {(size!.w * size!.d).toLocaleString("fr-FR", { maximumFractionDigits: 2 })} m²</span>
                <span>Cotes en cm</span>
              </div>
              {selected.size ? (
                <button
                  type="button"
                  className="button button--outline button--sm dimensions-reset"
                  onClick={() => updateItem(selected.id, { size: undefined })}
                >
                  <RotateIcon size={14} />
                  Revenir aux cotes catalogue ({formatDimensions(catalog.w, catalog.d, catalog.h)})
                </button>
              ) : (
                <p className="inspector-note">
                  Cotes d&apos;origine : {formatDimensions(catalog.w, catalog.d, catalog.h)}.
                  Modifiez une valeur pour adapter ce meuble à la pièce.
                </p>
              )}
            </section>

            <section className="inspector-section">
              <div className="section-head">
                <h3>Matière</h3>
                <span className="section-hint">{variant.name}</span>
              </div>
              <div className="swatch-row">
                {catalog.variants.map((entry) => (
                  <button
                    key={entry.id}
                    type="button"
                    className={`swatch${entry.id === variant.id ? " swatch--active" : ""}`}
                    style={{ "--swatch": entry.primary } as CSSProperties}
                    onClick={() => setVariant(selected.id, entry.id)}
                    title={entry.name}
                    aria-label={`Matière ${entry.name}`}
                    aria-pressed={entry.id === variant.id}
                  >
                    <span />
                  </button>
                ))}
              </div>
              <div className="variant-name">{variant.name}</div>
            </section>

            <section className="inspector-section">
              <div className="section-head">
                <h3>Finition</h3>
                <span className="section-hint">{catalog.model ? "modèle GLB" : "modèle paramétrique"}</span>
              </div>
              <p className="inspector-note">
                {catalog.model
                  ? "Le modèle glTF est calibré sur les dimensions du catalogue. Les variantes de matière restent disponibles."
                  : "Ce meuble est généré à l'échelle réelle à partir de ses cotes. Ajoutez un GLB dans le catalogue pour utiliser un modèle scanné."}
              </p>
            </section>
          </>
        ) : (
          <div className="inspector-empty">
            <div className="inspector-empty__art">
              <SofaIcon size={34} />
            </div>
            <p className="inspector-empty__title">Rien de sélectionné</p>
            <p className="inspector-empty__text">
              Cliquez sur un meuble, ou glissez-en un depuis le catalogue. Tout se règle au
              centimètre, avec accroche à la grille de 5 cm.
            </p>
            <div className="inspector-empty__stats">
              <div>
                <span>Niveau</span>
                <strong>{levelConfig.name}</strong>
              </div>
              <div>
                <span>Meubles</span>
                <strong>
                  {furniture.filter((item) => item.level === level).length}
                </strong>
              </div>
            </div>
            {furniture.filter((item) => item.level === level).length === 0 ? (
              <button
                type="button"
                className="button button--outline button--sm inspector-example"
                onClick={loadExample}
              >
                <SparkleIcon size={14} />
                {level === "etage" ? "Charger l'exemple du RdC" : "Charger un exemple d'am?nagement"}
              </button>
            ) : null}
          </div>
        )}

        <section className="inspector-section ambience-section">
          <div className="section-head">
            <h3>Ambiance</h3>
            <span className="section-hint">
              {ambience.hour < 7 || ambience.hour > 20 ? <MoonIcon size={13} /> : <SunIcon size={13} />}
              {formatHour(ambience.hour)}
            </span>
          </div>
          <div className="hour-card">
            <div className="hour-card__head">
              <div>
                <span className="hour-card__value">{formatHour(ambience.hour)}</span>
                <span className="hour-card__label">{timeOfDay(ambience.hour)}</span>
              </div>
              <span className="hour-card__sun">
                {ambience.hour < 7 || ambience.hour > 20 ? <MoonIcon size={17} /> : <SunIcon size={17} />}
              </span>
            </div>
            <input
              type="range"
              min={5}
              max={23}
              step={0.25}
              value={ambience.hour}
              style={sliderStyle}
              className="hour-slider"
              aria-label="Heure du jour"
              onChange={(event) => setAmbience({ hour: Number(event.target.value) })}
            />
            <div className="hour-presets">
              {[
                { label: "Matin", hour: 8 },
                { label: "Midi", hour: 13 },
                { label: "Après-midi", hour: 16 },
                { label: "Soir", hour: 19.5 },
              ].map((preset) => (
                <button
                  key={preset.label}
                  type="button"
                  className={Math.abs(ambience.hour - preset.hour) < 0.2 ? "is-active" : ""}
                  onClick={() => setAmbience({ hour: preset.hour })}
                >
                  {preset.label}
                </button>
              ))}
            </div>
          </div>

          <div className="toggle-list">
            <ToggleRow
              label="Ombres douces"
              description="Filtre les ombres du soleil"
              checked={ambience.softShadows}
              onChange={(value) => setAmbience(property("softShadows", value))}
            />
            <ToggleRow
              label="Textures PBR"
              description="Bois, pierre, tissu et relief"
              checked={ambience.textures}
              onChange={(value) => setAmbience(property("textures", value))}
            />
            <ToggleRow
              label="Occlusion ambiante"
              description="Assombrit les angles et contacts"
              checked={ambience.ambientOcclusion}
              onChange={(value) => setAmbience(property("ambientOcclusion", value))}
            />
            <ToggleRow
              label="Mode coupe"
              description="Murs devant la caméra translucides"
              checked={ambience.cutaway}
              onChange={(value) => setAmbience(property("cutaway", value))}
              disabled={view !== "3d"}
            />
            <ToggleRow
              label="Toiture"
              description="Vue extérieure avec l'étage"
              checked={ambience.roof}
              onChange={(value) => setAmbience({ roof: value, cutaway: value ? false : true })}
              disabled={view === "walk"}
            />
            <ToggleRow
              label="Plinthes & détails"
              description="Plinthes, chambranles, seuils"
              checked={ambience.details}
              onChange={(value) => setAmbience(property("details", value))}
            />
            <ToggleRow
              label="Végétation détaillée"
              description="Brins d'herbe 3D et feuillage des arbres"
              checked={ambience.vegetation}
              onChange={(value) => setAmbience(property("vegetation", value))}
            />
          </div>

          <div className="ambience-foot">
            <button
              type="button"
              className="button button--ghost button--sm"
              onClick={() => setAmbience({ ...HOUSE.ambience })}
            >
              <SparkleIcon size={14} />
              Réinitialiser l'ambiance
            </button>
          </div>
        </section>

        <div className="inspector-help">
          <p className="eyebrow">Repères</p>
          <ul>
            <li>Glisser un meuble : déplacement libre, accroche aux murs et à la grille.</li>
            <li>Molette : zoom · clic droit : orbite · double-clic : rotation 90°.</li>
            <li>Mode visite : ZQSD / WASD, souris pour regarder, Échap pour sortir.</li>
          </ul>
        </div>
      </div>
    </aside>
  )
}
