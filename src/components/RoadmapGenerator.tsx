import React, { useState } from 'react';
import { CareerRoadmap, CareerMilestone } from '../types.ts';
import {
  Sparkles,
  CheckCircle2,
  Circle,
  Clock,
  ArrowRight,
  BookOpen,
  Award,
  Calendar,
  Layers,
  FileText,
  UserCheck,
  ChevronRight,
  Target,
  Wand2,
} from 'lucide-react';

interface RoadmapGeneratorProps {
  initialRoadmap: CareerRoadmap;
  onSelectMentorForMilestone?: (milestoneTitle: string) => void;
}

const PRESET_PATHWAYS = [
  {
    label: 'Mid Level SWE → Staff AI Systems Engineer',
    current: 'Mid Level Full Stack / Backend Engineer',
    target: 'Staff AI Systems Engineer',
    hours: '8 to 10 Hours / Week',
    timeline: '6 to 9 Months',
    rationale: 'Bridges generalist web backend engineering into foundational AI systems engineering by isolating hardware bottlenecks first, mastering continuous batching, and shipping high throughput inference architectures.',
    milestones: [
      {
        id: 'p1-1',
        phase: 'Phase 1: Hardware Primitives & Distributed Memory',
        title: 'Distributed Systems & GPU Memory Hierarchy',
        description: 'Master HBM bandwidth bottlenecks, compute bound vs memory bound ops, CUDA kernel dispatching, and tensor parallelism primitives.',
        prerequisites: ['Proficiency with Python & C/C++', 'Basic linear algebra and matrix multiplication'],
        deliverable: 'Benchmark a custom Triton kernel vs cuBLAS and author a two page memory bandwidth audit report.',
        duration: '4 Weeks',
        completed: true,
        resources: ['CUDA C++ Programming Guide', 'FlashAttention Deep Dive', 'Triton Tutorials'],
        mentorCheckInTopic: 'Review GPU profiling traces with mentor to diagnose kernel launch overheads.',
      },
      {
        id: 'p1-2',
        phase: 'Phase 2: Scaled Inference & Architecture',
        title: 'High Throughput Inference Engines & Continuous Batching',
        description: 'Build low latency LLM serving runtimes utilizing vLLM, PagedAttention, dynamic prompt caching, and speculative decoding.',
        prerequisites: ['Understanding of Transformer attention masks', 'Async Python / FastAPI runtimes'],
        deliverable: 'Deploy a self hosted inference endpoint serving 50 concurrent streams with <25ms TTFT (Time to First Token).',
        duration: '6 Weeks',
        completed: true,
        resources: ['vLLM Architecture Deep Dive', 'Quantization (AWQ/GPTQ) Labs', 'Latency Benchmarking Harness'],
        mentorCheckInTopic: 'Inspect production concurrency limits, token queuing trade offs, and fallback strategies.',
      },
      {
        id: 'p1-3',
        phase: 'Phase 3: Fine Tuning & Distributed Execution',
        title: 'Parameter Efficient Fine Tuning (PEFT) & Pipeline Sharding',
        description: 'Implement distributed training pipelines using Deepspeed ZeRO stage 3, FSDP, and LoRA/QLoRA on multi GPU setups without OOM failures.',
        prerequisites: ['PyTorch dataset streaming pipelines', 'Gradient accumulation mechanics'],
        deliverable: 'Train a domain specialized 8 billion parameter model, evaluate perplexity, and publish a reproducible eval harness.',
        duration: '5 Weeks',
        completed: false,
        resources: ['Deepspeed ZeRO stage 3 Documentation', 'Axolotl Configuration Guides', 'HuggingFace TRL Libraries'],
        mentorCheckInTopic: 'Validate gradient checkpointing and loss curve anomalies with a senior AI researcher.',
      },
      {
        id: 'p1-4',
        phase: 'Phase 4: Production Governance & Staff Level RFC',
        title: 'Production Alignment, Guardrails & Promotion Artifact',
        description: 'Establish automated regression test suites, red teaming harnesses, latency SLAs, and draft an enterprise RFC for LLM infrastructure.',
        prerequisites: ['Completion of Phases 1 to 3 deliverables'],
        deliverable: 'Author a complete RFC for enterprise scale LLM infra and conduct a mock Staff level architecture defense with your mentor.',
        duration: '4 Weeks',
        completed: false,
        resources: ['Staff Engineer RFC Template', 'RAG Triad Metrics Framework', 'Security & Jailbreak Defense Guide'],
        mentorCheckInTopic: 'Simulate Staff level technical defense and review promotion packet readiness.',
      },
    ],
  },
  {
    label: 'Senior Engineer → Engineering Manager',
    current: 'Senior Software Engineer',
    target: 'Engineering Manager',
    hours: '6 to 8 Hours / Week',
    timeline: '5 to 7 Months',
    rationale: 'Shifts primary leverage from individual commit velocity to amplifying team output, designing organizational feedback loops, and mastering cross functional executive alignment.',
    milestones: [
      {
        id: 'p2-1',
        phase: 'Phase 1: Transitioning from Maker to Multiplier',
        title: 'one on one Coaching Cadence & Psychological Safety',
        description: 'Transition off critical path coding tasks; establish coaching frameworks, career progression ladders, and radical candor feedback rituals.',
        prerequisites: ['Senior technical credibility', 'Desire to grow team members'],
        deliverable: 'Conduct diagnostic one on one audits across 4 teammates and build individual growth plans (IDPs).',
        duration: '4 Weeks',
        completed: false,
        resources: ['The Manager\'s Path by Camille Fournier', 'Lighthouse 1:1 Templates'],
        mentorCheckInTopic: 'Discuss handling underperformance and delivering constructive feedback without demoralizing.',
      },
      {
        id: 'p2-2',
        phase: 'Phase 2: Delivery Predictability & Team Velocity',
        title: 'Sprint Health, Technical Debt & Estimation Rigor',
        description: 'Balance feature velocity with maintenance debt; establish SLA tracking, sprint retrospectives, and unblocking procedures.',
        prerequisites: ['Agile / Kanban sprint planning fundamentals'],
        deliverable: 'Implement a team throughput dashboard and reduce cycle time by 20% over 2 sprint cycles.',
        duration: '5 Weeks',
        completed: false,
        resources: ['Accelerate (DORA Metrics)', 'Shape Up by Basecamp'],
        mentorCheckInTopic: 'Review real sprint burndowns and negotiate technical debt allocation with Product VP.',
      },
      {
        id: 'p2-3',
        phase: 'Phase 3: Cross Functional Alignment & Strategic Staffing',
        title: 'Hiring Rubrics, Headcount Forecasting & Product Triad',
        description: 'Partner with Product Managers and Design leads; create standardized hiring rubrics, and forecast annual hiring needs.',
        prerequisites: ['Interviewing experience'],
        deliverable: 'Author a calibrated engineering interview rubric and conduct 5 structured candidate scorecards.',
        duration: '5 Weeks',
        completed: false,
        resources: ['Google Structured Interviewing Guidelines', 'Staffing Model Templates'],
        mentorCheckInTopic: 'Simulate budget defense and managing conflicting priorities with Product.',
      },
      {
        id: 'p2-4',
        phase: 'Phase 4: Org Health & Management Defense',
        title: 'Performance Reviews, Calibration & Promotion Case',
        description: 'Conduct biannual calibration meetings, defend promotions for high performing direct reports, and manage org realignments.',
        prerequisites: ['Completion of Phases 1 to 3'],
        deliverable: 'Write 3 comprehensive performance evaluations and an engineering org review memo.',
        duration: '4 Weeks',
        completed: false,
        resources: ['Radical Candor Framework', 'Calibration Rubrics'],
        mentorCheckInTopic: 'Practice calibration defense with a Director level PathFinders mentor.',
      },
    ],
  },
  {
    label: 'Frontend Developer → Principal Design Engineer',
    current: 'Frontend Software Engineer',
    target: 'Principal Design Technologist',
    hours: '8 to 10 Hours / Week',
    timeline: '6 to 8 Months',
    rationale: 'Unites supreme frontend technical architecture with high craft UI motion, design token governance, and accessible design system infrastructure.',
    milestones: [
      {
        id: 'p3-1',
        phase: 'Phase 1: Multi Platform Design Token Architecture',
        title: 'Design Tokens, CSS Geometry & Semantic Math',
        description: 'Build automated design token pipelines connecting Figma variables to Tailwind, CSS custom properties, and iOS/Android exports.',
        prerequisites: ['Proficiency with CSS/TypeScript', 'Figma auto layout mastery'],
        deliverable: 'Publish an automated design token package with versioned releases and CI accessibility audits.',
        duration: '4 Weeks',
        completed: false,
        resources: ['W3C Design Tokens Community Group', 'Style Dictionary Deep Dive'],
        mentorCheckInTopic: 'Review color space conversions (OKLCH) and dark mode contrast math.',
      },
      {
        id: 'p3-2',
        phase: 'Phase 2: High Craft Micro Interactions & Motion Physics',
        title: 'Physics Based Springs, Canvas & 60FPS Orchestration',
        description: 'Master interruptible spring animations, gesture recognition, WebGL shader transitions, and zero layout thrashing.',
        prerequisites: ['Framer Motion / Tailwind animations', 'Web Performance DevTools'],
        deliverable: 'Build a production grade gesture driven interaction library benchmarked at 60 fps on mobile Safari.',
        duration: '5 Weeks',
        completed: false,
        resources: ['Motion Guidelines', 'Web Animation API Specs'],
        mentorCheckInTopic: 'Review interaction feel and perceptual latency with a Principal Figma designer.',
      },
      {
        id: 'p3-3',
        phase: 'Phase 3: Component Governance & Accessibility Compliance',
        title: 'Headless Primitive Architecture (WCAG 2.2 AAA)',
        description: 'Architect accessible compound components, keyboard focus traps, screen reader announcements, and automated accessibility regression checks.',
        prerequisites: ['ARIA Authoring Practices'],
        deliverable: 'Audit and rebuild an enterprise data table with full keyboard navigation and multi row selection.',
        duration: '5 Weeks',
        completed: false,
        resources: ['ARIA 1.2 Design Patterns', 'Accessibility regression testing'],
        mentorCheckInTopic: 'Review screen reader testing results and edge case focus states.',
      },
      {
        id: 'p3-4',
        phase: 'Phase 4: Design System RFC & Organizational Adoption',
        title: 'Design System RFC, Migration Strategy & Adoption Metrics',
        description: 'Author an RFC for enterprise wide design system adoption, write Codemod automated migration scripts, and track component reuse metrics.',
        prerequisites: ['Completion of Phases 1 to 3'],
        deliverable: 'Author the design system RFC and run a company wide developer adoption clinic.',
        duration: '4 Weeks',
        completed: false,
        resources: ['Staff Design System Playbook', 'jscodeshift migration patterns'],
        mentorCheckInTopic: 'Mock presentation to Engineering & Design leadership on system ROI.',
      },
    ],
  },
];

