# Design System Specification: The Ethereal Float

## 1. Overview & Creative North Star
**Creative North Star: "The Weightless Workspace"**

This design system rejects the rigid, boxy constraints of traditional productivity software. Instead of a grid of "tasks," we are building a digital atmosphere where information floats with intention. The system is defined by **Optical Softness** and **Atmospheric Depth**.

We move beyond "standard" UI by eliminating hard edges and high-contrast separators. By leveraging extreme corner radii and the interplay of translucent layers, we create a sense of "magical utility." The goal is for the user to feel as though they are interacting with soap bubbles—delicate, luminous, and precious—rather than a static database.

---

## 2. Color & Atmospheric Tones
Color is not just decorative here; it is the medium through which light passes.

### The "No-Line" Rule
**Explicit Instruction:** 1px solid borders are strictly prohibited for sectioning or containment. Boundaries must be defined through:
1. **Tonal Transitions:** A `surface-container-low` card sitting on a `surface` background.
2. **Backdrop Blur:** Distinguishing layers via refraction rather than lines.
3. **Soft Glows:** Using `primary-container` as a soft under-glow for active states.

### Surface Hierarchy & Nesting
Treat the interface as a series of stacked, frosted glass panes.
* **Base:** `surface` (#f6fafe) acts as the sky.
* **Lower Layer:** `surface-container-low` (#eff4f9) for inactive or background grouping.
* **Main Interactive Layer:** `surface-container-lowest` (#ffffff) with 80% opacity and a 20px backdrop blur.
* **Emphasis Layer:** `surface-container-high` (#e1e9f0) for momentary focus or hover states.

### The "Glass & Gradient" Signature
To achieve "visual soul," main CTAs and Hero elements must use a **Refractive Gradient**.
* **Primary Action:** A linear gradient from `primary` (#815163) to `primary-fixed-dim` (#e9aec3) at 135 degrees.
* **Secondary Action:** A gradient from `secondary` (#3c6663) to `secondary-fixed-dim` (#beebe7).

---

## 3. Typography: Soft Authority
We utilize **Plus Jakarta Sans** for its modern, geometric, yet friendly apertures. It provides the "softness" required without sacrificing professional legibility.

* **Display (lg/md/sm):** Used for "Aha!" moments and empty states. Characterized by `-0.02em` letter spacing to feel more cohesive and "bubble-like."
* **Headlines & Titles:** Set in `Medium` weight. These should feel like organic labels rather than rigid headers.
* **Body (lg/md/sm):** Always use `on-surface-variant` (#576067) for long-form text to reduce visual harshness against the light background.
* **Labels:** Reserved for micro-data. Use `on-tertiary-fixed-variant` (#5d5372) to provide a subtle lavender-tinted hierarchy.

---

## 4. Elevation & Depth: Tonal Layering
Traditional drop shadows are too heavy for a "bubble" aesthetic. We use **Ambient Refraction**.

* **The Layering Principle:** Depth is achieved by "stacking." Place a `surface-container-lowest` (pure white) card on a `surface-container` (#e8eff4) background. The 2% shift in brightness is enough to define the edge.
* **Ambient Shadows:** For floating bubbles (Modals/FABs), use a shadow color tinted with the primary hue: `rgba(129, 81, 99, 0.08)` with a 40px blur and 10px Y-offset.
* **The Ghost Border:** If a boundary is required for accessibility, use `outline-variant` (#a9b3ba) at **15% opacity**. It should feel like a catch-light on the edge of a bubble, not a stroke.

---

## 5. Component Logic

### Buttons & Chips
* **Shape:** Always `rounded-full` (9999px). No exceptions.
* **Primary Button:** Gradient-filled (Primary to Primary-Fixed) with a soft white inner glow (1px white top-inner-shadow at 30% opacity) to mimic light hitting a sphere.
* **Selection Chips:** Use `secondary-container` (#ccfaf5) with `on-secondary-container` (#37615e) text. When unselected, they should be `surface-container-low` with no border.

### Input Fields
* **Structure:** `surface-container-lowest` background, `rounded-xl` (3rem) corners.
* **Focus State:** Do not use a high-contrast ring. Instead, transition the background to `tertiary-container` (#e4d7fd) and increase the backdrop-blur intensity.

### Cards & Task Items
* **Prohibition:** Never use divider lines between list items.
* **Separation:** Use `1rem` (DEFAULT) vertical spacing. Each task is its own "bubble."
* **Interaction:** On hover, a card should scale slightly (1.02x) and transition from `surface-container-low` to `surface-container-lowest`.

### Floating Action Button (FAB)
* **The "Soap Bubble":** A perfect circle using a `tertiary` (#645a7a) to `tertiary-fixed-dim` (#d6c9ee) gradient. Use a thin, minimalist icon (0.5pt to 1pt stroke).

---

## 6. Do’s and Don’ts

### Do:
* **Embrace Negative Space:** Let elements breathe. If a layout feels "tight," add 8px more padding than you think you need.
* **Use Asymmetric Layouts:** Place decorative "floating" blurred circles of `secondary-container` and `primary-container` in the background to break the grid.
* **Layer Opacity:** Use 60%–80% opacities on surfaces to allow background gradients to "bleed" through.

### Don’t:
* **Don't Use Pure Black:** Use `on-surface` (#2a3439) for maximum contrast. Pure black (#000) breaks the ethereal illusion.
* **Don't Use Sharp Corners:** Even the smallest "sm" radius is `0.5rem`. Avoid `none` (0px) at all costs.
* **Don't Over-Animate:** Movement should be "floaty" and eased (use `cubic-bezier(0.34, 1.56, 0.64, 1)` for a slight bounce), not robotic or linear.

### Accessibility Note:
While the aesthetic is light and airy, ensure all functional text maintains a 4.5:1 contrast ratio against its specific glass layer. Use the `on-surface` and `on-primary-container` tokens to ensure legibility is never sacrificed for "magic."
