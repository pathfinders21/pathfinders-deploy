import React, { useState } from 'react';
import { Menu, X, Compass, User, LogOut, Sparkles } from 'lucide-react';
import { UserProfile } from '../types.ts';

interface NavigationProps {
  currentTab: string;
  onSelectTab: (tab: string) => void;
  user: UserProfile | null;
  onCtaClick: () => void;
  onSignOut: () => void;
}

export const Navigation: React.FC<NavigationProps> = ({
  currentTab,
  onSelectTab,
  user,
  onCtaClick,
  onSignOut,
}) => {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const navLinks = [
    { id: 'hero', label: 'Home' },
    { id: 'plans', label: 'Plans' },
    { id: 'mentors', label: 'Find Mentors' },
    { id: 'roadmaps', label: 'AI Roadmaps' },
    { id: 'community', label: 'Community' },
    { id: 'assess', label: 'Assessment' },
  ];

  const getCtaLabel = () => {
    if (!user) return 'Begin Journey';
    if (!user.role) return 'Choose Role';
    if (!user.isOnboarded) return 'Complete Profile';
    return user.role === 'mentor' ? 'Mentor Hub' : 'My Dashboard';
  };

  return (
    <header className="fixed top-0 left-0 right-0 z-50 transition-all duration-300 backdrop-blur-md bg-[#002244]/40 border-b border-white/5">
      <nav
        aria-label="Main Navigation"
        className="relative z-10 flex items-center justify-between px-6 sm:px-8 py-5 sm:py-6 max-w-7xl mx-auto"
      >
        {/* Brand Logo */}
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => onSelectTab('hero')}
            className="flex items-center gap-2 group text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80 rounded"
          >
            <Compass className="w-5 h-5 text-white/80 group-hover:rotate-45 transition-transform duration-500" />
            <span
              style={{ fontFamily: "'Instrument Serif', serif" }}
              className="text-2xl sm:text-3xl tracking-tight text-white select-none"
            >
              PathFinders
              <sup className="text-xs ml-0.5 opacity-70">®</sup>
            </span>
          </button>
        </div>

        {/* Desktop Navigation Links */}
        <div className="hidden lg:flex items-center gap-8">
          {navLinks.map((link) => {
            const isActive = currentTab === link.id;
            return (
              <button
                key={link.id}
                type="button"
                onClick={() => onSelectTab(link.id)}
                className={`text-sm transition-colors duration-200 cursor-pointer focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-white/60 rounded px-1 py-0.5 ${
                  isActive
                    ? 'text-white font-medium drop-shadow-sm'
                    : 'text-white/70 hover:text-white'
                }`}
              >
                {link.label}
              </button>
            );
          })}
        </div>

        {/* Desktop CTA & User State */}
        <div className="hidden lg:flex items-center gap-4">
          {/* The assistant has a screen of its own, so it gets its own way in rather than
              being buried under the CTA. */}
          <button
            type="button"
            onClick={() => onSelectTab('assistant')}
            aria-current={currentTab === 'assistant' ? 'page' : undefined}
            className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-white/60 ${
              currentTab === 'assistant'
                ? 'bg-white/15 text-white font-medium'
                : 'text-white/75 hover:text-white hover:bg-white/5'
            }`}
          >
            <Sparkles className="w-4 h-4" />
            <span>Ask AI</span>
          </button>

          {user ? (
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={onCtaClick}
                className="liquid-glass rounded-full px-5 py-2.5 text-sm text-white hover:scale-[1.03] active:scale-[0.98] transition-all duration-200 cursor-pointer flex items-center gap-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
              >
                {user.avatar ? (
                  <img
                    src={user.avatar}
                    alt={user.name}
                    className="w-5 h-5 rounded-full object-cover"
                  />
                ) : (
                  <User className="w-4 h-4 text-white/80" />
                )}
                <span>{getCtaLabel()}</span>
              </button>
              <button
                type="button"
                onClick={onSignOut}
                title="Sign Out"
                className="p-2 text-white/60 hover:text-white hover:bg-white/5 rounded-full transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-white"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={onCtaClick}
              className="liquid-glass rounded-full px-6 py-2.5 text-sm font-medium text-white hover:scale-[1.03] active:scale-[0.98] transition-transform duration-200 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
            >
              <span>{getCtaLabel()}</span>
            </button>
          )}
        </div>

        {/* Mobile Hamburger Button */}
        <div className="lg:hidden flex items-center gap-2">
          <button
            type="button"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            aria-expanded={mobileMenuOpen}
            aria-label={mobileMenuOpen ? 'Close Navigation Menu' : 'Open Navigation Menu'}
            className="p-2 rounded-lg text-white/80 hover:text-white hover:bg-white/10 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
          >
            {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
          </button>
        </div>
      </nav>

      {/* Accessible Mobile Menu Overlay */}
      {mobileMenuOpen && (
        <div className="lg:hidden px-6 pt-2 pb-6 border-t border-white/10 bg-[#002244]/95 backdrop-blur-xl animate-fade-rise">
          <div className="flex flex-col gap-3 py-3">
            {navLinks.map((link) => (
              <button
                key={link.id}
                type="button"
                onClick={() => {
                  onSelectTab(link.id);
                  setMobileMenuOpen(false);
                }}
                className={`text-left py-2.5 px-3 rounded-md text-base transition-colors ${
                  currentTab === link.id
                    ? 'text-white bg-white/10 font-medium'
                    : 'text-white/70 hover:text-white hover:bg-white/5'
                }`}
              >
                {link.label}
              </button>
            ))}
            <button
              type="button"
              onClick={() => {
                onSelectTab('assistant');
                setMobileMenuOpen(false);
              }}
              aria-current={currentTab === 'assistant' ? 'page' : undefined}
              className={`text-left py-2.5 px-3 rounded-md text-base transition-colors flex items-center gap-2 ${
                currentTab === 'assistant'
                  ? 'text-white bg-white/10 font-medium'
                  : 'text-white/70 hover:text-white hover:bg-white/5'
              }`}
            >
              <Sparkles className="w-4 h-4" />
              <span>Ask AI</span>
            </button>
          </div>

          <div className="pt-4 border-t border-white/10 flex flex-col gap-3">
            <button
              type="button"
              onClick={() => {
                onCtaClick();
                setMobileMenuOpen(false);
              }}
              className="liquid-glass w-full rounded-full py-3 text-center text-sm font-medium text-white hover:scale-[1.02] transition-transform"
            >
              {getCtaLabel()}
            </button>

            {user && (
              <button
                type="button"
                onClick={() => {
                  onSignOut();
                  setMobileMenuOpen(false);
                }}
                className="w-full text-center py-2 text-xs text-white/60 hover:text-white"
              >
                Sign Out ({user.name})
              </button>
            )}
          </div>
        </div>
      )}
    </header>
  );
};
