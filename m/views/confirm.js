// Confirming a change that changes who sees what, before it happens. For now one: moving a project to another place
// (design §4.3). It says, by name, who drops to the one line, whose open tasks go to the manager, and which outside
// partners lose or regain access, then setPlace runs. Lowering to בלמ"ס is the commander's, with a reason for the log.
import { useState } from 'preact/hooks';
import { html, Icon, Empty } from '../ui.js';
import { useStore, project, person, closeSheet, placeEffects, placeCheck, setPlace, joinNames } from '../store.js';
import { PLACES, placeOf, isRestricted, whoSees, LOCKED_LINE_SHOWS_STAGE } from '../card.js';

export function ConfirmBody({ what, pid, to }) {
  const s = useStore();
  const [reason, setReason] = useState('');
  const p = project(pid);
  if (what !== 'place' || !p || !PLACES[to]) return null;
  if (placeOf(p) === to) return html`<${Empty}>${PLACES[to].label}</${Empty}>`;
  const rule = placeCheck(pid, to);
  if (!rule.ok) return html`<${Empty} icon="lock">${rule.why}</${Empty}>`;
  const lower = isRestricted(p) && PLACES[to].level === 'open';
  // Raising is from בלמ"ס up (design §4.3). A move between the two closed places keeps the level, so it has no such line.
  const raise = !isRestricted(p) && isRestricted({ place: to });
  const fx = placeEffects(pid, to);
  const toManager = p.manager === s.me ? 'יעברו אליך' : `יעברו ל${person(p.manager).name}`;
  const lines = [
    fx.lose.length && `ל${joinNames(fx.lose)} תוצג מעכשיו רק השורה: שם הפרויקט, מי מנהל, ${LOCKED_LINE_SHOWS_STAGE ? 'השלב' : 'מספר השלב'} והמצב.`,
    fx.handed.length && `המשימות הפתוחות של ${joinNames(fx.handed)} ${toManager}.`,
    fx.outsiders.length && `ל${joinNames(fx.outsiders)} מבחוץ לא תהיה גישה כאן כל עוד הכול ברשת המסווגת.`,
    fx.regain.length && `ל${joinNames(fx.regain)} מבחוץ תחזור הגישה כאן.`,
    raise && 'כדאי לעבור על השדות שכבר מולאו. הם נכתבו כשהפרויקט היה ברמה נמוכה יותר.',
    lower && 'הפרויקט ייפתח לכל הצוות.',
    lower && "מה שנשאר ברשת המסווגת לא עובר לכאן לבד. שדות שסומנו 'ברשת המסווגת' נשארים מסומנים.",
  ].filter(Boolean);
  const ready = !lower || reason.trim();
  const go = () => { if (ready && setPlace(pid, to, { reason: reason.trim() })) closeSheet(); };
  return html`<div class="form confirm">
    <div class="gate-q"><span class="muted small">${p.name}</span>
      <strong>${lower ? `להעביר ל'${PLACES.here.label}' (בלמ"ס)?` : `להעביר ל'${PLACES[to].label}'?`}</strong>
      <span class="muted small">${PLACES[to].hint}</span></div>
    ${lines.length ? html`<div class="gate-facts">${lines.map((l) => html`<span>${l}</span>`)}</div>` : null}
    <div class="note-band"><${Icon} name="eye" size=${16} /><span><b>מי רואה:</b> ${whoSees(to).join(' ')}</span></div>
    ${lower ? html`<label class="lbl" for="c-why">למה? (נרשם בהחלטות הפרויקט)</label>
      <textarea id="c-why" class="input area" rows="2" value=${reason} onInput=${(e) => setReason(e.currentTarget.value)} placeholder="למשל: התברר שאין בפרויקט חומר מסווג"></textarea>` : null}
    <div class="form-actions"><button type="button" class="btn btn-primary" disabled=${!ready} onClick=${go}>להעביר</button><button type="button" class="btn" onClick=${closeSheet}>ביטול</button></div>
  </div>`;
}
