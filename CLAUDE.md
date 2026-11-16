# CTO Tasks: rules for every change

The app is a static Preact + htm site with no build step (see README.md). UI copy is Hebrew, RTL, and gender-neutral.

## Design: a standing rule until the project ends

Every screen, on desktop and on the phone, follows Apple's design principles (the apple-design skill, after WWDC's
"Designing Fluid Interfaces"). Yahali set this on 14/10/2026. Any change that touches UI keeps to the rules below.

### Motion (app/motion.js)

- Anything a person touches moves on a spring, never a fixed-duration tween. A spring takes damping (1 settles
  without bouncing) and response (seconds). Default to damping 1. Use a little bounce (about 0.8) only after a
  gesture that carried momentum, such as a release or a flick. Start from the value on screen and pass on the
  finger's velocity.
- `useLayer(rootRef, panelRef, { kind, onClose })` gives a layer its entrance, its exit along the same path, and
  drag-to-dismiss on phones. Kinds: `modal` and `drawer` (a bottom sheet on phones; a dialog or a side panel on
  desktop), `alert`, `menu`, `toast`. New overlays use it. Don't add CSS keyframes for them.
- The real node unmounts at once, which keeps state and tests simple. An inert copy in a closed shadow root finishes
  the exit. Never make a component wait for an animation before it unmounts.
- Segmented controls: `.seg` with `useThumb(ref)` and a first child `<span class="seg-thumb">`.
- CSS transitions are fine for color, opacity and press feedback. `--spring` and `--spring-bounce` are `linear()`
  versions of the springs for CSS-only motion.
- `haptic('success')` is only for a commit that matters, such as a decision made or something done.

### Response

- Feedback comes on press, not on release. Buttons scale on `:active` (0.95; tabs 0.9; cards 0.985) and rows
  highlight. Add new controls to the press lists at the end of `app/styles.css`.
- Hover styles go only inside `@media (hover: hover)`.
- A small target gets a hit area of at least 44px (`::after { inset: -8px }`).

### Look (tokens at the top of app/styles.css; never hard-code a color)

- Use the system font stack (`--f-ui`) and sizes in rem. Tracking depends on size: negative for large text (h1
  -0.02em), +0.01em for small text.
- Use Apple's system colors. A status is a tinted capsule (`color-mix(in srgb, var(--c) 15%, transparent)`), with its
  text darkened through `--ink`.
- Surfaces are grouped: white `--surface` cards on `--bg`, with no borders on cards. Cards use `--r-card` (18px),
  sheets `--r-sheet` (28px), and controls are capsules.
- A kind or status color on a card is a short bar inside the leading edge (`--bar`), not a border.
- Glass (`--glass` with backdrop-filter) is only for chrome that content scrolls under: the top bar once the page
  scrolls, and the phone tab bar. Menus and toasts use `--glass-thick`. Never put glass on glass.
- Light and dark come from the same tokens (`prefers-color-scheme`).

### Layout

- Phones (900px and under) get a large title that collapses into the bar, a floating glass tab bar with the +
  button beside it, and bottom sheets with a grabber for every modal and the task drawer.
- Desktop gets a floating sidebar, a side panel for a task, and centered dialogs that grow from the point that was
  pressed. Menus grow from their trigger.
- RTL first: use logical properties (inline-start and inline-end), never left and right.

### Accessibility, built into every component

- `prefers-reduced-motion`: cross-fades instead of slides. motion.js handles layers, and CSS keeps only opacity and
  color transitions.
- `prefers-reduced-transparency`: the glass turns solid. `prefers-contrast: more`: defined edges and darker
  secondary text.
- Focus stays visible (`:focus-visible`).

### Checking a UI change

Serve the repo root (`npx http-server -c-1 .`) and open `/?mock` at 390x844 and at 1440x900, in light and dark.
Check that nothing scrolls sideways, that the console has no errors, that a sheet follows a drag and closes on a
flick, and that menus and toasts are legible.
