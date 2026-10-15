import React from "react";
import { AvatarCanvas } from "../avatar/AvatarCanvas";
import {
  ACCESSORIES,
  BODIES,
  BOTTOMS,
  BUILDS,
  CLOTH_COLORS,
  DENIM,
  FACIAL_HAIR,
  HAIR_COLORS,
  HAIR_STYLES,
  HEIGHTS,
  SHOE_COLORS,
  SKIN_TONES,
  TOPS,
  randomAvatar,
  type AvatarConfig,
  type Option,
} from "../avatar/config";
import type { Facing } from "../avatar/render";

type Tab = "cuerpo" | "cabello" | "ropa" | "accesorios";
const TABS: { id: Tab; label: string }[] = [
  { id: "cuerpo", label: "Cuerpo" },
  { id: "cabello", label: "Cabello" },
  { id: "ropa", label: "Ropa" },
  { id: "accesorios", label: "Accesorios" },
];
const FACINGS: Facing[] = ["front", "right", "back", "left"];
const FACING_LABEL: Record<Facing, string> = {
  front: "De frente",
  right: "Perfil derecho",
  back: "De espaldas",
  left: "Perfil izquierdo",
};

interface Props {
  name: string;
  value: AvatarConfig;
  /** First visit: the copy invites to create the avatar instead of editing it. */
  firstTime?: boolean;
  /** Live preview on the map while editing. */
  onPreview?: (cfg: AvatarConfig) => void;
  onSave: (cfg: AvatarConfig) => void;
  onClose: () => void;
}

