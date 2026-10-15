/**
 * Shared domain types for the Worker.
 *
 * Mirrors the frontend's `DirectoryMentor` shape so a mentor record can move
 * between D1 and the UI without a translation layer that can silently drop a
 * field.
 */

export type MentorRecord = {
  id: string
  name: string
  initials: string
  year: string
  tagline: string
  skills: string[]
  goals: string[]
  careers: string[]
  sessions: number
  yearsAhead: number
  rating: number
  days: string[]
  availabilityWindow: string
  vibeTags: string[]
  vibeBlurb: string
  /** 3072-dim vector from gemini-embedding-001, or null until first computed. */
  embedding: number[] | null
}

export type MatchBreakdownSignal = {
  signal: string
  weight: number
  contribution: number
  note: string
}

export type AiMatch = {
  mentor: MentorRecord
  score: number
  vibeFit: number
  whyTechnical: string
  whyVibe: string
  breakdown: MatchBreakdownSignal[]
}

export type RoadmapStep = {
  id: string
  parentId: string | null
  position: number
  title: string
  detail: string
  status: 'pending' | 'done'
  aiGenerated: boolean
  source: string
  createdAt: string
  lastTouchedAt: string
}

export type AgentEvent = {
  id: string
  kind: string
  title: string
  detail: string
  createdAt: string
}

export type Engine = 'gemini' | 'demo'
