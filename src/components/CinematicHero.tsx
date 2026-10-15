import React, { useState, useRef } from 'react';
import { Play, Pause, ChevronDown } from 'lucide-react';

interface CinematicHeroProps {
  onCtaClick: () => void;
  ctaLabel?: string;
  onScrollDown?: () => void;
}

export const CinematicHero: React.FC<CinematicHeroProps> = ({
  onCtaClick,
  ctaLabel = 'Begin Journey',
  onScrollDown,
}) => {
  const [videoError, setVideoError] = useState(false);
  const [isPlaying, setIsPlaying] = useState(true);
  const videoRef = useRef<HTMLVideoElement>(null);

  const togglePlay = () => {
    if (!videoRef.current) return;
    if (isPlaying) {
      videoRef.current.pause();
      setIsPlaying(false);
    } else {
      videoRef.current.play().then(() => setIsPlaying(true)).catch(() => {});
    }
  };

  return (
    <section
      aria-label="Hero Section"
      className="relative min-h-screen w-full flex flex-col items-center justify-center overflow-hidden bg-[#002244]"
    >
      {/* Fullscreen Video Background */}
      {!videoError ? (
        <video
          ref={videoRef}
          autoPlay
          loop
          muted
          playsInline
          aria-hidden="true"
          tabIndex={-1}
          onError={() => setVideoError(true)}
          className="absolute inset-0 w-full h-full object-cover z-0 pointer-events-none select-none"
        >
          <source
            src="https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260314_131748_f2ca2a28-fed7-44c8-b9a9-bd9acdd5ec31.mp4"
            type="video/mp4"
          />
        </video>
      ) : (
        /* Graceful Video Fallback Background */
        <div
          aria-hidden="true"
          className="absolute inset-0 w-full h-full bg-[#002244] z-0 pointer-events-none"
        />
      )}

      {/* Hero Content Stacking Context (relative z-10) */}
      <div className="relative z-10 flex flex-col items-center justify-center text-center px-6 pt-28 pb-32 sm:pt-36 sm:pb-36 max-w-7xl mx-auto my-auto">
        {/* Main Headline */}
        <h1
          style={{ fontFamily: "'Instrument Serif', serif" }}
          className="text-5xl sm:text-7xl md:text-8xl leading-[0.95] tracking-[-2.46px] max-w-7xl font-normal text-white animate-fade-rise drop-shadow-[0_2px_14px_rgba(0,0,0,0.45)]"
        >
          Where{' '}
          <em className="not-italic text-white/50">guidance</em> meets your{' '}
          <em className="not-italic text-white/50">next beginning.</em>
        </h1>

        {/* Supporting Copy */}
        <p className="text-white/70 text-base sm:text-lg max-w-2xl mt-8 leading-relaxed font-normal text-center animate-fade-rise-delay drop-shadow-[0_1px_8px_rgba(0,0,0,0.3)]">
          Find the right mentors, discover your direction, and turn your ambitions into measurable progress. Your next chapter starts with one meaningful connection.
        </p>

        {/* Hero CTA Button */}
        <button
          type="button"
          onClick={onCtaClick}
          className="liquid-glass rounded-full px-12 sm:px-14 py-4 sm:py-5 text-base font-medium text-white mt-12 hover:scale-[1.03] active:scale-[0.99] transition-transform duration-200 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80 focus-visible:ring-offset-2 focus-visible:ring-offset-[#002244] animate-fade-rise-delay-2"
        >
          <span className="relative z-10">{ctaLabel}</span>
        </button>
      </div>

      {/* Video Playback Accessibility Controller */}
      {!videoError && (
        <div className="absolute bottom-6 left-6 z-20">
          <button
            type="button"
            onClick={togglePlay}
            aria-label={isPlaying ? 'Pause background video' : 'Play background video'}
            className="liquid-glass p-2.5 rounded-full text-white/70 hover:text-white transition-colors cursor-pointer flex items-center gap-2 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
          >
            {isPlaying ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
            <span className="hidden sm:inline text-[11px] pr-1">
              {isPlaying ? 'Pause ambient video' : 'Play video'}
            </span>
          </button>
        </div>
      )}

      {/* Subtle Scroll Down Prompt */}
      {onScrollDown && (
        <div className="absolute bottom-6 z-20 animate-bounce">
          <button
            type="button"
            onClick={onScrollDown}
            className="text-white/40 hover:text-white transition-colors flex flex-col items-center gap-1 text-[11px] uppercase tracking-widest cursor-pointer"
          >
            <span>Explore</span>
            <ChevronDown className="w-4 h-4" />
          </button>
        </div>
      )}
    </section>
  );
};