export const RoadmapGenerator: React.FC<RoadmapGeneratorProps> = ({
  initialRoadmap,
  onSelectMentorForMilestone,
}) => {
  const [roadmap, setRoadmap] = useState<CareerRoadmap>(() => {
    try {
      const saved = localStorage.getItem('pathfinders_active_roadmap');
      return saved ? JSON.parse(saved) : initialRoadmap;
    } catch {
      return initialRoadmap;
    }
  });

  const [currentLevelInput, setCurrentLevelInput] = useState(roadmap.currentLevel || 'Mid Level Full Stack Engineer');
  const [targetRoleInput, setTargetRoleInput] = useState(roadmap.targetRole || 'Staff AI Systems Engineer');
  const [commitmentInput, setCommitmentInput] = useState(roadmap.weeklyCommitment || '8 to 10 Hours / Week');
  const [isGenerating, setIsGenerating] = useState(false);
  const [showConfig, setShowConfig] = useState(false);

  const toggleMilestone = (id: string) => {
    setRoadmap((prev) => {
      const updated = {
        ...prev,
        milestones: prev.milestones.map((m) =>
          m.id === id ? { ...m, completed: !m.completed } : m
        ),
      };
      try {
        localStorage.setItem('pathfinders_active_roadmap', JSON.stringify(updated));
      } catch {}
      return updated;
    });
  };

  const handleSelectPreset = (preset: (typeof PRESET_PATHWAYS)[0]) => {
    const updated: CareerRoadmap = {
      id: `rd-${Date.now()}`,
      targetRole: preset.target,
      currentLevel: preset.current,
      weeklyCommitment: preset.hours,
      timeline: preset.timeline,
      rationale: preset.rationale,
      milestones: preset.milestones,
    };
    setRoadmap(updated);
    setCurrentLevelInput(preset.current);
    setTargetRoleInput(preset.target);
    setCommitmentInput(preset.hours);
    setShowConfig(false);
    try {
      localStorage.setItem('pathfinders_active_roadmap', JSON.stringify(updated));
    } catch {}
  };

  const handleGenerateCustomRoadmap = (e: React.FormEvent) => {
    e.preventDefault();
    if (!targetRoleInput.trim()) return;

    setIsGenerating(true);
    setTimeout(() => {
      const target = targetRoleInput.trim();
      const current = currentLevelInput.trim() || 'Software Engineer';
      const hours = commitmentInput || '8 to 10 Hours / Week';

      const generated: CareerRoadmap = {
        id: `rd-${Date.now()}`,
        targetRole: target,
        currentLevel: current,
        weeklyCommitment: hours,
        timeline: '6 to 9 Months',
        rationale: `Systematically transitions a ${current} into a validated ${target} through sequential technical primitives, scaled execution, cross functional RFC defense, and promotion artifact packaging.`,
        milestones: [
          {
            id: `ms-${Date.now()}-1`,
            phase: 'Phase 1: Architectural Primitives & Foundational Math',
            title: `Core Fundamentals & Mental Models for ${target}`,
            description: `Deconstruct domain critical fundamentals, performance bottlenecks, and industry benchmarks required to establish credible senior judgment in ${target}.`,
            prerequisites: [`Baseline competence as ${current}`, 'Commitment to artifact first learning'],
            deliverable: `Author a comprehensive diagnostic audit and technical blueprint detailing the baseline architecture of a modern ${target} system.`,
            duration: '4 Weeks',
            completed: false,
            resources: ['Canonical Case Studies & Architecture Blueprints', 'Official Standards & Specifications', 'Domain Diagnostic Checklist'],
            mentorCheckInTopic: `Review baseline technical assumptions with a mentor to avoid common anti patterns.`,
          },
          {
            id: `ms-${Date.now()}-2`,
            phase: 'Phase 2: Production Scale & Failure Modes',
            title: `High Throughput Execution & System Reliability`,
            description: `Build and deploy production grade deliverables under real latency, concurrency, and reliability constraints; analyze worst case failure modes.`,
            prerequisites: ['Completion of Phase 1 architecture audit'],
            deliverable: `Ship a production grade working prototype with automated integration tests, latency benchmarks, and disaster recovery playbooks.`,
            duration: '6 Weeks',
            completed: false,
            resources: ['Site Reliability Engineering Handbooks', 'Performance Profiling Frameworks', 'Distributed Benchmarking Suite'],
            mentorCheckInTopic: `Inspect production telemetry traces, edge cases, and scaling bottlenecks with a senior practitioner.`,
          },
          {
            id: `ms-${Date.now()}-3`,
            phase: 'Phase 3: Cross Functional RFC & System Ownership',
            title: `Architectural RFC, Dependency Alignment & Org Influence`,
            description: `Transition from individual output to setting architectural direction: author technical RFCs, conduct design reviews, and align cross functional stakeholders.`,
            prerequisites: ['Completion of Phase 2 working deliverable'],
            deliverable: `Draft a six page architectural RFC addressing trade offs, security, cost projections, and multi team migration timelines.`,
            duration: '5 Weeks',
            completed: false,
            resources: ['Principal Engineering RFC Templates', 'Stakeholder Communication Matrix', 'Architecture Decision Records (ADRs)'],
            mentorCheckInTopic: `Simulate a tough architecture review board session with your PathFinders mentor.`,
          },
          {
            id: `ms-${Date.now()}-4`,
            phase: 'Phase 4: Capstone Artifact & Senior Promotion Review',
            title: `Senior Promo Packet, Public Artifact & Mentor Defense`,
            description: `Package all deliverables into a compelling portfolio or promotion packet; conduct mock technical interviews and Staff level promotion defense.`,
            prerequisites: ['Phases 1 to 3 deliverables cleared'],
            deliverable: `Complete a formal 45 minute architectural defense presentation and review career advancement packet with your mentor.`,
            duration: '4 Weeks',
            completed: false,
            resources: ['Executive Promotion Packet Guidelines', 'Staff+ Interview Rubrics', 'Public Artifact Publishing Checklist'],
            mentorCheckInTopic: `Conduct mock Staff level promotion defense and finalize roadmap graduation review.`,
          },
        ],
      };

      setRoadmap(generated);
      setIsGenerating(false);
      setShowConfig(false);
      try {
        localStorage.setItem('pathfinders_active_roadmap', JSON.stringify(generated));
      } catch {}
    }, 800);
  };

  const completedCount = roadmap.milestones.filter((m) => m.completed).length;
  const progressPercent = Math.round((completedCount / roadmap.milestones.length) * 100);

  return (
    <div className="min-h-screen pt-28 pb-16 px-6 max-w-5xl mx-auto text-white">
      {/* Header */}
      <div className="text-center max-w-3xl mx-auto mb-10">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/5 border border-white/10 text-white/70 text-xs mb-3">
          <Sparkles className="w-3.5 h-3.5 text-white/90" />
          <span>Logical Career Architecture Engine</span>
        </div>
        <h1
          style={{ fontFamily: "'Instrument Serif', serif" }}
          className="text-4xl sm:text-6xl text-white font-normal"
        >
          Dynamic, Phased Career Roadmaps
        </h1>
        <p className="text-white/60 text-sm sm:text-base mt-2">
          Structured sequentially by real engineering practitioners. Every milestone mandates concrete deliverables, prerequisites, and dedicated mentor check ins.
        </p>
      </div>

      {/* Preset Tested Career Pathways Bar */}
      <div className="mb-8">
        <div className="text-xs text-white/50 mb-2 uppercase tracking-wider flex items-center justify-between">
          <span>Curated Proven Career Ladders:</span>
          <button
            type="button"
            onClick={() => setShowConfig(!showConfig)}
            className="text-white/80 hover:text-white underline cursor-pointer"
          >
            {showConfig ? 'Hide Customizer' : 'Customize Trajectory & Hours'}
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
          {PRESET_PATHWAYS.map((preset) => {
            const isCurrent = roadmap.targetRole === preset.target;
            return (
              <button
                key={preset.label}
                type="button"
                onClick={() => handleSelectPreset(preset)}
                className={`p-3.5 rounded-xl border text-left text-xs transition-all cursor-pointer flex flex-col justify-between ${
                  isCurrent
                    ? 'border-white bg-white/15 text-white shadow-sm'
                    : 'border-white/10 bg-white/[0.02] text-white/70 hover:border-white/30 hover:text-white hover:bg-white/[0.05]'
                }`}
              >
                <div className="font-medium text-white mb-1">{preset.label}</div>
                <div className="text-[11px] text-white/50 flex items-center gap-2">
                  <span>{preset.timeline}</span>
                  <span>·</span>
                  <span>{preset.hours}</span>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Custom Roadmap Generator Drawer / Form */}
      {showConfig && (
        <form
          onSubmit={handleGenerateCustomRoadmap}
          className="p-6 rounded-2xl bg-white/[0.03] border border-white/10 mb-8 space-y-4 animate-fade-rise"
        >
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-medium text-white flex items-center gap-2">
              <Wand2 className="w-4 h-4 text-amber-300" />
              <span>Configure Logical Career Path</span>
            </h3>
            <span className="text-xs text-white/50">Phased milestone synthesis</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-medium text-white/70 mb-1">
                Current Level / Role
              </label>
              <input
                type="text"
                required
                value={currentLevelInput}
                onChange={(e) => setCurrentLevelInput(e.target.value)}
                placeholder="e.g. Mid Level Backend Engineer"
                className="w-full px-3.5 py-2.5 rounded-xl bg-white/5 border border-white/10 text-xs text-white placeholder:text-white/30 focus:outline-none focus:border-white/40"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-white/70 mb-1">
                Target Destination Role
              </label>
              <input
                type="text"
                required
                value={targetRoleInput}
                onChange={(e) => setTargetRoleInput(e.target.value)}
                placeholder="e.g. Staff AI Systems Engineer"
                className="w-full px-3.5 py-2.5 rounded-xl bg-white/5 border border-white/10 text-xs text-white placeholder:text-white/30 focus:outline-none focus:border-white/40"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-white/70 mb-1">
                Weekly Time Commitment
              </label>
              <select
                value={commitmentInput}
                onChange={(e) => setCommitmentInput(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl bg-[#00172e] border border-white/10 text-xs text-white focus:outline-none focus:border-white/40"
              >
                <option value="5 to 7 Hours / Week">5 to 7 Hours / Week (Steady)</option>
                <option value="8 to 10 Hours / Week">8 to 10 Hours / Week (Recommended)</option>
                <option value="12 to 15+ Hours / Week">12 to 15+ Hours / Week (Accelerated)</option>
              </select>
            </div>
          </div>

          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={() => setShowConfig(false)}
              className="text-xs text-white/60 hover:text-white"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isGenerating}
              className="liquid-glass rounded-full px-6 py-2.5 text-xs font-medium text-white hover:scale-[1.02] cursor-pointer flex items-center gap-2"
            >
              {isGenerating ? (
                <span>Synthesizing Logical Phases...</span>
              ) : (
                <>
                  <Sparkles className="w-3.5 h-3.5 text-amber-300" />
                  <span>Synthesize Custom Roadmap</span>
                </>
              )}
            </button>
          </div>
        </form>
      )}

      {/* Active Roadmap View */}
      <div className="bg-white/[0.02] border border-white/10 rounded-2xl p-6 sm:p-8">
        {/* Roadmap Trajectory Banner */}
        <div className="flex flex-col md:flex-row md:items-start justify-between pb-6 border-b border-white/10 gap-6">
          <div className="space-y-1.5 max-w-2xl">
            <div className="flex items-center gap-2 text-xs text-white/50">
              <Target className="w-4 h-4 text-emerald-400" />
              <span>Target Trajectory: {roadmap.currentLevel} → <strong className="text-white">{roadmap.targetRole}</strong></span>
            </div>
            <h2 className="text-2xl sm:text-3xl font-medium text-white">{roadmap.targetRole}</h2>
            {roadmap.rationale && (
              <p className="text-xs sm:text-sm text-white/70 leading-relaxed pt-1">
                {roadmap.rationale}
              </p>
            )}
            <div className="flex flex-wrap items-center gap-4 text-xs text-white/50 pt-2">
              <span className="flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5" />
                <span>Estimated Timeline: {roadmap.timeline}</span>
              </span>
              <span>·</span>
              <span className="flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5" />
                <span>Commitment: {roadmap.weeklyCommitment || '8 to 10 Hours / Week'}</span>
              </span>
            </div>
          </div>

          <div className="text-left md:text-right shrink-0">
            <div className="text-3xl font-semibold text-white">{progressPercent}%</div>
            <div className="text-xs text-white/50 mt-0.5">
              {completedCount} of {roadmap.milestones.length} Milestones Cleared
            </div>
            <div className="w-32 h-1.5 bg-white/10 rounded-full mt-2 overflow-hidden ml-auto">
              <div
                className="h-full bg-emerald-400 transition-all duration-300"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
          </div>
        </div>

        {/* Sequential Phased Milestones */}
        <div className="mt-8 space-y-6">
          {roadmap.milestones.map((milestone, index) => (
            <div
              key={milestone.id}
              className={`p-6 rounded-2xl border transition-all ${
                milestone.completed
                  ? 'bg-emerald-500/[0.03] border-emerald-500/25'
                  : 'bg-white/[0.02] border-white/10 hover:border-white/20'
              }`}
            >
              {/* Phase Header */}
              <div className="flex items-center justify-between pb-3 mb-4 border-b border-white/5 text-xs">
                <div className="flex items-center gap-2 text-white/60">
                  <span className="w-5 h-5 rounded-full bg-white/10 flex items-center justify-center text-[10px] font-bold text-white">
                    {index + 1}
                  </span>
                  <span className="font-medium text-white/80">{milestone.phase}</span>
                </div>
                <span className="text-[11px] px-2.5 py-0.5 rounded-full bg-white/5 text-white/60 border border-white/10">
                  {milestone.duration}
                </span>
              </div>

              {/* Title & Checkbox */}
              <div className="flex items-start gap-4">
                <button
                  type="button"
                  onClick={() => toggleMilestone(milestone.id)}
                  aria-label={milestone.completed ? 'Mark milestone incomplete' : 'Mark milestone complete'}
                  className="mt-1 cursor-pointer focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-white rounded-full shrink-0"
                >
                  {milestone.completed ? (
                    <CheckCircle2 className="w-6 h-6 text-emerald-400" />
                  ) : (
                    <Circle className="w-6 h-6 text-white/30 hover:text-white" />
                  )}
                </button>

                <div className="flex-1 space-y-3">
                  <div>
                    <h3
                      className={`text-base sm:text-lg font-medium ${
                        milestone.completed ? 'line-through text-white/60' : 'text-white'
                      }`}
                    >
                      {milestone.title}
                    </h3>
                    <p className="text-xs sm:text-sm text-white/70 mt-1 leading-relaxed">
                      {milestone.description}
                    </p>
                  </div>

                  {/* Prerequisites Section */}
                  {milestone.prerequisites && milestone.prerequisites.length > 0 && (
                    <div className="p-3 rounded-xl bg-white/[0.02] border border-white/5 text-xs text-white/60">
                      <span className="font-semibold text-white/80 mr-1">Prerequisites:</span>
                      <span>{milestone.prerequisites.join(' · ')}</span>
                    </div>
                  )}

                  {/* Mandated Work Deliverable */}
                  <div className="p-3.5 rounded-xl bg-white/[0.03] border border-white/10 text-xs">
                    <div className="flex items-center gap-1.5 text-white font-medium mb-1">
                      <FileText className="w-3.5 h-3.5 text-amber-300" />
                      <span>Required Work Deliverable:</span>
                    </div>
                    <p className="text-white/80 italic leading-relaxed">
                      "{milestone.deliverable}"
                    </p>
                  </div>

                  {/* Mentor Check In Question */}
                  {milestone.mentorCheckInTopic && (
                    <div className="flex items-start gap-2 text-xs text-white/70">
                      <UserCheck className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                      <div>
                        <span className="font-medium text-white">Mentor Check In Agenda:</span>{' '}
                        <span>{milestone.mentorCheckInTopic}</span>
                      </div>
                    </div>
                  )}

                  {/* Curated Resources */}
                  <div className="flex flex-wrap items-center gap-1.5 pt-1">
                    <span className="text-[11px] text-white/40 uppercase tracking-wider mr-1">
                      Recommended References:
                    </span>
                    {milestone.resources.map((res) => (
                      <span
                        key={res}
                        className="text-[11px] px-2.5 py-1 rounded-md bg-white/5 text-white/80 border border-white/5"
                      >
                        {res}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
