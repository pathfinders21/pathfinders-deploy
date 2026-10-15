import React, { useState } from 'react';
import { Mentor, MentorshipRequest, UserProfile } from '../types.ts';
import { Search, Star, Sparkles, X, Check, ArrowRight } from 'lucide-react';
import {
  VERIFICATION_LABEL,
  VERIFICATION_NOTE,
  VERIFICATION_TONE,
} from '../lib/verification.ts';

interface MentorDirectoryProps {
  mentors: Mentor[];
  user: UserProfile | null;
  onRequestMentorship: (mentor: Mentor, topic: string, note: string) => void;
  onRequireAuth: () => void;
}

const DOMAIN_FILTERS = [
  'All Disciplines',
  'AI / Machine Learning',
  'Product Management',
  'Design & UX Engineering',
  'Cloud & DevOps',
  'Startup Leadership',
];

export const MentorDirectory: React.FC<MentorDirectoryProps> = ({
  mentors,
  user,
  onRequestMentorship,
  onRequireAuth,
}) => {
  const [selectedFilter, setSelectedFilter] = useState('All Disciplines');
  const [searchQuery, setSearchQuery] = useState('');
  const [activeRequestMentor, setActiveRequestMentor] = useState<Mentor | null>(null);
  const [requestTopic, setRequestTopic] = useState('');
  const [requestNote, setRequestNote] = useState('');
  const [submittedSuccess, setSubmittedSuccess] = useState(false);

  const filteredMentors = mentors.filter((m) => {
    const matchesFilter =
      selectedFilter === 'All Disciplines' || m.domain.toLowerCase().includes(selectedFilter.toLowerCase());
    const matchesSearch =
      m.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      m.role.toLowerCase().includes(searchQuery.toLowerCase()) ||
      m.company.toLowerCase().includes(searchQuery.toLowerCase()) ||
      m.skills.some((s) => s.toLowerCase().includes(searchQuery.toLowerCase()));
    return matchesFilter && matchesSearch;
  });

  const handleOpenRequest = (mentor: Mentor) => {
    if (!user) {
      onRequireAuth();
      return;
    }
    setActiveRequestMentor(mentor);
    setRequestTopic('');
    setRequestNote('');
    setSubmittedSuccess(false);
  };

  const handleSubmitRequest = (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeRequestMentor || !requestTopic.trim()) return;

    onRequestMentorship(activeRequestMentor, requestTopic, requestNote);
    setSubmittedSuccess(true);
    setTimeout(() => {
      setActiveRequestMentor(null);
      setSubmittedSuccess(false);
    }, 1500);
  };

  return (
    <div className="min-h-screen pt-28 pb-16 px-6 max-w-7xl mx-auto text-white">
      {/* Directory Title */}
      <div className="text-center max-w-2xl mx-auto mb-10">
        <h1
          style={{ fontFamily: "'Instrument Serif', serif" }}
          className="text-4xl sm:text-6xl text-white font-normal"
        >
          Explore Mentors
        </h1>
        <p className="text-white/60 text-sm sm:text-base mt-2">
          Connect one on one with senior architects, product executives, and founders who have walked the path before you.
        </p>
        <p className="text-white/40 text-xs mt-3">{VERIFICATION_NOTE}</p>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col md:flex-row items-center justify-between gap-4 mb-8">
        {/* Search */}
        <div className="relative w-full md:w-80">
          <Search className="w-4 h-4 text-white/40 absolute left-3.5 top-3.5" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search mentors, skills, companies..."
            className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-white/5 border border-white/10 text-sm text-white placeholder:text-white/30 focus:outline-none focus:border-white/40"
          />
        </div>

        {/* Filter Tabs */}
        <div className="flex items-center gap-1 overflow-x-auto w-full md:w-auto pb-2 md:pb-0 scrollbar-none">
          {DOMAIN_FILTERS.map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setSelectedFilter(f)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors cursor-pointer ${
                selectedFilter === f
                  ? 'bg-white/20 text-white font-semibold'
                  : 'text-white/60 hover:text-white hover:bg-white/5'
              }`}
            >
              {f}
            </button>
          ))}
        </div>
      </div>

      {/* Mentor Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {filteredMentors.map((mentor) => (
          <div
            key={mentor.id}
            className="bg-white/[0.02] border border-white/10 rounded-2xl p-6 hover:border-white/30 hover:bg-white/[0.04] transition-all flex flex-col justify-between"
          >
            <div>
              {/* Header */}
              <div className="flex items-start gap-4 mb-4">
                <img
                  src={mentor.avatar}
                  alt={mentor.name}
                  className="w-14 h-14 rounded-full object-cover ring-2 ring-white/10"
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="text-base font-medium text-white truncate">{mentor.name}</h3>
                    <span
                      className={`text-[10px] px-1.5 py-0.5 rounded border shrink-0 ${VERIFICATION_TONE[mentor.verification]}`}
                      title={VERIFICATION_LABEL[mentor.verification]}
                    >
                      {VERIFICATION_LABEL[mentor.verification]}
                    </span>
                  </div>
                  <div className="text-xs text-white/60 truncate">{mentor.role}</div>
                  <div className="text-xs font-semibold text-white/80">{mentor.company}</div>
                </div>
              </div>

              {/* Stats */}
              <div className="flex items-center gap-3 text-xs text-white/50 mb-3 pb-3 border-b border-white/5">
                <div className="flex items-center gap-1 text-white/80 font-medium">
                  <Star className="w-3.5 h-3.5 fill-amber-300 text-amber-300" />
                  <span>{mentor.rating}</span>
                </div>
                <span>·</span>
                <span>{mentor.reviewCount} sessions</span>
                <span>·</span>
                <span>{mentor.experienceYears}y exp</span>
              </div>

              {/* Bio */}
              <p className="text-xs text-white/70 line-clamp-3 leading-relaxed mb-4">
                {mentor.bio}
              </p>

              {/* Skills Tags */}
              <div className="flex flex-wrap gap-1.5 mb-6">
                {mentor.skills.map((skill) => (
                  <span
                    key={skill}
                    className="text-[11px] px-2 py-0.5 rounded-md bg-white/5 text-white/70 border border-white/5"
                  >
                    {skill}
                  </span>
                ))}
              </div>
            </div>

            {/* Request Button */}
            <button
              type="button"
              onClick={() => handleOpenRequest(mentor)}
              className="liquid-glass w-full rounded-full py-2.5 text-xs sm:text-sm font-medium text-white hover:scale-[1.02] transition-transform cursor-pointer text-center"
            >
              Request one on one Mentorship
            </button>
          </div>
        ))}
      </div>

      {/* Mentorship Request Dialog Modal */}
      {activeRequestMentor && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-md animate-fade-rise"
        >
          <div className="relative w-full max-w-lg bg-[#00172e] border border-white/10 rounded-2xl p-6 sm:p-8 text-white shadow-2xl">
            <button
              type="button"
              onClick={() => setActiveRequestMentor(null)}
              className="absolute top-5 right-5 text-white/50 hover:text-white p-1"
            >
              <X className="w-5 h-5" />
            </button>

            {submittedSuccess ? (
              <div className="text-center py-8 space-y-3">
                <div className="w-12 h-12 rounded-full bg-emerald-500/20 text-emerald-400 mx-auto flex items-center justify-center">
                  <Check className="w-6 h-6" />
                </div>
                <h3 className="text-xl font-medium text-white">Request recorded</h3>
                <p className="text-xs text-white/60">
                  It is on your dashboard with its own chat channel. {activeRequestMentor.name} is not
                  contacted from this preview build.
                </p>
              </div>
            ) : (
              <div>
                <div className="flex items-center gap-3 mb-5">
                  <img
                    src={activeRequestMentor.avatar}
                    alt={activeRequestMentor.name}
                    className="w-12 h-12 rounded-full object-cover"
                  />
                  <div>
                    <h3 className="text-lg font-medium text-white">
                      Request Mentorship with {activeRequestMentor.name}
                    </h3>
                    <div className="text-xs text-white/60">
                      {activeRequestMentor.role} · {activeRequestMentor.company}
                    </div>
                  </div>
                </div>

                <form onSubmit={handleSubmitRequest} className="space-y-4">
                  <div>
                    <label className="block text-xs font-medium text-white/70 mb-1">
                      Session Topic / Objective
                    </label>
                    <input
                      type="text"
                      required
                      value={requestTopic}
                      onChange={(e) => setRequestTopic(e.target.value)}
                      placeholder="e.g. Distributed LLM Serving & Career Transition"
                      className="w-full px-3.5 py-2.5 rounded-xl bg-white/5 border border-white/15 text-sm text-white placeholder:text-white/30 focus:outline-none focus:border-white/50"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-white/70 mb-1">
                      Personal Note & Questions
                    </label>
                    <textarea
                      rows={4}
                      required
                      value={requestNote}
                      onChange={(e) => setRequestNote(e.target.value)}
                      placeholder="Share your background, what you have tried so far, and the exact guidance you are seeking..."
                      className="w-full px-3.5 py-2.5 rounded-xl bg-white/5 border border-white/15 text-sm text-white placeholder:text-white/30 focus:outline-none focus:border-white/50"
                    />
                  </div>

                  <div className="p-3 rounded-xl bg-white/[0.03] border border-white/5 text-xs text-white/60">
                    <span className="font-medium text-white/80">Available slot formats:</span>{' '}
                    {activeRequestMentor.availableSlots.join(', ')}
                  </div>

                  <div className="flex items-center justify-end gap-3 pt-3">
                    <button
                      type="button"
                      onClick={() => setActiveRequestMentor(null)}
                      className="px-4 py-2 text-xs text-white/60 hover:text-white"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      className="liquid-glass rounded-full px-6 py-2.5 text-xs sm:text-sm font-medium text-white hover:scale-[1.02] cursor-pointer"
                    >
                      Send Request
                    </button>
                  </div>
                </form>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
