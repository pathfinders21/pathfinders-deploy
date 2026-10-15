# Implementation Plan: Permanent Unification under PathFinders®

## 1. Overview & Objective

Based on your clarification, the application will permanently lock into **PathFinders®: Career Mentorship and Roadmaps** as its singular brand and product identity. All secondary Velorah switchers, alternative copy modes, and clutter will be removed, establishing an authoritative, cinematic mentorship experience.

---

## 2. Scope of Changes

### A. Navigation & Header Cleanup (`src/components/Navigation.tsx`)
- Lock the brand wordmark permanently to **PathFinders®** with `<sup>®</sup>` in `Instrument Serif` font.
- Remove the `"Velorah Mode / PathFinders Mode"` header toggle button.
- Clean up navigation destinations to canonical mentorship sections:
  - `Home` (Cinematic Hero + Editorial Pillars)
  - `Find Mentors` (Filterable Directory & Booking)
  - `AI Roadmaps` (Milestone Roadmap Engine)
  - `Community` (Cohort Circles & Office Hours)
  - Contextual CTA (`Begin Journey` / `Select Path` / `Complete Profile` / `Mentor Hub` / `My Dashboard`)

### B. Cinematic Hero Solidification (`src/components/CinematicHero.tsx`)
- Permanently standardize the headline to:
  `Where <em className="not-italic text-white/50">guidance</em> meets your <em className="not-italic text-white/50">next beginning.</em>`
- Standardize the supporting copy to:
  *"Find the right mentors, discover your direction, and turn your ambitions into measurable progress. Your next chapter starts with one meaningful connection."*
- Maintain the fullscreen looping video background, ambient playback controls, and `.liquid-glass` CTA buttons.

### C. State Switcher QA Controller Simplification (`src/components/StateSwitcherBar.tsx`)
- Strip out the headline copy switchers (`Velorah (Dreams)` toggle).
- Retain the pure 4-rule testing controller for seamless verification of:
  - Rule 1: Signed Out
  - Rule 2: Auth (No Role Chosen)
  - Rule 3: Incomplete Onboarding
  - Rule 4a: Mentee Dashboard
  - Rule 4b: Mentor Hub

### D. App Orchestration Cleanup (`src/App.tsx`)
- Remove all `brandVariant` state variables, props, and branch logic.
- Keep the full ecosystem intact: `LandingSections`, `MentorDirectory`, `MentorDetailModal`, `RoadmapGenerator`, `ChatDrawer`, and `Toast` notifications.

---

## 3. Verification & Testing

1. **Brand Consistency Check**: Ensure zero occurrences of secondary theme toggles remain in the UI.
2. **Hero & Video Integrity**: Confirm fullscreen video, muted autoplay, and liquid-glass CTAs remain intact.
3. **CTA Decision Rules (1 to 4)**: Verify that clicking "Begin Journey" performs the correct action across all four authenticated/unauthenticated states.
4. **Build & Type Check**: Execute `tsc --noEmit` and `vite build` to guarantee zero errors.
