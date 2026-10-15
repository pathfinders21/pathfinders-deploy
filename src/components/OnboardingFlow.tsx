import React, { useState } from 'react';
import { Check, ArrowRight, ArrowLeft, Sparkles, RefreshCw, Wand2, CheckCheck } from 'lucide-react';
import { UserProfile, UserRole } from '../types.ts';

interface OnboardingFlowProps {
  user: UserProfile;
  onComplete: (updatedUser: UserProfile) => void;
  onCancel?: () => void;
}

const DOMAINS = [
  'AI / Machine Learning',
  'Full Stack & Cloud Architecture',
  'Product Strategy & Management',
  'Design & UX Engineering',
  'Engineering Leadership & Management',
  'Early Stage Startup Founders',
];

export const OnboardingFlow: React.FC<OnboardingFlowProps> = ({
  user,
  onComplete,
  onCancel,
}) => {
  const [step, setStep] = useState(1);
  const [selectedDomains, setSelectedDomains] = useState<string[]>(
    user.domains && user.domains.length > 0 ? user.domains : [DOMAINS[0]]
  );
  const [title, setTitle] = useState(user.title || '');
  const [company, setCompany] = useState(user.company || '');
  const [bio, setBio] = useState(user.bio || '');
  const [skills, setSkills] = useState<string[]>(
    user.skills || ['System Design', 'React / Next.js', 'LLMs', 'Strategic Planning']
  );
  const [newSkill, setNewSkill] = useState('');
  const [experienceYears, setExperienceYears] = useState(user.experienceYears || 4);

  // AI Bio Assistant State
  const [isGeneratingBio, setIsGeneratingBio] = useState(false);
  const [aiBioStyle, setAiBioStyle] = useState<'technical' | 'executive' | 'growth'>('technical');
  const [generatedBioSuggestion, setGeneratedBioSuggestion] = useState<string | null>(null);

  const isMentor = user.role === 'mentor';

  const toggleDomain = (domain: string) => {
    if (selectedDomains.includes(domain)) {
      if (selectedDomains.length > 1) {
        setSelectedDomains(selectedDomains.filter((d) => d !== domain));
      }
    } else {
      setSelectedDomains([...selectedDomains, domain]);
    }
  };

  const handleAddSkill = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSkill.trim()) return;
    if (!skills.includes(newSkill.trim())) {
      setSkills([...skills, newSkill.trim()]);
    }
    setNewSkill('');
  };

  const handleRemoveSkill = (skillToRemove: string) => {
    setSkills(skills.filter((s) => s !== skillToRemove));
  };

  // AI Bio Generator Engine
  const generateAiBio = (style: 'technical' | 'executive' | 'growth') => {
    setIsGeneratingBio(true);
    setAiBioStyle(style);

    setTimeout(() => {
      const domainsText = selectedDomains.slice(0, 2).join(' and ');
      const skillsText = skills.slice(0, 3).join(', ');
      let generated = '';

      if (isMentor) {
        if (style === 'executive') {
          generated = `${title || 'Engineering Leader'} with ${experienceYears}+ years building resilient teams and products at ${company || 'tier 1 tech'}. I mentor upcoming talent in ${domainsText}, focusing on executive presence, strategic trade offs, and scaling systems from 0 to 10M+ users.`;
        } else if (style === 'technical') {
          generated = `Deep tech practitioner with ${experienceYears} years in ${domainsText}. My core expertise spans ${skillsText}. In my mentorship sessions, we avoid fluff: we review real architecture diagrams, profile bottlenecks, and master Staff level engineering judgment.`;
        } else {
          generated = `Passionate mentor dedicated to demystifying the path to Senior and Staff engineering in ${domainsText}. I partner with ambitious builders to turn daily execution into high leverage promotion cases, rigorous RFCs, and lasting career momentum.`;
        }
      } else {
        if (style === 'technical') {
          generated = `${title || 'Software Engineer'} with ${experienceYears} years of experience specializing in ${domainsText}. Currently deepening my technical depth in ${skillsText}, with a target to transition into foundational distributed architectures and high scale production systems.`;
        } else if (style === 'executive') {
          generated = `Focused on bridging rigorous engineering execution with high level product strategy in ${domainsText}. Seeking mentorship from seasoned leaders to sharpen technical decision making, stakeholder alignment, and Staff+ roadmap formulation.`;
        } else {
          generated = `Ambitious builder accelerating my trajectory across ${domainsText}. Looking for hands on, artifact driven guidance on ${skillsText} to break through career plateaus and deliver outsized organizational impact.`;
        }
      }

      setGeneratedBioSuggestion(generated);
      setIsGeneratingBio(false);
    }, 600);
  };

  const handleApplyAiBio = () => {
    if (generatedBioSuggestion) {
      setBio(generatedBioSuggestion);
      setGeneratedBioSuggestion(null);
    }
  };

  const handleSubmit = () => {
    const updated: UserProfile = {
      ...user,
      title: title || (isMentor ? 'Senior Principal Specialist' : 'Software Engineer'),
      company: company || (isMentor ? 'Global Tech' : 'Fast growth Tech'),
      bio:
        bio ||
        (isMentor
          ? 'Passionate about mentoring high potential builders and navigating career plateaus.'
          : 'Focused on leveling up in systems architecture and AI engineering.'),
      domains: selectedDomains,
      skills,
      experienceYears,
      isOnboarded: true,
      onboardingStep: 3,
    };
    onComplete(updated);
  };

  return (
    <div className="min-h-screen pt-28 pb-16 px-6 flex items-center justify-center bg-[#00172e]">
      <div className="max-w-2xl w-full mx-auto bg-white/[0.02] border border-white/10 rounded-2xl p-6 sm:p-10 text-white backdrop-blur-md animate-fade-rise">
        {/* Progress Bar */}
        <div className="mb-8">
          <div className="flex items-center justify-between text-xs text-white/50 mb-2">
            <span>
              Step {step} of 3: {step === 1 ? 'Focus Domains' : step === 2 ? 'Background & Skills' : 'Bio & Philosophy'}
            </span>
            <span>{isMentor ? 'Mentor Profile Setup' : 'Mentee Profile Setup'}</span>
          </div>
          <div className="w-full h-1.5 bg-white/10 rounded-full overflow-hidden">
            <div
              className="h-full bg-white transition-all duration-300"
              style={{ width: `${(step / 3) * 100}%` }}
            />
          </div>
        </div>

        {/* Step 1: Core Domain (Multi select) */}
        {step === 1 && (
          <div className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-baseline justify-between gap-1">
              <div>
                <h2
                  style={{ fontFamily: "'Instrument Serif', serif" }}
                  className="text-3xl text-white font-normal"
                >
                  {isMentor ? 'Select your mentorship expertise' : 'Choose your focus domains'}
                </h2>
                <p className="text-sm text-white/60 mt-1">
                  {isMentor
                    ? 'Select one or more disciplines where you provide practical guidance.'
                    : 'Select one or more focus areas you want to accelerate in.'}
                </p>
              </div>
              <span className="text-xs text-emerald-400 font-medium whitespace-nowrap self-start sm:self-auto">
                {selectedDomains.length} selected
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {DOMAINS.map((domain) => {
                const isSelected = selectedDomains.includes(domain);
                return (
                  <button
                    key={domain}
                    type="button"
                    onClick={() => toggleDomain(domain)}
                    className={`p-4 rounded-xl text-left border text-sm transition-all cursor-pointer flex items-center justify-between ${
                      isSelected
                        ? 'border-white bg-white/15 text-white font-medium shadow-sm'
                        : 'border-white/10 bg-white/[0.02] text-white/70 hover:border-white/30 hover:text-white'
                    }`}
                  >
                    <span>{domain}</span>
                    <div
                      className={`w-5 h-5 rounded-md flex items-center justify-center border transition-colors ${
                        isSelected
                          ? 'bg-white text-gray-900 border-white'
                          : 'border-white/20 bg-transparent'
                      }`}
                    >
                      {isSelected && <Check className="w-3.5 h-3.5 stroke-[3]" />}
                    </div>
                  </button>
                );
              })}
            </div>

            <div className="p-3 rounded-xl bg-white/[0.03] border border-white/5 text-xs text-white/60 flex items-center justify-between">
              <span>Multi select active: Choose all domains relevant to your path.</span>
              <span className="text-white/40">{selectedDomains.length} of {DOMAINS.length} selected</span>
            </div>

            <div className="flex items-center justify-between pt-6 border-t border-white/10">
              {onCancel ? (
                <button
                  type="button"
                  onClick={onCancel}
                  className="text-xs text-white/50 hover:text-white"
                >
                  Cancel
                </button>
              ) : (
                <div />
              )}
              <button
                type="button"
                onClick={() => setStep(2)}
                disabled={selectedDomains.length === 0}
                className="liquid-glass rounded-full px-6 py-2.5 text-sm font-medium text-white hover:scale-[1.03] transition-transform flex items-center gap-2 cursor-pointer disabled:opacity-50"
              >
                <span>Continue</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {/* Step 2: Background & Skills */}
        {step === 2 && (
          <div className="space-y-6">
            <div>
              <h2
                style={{ fontFamily: "'Instrument Serif', serif" }}
                className="text-3xl text-white font-normal"
              >
                Professional Background & Skills
              </h2>
              <p className="text-sm text-white/60 mt-1">
                Help match you with the right mentors and peer connections.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-white/70 mb-1">
                  Current Title / Role
                </label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder={isMentor ? 'Staff Software Engineer' : 'Frontend Developer'}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-white/5 border border-white/15 text-sm text-white placeholder:text-white/30 focus:outline-none focus:border-white/50"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-white/70 mb-1">
                  Company / Organization
                </label>
                <input
                  type="text"
                  value={company}
                  onChange={(e) => setCompany(e.target.value)}
                  placeholder="e.g. Acme Labs or Independent"
                  className="w-full px-3.5 py-2.5 rounded-xl bg-white/5 border border-white/15 text-sm text-white placeholder:text-white/30 focus:outline-none focus:border-white/50"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-white/70 mb-1">
                Years of Professional Experience: <span className="text-white font-semibold">{experienceYears} yrs</span>
              </label>
              <input
                type="range"
                min="0"
                max="25"
                value={experienceYears}
                onChange={(e) => setExperienceYears(Number(e.target.value))}
                className="w-full accent-white"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-white/70 mb-1">
                Key Skills & Topics
              </label>
              <form onSubmit={handleAddSkill} className="flex gap-2 mb-3">
                <input
                  type="text"
                  value={newSkill}
                  onChange={(e) => setNewSkill(e.target.value)}
                  placeholder="Add a skill (e.g. Distributed Systems, Product Vision)..."
                  className="flex-1 px-3.5 py-2 rounded-xl bg-white/5 border border-white/15 text-sm text-white placeholder:text-white/30 focus:outline-none focus:border-white/50"
                />
                <button
                  type="submit"
                  className="px-4 py-2 bg-white/10 hover:bg-white/20 text-white rounded-xl text-xs font-medium transition-colors cursor-pointer"
                >
                  Add
                </button>
              </form>

              <div className="flex flex-wrap gap-2">
                {skills.map((skill) => (
                  <span
                    key={skill}
                    className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-white/10 text-white text-xs border border-white/10"
                  >
                    <span>{skill}</span>
                    <button
                      type="button"
                      onClick={() => handleRemoveSkill(skill)}
                      className="text-white/50 hover:text-white text-sm"
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
            </div>

            <div className="flex items-center justify-between pt-6 border-t border-white/10">
              <button
                type="button"
                onClick={() => setStep(1)}
                className="text-xs text-white/60 hover:text-white flex items-center gap-1"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>Back</span>
              </button>
              <button
                type="button"
                onClick={() => setStep(3)}
                className="liquid-glass rounded-full px-6 py-2.5 text-sm font-medium text-white hover:scale-[1.03] transition-transform flex items-center gap-2 cursor-pointer"
              >
                <span>Continue</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {/* Step 3: Bio & AI Bio Writer */}
        {step === 3 && (
          <div className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <h2
                  style={{ fontFamily: "'Instrument Serif', serif" }}
                  className="text-3xl text-white font-normal"
                >
                  Bio & Mentorship Philosophy
                </h2>
                <p className="text-sm text-white/60 mt-1">
                  Describe what drives your work and what challenges you solve.
                </p>
              </div>

              {/* AI Bio Writer Trigger */}
              <div className="flex items-center gap-1.5 self-start sm:self-auto">
                <button
                  type="button"
                  onClick={() => generateAiBio('technical')}
                  disabled={isGeneratingBio}
                  className="px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 border border-white/20 text-xs text-white font-medium flex items-center gap-1.5 transition-colors cursor-pointer shadow-sm"
                  title="Generate custom bio with AI based on your skills & role"
                >
                  <Sparkles className="w-3.5 h-3.5 text-amber-300" />
                  <span>{isGeneratingBio ? 'Drafting...' : 'Write Bio with AI'}</span>
                </button>
              </div>
            </div>

            {/* AI Bio Writer Options Toolbar */}
            <div className="p-3.5 rounded-xl bg-white/[0.04] border border-white/10 space-y-2.5">
              <div className="flex items-center justify-between text-xs text-white/70">
                <span className="font-medium flex items-center gap-1.5">
                  <Wand2 className="w-3.5 h-3.5 text-white/70" />
                  <span>AI Bio Writing Tone:</span>
                </span>
                <div className="flex gap-1.5">
                  {(['technical', 'executive', 'growth'] as const).map((style) => (
                    <button
                      key={style}
                      type="button"
                      onClick={() => generateAiBio(style)}
                      className={`px-2.5 py-1 rounded-md text-[11px] capitalize transition-colors cursor-pointer ${
                        aiBioStyle === style
                          ? 'bg-white/20 text-white font-semibold'
                          : 'text-white/50 hover:text-white'
                      }`}
                    >
                      {style}
                    </button>
                  ))}
                </div>
              </div>

              {generatedBioSuggestion && (
                <div className="p-3 rounded-lg bg-black/40 border border-white/10 text-xs text-white/90 space-y-2 animate-fade-rise">
                  <div className="text-[11px] text-amber-300 font-medium flex items-center gap-1">
                    <Sparkles className="w-3 h-3" />
                    <span>AI Drafted Suggestion:</span>
                  </div>
                  <p className="leading-relaxed italic">{generatedBioSuggestion}</p>
                  <div className="flex items-center justify-end gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => generateAiBio(aiBioStyle)}
                      className="text-[11px] text-white/50 hover:text-white flex items-center gap-1 cursor-pointer"
                    >
                      <RefreshCw className="w-3 h-3" />
                      <span>Regenerate</span>
                    </button>
                    <button
                      type="button"
                      onClick={handleApplyAiBio}
                      className="px-3 py-1 rounded-md bg-white text-gray-900 font-medium text-[11px] hover:bg-gray-100 transition-colors flex items-center gap-1 cursor-pointer shadow-sm"
                    >
                      <CheckCheck className="w-3.5 h-3.5 text-emerald-600" />
                      <span>Apply to Bio</span>
                    </button>
                  </div>
                </div>
              )}
            </div>

            <div>
              <label className="block text-xs font-medium text-white/70 mb-1">
                Your Bio Text
              </label>
              <textarea
                rows={4}
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                placeholder={
                  isMentor
                    ? 'What principles guide your mentorship? What challenges do you excel at helping with?'
                    : 'What are your primary goals for this season? What kind of guidance do you value most?'
                }
                className="w-full px-3.5 py-2.5 rounded-xl bg-white/5 border border-white/15 text-sm text-white placeholder:text-white/30 focus:outline-none focus:border-white/50"
              />
            </div>

            <div className="p-4 rounded-xl bg-white/[0.04] border border-white/10 flex items-start gap-3">
              <Sparkles className="w-5 h-5 text-white/80 shrink-0 mt-0.5" />
              <div className="text-xs text-white/70 leading-relaxed">
                {isMentor
                  ? 'Your profile will be listed across your selected domains in PathFinders. You maintain complete control over which mentorship requests you accept and your weekly availability.'
                  : 'Your profile enables tailored multi domain mentor matching, logical phased roadmaps, and one on one session scheduling.'}
              </div>
            </div>

            <div className="flex items-center justify-between pt-6 border-t border-white/10">
              <button
                type="button"
                onClick={() => setStep(2)}
                className="text-xs text-white/60 hover:text-white flex items-center gap-1"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>Back</span>
              </button>
              <button
                type="button"
                onClick={handleSubmit}
                className="liquid-glass rounded-full px-8 py-3 text-sm font-medium text-white hover:scale-[1.03] transition-transform flex items-center gap-2 cursor-pointer"
              >
                <span>Launch {isMentor ? 'Mentor Hub' : 'My Dashboard'}</span>
                <Check className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
