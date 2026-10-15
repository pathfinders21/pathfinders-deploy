import React from 'react';
import { Mentor } from '../types.ts';
import { Compass, Sparkles, Target, Users, ArrowRight, ShieldCheck, Check } from 'lucide-react';
import { VERIFICATION_SHORT } from '../lib/verification.ts';

interface LandingSectionsProps {
  featuredMentors: Mentor[];
  onSelectMentor: (mentor: Mentor) => void;
  onCtaClick: () => void;
  onExploreMentors: () => void;
  onViewRoadmap: () => void;
}

export const LandingSections: React.FC<LandingSectionsProps> = ({
  featuredMentors,
  onSelectMentor,
  onCtaClick,
  onExploreMentors,
  onViewRoadmap,
}) => {
  return (
    <div id="landing-details" className="relative z-10 bg-[#00172e] text-white">
      {/* Section 1: The Three Pillars */}
      <section className="py-24 px-6 max-w-7xl mx-auto border-t border-white/10">
        <div className="text-center max-w-3xl mx-auto mb-16">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/5 border border-white/10 text-white/70 text-xs mb-3">
            <Compass className="w-3.5 h-3.5 text-white/90" />
            <span>The Mentorship Architecture</span>
          </div>
          <h2
            style={{ fontFamily: "'Instrument Serif', serif" }}
            className="text-4xl sm:text-6xl text-white font-normal"
          >
            Built for intentional growth, not casual networking.
          </h2>
          <p className="text-white/60 text-sm sm:text-base mt-4 leading-relaxed">
            Every session on PathFinders is anchored to clear deliverables, practical roadmaps, and honest feedback from those who have built at global scale.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          <div className="p-8 rounded-2xl bg-white/[0.02] border border-white/10 hover:border-white/25 transition-all">
            <div className="w-12 h-12 rounded-xl bg-white/10 flex items-center justify-center text-white mb-6">
              <ShieldCheck className="w-6 h-6 text-white" />
            </div>
            <h3 className="text-xl font-medium text-white mb-2">Mentors Who Have Shipped</h3>
            <p className="text-xs sm:text-sm text-white/60 leading-relaxed mb-6">
              Staff+ engineers, VP of Products, and founders from DeepMind, Stripe, Figma, and OpenAI. Every profile shows its own verification status.
            </p>
            <div className="text-xs text-white/40 flex items-center gap-2">
              <Check className="w-3.5 h-3.5 text-emerald-400" />
              <span>{VERIFICATION_SHORT}</span>
            </div>
          </div>

          <div className="p-8 rounded-2xl bg-white/[0.02] border border-white/10 hover:border-white/25 transition-all">
            <div className="w-12 h-12 rounded-xl bg-white/10 flex items-center justify-center text-white mb-6">
              <Sparkles className="w-6 h-6 text-white" />
            </div>
            <h3 className="text-xl font-medium text-white mb-2">Dynamic AI Roadmaps</h3>
            <p className="text-xs sm:text-sm text-white/60 leading-relaxed mb-6">
              Convert ambiguous ambition into sequential milestone plans with recommended case studies, RFCs, and code review checkpoints.
            </p>
            <div className="text-xs text-white/40 flex items-center gap-2">
              <Check className="w-3.5 h-3.5 text-emerald-400" />
              <span>Personalized skill milestones</span>
            </div>
          </div>

          <div className="p-8 rounded-2xl bg-white/[0.02] border border-white/10 hover:border-white/25 transition-all">
            <div className="w-12 h-12 rounded-xl bg-white/10 flex items-center justify-center text-white mb-6">
              <Target className="w-6 h-6 text-white" />
            </div>
            <h3 className="text-xl font-medium text-white mb-2">Artifact First Sessions</h3>
            <p className="text-xs sm:text-sm text-white/60 leading-relaxed mb-6">
              No generic pep talks. Inspect architecture diagrams, conduct live mock design reviews, and receive actionable promotion rubrics.
            </p>
            <div className="text-xs text-white/40 flex items-center gap-2">
              <Check className="w-3.5 h-3.5 text-emerald-400" />
              <span>one on one structured sessions</span>
            </div>
          </div>
        </div>
      </section>

      {/* Section 2: Featured Mentors Carousel / Grid */}
      <section className="py-20 px-6 max-w-7xl mx-auto border-t border-white/10">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-12">
          <div>
            <span className="text-xs text-white/50 uppercase tracking-wider">Top Practitioners</span>
            <h2
              style={{ fontFamily: "'Instrument Serif', serif" }}
              className="text-3xl sm:text-5xl text-white font-normal mt-1"
            >
              Meet Leaders Guiding the Next Cohort
            </h2>
          </div>
          <button
            type="button"
            onClick={onExploreMentors}
            className="liquid-glass rounded-full px-6 py-2.5 text-xs sm:text-sm font-medium text-white hover:scale-[1.03] transition-transform flex items-center gap-2 cursor-pointer self-start md:self-auto"
          >
            <span>Browse Full Directory</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {featuredMentors.slice(0, 3).map((mentor) => (
            <div
              key={mentor.id}
              className="p-6 rounded-2xl bg-white/[0.02] border border-white/10 hover:border-white/30 transition-all flex flex-col justify-between"
            >
              <div>
                <div className="flex items-start gap-4 mb-4">
                  <img
                    src={mentor.avatar}
                    alt={mentor.name}
                    className="w-14 h-14 rounded-full object-cover ring-2 ring-white/10"
                  />
                  <div>
                    <h3 className="text-base font-medium text-white">{mentor.name}</h3>
                    <div className="text-xs text-white/50">{mentor.role}</div>
                    <div className="text-xs font-semibold text-white/80">{mentor.company}</div>
                  </div>
                </div>

                <p className="text-xs text-white/60 line-clamp-3 mb-4 leading-relaxed">
                  {mentor.bio}
                </p>

                <div className="flex flex-wrap gap-1.5 mb-6">
                  {mentor.skills.slice(0, 3).map((s) => (
                    <span
                      key={s}
                      className="text-[10px] px-2 py-0.5 rounded bg-white/5 text-white/70 border border-white/5"
                    >
                      {s}
                    </span>
                  ))}
                </div>
              </div>

              <button
                type="button"
                onClick={() => onSelectMentor(mentor)}
                className="w-full py-2.5 rounded-xl bg-white/10 hover:bg-white/15 text-xs font-medium text-white transition-colors cursor-pointer text-center"
              >
                Inspect Profile & Request
              </button>
            </div>
          ))}
        </div>
      </section>

      {/* Section 3: Bottom Call to Action */}
      <section className="py-24 px-6 max-w-5xl mx-auto text-center border-t border-white/10">
        <h2
          style={{ fontFamily: "'Instrument Serif', serif" }}
          className="text-4xl sm:text-6xl text-white font-normal"
        >
          Your next chapter starts with one conversation.
        </h2>
        <p className="text-white/60 text-sm sm:text-base max-w-xl mx-auto mt-4 leading-relaxed">
          Step into a focused ecosystem where ambition meets actionable guidance. Whether you are stepping up to Staff level or leading a product division, PathFinders is your compass.
        </p>

        <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4">
          <button
            type="button"
            onClick={onCtaClick}
            className="liquid-glass rounded-full px-10 py-4 text-sm font-medium text-white hover:scale-[1.03] transition-transform cursor-pointer"
          >
            <span>Begin Your Journey</span>
          </button>
          <button
            type="button"
            onClick={onViewRoadmap}
            className="px-8 py-4 rounded-full border border-white/15 bg-white/5 hover:bg-white/10 text-sm font-medium text-white/80 transition-colors"
          >
            Explore Career Roadmaps
          </button>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-12 px-6 border-t border-white/10 text-xs text-white/40">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <span
              style={{ fontFamily: "'Instrument Serif', serif" }}
              className="text-lg text-white font-normal"
            >
              PathFinders®
            </span>
            <span>· Where guidance meets your next beginning.</span>
          </div>

          <div className="flex items-center gap-6">
            <span>Privacy</span>
            <span>Terms of Mentorship</span>
            <span>Honor Code</span>
            <span>© 2026 PathFinders Network</span>
            <span className="text-white/25">Preview build with sample profiles</span>
          </div>
        </div>
      </footer>
    </div>
  );
};
