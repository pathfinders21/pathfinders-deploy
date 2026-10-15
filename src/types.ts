export type UserRole = 'mentee' | 'mentor' | null;

export interface UserProfile {
  id: string;
  name: string;
  email: string;
  avatar: string;
  role: UserRole;
  isOnboarded: boolean;
  onboardingStep?: number;
  title?: string;
  company?: string;
  bio?: string;
  domains?: string[];
  skills?: string[];
  goals?: string[];
  experienceYears?: number;
}

/** The review state of the evidence a mentor submitted. Never an affiliation. */
export type MentorVerification = 'verified' | 'pending' | 'unverified';

export interface Mentor {
  id: string;
  name: string;
  role: string;
  company: string;
  avatar: string;
  domain: string;
  experienceYears: number;
  rating: number;
  reviewCount: number;
  bio: string;
  skills: string[];
  availableSlots: string[];
  verification: MentorVerification;
}

export interface MentorshipRequest {
  id: string;
  mentorId: string;
  mentorName: string;
  menteeId: string;
  menteeName: string;
  topic: string;
  note: string;
  status: 'pending' | 'accepted' | 'declined';
  createdAt: string;
}

export interface CareerMilestone {
  id: string;
  phase: string;
  title: string;
  description: string;
  prerequisites: string[];
  deliverable: string;
  duration: string;
  completed: boolean;
  resources: string[];
  mentorCheckInTopic: string;
}

export interface CareerRoadmap {
  id: string;
  targetRole: string;
  currentLevel: string;
  weeklyCommitment?: string;
  timeline: string;
  rationale?: string;
  milestones: CareerMilestone[];
}

export interface ChatAttachment {
  type: 'image' | 'video' | 'voice' | 'file';
  /** Object URL for a file attached in this session, or '' when it is no longer held. */
  url: string;
  name?: string;
  size?: number;
  duration?: string;
  thumbnail?: string;
}

export interface ChatMessage {
  id: string;
  sender: 'user' | 'other';
  senderName: string;
  text?: string;
  attachment?: ChatAttachment;
  timestamp: string;
}

export interface ProblemResponse {
  id: string;
  /**
   * Who wrote it, so the board can offer a delete to that person and nobody else. Absent
   * on the bundled sample answers, which belong to nobody using this browser.
   */
  authorId?: string;
  authorName: string;
  authorRole: string;
  authorAvatar: string;
  isMentor: boolean;
  content: string;
  createdAt: string;
  isSolution?: boolean;
}

export interface CommunityProblem {
  id: string;
  authorId: string;
  authorName: string;
  authorAvatar: string;
  authorRole: string;
  title: string;
  description: string;
  domain: string;
  urgency: 'high' | 'medium' | 'low';
  status: 'open' | 'solved';
  createdAt: string;
  responses: ProblemResponse[];
}

export interface EntitlementsResponse {
  role: 'user' | 'mentor' | 'college' | 'admin'
  hasPremium: boolean
  activeTimePasses: number
  creditBalance: number
  activeMentorSessions: number
  accessiblePromotions: any[]
  subscription?: any
  activeTimePass?: any
}