function Segmented<T extends string>({
  id,
  options,
  value,
  onChange,
}: {
  id: string;
  options: Option<T>[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div className="q-seg" role="radiogroup" aria-labelledby={id}>
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          role="radio"
          aria-checked={o.id === value}
          className="q-seg__opt"
          onClick={() => onChange(o.id)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function Swatches({
  id,
  colors,
  value,
  onChange,
}: {
  id: string;
  colors: string[];
  value: string;
  onChange: (c: string) => void;
}) {
  return (
    <div className="q-swatches" role="radiogroup" aria-labelledby={id}>
      {colors.map((c) => (
        <button
          key={c}
          type="button"
          role="radio"
          aria-checked={c === value}
          aria-label={c}
          title={c}
          className="q-swatch"
          style={{ background: c }}
          onClick={() => onChange(c)}
        />
      ))}
    </div>
  );
}

function Thumbs<T extends string>({
  id,
  options,
  value,
  render,
  onChange,
  head = false,
}: {
  id: string;
  options: Option<T>[];
  value: T;
  render: (v: T) => AvatarConfig;
  onChange: (v: T) => void;
  head?: boolean;
}) {
  return (
    <div className="q-thumbs" role="radiogroup" aria-labelledby={id}>
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          role="radio"
          aria-checked={o.id === value}
          className="q-thumb"
          onClick={() => onChange(o.id)}
        >
          {head ? (
            <AvatarCanvas cfg={render(o.id)} scale={3} cropTop={2} cropRows={18} />
          ) : (
            <AvatarCanvas cfg={render(o.id)} scale={2.5} cropTop={2} cropRows={26} />
          )}
          <span>{o.label}</span>
        </button>
      ))}
    </div>
  );
}

function Field({ id, label, children }: { id: string; label: string; children: React.ReactNode }) {
  return (
    <div className="q-field">
      <h4 id={id} className="q-eyebrow">
        {label}
      </h4>
      {children}
    </div>
  );
}

export function ProfilePanel({ name, value, firstTime = false, onPreview, onSave, onClose }: Props) {
  const [cfg, setCfg] = React.useState<AvatarConfig>(value);
  const [tab, setTab] = React.useState<Tab>("cuerpo");
  const [facing, setFacing] = React.useState<Facing>("front");

  const update = (patch: Partial<AvatarConfig>) => {
    const next = { ...cfg, ...patch };
    setCfg(next);
    onPreview?.(next);
  };
  const turn = (delta: number) =>
    setFacing((f) => FACINGS[(FACINGS.indexOf(f) + delta + FACINGS.length) % FACINGS.length]);

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const dress = cfg.top === "vestido";

  return (
    <div className="q-scrim" onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <section className="q-panel q-profile" role="dialog" aria-modal="true" aria-labelledby="profile-title">
        <aside className="q-profile__stage">
          <div className="q-profile__aura" aria-hidden="true" />
          <div className="q-profile__avatar">
            <AvatarCanvas cfg={cfg} facing={facing} scale={10} label={`Avatar de ${name}, ${FACING_LABEL[facing]}`} />
          </div>
          <div className="q-profile__turn">
            <button type="button" className="q-btn q-btn--icon" onClick={() => turn(-1)} aria-label="Girar a la izquierda">
              ↺
            </button>
            <span className="q-small">{FACING_LABEL[facing]}</span>
            <button type="button" className="q-btn q-btn--icon" onClick={() => turn(1)} aria-label="Girar a la derecha">
              ↻
            </button>
          </div>
          <div className="q-profile__name">
            <strong>{name}</strong>
            <button type="button" className="q-btn q-btn--sm" onClick={() => update(randomAvatar())}>
              🎲 Aleatorio
            </button>
          </div>
        </aside>

        <div className="q-profile__editor">
          <header className="q-profile__head">
            <div>
              <h2 id="profile-title">{firstTime ? "Crea tu avatar" : "Mi perfil"}</h2>
              <p className="q-small q-muted">
                {firstTime
                  ? "Así te verá el equipo en la oficina. Puedes cambiarlo cuando quieras."
                  : "Personaliza cómo te ve el equipo en la oficina."}
              </p>
            </div>
            <button type="button" className="q-btn q-btn--icon" onClick={onClose} aria-label="Cerrar">
              ✕
            </button>
          </header>

          <nav className="q-tabs" role="tablist" aria-label="Partes del avatar">
            {TABS.map((t) => (
              <button
                key={t.id}
                type="button"
                role="tab"
                aria-selected={tab === t.id}
                className="q-tab"
                onClick={() => setTab(t.id)}
              >
                {t.label}
              </button>
            ))}
          </nav>

          <div className="q-profile__body" role="tabpanel">
            {tab === "cuerpo" && (
              <>
                <Field id="f-body" label="Sexo del avatar">
                  <Segmented id="f-body" options={BODIES} value={cfg.body} onChange={(body) => update({ body })} />
                </Field>
                <Field id="f-height" label="Estatura">
                  <Segmented id="f-height" options={HEIGHTS} value={cfg.height} onChange={(height) => update({ height })} />
                </Field>
                <Field id="f-build" label="Contextura">
                  <Segmented id="f-build" options={BUILDS} value={cfg.build} onChange={(build) => update({ build })} />
                </Field>
                <Field id="f-skin" label="Color de piel">
                  <Swatches id="f-skin" colors={SKIN_TONES} value={cfg.skin} onChange={(skin) => update({ skin })} />
                </Field>
              </>
            )}

            {tab === "cabello" && (
              <>
                <Field id="f-hair" label="Estilo">
                  <Thumbs
                    id="f-hair"
                    head
                    options={HAIR_STYLES}
                    value={cfg.hair}
                    render={(hair) => ({ ...cfg, hair, accessory: "ninguno" })}
                    onChange={(hair) => update({ hair })}
                  />
                </Field>
                <Field id="f-hair-color" label="Color de cabello">
                  <Swatches id="f-hair-color" colors={HAIR_COLORS} value={cfg.hairColor} onChange={(hairColor) => update({ hairColor })} />
                </Field>
                <Field id="f-facial" label="Barba">
                  <Segmented id="f-facial" options={FACIAL_HAIR} value={cfg.facialHair} onChange={(facialHair) => update({ facialHair })} />
                </Field>
              </>
            )}

            {tab === "ropa" && (
              <>
                <Field id="f-top" label="Parte de arriba">
                  <Thumbs id="f-top" options={TOPS} value={cfg.top} render={(top) => ({ ...cfg, top })} onChange={(top) => update({ top })} />
                </Field>
                <Field id="f-top-color" label={dress ? "Color del vestido" : "Color de arriba"}>
                  <Swatches id="f-top-color" colors={CLOTH_COLORS} value={cfg.topColor} onChange={(topColor) => update({ topColor })} />
                </Field>
                {!dress && (
                  <>
                    <Field id="f-bottom" label="Parte de abajo">
                      <Thumbs
                        id="f-bottom"
                        options={BOTTOMS}
                        value={cfg.bottom}
                        render={(bottom) => ({ ...cfg, bottom })}
                        onChange={(bottom) => update({ bottom })}
                      />
                    </Field>
                    <Field id="f-bottom-color" label="Color de abajo">
                      <Swatches
                        id="f-bottom-color"
                        colors={[DENIM, ...CLOTH_COLORS]}
                        value={cfg.bottomColor}
                        onChange={(bottomColor) => update({ bottomColor })}
                      />
                    </Field>
                  </>
                )}
                <Field id="f-shoes" label="Zapatos">
                  <Swatches id="f-shoes" colors={SHOE_COLORS} value={cfg.shoesColor} onChange={(shoesColor) => update({ shoesColor })} />
                </Field>
              </>
            )}

            {tab === "accesorios" && (
              <Field id="f-acc" label="Accesorio">
                <Thumbs
                  id="f-acc"
                  head
                  options={ACCESSORIES}
                  value={cfg.accessory}
                  render={(accessory) => ({ ...cfg, accessory })}
                  onChange={(accessory) => update({ accessory })}
                />
              </Field>
            )}
          </div>

          <footer className="q-profile__foot">
            <button type="button" className="q-btn q-btn--ghost" onClick={onClose}>
              {firstTime ? "Ahora no" : "Cancelar"}
            </button>
            <button type="button" className="q-btn q-btn--primary" onClick={() => onSave(cfg)}>
              {firstTime ? "Entrar a la oficina" : "Guardar cambios"}
            </button>
          </footer>
        </div>
      </section>
    </div>
  );
}
