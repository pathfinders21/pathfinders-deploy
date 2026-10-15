import React from 'react';
import { UserProfile, MentorshipRequest, CareerRoadmap } from '../types.ts';
import { Calendar, CheckCircle2, Clock, MessageSquare, ArrowRight, BookOpen, Star, Video } from 'lucide-react';
import { meetingRoomUrl } from '../lib/meeting.ts';

interface MenteeDashboardProps {
  user: UserProfile;
  requests: MentorshipRequest[];
  roadmap: CareerRoadmap;
  onExploreMentors: () => void;
  onViewRoadmap: () => void;
  onOpenHero: () => void;
  onOpenChat?: (
    channelId: string,
    recipientName: string,
    recipientRole: string,
    recipientAvatar: string,
    topic?: string
  ) => void;
}

export const MenteeDashboard: React.FC<MenteeDashboardProps> = ({
  user,
  requests,
  roadmap,
  onExploreMentors,
  onViewRoadmap,
  onOpenHero,
  onOpenChat,
}) => {
  const completedMilestones = roadmap.milestones.filter((m) => m.completed).length;
  const progressPercent = Math.round((completedMilestones / roadmap.milestones.length) * 100);

  return (
    <div className="min-h-screen pt-28 pb-16 px-6 max-w-7xl mx-auto text-white">
      {/* Top Welcome Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 pb-8 border-b border-white/10">
        <div>
          <div className="flex items-center gap-2 text-xs text-white/50 mb-2">
            <span>Mentee Dashboard</span>
            <span>·</span>
            <span>{user.title || 'Software Engineer'} at {user.company || 'Tech'}</span>
          </div>
          <h1
            style={{ fontFamily: "'Instrument Serif', serif" }}
            className="text-4xl sm:text-5xl text-white font-normal"
          >
            Welcome back, {user.name}
          </h1>
          <p className="text-white/60 text-sm mt-1">
            Track your dedicated mentorship chats, pending requests, and skill roadmaps.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onExploreMentors}
            className="liquid-glass rounded-full px-5 py-2.5 text-xs sm:text-sm font-medium text-white hover:scale-[1.03] transition-transform cursor-pointer"
          >
            Find a Mentor
          </button>
          <button
            type="button"
            onClick={onOpenHero}
            className="px-4 py-2.5 rounded-full border border-white/15 bg-white/5 hover:bg-white/10 text-xs sm:text-sm text-white/80 transition-colors"
          >
            View Hero Video
          </button>
        </div>
      </div>

      {/* Grid: 3 Main Sections */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 mt-8">
        {/* Left Column (2 spans): Active Mentorships & Requests */}
        <div className="lg:col-span-2 space-y-8">
          {/* Active Mentorships Section */}
          <div className="bg-white/[0.02] border border-white/10 rounded-2xl p-6">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-2">
                <Calendar className="w-5 h-5 text-white/80" />
                <h2 className="text-lg font-medium text-white">Upcoming Mentorship Sessions</h2>
              </div>
              <span className="text-xs text-white/50">1 Confirmed</span>
            </div>

            <div className="p-4 rounded-xl bg-white/[0.03] border border-white/10 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="flex items-start gap-4">
                <img
                  src="https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=100&auto=format&fit=crop&q=80"
                  alt="Elena Rostova"
                  className="w-12 h-12 rounded-full object-cover"
                />
                <div>
                  <div className="text-sm font-medium text-white">Elena Rostova</div>
                  <div className="text-xs text-white/50">Staff AI Research Engineer · DeepMind</div>
                  <div className="text-xs text-emerald-400 mt-1 flex items-center gap-1.5 font-medium">
                    <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                    <span>Thursday, 4:00 PM EST</span>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() =>
                    onOpenChat?.(
                      'sess-elena',
                      'Elena Rostova',
                      'Staff AI Research Engineer · DeepMind',
                      'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=100&auto=format&fit=crop&q=80',
                      'Transitioning from backend Java to AI infrastructure'
                    )
                  }
                  className="liquid-glass rounded-full px-4 py-2 text-xs text-white hover:scale-[1.03] transition-transform flex items-center gap-1.5 cursor-pointer"
                >
                  <MessageSquare className="w-3.5 h-3.5 text-sky-400" />
                  <span>Open Session Chat</span>
                </button>
                <a
                  href={meetingRoomUrl('sess-elena')}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label="Join the video room for the session with Elena Rostova"
                  className="px-3.5 py-2 rounded-full border border-white/15 bg-white/5 hover:bg-white/10 text-xs text-white transition-colors inline-flex items-center gap-1.5"
                >
                  <Video className="w-3.5 h-3.5 text-sky-400" />
                  <span>Join video room</span>
                </a>
              </div>
            </div>
          </div>

          {/* Mentorship Requests Status Section with Dedicated Separate Chats */}
          <div className="bg-white/[0.02] border border-white/10 rounded-2xl p-6">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-2">
                <Clock className="w-5 h-5 text-white/80" />
                <h2 className="text-lg font-medium text-white">My Mentorship Requests & Dedicated Chats</h2>
              </div>
              <span className="text-xs text-white/50">{requests.length} Requests</span>
            </div>

            <div className="space-y-3">
              {requests.map((req) => (
                <div
                  key={req.id}
                  className="p-4 rounded-xl bg-white/[0.02] border border-white/10 flex flex-col sm:flex-row sm:items-center justify-between gap-4"
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-white">{req.mentorName}</span>
                      <span
                        className={`text-[10px] px-2 py-0.5 rounded-full border ${
                          req.status === 'accepted'
                            ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                            : req.status === 'pending'
                            ? 'bg-amber-500/10 text-amber-400 border-amber-500/20'
                            : 'bg-rose-500/10 text-rose-400 border-rose-500/20'
                        }`}
                      >
                        {req.status.toUpperCase()}
                      </span>
                      <span className="text-[11px] text-white/40">{req.createdAt}</span>
                    </div>
                    <div className="text-xs text-white/70">{req.topic}</div>
                    <div className="text-[11px] text-white/40 italic">"{req.note}"</div>
                  </div>

                  {/* Separate Chat Button per Request */}
                  <div className="flex items-center gap-2 self-start sm:self-center shrink-0">
                    <button
                      type="button"
                      onClick={() =>
                        onOpenChat?.(
                          req.id,
                          req.mentorName,
                          'Mentor',
                          'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=100&auto=format&fit=crop&q=80',
                          req.topic
                        )
                      }
                      className="px-3.5 py-1.5 rounded-lg border border-white/15 bg-white/5 hover:bg-white/10 text-xs text-white transition-colors flex items-center gap-1.5 cursor-pointer"
                    >
                      <MessageSquare className="w-3.5 h-3.5 text-sky-400" />
                      <span>Separate Request Chat</span>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Right Column: AI Career Roadmap Progress & Quick Guidance */}
        <div className="space-y-8">
          <div className="bg-white/[0.02] border border-white/10 rounded-2xl p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <BookOpen className="w-5 h-5 text-white/80" />
                <h3 className="text-base font-medium text-white">Active Career Roadmap</h3>
              </div>
            </div>

            <div className="text-sm font-semibold text-white">{roadmap.targetRole}</div>
            <div className="text-xs text-white/50 mt-0.5">Target timeline: {roadmap.timeline}</div>

            {/* Progress Bar */}
            <div className="mt-5">
              <div className="flex items-center justify-between text-xs text-white/60 mb-2">
                <span>Progress: {completedMilestones}/{roadmap.milestones.length} milestones</span>
                <span>{progressPercent}%</span>
              </div>
              <div className="w-full h-2 bg-white/10 rounded-full overflow-hidden">
                <div
                  className="h-full bg-white transition-all duration-300"
                  style={{ width: `${progressPercent}%` }}
                />
              </div>
            </div>

            {/* Milestone Checklist preview */}
            <div className="mt-5 space-y-2.5">
              {roadmap.milestones.map((m) => (
                <div key={m.id} className="flex items-start gap-2.5 text-xs text-white/80">
                  <CheckCircle2
                    className={`w-4 h-4 shrink-0 mt-0.5 ${
                      m.completed ? 'text-emerald-400' : 'text-white/20'
                    }`}
                  />
                  <div>
                    <span className={m.completed ? 'line-through text-white/50' : 'text-white'}>
                      {m.title}
                    </span>
                    <span className="text-[10px] text-white/40 ml-2">({m.duration})</span>
                  </div>
                </div>
              ))}
            </div>

            <button
              type="button"
              onClick={onViewRoadmap}
              className="w-full mt-6 py-2.5 rounded-xl bg-white/10 hover:bg-white/15 text-xs font-medium text-white transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <span>Explore Interactive Roadmap</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Quick Mentorship Tip */}
          <div className="p-5 rounded-2xl bg-white/[0.03] border border-white/10 text-xs space-y-2">
            <div className="text-white font-medium flex items-center gap-1.5">
              <Star className="w-4 h-4 text-amber-300" />
              <span>Mentorship Pro Tip</span>
            </div>
            <p className="text-white/60 leading-relaxed">
              Use voice notes to explain complex problem contexts quickly, and attach architecture diagrams directly to your chat before your call.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
