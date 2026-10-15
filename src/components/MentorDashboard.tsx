import React, { useState } from 'react';
import { UserProfile, MentorshipRequest } from '../types.ts';
import { Users, Calendar, Check, X, Star, Clock, MessageSquare, ExternalLink, Video } from 'lucide-react';
import { meetingRoomUrl } from '../lib/meeting.ts';

interface MentorDashboardProps {
  user: UserProfile;
  requests: MentorshipRequest[];
  onAcceptRequest: (id: string) => void;
  onDeclineRequest: (id: string) => void;
  onOpenHero: () => void;
  onOpenChat?: (
    channelId: string,
    recipientName: string,
    recipientRole: string,
    recipientAvatar: string,
    topic?: string
  ) => void;
}

export const MentorDashboard: React.FC<MentorDashboardProps> = ({
  user,
  requests,
  onAcceptRequest,
  onDeclineRequest,
  onOpenHero,
  onOpenChat,
}) => {
  const [activeTab, setActiveTab] = useState<'requests' | 'sessions' | 'availability'>('requests');

  return (
    <div className="min-h-screen pt-28 pb-16 px-6 max-w-7xl mx-auto text-white">
      {/* Top Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 pb-8 border-b border-white/10">
        <div>
          <div className="flex items-center gap-2 text-xs text-white/50 mb-2">
            <span>Mentor Hub</span>
            <span>·</span>
            <span>{user.title || 'Principal Mentor'} · {user.company || 'Industry Leader'}</span>
          </div>
          <h1
            style={{ fontFamily: "'Instrument Serif', serif" }}
            className="text-4xl sm:text-5xl text-white font-normal"
          >
            Welcome, Mentor {user.name}
          </h1>
          <p className="text-white/60 text-sm mt-1">
            Review incoming mentee requests, open separate chats for each mentee, and manage office hours.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onOpenHero}
            className="px-4 py-2.5 rounded-full border border-white/15 bg-white/5 hover:bg-white/10 text-xs sm:text-sm text-white/80 transition-colors"
          >
            View Hero Video
          </button>
        </div>
      </div>

      {/* Impact Metrics Row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 my-8">
        <div className="p-4 rounded-xl bg-white/[0.02] border border-white/10">
          <div className="text-xs text-white/50">Mentees Guided</div>
          <div className="text-2xl font-semibold text-white mt-1">18</div>
        </div>
        <div className="p-4 rounded-xl bg-white/[0.02] border border-white/10">
          <div className="text-xs text-white/50">Mentorship Hours</div>
          <div className="text-2xl font-semibold text-white mt-1">42 hrs</div>
        </div>
        <div className="p-4 rounded-xl bg-white/[0.02] border border-white/10">
          <div className="text-xs text-white/50">Average Rating</div>
          <div className="text-2xl font-semibold text-white mt-1 flex items-center gap-1">
            <span>4.98</span>
            <Star className="w-4 h-4 fill-amber-300 text-amber-300" />
          </div>
        </div>
        <div className="p-4 rounded-xl bg-white/[0.02] border border-white/10">
          <div className="text-xs text-white/50">Active Requests</div>
          <div className="text-2xl font-semibold text-amber-400 mt-1">
            {requests.length}
          </div>
        </div>
      </div>

      {/* Sub navigation Tabs */}
      <div className="flex items-center gap-4 border-b border-white/10 pb-3 mb-6 text-sm">
        <button
          type="button"
          onClick={() => setActiveTab('requests')}
          className={`pb-2 border-b-2 font-medium transition-colors cursor-pointer ${
            activeTab === 'requests'
              ? 'border-white text-white'
              : 'border-transparent text-white/50 hover:text-white'
          }`}
        >
          Incoming Mentee Requests ({requests.length})
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('sessions')}
          className={`pb-2 border-b-2 font-medium transition-colors cursor-pointer ${
            activeTab === 'sessions'
              ? 'border-white text-white'
              : 'border-transparent text-white/50 hover:text-white'
          }`}
        >
          Upcoming Sessions (2)
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('availability')}
          className={`pb-2 border-b-2 font-medium transition-colors cursor-pointer ${
            activeTab === 'availability'
              ? 'border-white text-white'
              : 'border-transparent text-white/50 hover:text-white'
          }`}
        >
          Weekly Office Hours
        </button>
      </div>

      {/* Tab: Requests with Separate Chat Channels */}
      {activeTab === 'requests' && (
        <div className="space-y-4">
          {requests.map((req) => (
            <div
              key={req.id}
              className="p-6 rounded-2xl bg-white/[0.02] border border-white/10 flex flex-col md:flex-row md:items-center justify-between gap-6"
            >
              <div className="space-y-2 max-w-2xl">
                <div className="flex items-center gap-3">
                  <span className="font-medium text-white text-base">{req.menteeName}</span>
                  <span
                    className={`text-[10px] px-2.5 py-0.5 rounded-full border ${
                      req.status === 'accepted'
                        ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                        : req.status === 'pending'
                        ? 'bg-amber-500/10 text-amber-400 border-amber-500/20'
                        : 'bg-rose-500/10 text-rose-400 border-rose-500/20'
                    }`}
                  >
                    {req.status.toUpperCase()}
                  </span>
                  <span className="text-xs text-white/40">{req.createdAt}</span>
                </div>
                <div className="text-sm font-medium text-white/90">{req.topic}</div>
                <p className="text-xs text-white/60 leading-relaxed italic bg-white/[0.02] p-3 rounded-lg border border-white/5">
                  "{req.note}"
                </p>
              </div>

              {/* Action Buttons: Separate Chat & Decision */}
              <div className="flex flex-wrap items-center gap-2 self-start md:self-center shrink-0">
                {/* Dedicated Separate Chat for this requesting mentee */}
                <button
                  type="button"
                  onClick={() =>
                    onOpenChat?.(
                      req.id,
                      req.menteeName,
                      'Mentee Requester',
                      'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=100&auto=format&fit=crop&q=80',
                      req.topic
                    )
                  }
                  className="px-3.5 py-2 rounded-xl bg-white/10 hover:bg-white/15 border border-white/15 text-white text-xs font-medium transition-colors flex items-center gap-1.5 cursor-pointer"
                >
                  <MessageSquare className="w-3.5 h-3.5 text-sky-400" />
                  <span>Chat with {req.menteeName.split(' ')[0]}</span>
                </button>

                {req.status === 'pending' ? (
                  <>
                    <button
                      type="button"
                      onClick={() => onAcceptRequest(req.id)}
                      className="px-4 py-2 rounded-xl bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/30 text-xs font-medium transition-colors flex items-center gap-1.5 cursor-pointer"
                    >
                      <Check className="w-4 h-4" />
                      <span>Accept</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => onDeclineRequest(req.id)}
                      className="px-3 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-white/60 hover:text-white border border-white/10 text-xs transition-colors cursor-pointer"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </>
                ) : (
                  <div className="text-xs text-emerald-400 flex items-center gap-1.5 px-2">
                    <Check className="w-4 h-4" />
                    <span>Accepted</span>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Tab: Upcoming Sessions */}
      {activeTab === 'sessions' && (
        <div className="space-y-4">
          <div className="p-5 rounded-2xl bg-white/[0.02] border border-white/10 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <div className="text-sm font-medium text-white">one to one Deep Dive with Alex Mercer</div>
              <div className="text-xs text-white/50 mt-1">Topic: Distributed inference systems and GPU utilization</div>
              <div className="text-xs text-emerald-400 mt-2">Thursday, Oct 15 · 4:00 PM EST</div>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() =>
                  onOpenChat?.(
                    'sess-alex',
                    'Alex Mercer',
                    'Mentee Engineer',
                    'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=100&auto=format&fit=crop&q=80',
                    'Distributed inference systems and GPU utilization'
                  )
                }
                className="px-3.5 py-2 rounded-full border border-white/15 bg-white/5 hover:bg-white/10 text-xs text-white flex items-center gap-1.5 cursor-pointer"
              >
                <MessageSquare className="w-3.5 h-3.5 text-sky-400" />
                <span>Open Chat</span>
              </button>
              <a
                href={meetingRoomUrl('sess-alex')}
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Join the video room for the session with Alex Mercer"
                className="liquid-glass rounded-full px-4 py-2 text-xs font-medium text-white hover:scale-105 transition-transform inline-flex items-center gap-1.5"
              >
                <Video className="w-3.5 h-3.5 text-sky-400" />
                <span>Join video room</span>
              </a>
            </div>
          </div>

          <div className="p-5 rounded-2xl bg-white/[0.02] border border-white/10 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <div className="text-sm font-medium text-white">Portfolio & Architecture Review with Liam Zhao</div>
              <div className="text-xs text-white/50 mt-1">Topic: Full stack Next.js/Vite system architecture</div>
              <div className="text-xs text-white/70 mt-2">Saturday, Oct 17 · 11:00 AM EST</div>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() =>
                  onOpenChat?.(
                    'sess-liam',
                    'Liam Zhao',
                    'Mentee Engineer',
                    'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=100&auto=format&fit=crop&q=80',
                    'Full stack Next.js/Vite system architecture'
                  )
                }
                className="px-3.5 py-2 rounded-full border border-white/15 bg-white/5 hover:bg-white/10 text-xs text-white flex items-center gap-1.5 cursor-pointer"
              >
                <MessageSquare className="w-3.5 h-3.5 text-sky-400" />
                <span>Open Chat</span>
              </button>
              <a
                href={meetingRoomUrl('sess-liam')}
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Join the video room for the session with Liam Zhao"
                className="liquid-glass rounded-full px-4 py-2 text-xs font-medium text-white hover:scale-105 transition-transform inline-flex items-center gap-1.5"
              >
                <Video className="w-3.5 h-3.5 text-sky-400" />
                <span>Join video room</span>
              </a>
            </div>
          </div>
        </div>
      )}

      {/* Tab: Availability */}
      {activeTab === 'availability' && (
        <div className="p-6 rounded-2xl bg-white/[0.02] border border-white/10 space-y-4 max-w-xl">
          <h3 className="text-base font-medium text-white">Configured Office Hours</h3>
          <p className="text-xs text-white/60">
            Mentees can request mentorship during any of your active weekly time blocks.
          </p>

          <div className="space-y-2">
            {['Tuesdays 6:00 PM to 7:30 PM EST', 'Thursdays 4:00 PM to 5:30 PM EST', 'Saturdays 10:00 AM to 12:00 PM EST'].map(
              (slot) => (
                <div
                  key={slot}
                  className="flex items-center justify-between p-3 rounded-xl bg-white/5 border border-white/10 text-xs text-white"
                >
                  <div className="flex items-center gap-2">
                    <Clock className="w-3.5 h-3.5 text-white/60" />
                    <span>{slot}</span>
                  </div>
                  <span className="text-emerald-400 text-[11px]">Active</span>
                </div>
              )
            )}
          </div>
        </div>
      )}
    </div>
  );
};
