// Opening a project (design §6.1). A team project starts from its type and from where its materials live, in that
// order and before any free text, so that no classified detail is typed here by mistake. A personal project asks only
// for its name and what it is for. Outside partners never reach this sheet (§4.4).
//
// Every default and every reason ("הוצע כי…") comes from card.suggest: fixed rules, with nothing sent anywhere. It is
// the one seam an AI suggester could fill later (§8). A place the type does not allow is shown, never hidden, with its
// reason (card.placeRefusal).
//
// Opened from a building block (store.openLinkedBdt), the sheet starts from the block's preset (card.linkedBdtPreset,
// §6.6): בדה"ת, chosen and collapsed, never at a lower place than the block, with the domain, the block's readiness and
// the link back to it. The link (parent, readiness and the band at the top) holds while בדה"ת is the type: §2.6 makes
// parent a בדה"ת's block, and §13 leaves links from other types out. The floor holds for any type, as in suggest.
import { useState, useRef, useEffect } from 'preact/hooks';
import { html, Icon, Avatar, Seg } from '../ui.js';
import { useStore, team, isCommander, closeSheet, addProject, addPerson, setPeople, toast, lib, sayFill } from '../store.js';
import { PLACES, PLACE_ORDER, PYRAMID_ORDER, isRestricted, domainName, openTypes, typeById, typeStages, gateCount, classifiedLabels, coreHint, whoSees, placeRefusal, suggest, nextLink } from '../card.js';

// The separation band: what stays here and what stays on the classified network, by place.
const BAND = {
  here: 'הכול נשמר כאן, ומותר רק חומר בלמ"ס.',
  both: (labels) => `כאן: השלבים, התאריכים, המשימות, העדכון השבועי והחומר הבלמ"ס. ברשת המסווגת: ${labels}.`,
  there: "כאן רק שכבת הניהול: שלבים, תאריכים, משימות ועדכון שבועי, בלי פרטים מסווגים. כל שדה מסומן 'ברשת המסווגת', ותוצרים נשמרים כמצביע.",
};
const SPLIT_CODE = "יש בפרויקט חלק של קוד עם Claude? פותחים אותו כפרויקט נפרד מסוג 'כלי עם Claude'.";
const CLAUDE_WORK = 'העבודה עם Claude נעשית בפלטפורמה המחוברת. כאן רואים את השלב ואת העדכון השבועי.';
const LINK_ERR = 'הקישור צריך להוביל לפלטפורמה המחוברת, לכתובת עם /next/';
const BLMS_WHAT = ' במשפט בלמ"ס אחד';
const DOMAIN_CHOICES = [...PYRAMID_ORDER, null]; // the four tiers, the two side areas, then "בלי רובד"

// The Claude type, or a team copy of it (a copy keeps its link out).
const isClaudeType = (t) => !!t && (t.id === 'claude' || t.link === 'next');
const origin = () => (typeof location === 'undefined' ? undefined : location.origin);
// "{n} שלבים: a · b · c · d · …", "שלב אחד: a", or "בלי שלבים מראש".
function stagesLine(t) {
  const names = typeStages(t).map((x) => x.name);
  if (!names.length) return 'בלי שלבים מראש';
  if (names.length === 1) return `שלב אחד: ${names[0]}`;
  return `${names.length} שלבים: ${names.slice(0, 4).join(' · ')}${names.length > 4 ? ' · …' : ''}`;
}
// "שער אחד באישור יואש" or "2 שערים באישור יואש"; nothing when every stage closes in the project.
function gatesLine(t) {
  const g = gateCount(t);
  return g ? sayFill(g === 1 ? 'שער אחד באישור {commander}' : `${g} שערים באישור {commander}`) : '';
}
// The labels the type keeps on the classified network, joined; past four, the first four and "ועוד {n}".
function labelsLine(t) {
  const all = t ? classifiedLabels(t) : [];
  if (!all.length) return 'מה שמסמנים ככזה';
  return all.length > 4 ? `${all.slice(0, 4).join(', ')} ועוד ${all.length - 4}` : all.join(', ');
}

