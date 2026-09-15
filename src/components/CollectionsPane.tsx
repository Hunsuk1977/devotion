import { useState } from "react";
import { db } from "../lib/data";
import { collectionDescription, collectionName } from "../lib/content";
import { t } from "../i18n";
import type { Collection, CollectionInput } from "../types";

/** 이름에서 주소를 만들어 봅니다. 한글만 적혀 있으면 빈 값을 돌려줍니다. */
export function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

const SLUG_RE = /^[a-z0-9][a-z0-9-]*$/;
const RESERVED = ["admin", "api", "assets"];

const emptyDraft = (order: number) => ({
  slug: "",
  nameKo: "",
  nameEn: "",
  descKo: "",
  descEn: "",
  order: String(order),
});

type Draft = ReturnType<typeof emptyDraft>;

const draftOf = (c: Collection): Draft => ({
  slug: c.slug,
  nameKo: c.name?.ko ?? "",
  nameEn: c.name?.en ?? "",
  descKo: c.description?.ko ?? "",
  descEn: c.description?.en ?? "",
  order: String(c.order ?? 500),
});

/** "글 3편" / "3 entries" */
function countText(n: number, ui: string) {
  return t(ui, n === 1 ? "colEntriesOne" : "colEntriesMany").replace("{n}", String(n));
}

function sourceLabel(c: Collection, ui: string) {
  if (c.source === "email") return t(ui, "colSourceEmail");
  if (c.source === "web") return t(ui, "colSourceWeb");
  return t(ui, "colSourceManual");
}

/**
 * 묵상집을 만들고 이름을 고치는 화면.
 * 이메일·웹에서 가져오는 묵상집도 이름은 여기서 고칠 수 있지만,
 * 가져오기 설정(importer)은 저장소의 collections.json 에 그대로 둡니다.
 */
