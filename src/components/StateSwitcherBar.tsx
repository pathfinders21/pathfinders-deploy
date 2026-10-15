import React, { useState } from 'react';
import { UserProfile } from '../types.ts';
import { Sliders, ChevronDown, ChevronUp } from 'lucide-react';

interface StateSwitcherBarProps {
  currentUser: UserProfile | null;
  onSetScenario: (
    scenario: 'signed-out' | 'auth-no-role' | 'auth-incomplete' | 'mentee-complete' | 'mentor-complete'
  ) => void;
}

export const StateSwitcherBar: React.FC<StateSwitcherBarProps> = ({
  currentUser,
  onSetScenario,
}) => {
  const [isOpen, setIsOpen] = useState(false);

  const getScenarioLabel = () => {
    if (!currentUser) return '1. Signed Out';
    if (!currentUser.role) return '2. Auth (No Role)';
    if (!currentUser.isOnboarded) return '3. Incomplete Onboarding';
    return currentUser.role === 'mentor' ? '4b. Mentor Hub' : '4a. Mentee Dashboard';
  };

  return (
    <div className="fixed bottom-4 right-4 z-50 font-sans">
      <div className="bg-[#00172e]/90 backdrop-blur-md border border-white/15 rounded-xl shadow-2xl text-xs text-white overflow-hidden transition-all duration-200">
        <button
          type="button"
          onClick={() => setIsOpen(!isOpen)}
          className="flex items-center gap-2 px-3 py-2 text-white/80 hover:text-white transition-colors cursor-pointer w-full text-left"
          title="Testing Scenario Controller"
        >
          <Sliders className="w-3.5 h-3.5 text-white/70" />
          <span className="font-medium text-[11px]">
            CTA Rule State: <span className="text-white underline">{getScenarioLabel()}</span>
          </span>
          {isOpen ? <ChevronDown className="w-3.5 h-3.5 ml-auto" /> : <ChevronUp className="w-3.5 h-3.5 ml-auto" />}
        </button>

        {isOpen && (
          <div className="p-3 border-t border-white/10 space-y-2.5 max-w-xs animate-fade-rise">
            <div className="text-[10px] text-white/50 uppercase tracking-wider">
              Verify PathFinders CTA Rules:
            </div>

            <div className="flex flex-col gap-1.5">
              <button
                type="button"
                onClick={() => {
                  onSetScenario('signed-out');
                  setIsOpen(false);
                }}
                className={`px-2.5 py-1.5 rounded-lg text-left text-xs transition-colors cursor-pointer ${
                  !currentUser
                    ? 'bg-white/20 text-white font-medium'
                    : 'text-white/70 hover:bg-white/10 hover:text-white'
                }`}
              >
                Rule 1: Signed Out (Prompts Sign In)
              </button>

              <button
                type="button"
                onClick={() => {
                  onSetScenario('auth-no-role');
                  setIsOpen(false);
                }}
                className={`px-2.5 py-1.5 rounded-lg text-left text-xs transition-colors cursor-pointer ${
                  currentUser && !currentUser.role
                    ? 'bg-white/20 text-white font-medium'
                    : 'text-white/70 hover:bg-white/10 hover:text-white'
                }`}
              >
                Rule 2: Auth (No Role Chosen)
              </button>

              <button
                type="button"
                onClick={() => {
                  onSetScenario('auth-incomplete');
                  setIsOpen(false);
                }}
                className={`px-2.5 py-1.5 rounded-lg text-left text-xs transition-colors cursor-pointer ${
                  currentUser && currentUser.role && !currentUser.isOnboarded
                    ? 'bg-white/20 text-white font-medium'
                    : 'text-white/70 hover:bg-white/10 hover:text-white'
                }`}
              >
                Rule 3: Incomplete Profile Onboarding
              </button>

              <button
                type="button"
                onClick={() => {
                  onSetScenario('mentee-complete');
                  setIsOpen(false);
                }}
                className={`px-2.5 py-1.5 rounded-lg text-left text-xs transition-colors cursor-pointer ${
                  currentUser && currentUser.role === 'mentee' && currentUser.isOnboarded
                    ? 'bg-white/20 text-white font-medium'
                    : 'text-white/70 hover:bg-white/10 hover:text-white'
                }`}
              >
                Rule 4a: Mentee (Completed Dashboard)
              </button>

              <button
                type="button"
                onClick={() => {
                  onSetScenario('mentor-complete');
                  setIsOpen(false);
                }}
                className={`px-2.5 py-1.5 rounded-lg text-left text-xs transition-colors cursor-pointer ${
                  currentUser && currentUser.role === 'mentor' && currentUser.isOnboarded
                    ? 'bg-white/20 text-white font-medium'
                    : 'text-white/70 hover:bg-white/10 hover:text-white'
                }`}
              >
                Rule 4b: Mentor (Completed Hub)
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
