---
name: MAD QA Workbench
description: A map-first evidence dossier for safe, human-approved address corrections.
colors:
  blueprint: "#174d6d"
  blueprint-bright: "#0d638f"
  ink-strong: "#0e2433"
  text: "#1d2b32"
  cool-paper: "#e9edeb"
  deep-paper: "#dce2df"
  sheet: "#f7f8f5"
  rule: "#b8c2c0"
  evidence-red: "#b63d31"
  accepted-green: "#287044"
  hold-amber: "#8b620e"
typography:
  display:
    fontFamily: "\"Segoe UI\", \"Helvetica Neue\", Arial, sans-serif"
    fontSize: "31px"
    fontWeight: 680
    lineHeight: 1.08
    letterSpacing: "-0.025em"
  body:
    fontFamily: "\"Segoe UI\", \"Helvetica Neue\", Arial, sans-serif"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.55
    letterSpacing: "normal"
  data:
    fontFamily: "\"Cascadia Code\", \"SFMono-Regular\", Consolas, monospace"
    fontSize: "12px"
    fontWeight: 700
    lineHeight: 1.35
    letterSpacing: "normal"
rounded:
  field: "1px"
  control: "2px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "14px"
  lg: "22px"
components:
  button-primary:
    backgroundColor: "{colors.accepted-green}"
    textColor: "#ffffff"
    rounded: "{rounded.control}"
    padding: "0 13px"
    height: "34px"
  button-secondary:
    backgroundColor: "{colors.sheet}"
    textColor: "{colors.blueprint}"
    rounded: "{rounded.control}"
    padding: "0 13px"
    height: "34px"
  field:
    backgroundColor: "#ffffff"
    textColor: "{colors.text}"
    rounded: "{rounded.field}"
    padding: "8px 9px"
---

# Design System: MAD QA Workbench

## Overview

**Creative North Star: "The Survey Evidence Dossier"**

The interface borrows from municipal survey packets and registry records. It feels exact, workmanlike, and consequential: every mark has a source, and every proposed change can be challenged. The live map is the shared working surface; a feature inspector appears only after a user selects a vector or follows a known relationship.

Dense information is composed through alignment, exact rules, numbering, and typographic contrast. Thin relational traces and annotation marks connect evidence to the feature it supports. Motion behaves like handling a case file: a sheet settles into place, a check reruns, or a decision receives a stamp.

**Key Characteristics:**

- Cool drafting-paper surfaces with blueprint navy and sparing evidence inks
- Precise square geometry, one-pixel rules, and registration marks
- A dominant map workspace with a persistent case queue and on-demand feature inspector
- Visible identifiers, timestamps, sources, and relationship paths
- State changes that read as evidence annotations and approval stamps

## Colors

The restrained cool-neutral palette is designed for long review sessions under ordinary office lighting. Blueprint owns structure and active navigation. Vermilion, green, and amber communicate issue, accepted, and hold states.

### Primary

- **Blueprint Ink** (`colors.blueprint`): Active tabs, primary information structure, map overlays, evidence numbering, and the agent's controlled vocabulary.
- **Bright Blueprint** (`colors.blueprint-bright`): Keyboard focus and high-clarity interactive emphasis.

### Secondary

- **Accepted Field Green** (`colors.accepted-green`): Passed validation, proposed geometry, and the human approval action.
- **Evidence Vermilion** (`colors.evidence-red`): Existing/problem geometry, returned decisions, and issue codes.
- **Hold Amber** (`colors.hold-amber`): Missing evidence, blocked decisions, and caution notes.

### Neutral

- **Archive Ink** (`colors.ink-strong`): Application chrome and the strongest information.
- **Record Text** (`colors.text`): Primary body and data labels.
- **Cool Drafting Paper** (`colors.cool-paper`): The continuous workbench ground.
- **Deep Drafting Paper** (`colors.deep-paper`): Inset tracks and secondary layers.
- **Evidence Sheet** (`colors.sheet`): Docket and folio surfaces.
- **Survey Rule** (`colors.rule`): Dividers, parcel-like boundaries, and field outlines.

**The Evidence Ink Rule.** Status colors appear only where they communicate a decision, validation result, or changed geometry. They are never decorative accents.

## Typography

**Display Font:** Segoe UI with Helvetica Neue and Arial fallbacks  
**Body Font:** Segoe UI with Helvetica Neue and Arial fallbacks  
**Label/Mono Font:** Cascadia Code with SFMono-Regular and Consolas fallbacks