export function NewProjectBody({ preset = null }) {
  const s = useStore();
  const cmd = isCommander();
  const L = lib();
  const [scope, setScope] = useState('team');
  // A preset's type is chosen unless the team hid it from opening a project (§2.3): then nothing is, as in the list.
  const [typeId, setTypeId] = useState(() => { const pt = preset ? typeById(L, preset.type) : null; return pt && !pt.hidden ? pt.id : null; });
  const [listOpen, setListOpen] = useState(false);
  const [placePick, setPlacePick] = useState(null); // a place pressed here; dropped once a type refuses it
  const [domainPick, setDomainPick] = useState(undefined); // undefined until a chip is touched: then the type's no longer moves it
  const [name, setName] = useState('');
  const [link, setLink] = useState('');
  const [linkErr, setLinkErr] = useState(false);
  const [what, setWhat] = useState('');
  const [manager, setManager] = useState(s.me);
  const [partners, setPartners] = useState([]);
  const [ext, setExt] = useState(null);
  const [exts, setExts] = useState([]); // outsiders typed here: they become people only once the project is open
  const extBtn = useRef();
  const sumBtn = useRef();
  const linkIn = useRef();
  // A type picked from the list closes it, and the row that had focus goes with it: focus moves to the summary row.
  const toSummary = useRef(false);
  useEffect(() => {
    if (!toSummary.current) return;
    toSummary.current = false;
    sumBtn.current?.focus({ preventScroll: true });
  });

  const personal = scope === 'personal';
  const t = typeId ? typeById(L, typeId) : null;
  const linked = !!preset && !!t && t.id === preset.type;
  const minPlace = PLACES[preset?.minPlace] ? preset.minPlace : null;
  const sug = suggest(L, typeId, preset);
  const refusal = (pl) => placeRefusal(t, pl, { minPlace }); // null when the place is open to this type
  const place = placePick && !refusal(placePick) ? placePick : sug.place;
  const domain = domainPick !== undefined ? domainPick : sug.domain;
  const restricted = !personal && !!place && isRestricted({ place }); // the level goes through card.js, as every lock does
  const there = !personal && place === 'there';
  const claude = !personal && isClaudeType(t);
  const ready = !!name.trim() && (personal || (!!t && !!place));

  // A new type keeps the place pressed here if it allows it. Otherwise its own default takes over, and the pick is gone
  // for good: a type picked after that starts from its default too, never from a place pressed for an earlier type.
  const pickType = (id) => {
    if (placePick && placeRefusal(typeById(L, id), placePick, { minPlace })) setPlacePick(null);
    setTypeId(id); setListOpen(false); toSummary.current = true;
  };
  const toggle = (id) => setPartners(partners.includes(id) ? partners.filter((x) => x !== id) : [...partners, id]);
  // Outside partners don't see a project that is all on the classified network, so there they are not offered.
  const pool = [...s.people.filter((x) => x.id !== manager), ...exts].filter((x) => !(there && x.role === 'external'));
  const addExt = () => {
    if (!ext.name.trim()) return;
    const id = `new:${exts.length}`;
    setExts([...exts, { id, name: ext.name.trim(), org: ext.org.trim(), role: 'external' }]);
    setPartners([...partners, id]);
    setExt(null);
    extBtn.current?.focus(); // the fields are about to go; focus stays beside the new chip
  };
  const face = (x) => (x.id.startsWith('new:') ? html`<span class="avatar ext pending" style="width:22px;height:22px;font-size:9px">${x.name.slice(0, 2)}</span>` : html`<${Avatar} id=${x.id} size=${22} />`);
  const enterAdds = (e) => { if (e.key === 'Enter') { e.preventDefault(); addExt(); } };
  const badLink = (v) => !!v.trim() && !nextLink(v, origin());

  const save = (e) => {
    e.preventDefault();
    if (!ready) return;
    if (claude && badLink(link)) { setLinkErr(true); linkIn.current?.focus(); return; }
    const chosen = personal ? [] : partners.filter((id) => id !== manager && pool.some((x) => x.id === id));
    const p = addProject(personal
      ? { name: name.trim(), template: 'blank', what: what.trim(), personal: true }
      : { name: name.trim(), template: t.id, place, domain, link: claude ? link.trim() : undefined, parent: linked ? preset.parent : undefined,
        trl: linked ? preset.trl : undefined, minPlace, what: what.trim(), manager, partners: chosen.filter((id) => !id.startsWith('new:')), personal: false });
    if (!p) return; // the store said why; the sheet stays open with everything in it
    // Outsiders typed here become people now that the project exists, so a refusal leaves nobody behind.
    const added = chosen.filter((id) => id.startsWith('new:')).map((id) => { const x = exts.find((y) => y.id === id); return addPerson({ name: x.name, org: x.org, account: false }).id; });
    if (added.length) setPeople(p.id, { partners: [...p.partners, ...added] });
    closeSheet();
    location.hash = `#/project/${p.id}`;
    toast(personal ? 'הפרויקט האישי נפתח. רק את/ה רואה אותו' : 'הפרויקט נפתח. תעודת הזהות מחכה למילוי לאורך הדרך');
  };

  // 2. The type: two groups, or once one is picked, one summary row that opens them again.
  const types = openTypes(L);
  const groups = [{ id: 'cto', label: 'סוגי ה-CTO', list: types.filter((x) => x.cto) }, { id: 'gen', label: 'סוגים כלליים', list: types.filter((x) => !x.cto) }].filter((g) => g.list.length);
  const gates = t ? gatesLine(t) : '';
  const typePart = html`
    <span class="lbl" id="np-type-l">סוג הפרויקט</span>
    ${t ? html`<div class="tpl-list np-sum-wrap"><button type="button" ref=${sumBtn} class="tpl-opt np-sum" aria-expanded=${listOpen} aria-controls=${listOpen ? 'np-types' : null} onClick=${() => setListOpen(!listOpen)}>
        <span class="grow"><strong>${t.name}</strong><span class="np-sum-l">${stagesLine(t)}</span>${gates ? html`<span class="np-sum-l np-gates">${gates}</span>` : null}</span>
        <span class="np-change">להחליף</span></button></div>
      ${sug.typeWhy ? html`<p class="np-why">הוצע כי ${sug.typeWhy}</p>` : null}` : null}
    ${!t || listOpen ? html`<div class="np-types" id="np-types" role="group" aria-labelledby="np-type-l">${groups.map((g) => html`
      <span class="np-group" id=${`np-g-${g.id}`}>${g.label}</span>
      <div class="tpl-list" role="group" aria-labelledby=${`np-g-${g.id}`}>${g.list.map((x) => html`<button type="button" key=${x.id} class=${'tpl-opt' + (x.id === typeId ? ' on' : '')} aria-pressed=${x.id === typeId} onClick=${() => pickType(x.id)}>
        <span class="grow"><strong>${x.name}</strong>${x.hint ? html`<span class="muted small">${x.hint}</span>` : null}</span>${x.id === typeId ? html`<${Icon} name="check" size=${16} />` : null}</button>`)}</div>`)}
    </div>` : null}`;

  // 3. Where the materials live: three rows; one the type does not allow stays in view, with its reason.
  const anyOpen = PLACE_ORDER.some((pl) => !refusal(pl));
  const placeWhy = !t ? null
    : place && place === sug.place && sug.placeWhy ? `הוצע כי ${sug.placeWhy}`
    : !place && !sug.place && anyOpen ? 'אין הצעה לסוג הזה. צריך לבחור' : null;
  const placePart = html`
    <span class="lbl" id="np-place-l">איפה החומרים?</span>
    <p class="np-sub">קובעים לפני שכותבים משהו, כדי ששום פרט מסווג לא ייכתב כאן בטעות</p>
    <div class="choice-list np-places" role="group" aria-labelledby="np-place-l">${PLACE_ORDER.map((pl) => {
      const no = refusal(pl);
      const on = place === pl;
      return html`<button type="button" key=${pl} class=${'choice' + (on ? ' on' : '') + (no ? ' off' : '')} aria-pressed=${on} aria-disabled=${no ? 'true' : null} onClick=${() => { if (!no) setPlacePick(pl); }}>
        <span class="grow"><strong>${PLACES[pl].label}</strong><span class="muted small">${PLACES[pl].hint}</span>${no ? html`<span class="np-no">${no}</span>` : null}</span>
        ${on ? html`<${Icon} name="check" size=${16} />` : null}</button>`;
    })}</div>
    ${placeWhy ? html`<p class="np-why">${placeWhy}</p>` : null}`;

  // 4. What stays where, and who sees the project; then what the type adds.
  const bandPart = place ? html`<div class="note-band np-band"><${Icon} name=${PLACES[place].level === 'open' ? 'unlock' : 'lock'} size=${16} />
    <div class="np-band-t">
      <p>${place === 'both' ? BAND.both(labelsLine(t)) : BAND[place]}</p>
      <p><b>מי רואה:</b> ${whoSees(place).join(' ')}</p>
      ${t && (t.id === 'block' || t.id === 'bdt') ? html`<p>${SPLIT_CODE}</p>` : null}
      ${claude ? html`<p>${CLAUDE_WORK}</p>` : null}
    </div></div>` : null;

  // 6. The Claude type's link out, checked when it is left and when the sheet is sent (card.nextLink).
  const linkPart = claude ? html`
    <label class="lbl" for="np-link">קישור לפרויקט בפלטפורמה <span class="muted">(אפשר להוסיף גם אחר כך)</span></label>
    <input id="np-link" ref=${linkIn} class=${'input np-link' + (linkErr ? ' bad' : '')} dir="ltr" inputmode="url" autocomplete="off" autocapitalize="off" spellcheck="false"
      value=${link} aria-invalid=${linkErr ? 'true' : null} aria-describedby=${linkErr ? 'np-link-err' : null}
      onInput=${(e) => { setLink(e.currentTarget.value); if (linkErr) setLinkErr(false); }} onBlur=${(e) => setLinkErr(badLink(e.currentTarget.value))} />
    ${linkErr ? html`<p class="np-err" id="np-link-err" role="alert">${LINK_ERR}</p>` : null}` : null;

  // 7. The domain: the type's is pressed, with its reason, until a chip is touched.
  const domainPart = html`
    <span class="lbl" id="np-dom-l">באיזה רובד</span>
    <div class="chips-row np-chips" role="group" aria-labelledby="np-dom-l">${DOMAIN_CHOICES.map((d) => html`<button type="button" key=${d || 'none'} class=${'qchip' + (domain === d ? ' on' : '')} aria-pressed=${domain === d} onClick=${() => setDomainPick(d)}><span class="np-chip-t">${domainName(d)}</span></button>`)}</div>
    ${domainPick === undefined && sug.domainWhy ? html`<p class="np-why">הוצע כי ${sug.domainWhy}</p>` : null}`;

  // 8. Who runs it (the commander picks) and who is in it.
  const peoplePart = html`
    ${cmd ? html`<span class="lbl">מי מוביל/ה</span><div class="chips-row np-people">${team().map((x) => html`<button type="button" key=${x.id} class=${'person-chip' + (manager === x.id ? ' on' : '')} aria-pressed=${manager === x.id} onClick=${() => setManager(x.id)}><${Avatar} id=${x.id} size=${22} />${x.name}</button>`)}</div>` : null}
    <span class="lbl">שותפים <span class="muted">(אפשר להוסיף גם אחר כך)</span></span>
    <div class="chips-row np-people">${pool.map((x) => html`<button type="button" key=${x.id} class=${'person-chip' + (partners.includes(x.id) ? ' on' : '')} aria-pressed=${partners.includes(x.id)} onClick=${() => toggle(x.id)}>${face(x)}${x.name}${x.role === 'external' ? html`<span class="muted small">· מבחוץ</span>` : null}</button>`)}
      ${there ? null : html`<button type="button" class="person-chip add" ref=${extBtn} aria-expanded=${!!ext} onClick=${() => setExt(ext ? null : { name: '', org: '' })}><${Icon} name="plus" size=${16} />גורם מבחוץ</button>`}</div>
    ${there ? html`<p class="np-note"><${Icon} name="lock" size=${13} />שותפים מבחוץ לא רואים פרויקט שכולו ברשת המסווגת.</p>` : null}
    ${ext && !there ? html`<div class="inline-form ext-form">
      <input class="input" value=${ext.name} onInput=${(e) => setExt({ ...ext, name: e.currentTarget.value })} onKeyDown=${enterAdds} placeholder="שם" aria-label="שם השותף" />
      <input class="input" value=${ext.org} onInput=${(e) => setExt({ ...ext, org: e.currentTarget.value })} onKeyDown=${enterAdds} placeholder="מאיפה: ארגון, מחלקה, ספק" aria-label="מאיפה" />
      <button type="button" class="btn" disabled=${!ext.name.trim()} onClick=${addExt}>הוספה</button></div>` : null}`;

  // 9. What it is for: the type's hint; in a closed place, one בלמ"ס sentence (unless the hint already asks for one).
  const whatHint = coreHint(personal ? typeById(L, 'blank') : t, 'what');
  const whatPh = restricted && !whatHint.includes('בלמ"ס') ? whatHint + BLMS_WHAT : whatHint;

  return html`<form class="form np" onSubmit=${save}>
    ${linked && !personal ? html`<div class="note-band np-from"><${Icon} name="link" size=${16} /><span>נפתח מתוך ${preset.parentName}</span></div>` : null}
    <${Seg} label="פרויקט צוות או פרויקט אישי" value=${scope} onChange=${setScope} options=${[{ id: 'team', label: 'פרויקט צוות' }, { id: 'personal', label: 'פרויקט אישי' }]} />
    ${personal ? html`<p class="muted small">פרויקט אישי נשאר רק אצלך: קורס, לימודים, משהו שלך. הוא לא מופיע לצוות ולא למפקד.</p>` : html`${typePart}${placePart}${bandPart}`}
    <label class="lbl" for="np-name">שם הפרויקט</label>
    <input id="np-name" class="input" value=${name} onInput=${(e) => setName(e.currentTarget.value)}
      placeholder=${personal ? 'למשל: קורס ניהול מוצר' : restricted ? 'שם בלמ"ס, כזה שאפשר לומר בטלפון' : 'למשל: מערכת אישורי כניסה'} />
    ${personal ? null : html`${linkPart}${domainPart}${peoplePart}`}
    <label class="lbl" for="np-what">מה ולמה <span class="muted">(אפשר גם אחר כך)</span></label>
    <textarea id="np-what" class="input area" rows="2" value=${what} onInput=${(e) => setWhat(e.currentTarget.value)} placeholder=${whatPh}></textarea>
    ${personal ? null : html`<p class="np-help">ההצעות כאן לפי כללים קבועים, בלי AI. שום דבר לא נשלח.</p>`}
    <div class="form-actions"><button type="submit" class="btn btn-primary" disabled=${!ready}>פתיחת הפרויקט</button><button type="button" class="btn" onClick=${closeSheet}>ביטול</button></div>
  </form>`;
}