export function CollectionsPane({
  ui,
  cols,
  onChange,
  onWrite,
}: {
  ui: string;
  cols: Collection[];
  onChange: (cols: Collection[]) => void;
  onWrite: (slug: string) => void;
}) {
  const [editing, setEditing] = useState<string | null>(null); // slug, 또는 "" (새로 만들기)
  const [draft, setDraft] = useState<Draft>(emptyDraft(500));
  const [slugTouched, setSlugTouched] = useState(false);
  const [msg, setMsg] = useState<{ text: string; err?: boolean } | null>(null);
  const [busy, setBusy] = useState(false);

  const startNew = () => {
    const next = Math.max(500, ...cols.map((c) => c.order ?? 500)) + 1;
    setDraft(emptyDraft(next));
    setSlugTouched(false);
    setEditing("");
    setMsg(null);
  };

  const startEdit = (c: Collection) => {
    setDraft(draftOf(c));
    setSlugTouched(true);
    setEditing(c.slug);
    setMsg(null);
  };

  const set = (k: keyof Draft, v: string) =>
    setDraft((d) => {
      const next = { ...d, [k]: v };
      // 새 묵상집은 영문 이름에서 주소를 자동으로 채웁니다 (직접 고치기 전까지)
      if (k === "nameEn" && editing === "" && !slugTouched) next.slug = slugify(v);
      return next;
    });

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const name: Record<string, string> = {};
    if (draft.nameKo.trim()) name.ko = draft.nameKo.trim();
    if (draft.nameEn.trim()) name.en = draft.nameEn.trim();
    if (!Object.keys(name).length) return setMsg({ text: t(ui, "colNameRequired"), err: true });

    const slug = draft.slug.trim();
    if (!SLUG_RE.test(slug) || RESERVED.includes(slug)) return setMsg({ text: t(ui, "colSlugBad"), err: true });
    if (editing === "" && cols.some((c) => c.slug === slug)) return setMsg({ text: t(ui, "colSlugTaken"), err: true });

    const description: Record<string, string> = {};
    if (draft.descKo.trim()) description.ko = draft.descKo.trim();
    if (draft.descEn.trim()) description.en = draft.descEn.trim();

    const input: CollectionInput = {
      slug,
      name,
      order: Number(draft.order) || 500,
      ...(Object.keys(description).length ? { description } : {}),
    };

    setBusy(true);
    try {
      onChange(await db.saveCollection(input));
      setMsg({ text: t(ui, "colSaved") });
      setEditing(null);
    } catch (ex) {
      setMsg({ text: (ex as Error).message, err: true });
    } finally {
      setBusy(false);
    }
  };

  const remove = async (slug: string) => {
    if (!confirm(t(ui, "colRemoveConfirm"))) return;
    setBusy(true);
    try {
      onChange(await db.removeCollection(slug));
      setMsg({ text: t(ui, "colRemoved") });
      if (editing === slug) setEditing(null);
    } catch (ex) {
      setMsg({ text: (ex as Error).message, err: true });
    } finally {
      setBusy(false);
    }
  };

  const form = (
    <form className="col-form" onSubmit={submit}>
      <div className="row">
        <div className="field">
          <label htmlFor="c-name-ko">{t(ui, "colNameKo")}</label>
          <input id="c-name-ko" value={draft.nameKo} onChange={(e) => set("nameKo", e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="c-name-en">{t(ui, "colNameEn")}</label>
          <input id="c-name-en" value={draft.nameEn} onChange={(e) => set("nameEn", e.target.value)} />
        </div>
      </div>
      <div className="field">
        <label htmlFor="c-desc-ko">{t(ui, "colDescKo")}</label>
        <textarea id="c-desc-ko" rows={2} value={draft.descKo} onChange={(e) => set("descKo", e.target.value)} />
      </div>
      <div className="field">
        <label htmlFor="c-desc-en">{t(ui, "colDescEn")}</label>
        <textarea id="c-desc-en" rows={2} value={draft.descEn} onChange={(e) => set("descEn", e.target.value)} />
      </div>
      <div className="row">
        <div className="field">
          <label htmlFor="c-slug">{t(ui, "colSlug")}</label>
          <input
            id="c-slug"
            value={draft.slug}
            disabled={editing !== ""}
            onChange={(e) => {
              setSlugTouched(true);
              set("slug", e.target.value);
            }}
          />
          <span className="hint">{t(ui, "colSlugHint")}</span>
        </div>
        <div className="field">
          <label htmlFor="c-order">{t(ui, "colOrder")}</label>
          <input id="c-order" type="number" value={draft.order} onChange={(e) => set("order", e.target.value)} />
        </div>
      </div>
      <div className="form-foot">
        <button type="submit" className="btn primary" disabled={busy}>
          {t(ui, "save")}
        </button>
        <button type="button" className="btn" onClick={() => setEditing(null)}>
          {t(ui, "cancel")}
        </button>
        {msg && <span className={`status-msg${msg.err ? " err" : ""}`}>{msg.text}</span>}
      </div>
    </form>
  );

  return (
    <section className="cols-pane">
      <div className="admin-head">
        <h2>{t(ui, "colsTitle")}</h2>
        <button type="button" className="btn primary" onClick={startNew}>
          + {t(ui, "colNew")}
        </button>
      </div>
      <p className="hint cols-intro">{t(ui, "colsIntro")}</p>

      {editing === "" && form}
      {msg && editing === null && <p className={`status-msg${msg.err ? " err" : ""}`}>{msg.text}</p>}

      <ul className="col-list">
        {cols.map((c) => (
          <li key={c.slug} className="col-card">
            {editing === c.slug ? (
              form
            ) : (
              <>
                <div className="col-card-head">
                  <h3>{collectionName(c, ui)}</h3>
                  <span className="tag">{sourceLabel(c, ui)}</span>
                  <span className="col-count">{countText(c.count ?? 0, ui)}</span>
                </div>
                <p className="col-slug">/{c.slug}</p>
                {collectionDescription(c, ui) && <p className="col-desc">{collectionDescription(c, ui)}</p>}
                {!c.count && <p className="hint">{t(ui, "colEmptyHidden")}</p>}
                {c.source !== "manual" && <p className="hint">{t(ui, "colSourceLocked")}</p>}
                <div className="admin-actions">
                  <button type="button" className="btn" onClick={() => onWrite(c.slug)}>
                    {t(ui, "colWrite")}
                  </button>
                  <button type="button" className="btn" onClick={() => startEdit(c)}>
                    {t(ui, "colEdit")}
                  </button>
                  <button type="button" className="btn danger" disabled={busy || !!c.count} onClick={() => remove(c.slug)}>
                    {t(ui, "delete")}
                  </button>
                </div>
              </>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
