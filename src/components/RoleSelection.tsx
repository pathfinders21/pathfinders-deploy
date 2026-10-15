import React from 'react';
import { Compass, Sparkles, BookOpen, Users, ArrowRight } from 'lucide-react';
import { UserRole } from '../types.ts';

interface RoleSelectionProps {
  userName: string;
  onSelectRole: (role: 'mentee' | 'mentor') => void;
  onCancel?: () => void;
}

export const RoleSelection: React.FC<RoleSelectionProps> = ({
  userName,
  onSelectRole,
  onCancel,
}) => {
  return (
    <div className="min-h-screen pt-28 pb-16 px-6 flex items-center justify-center bg-[#001c38]">
      <div className="max-w-3xl w-full mx-auto text-center animate-fade-rise">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/5 border border-white/10 text-white/70 text-xs mb-6">
          <Compass className="w-3.5 h-3.5 text-white/90" />
          <span>Step 1 of 2: Define Your Direction</span>
        </div>

        <h1
          style={{ fontFamily: "'Instrument Serif', serif" }}
          className="text-4xl sm:text-6xl text-white font-normal tracking-tight"
        >
          Welcome, {userName}.
        </h1>
        <p className="text-white/60 text-base sm:text-lg max-w-xl mx-auto mt-3 mb-12">
          Every journey begins with clarity. Choose how you would like to participate in the PathFinders network.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-left">
          {/* Option A: Mentee */}
          <button
            type="button"
            onClick={() => onSelectRole('mentee')}
            className="group relative p-8 rounded-2xl bg-white/[0.03] border border-white/10 hover:border-white/30 hover:bg-white/[0.06] transition-all duration-300 text-left cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
          >
            <div className="w-12 h-12 rounded-xl bg-white/10 flex items-center justify-center text-white mb-6 group-hover:scale-110 transition-transform">
              <BookOpen className="w-6 h-6" />
            </div>
            <h2 className="text-xl font-medium text-white mb-2 group-hover:text-white flex items-center justify-between">
              <span>I am seeking Mentorship</span>
              <ArrowRight className="w-4 h-4 opacity-0 group-hover:opacity-100 group-hover:translate-x-1 transition-all" />
            </h2>
            <p className="text-sm text-white/60 leading-relaxed mb-6">
              Connect with leaders at tier 1 companies, unlock tailored skill roadmaps, and break through career plateaus.
            </p>
            <div className="text-xs text-white/40 flex items-center gap-2">
              <span>Includes one on one sessions</span>
              <span>·</span>
              <span>AI roadmaps</span>
              <span>·</span>
              <span>Async reviews</span>
            </div>
          </button>

          {/* Option B: Mentor */}
          <button
            type="button"
            onClick={() => onSelectRole('mentor')}
            className="group relative p-8 rounded-2xl bg-white/[0.03] border border-white/10 hover:border-white/30 hover:bg-white/[0.06] transition-all duration-300 text-left cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
          >
            <div className="w-12 h-12 rounded-xl bg-white/10 flex items-center justify-center text-white mb-6 group-hover:scale-110 transition-transform">
              <Users className="w-6 h-6" />
            </div>
            <h2 className="text-xl font-medium text-white mb-2 group-hover:text-white flex items-center justify-between">
              <span>I want to become a Mentor</span>
              <ArrowRight className="w-4 h-4 opacity-0 group-hover:opacity-100 group-hover:translate-x-1 transition-all" />
            </h2>
            <p className="text-sm text-white/60 leading-relaxed mb-6">
              Give back to ambitious talent, sharpen your executive coaching skills, and help shape the next generation of builders.
            </p>
            <div className="text-xs text-white/40 flex items-center gap-2">
              <span>Flexible office hours</span>
              <span>·</span>
              <span>Curated matching</span>
              <span>·</span>
              <span>Impact recognition</span>
            </div>
          </button>
        </div>

        {onCancel && (
          <div className="mt-8">
            <button
              type="button"
              onClick={onCancel}
              className="text-xs text-white/50 hover:text-white transition-colors"
            >
              Back to Home
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
