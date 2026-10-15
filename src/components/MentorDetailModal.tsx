import React, { useState } from 'react';
import { Mentor, UserProfile } from '../types.ts';
import { X, Star, Calendar, Clock, Check, Sparkles, Building2, Award } from 'lucide-react';
import { VERIFICATION_LABEL, VERIFICATION_TONE } from '../lib/verification.ts';

interface MentorDetailModalProps {
  mentor: Mentor | null;
  onClose: () => void;
  onRequestMentorship: (mentor: Mentor, topic: string, note: string, selectedSlot: string) => void;
  user: UserProfile | null;
  onRequireAuth: () => void;
}

export const MentorDetailModal: React.FC<MentorDetailModalProps> = ({
  mentor,
  onClose,
  onRequestMentorship,
  user,
  onRequireAuth,
}) => {
  const [selectedSlot, setSelectedSlot] = useState<string>('');
  const [topic, setTopic] = useState('');
  const [note, setNote] = useState('');
  const [isSent, setIsSent] = useState(false);

  if (!mentor) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) {
      onRequireAuth();
      return;
    }
    if (!topic.trim()) return;

    onRequestMentorship(mentor, topic, note, selectedSlot || mentor.availableSlots[0]);
    setIsSent(true);
    setTimeout(() => {
      setIsSent(false);
      onClose();
    }, 1500);
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-md animate-fade-rise"
    >
      <div className="relative w-full max-w-2xl bg-[#00172e] border border-white/10 rounded-2xl p-6 sm:p-8 text-white shadow-2xl max-h-[90vh] overflow-y-auto">
        <button
          type="button"
          onClick={onClose}
          className="absolute top-5 right-5 text-white/50 hover:text-white transition-colors p-1 rounded-lg"
        >
          <X className="w-5 h-5" />
        </button>

        {isSent ? (
          <div className="text-center py-12 space-y-3">
            <div className="w-14 h-14 rounded-full bg-emerald-500/20 text-emerald-400 mx-auto flex items-center justify-center">
              <Check className="w-7 h-7" />
            </div>
            <h3 className="text-2xl font-medium text-white">Mentorship Request Sent!</h3>
            <p className="text-sm text-white/60 max-w-md mx-auto">
              Your request is recorded in this session and now appears on your dashboard. {mentor.name} is
              not contacted from this preview build, which runs without the backend.
            </p>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Header info */}
            <div className="flex flex-col sm:flex-row sm:items-center gap-5">
              <img
                src={mentor.avatar}
                alt={mentor.name}
                className="w-20 h-20 rounded-2xl object-cover ring-2 ring-white/15 shadow-lg"
              />
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <h2 className="text-2xl font-medium text-white">{mentor.name}</h2>
                  <span
                    className={`text-[11px] px-2 py-0.5 rounded-full border ${VERIFICATION_TONE[mentor.verification]}`}
                  >
                    {VERIFICATION_LABEL[mentor.verification]}
                  </span>
                </div>
                <div className="text-sm text-white/70">{mentor.role}</div>
                <div className="text-xs font-semibold text-white/90 flex items-center gap-2">
                  <Building2 className="w-3.5 h-3.5 text-white/60" />
                  <span>{mentor.company}</span>
                  <span>·</span>
                  <span>{mentor.experienceYears} Years Industry Experience</span>
                </div>

                <div className="flex items-center gap-2 text-xs text-amber-300 pt-1">
                  <Star className="w-4 h-4 fill-amber-300" />
                  <span className="font-semibold text-white">{mentor.rating}</span>
                  <span className="text-white/40">({mentor.reviewCount} mentee reviews)</span>
                </div>
              </div>
            </div>

            {/* Biography */}
            <div className="space-y-2 border-t border-white/10 pt-4">
              <h3 className="text-xs font-semibold text-white/50 uppercase tracking-wider">
                Mentorship Focus & Background
              </h3>
              <p className="text-xs sm:text-sm text-white/80 leading-relaxed">
                {mentor.bio}
              </p>
            </div>

            {/* Skills */}
            <div className="space-y-2">
              <h3 className="text-xs font-semibold text-white/50 uppercase tracking-wider">
                Specialized Topics
              </h3>
              <div className="flex flex-wrap gap-1.5">
                {mentor.skills.map((skill) => (
                  <span
                    key={skill}
                    className="text-xs px-2.5 py-1 rounded-lg bg-white/5 text-white/80 border border-white/10"
                  >
                    {skill}
                  </span>
                ))}
              </div>
            </div>

            {/* Request Form */}
            <form onSubmit={handleSubmit} className="space-y-4 border-t border-white/10 pt-4">
              <h3 className="text-sm font-medium text-white flex items-center gap-2">
                <Calendar className="w-4 h-4 text-white/70" />
                <span>Select Desired Weekly Time Slot</span>
              </h3>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {mentor.availableSlots.map((slot) => {
                  const isChosen = selectedSlot === slot || (!selectedSlot && mentor.availableSlots[0] === slot);
                  return (
                    <button
                      key={slot}
                      type="button"
                      onClick={() => setSelectedSlot(slot)}
                      className={`p-3 rounded-xl text-left border text-xs transition-colors flex items-center justify-between cursor-pointer ${
                        isChosen
                          ? 'border-white bg-white/15 text-white font-medium'
                          : 'border-white/10 bg-white/5 text-white/70 hover:border-white/20 hover:text-white'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <Clock className="w-3.5 h-3.5 text-white/50" />
                        <span>{slot}</span>
                      </div>
                      {isChosen && <Check className="w-3.5 h-3.5 text-white" />}
                    </button>
                  );
                })}
              </div>

              <div>
                <label className="block text-xs font-medium text-white/70 mb-1">
                  Session Topic / Objective
                </label>
                <input
                  type="text"
                  required
                  value={topic}
                  onChange={(e) => setTopic(e.target.value)}
                  placeholder="e.g. Navigating Staff Engineer promotion & System Design review"
                  className="w-full px-3.5 py-2.5 rounded-xl bg-white/5 border border-white/15 text-xs sm:text-sm text-white placeholder:text-white/30 focus:outline-none focus:border-white/50"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-white/70 mb-1">
                  Personal Context & What You've Tried
                </label>
                <textarea
                  rows={3}
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="Share any specific challenges or materials you'd like to inspect..."
                  className="w-full px-3.5 py-2.5 rounded-xl bg-white/5 border border-white/15 text-xs sm:text-sm text-white placeholder:text-white/30 focus:outline-none focus:border-white/50"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 text-xs text-white/60 hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="liquid-glass rounded-full px-7 py-3 text-xs sm:text-sm font-medium text-white hover:scale-[1.02] cursor-pointer"
                >
                  Confirm & Request Mentorship
                </button>
              </div>
            </form>
          </div>
        )}
      </div>
    </div>
  );
};