**Character:** The interface face is a compact public-service workhorse. The data face appears only where machine-verifiable values matter: identifiers, operations, coordinates, timestamps, source versions, and hashes.

### Hierarchy

- **Display** (680, 31px, 1): Product title in the persistent case docket.
- **Title** (680, 19px, 1.1): Current case and selected record titles.
- **Body** (400, 14px, 1.45): Attributes, map controls, and relation labels.
- **Label** (650–800, 12–13px): Field names and supporting status text.
- **Data** (700, 12px, 1.35): Stable IDs, coordinates, and identifiers.

**The Two Registers Rule.** Human explanation uses the interface face; machine-verifiable evidence uses the monospaced data face.

## Layout

Desktop uses two permanent regions: a 300px case docket and a fluid map that occupies all remaining space. Attributes live in an on-demand 430px inspector over the map rather than consuming space before a feature is selected. Below 680px, the case docket slides off canvas and the inspector becomes a bottom sheet.

Persistent panels meet edge-to-edge through one-pixel rules. Type, controls, map labels, and attribute rows are deliberately full size for prolonged GIS work; dense data uses visual grouping, not tiny text.

## Elevation & Depth

The system is flat at rest. Tonal paper layers and exact borders provide most depth. A sheet receives an offset shadow only when it is functionally above the work surface: map controls, the protected approval dialog, and the transient confirmation toast.

### Shadow Vocabulary

- **Map instrument** (`3px 4px 12px rgba(16, 35, 46, 0.16)`): Floating map controls and layer sheets.
- **Protected sheet** (`8px 10px 24px rgba(18, 36, 45, 0.16)`): The human approval gate.
- **Transient notice** (`5px 6px 18px rgba(9, 24, 33, 0.30)`): The sandbox result toast.

**The Laid-Flat Rule.** Persistent surfaces share one plane. Elevation is reserved for temporary review actions and map instruments.

## Shapes

Containers and controls are square or minimally eased. Inputs use 1px corners and buttons use 2px corners. Evidence tags use a clipped rectangular silhouette with a one-pixel leader line. Pills are avoided except where a compact status truly benefits from a continuous outline. Circles are reserved for map points, audit nodes, and profile identity.

## Components

### Buttons

- **Shape:** Almost square controls (2px) at a 34px minimum height.
- **Primary:** Accepted green with white type, reserved for the explicit human approval action.
- **Hover / Focus:** Primary darkens on hover; keyboard focus receives a two-part white and bright-blueprint ring.
- **Secondary:** Evidence-sheet background with a blueprint, vermilion, or neutral border according to the action.

### Chips

- **Style:** Compact status text with an icon or dot; most remain unboxed so they read as annotations.
- **State:** Readiness uses blueprint, missing evidence uses amber, return uses vermilion, and approval uses green. Text always accompanies color.

### Containers

- **Corner Style:** Square.
- **Background:** Cool paper or evidence sheet.
- **Shadow Strategy:** None while persistent.
- **Border:** One-pixel survey rule; adjacent sections share borders rather than nesting cards.
- **Internal Padding:** 17–20px for inspector sections and 12–18px for attribute rows.

### Inputs / Fields

- **Style:** White field, one-pixel dark survey rule, 1px corner, compact data type for coordinates.
- **Focus:** White separation plus a bright-blueprint outer ring.
- **Error / Disabled:** Disabled fields become deep paper with muted text; validation errors are explained in the corresponding rule row.

### Navigation

The case docket is the single persistent navigator. The active case uses a thin blueprint edge and field status dot. A selected vector opens its record in an inspector, where preset relationships work as a short list of full-width record links.

### Feature Inspector

The inspector uses a simple two-column attribute table and a preset relate list. It opens only after a vector is selected, so the default view prioritizes geometry. The one optional approval action appears only inside an eligible selected address-point record.

## Do's and Don'ts

### Do:

- **Do** make the map and changed geometry the center of every case.
- **Do** expose an immediately readable attribute table when a vector is selected.
- **Do** use preset relates to move between records without requiring a search or a dense relationship diagram.
- **Do** pair every status color with text or a symbol.
- **Do** keep the approval boundary explicit about its target environment.

### Don't:

- **Don't** fill the initial map view with narrative, validations, evidence lists, or persistent table panels.
- **Don't** use soft lifestyle illustration, ornamental gradients, or decorative GIS motifs.
- **Don't** imply that a sandbox approval changed production MAD.
- **Don't** make a user infer a relationship from the map when a direct record link can show it.
- **Don't** use the data face as a general visual costume.
