import React, { useState } from 'react';
import {
  MessageSquare,
  Sparkles,
  CheckCircle2,
  Clock,
  Search,
  Filter,
  Plus,
  X,
  Send,
  User,
  ShieldCheck,
  Check,
  AlertCircle,
  HelpCircle,
  ArrowRight,
  Trash2,
} from 'lucide-react';
import { CommunityProblem, ProblemResponse, UserProfile } from '../types.ts';

interface CommunityProblemBoardProps {
  problems: CommunityProblem[];
  currentUser: UserProfile | null;
  onPostProblem: (problem: Omit<CommunityProblem, 'id' | 'createdAt' | 'responses'>) => void;
  onAddResponse: (problemId: string, content: string) => void;
  onMarkSolved: (problemId: string, responseId?: string) => void;
  /** Both only ever reachable on a row this browser wrote. */
  onDeleteProblem: (problemId: string) => void;
  onDeleteResponse: (problemId: string, responseId: string) => void;
  onRequireAuth: () => void;
  onRequestMentorship?: (authorName: string, domain: string) => void;
}

const DOMAINS = [
  'All Domains',
  'AI / Machine Learning',
  'Full Stack & Cloud Architecture',
  'Product Strategy & Management',
  'Design & UX Engineering',
  'Engineering Leadership & Management',
];

export const CommunityProblemBoard: React.FC<CommunityProblemBoardProps> = ({
  problems,
  currentUser,
  onPostProblem,
  onAddResponse,
  onMarkSolved,
  onDeleteProblem,
  onDeleteResponse,
  onRequireAuth,
  onRequestMentorship,
}) => {
  const [selectedStatus, setSelectedStatus] = useState<'all' | 'open' | 'solved'>('all');
  const [selectedDomain, setSelectedDomain] = useState('All Domains');
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedProblemId, setExpandedProblemId] = useState<string | null>(null);

  // New Problem Modal State
  const [isPostModalOpen, setIsPostModalOpen] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newDomain, setNewDomain] = useState('AI / Machine Learning');
  const [newUrgency, setNewUrgency] = useState<'high' | 'medium' | 'low'>('medium');
  const [newDescription, setNewDescription] = useState('');

  // Inline Response Input state (problemId -> text)
  const [replyTexts, setReplyTexts] = useState<Record<string, string>>({});

  // The one delete waiting for a second press, so nothing disappears on a stray click.
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);

  //
  // Ownership is decided by account id, never by display name: a bundled sample post that
  // happens to carry the signed in person's name is not theirs, and a signed out visitor
  // owns nothing here.
  //
  const isMine = (authorId?: string) => !!currentUser && !!authorId && authorId === currentUser.id;
  const postKey = (problemId: string) => `post:${problemId}`;
  const answerKey = (problemId: string, responseId: string) => `answer:${problemId}:${responseId}`;

  const filteredProblems = problems.filter((prob) => {
    const matchesStatus =
      selectedStatus === 'all' ||
      (selectedStatus === 'open' && prob.status === 'open') ||
      (selectedStatus === 'solved' && prob.status === 'solved');

    const matchesDomain =
      selectedDomain === 'All Domains' || prob.domain.toLowerCase().includes(selectedDomain.toLowerCase());

    const matchesSearch =
      prob.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      prob.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
      prob.authorName.toLowerCase().includes(searchQuery.toLowerCase());

    return matchesStatus && matchesDomain && matchesSearch;
  });

  const handleOpenPostModal = () => {
    if (!currentUser) {
      onRequireAuth();
      return;
    }
    setIsPostModalOpen(true);
  };

  const handleCreateProblem = (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser || !newTitle.trim() || !newDescription.trim()) return;

    onPostProblem({
      authorId: currentUser.id,
      authorName: currentUser.name,
      authorAvatar:
        currentUser.avatar ||
        'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=150&auto=format&fit=crop&q=80',
      authorRole: currentUser.title || (currentUser.role === 'mentor' ? 'Industry Mentor' : 'Mentee Engineer'),
      title: newTitle.trim(),
      description: newDescription.trim(),
      domain: newDomain,
      urgency: newUrgency,
      status: 'open',
    });

    setNewTitle('');
    setNewDescription('');
    setIsPostModalOpen(false);
  };

  const handleSendReply = (problemId: string, e: React.FormEvent) => {
    e.preventDefault();
    const text = replyTexts[problemId];
    if (!text || !text.trim()) return;

    if (!currentUser) {
      onRequireAuth();
      return;
    }

    onAddResponse(problemId, text.trim());
    setReplyTexts((prev) => ({ ...prev, [problemId]: '' }));
  };

  const isMentor = currentUser?.role === 'mentor';

  return (
    <div className="min-h-screen pt-28 pb-16 px-6 max-w-6xl mx-auto text-white">
      {/* Title & Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 pb-8 border-b border-white/10">
        <div>
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/5 border border-white/10 text-white/70 text-xs mb-3">
            <Sparkles className="w-3.5 h-3.5 text-white/90" />
            <span>Community Problem Salons</span>
          </div>
          <h1
            style={{ fontFamily: "'Instrument Serif', serif" }}
            className="text-4xl sm:text-6xl text-white font-normal"
          >
            Mentee Problems & Mentor Solutions
          </h1>
          <p className="text-white/60 text-sm sm:text-base mt-2 max-w-2xl">
            Mentees post real architectural, technical, and career roadblocks. Mentors filter open challenges to provide concrete solutions and unblock talent.
          </p>
        </div>

        <button
          type="button"
          onClick={handleOpenPostModal}
          className="liquid-glass rounded-full px-6 py-3 text-xs sm:text-sm font-medium text-white hover:scale-[1.03] transition-transform cursor-pointer flex items-center gap-2 shrink-0 self-start md:self-auto"
        >
          <Plus className="w-4 h-4" />
          <span>Post a Problem</span>
        </button>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 my-8">
        {/* Search */}
        <div className="relative w-full lg:w-72">
          <Search className="w-4 h-4 text-white/40 absolute left-3.5 top-3.5" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search problems, keywords..."
            className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-white/5 border border-white/10 text-xs sm:text-sm text-white placeholder:text-white/30 focus:outline-none focus:border-white/40"
          />
        </div>

        {/* Status Pills */}
        <div className="flex items-center gap-1.5 p-1 bg-white/5 border border-white/10 rounded-xl self-start sm:self-auto">
          <button
            type="button"
            onClick={() => setSelectedStatus('all')}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
              selectedStatus === 'all'
                ? 'bg-white text-gray-900 font-semibold'
                : 'text-white/60 hover:text-white'
            }`}
          >
            All Problems ({problems.length})
          </button>
          <button
            type="button"
            onClick={() => setSelectedStatus('open')}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer flex items-center gap-1.5 ${
              selectedStatus === 'open'
                ? 'bg-amber-400 text-gray-900 font-semibold'
                : 'text-amber-300 hover:text-amber-200'
            }`}
          >
            <span className="w-2 h-2 rounded-full bg-amber-400" />
            <span>Unsolved ({problems.filter((p) => p.status === 'open').length})</span>
          </button>
          <button
            type="button"
            onClick={() => setSelectedStatus('solved')}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer flex items-center gap-1.5 ${
              selectedStatus === 'solved'
                ? 'bg-emerald-400 text-gray-900 font-semibold'
                : 'text-emerald-300 hover:text-emerald-200'
            }`}
          >
            <CheckCircle2 className="w-3.5 h-3.5" />
            <span>Solved ({problems.filter((p) => p.status === 'solved').length})</span>
          </button>
        </div>

        {/* Domain Filter Tabs */}
        <div className="flex items-center gap-1 overflow-x-auto w-full lg:w-auto pb-1 scrollbar-none">
          {DOMAINS.map((domain) => (
            <button
              key={domain}
              type="button"
              onClick={() => setSelectedDomain(domain)}
              className={`px-3 py-1.5 rounded-lg text-xs whitespace-nowrap transition-colors cursor-pointer ${
                selectedDomain === domain
                  ? 'bg-white/20 text-white font-medium'
                  : 'text-white/50 hover:text-white hover:bg-white/5'
              }`}
            >
              {domain}
            </button>
          ))}
        </div>
      </div>

      {/* Problems List */}
      <div className="space-y-4">
        {filteredProblems.length === 0 ? (
          <div className="text-center py-16 p-8 rounded-2xl bg-white/[0.02] border border-white/10 text-white/50">
            <HelpCircle className="w-10 h-10 mx-auto text-white/30 mb-3" />
            <p className="text-base font-medium text-white/70">No problems match your selected filters</p>
            <p className="text-xs text-white/40 mt-1">Try resetting the domain filter or search query.</p>
          </div>
        ) : (
          filteredProblems.map((problem) => {
            const isExpanded = expandedProblemId === problem.id;
            const hasSolutions = problem.responses.some((r) => r.isSolution);

            return (
              <div
                key={problem.id}
                className={`p-6 rounded-2xl border transition-all ${
                  problem.status === 'solved'
                    ? 'bg-emerald-500/[0.02] border-emerald-500/20'
                    : 'bg-white/[0.02] border-white/10 hover:border-white/20'
                }`}
              >
                {/* Header row */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-3">
                  <div className="flex items-center gap-3">
                    <img
                      src={problem.authorAvatar}
                      alt={problem.authorName}
                      className="w-10 h-10 rounded-full object-cover ring-2 ring-white/10"
                    />
                    <div>
                      <div className="text-sm font-medium text-white flex items-center gap-2">
                        <span>{problem.authorName}</span>
                        <span className="text-[11px] text-white/50 font-normal">
                          · {problem.authorRole}
                        </span>
                      </div>
                      <div className="text-[11px] text-white/40 flex items-center gap-2">
                        <span>{problem.domain}</span>
                        <span>·</span>
                        <span>{problem.createdAt}</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <span
                      className={`text-[10px] px-2.5 py-0.5 rounded-full font-medium border ${
                        problem.status === 'solved'
                          ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                          : 'bg-amber-500/10 text-amber-300 border-amber-500/30'
                      }`}
                    >
                      {problem.status === 'solved' ? 'SOLVED' : 'UNSOLVED / OPEN'}
                    </span>

                    {problem.urgency === 'high' && (
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-rose-500/10 text-rose-300 border border-rose-500/20">
                        Urgent
                      </span>
                    )}
                  </div>
                </div>

                {/* Problem Title & Description */}
                <h3 className="text-base sm:text-lg font-medium text-white mb-2">
                  {problem.title}
                </h3>
                <p className="text-xs sm:text-sm text-white/70 leading-relaxed mb-4">
                  {problem.description}
                </p>

                {/* Response / Thread Actions Bar */}
                <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-white/5 text-xs">
                  <button
                    type="button"
                    onClick={() =>
                      setExpandedProblemId(isExpanded ? null : problem.id)
                    }
                    className="text-white/60 hover:text-white flex items-center gap-1.5 cursor-pointer"
                  >
                    <MessageSquare className="w-3.5 h-3.5" />
                    <span>
                      {problem.responses.length}{' '}
                      {problem.responses.length === 1 ? 'Mentor Response' : 'Mentor Responses'}
                    </span>
                  </button>

                  <div className="flex items-center gap-2">
                    {/* Your own post can be taken down; nobody else's. */}
                    {isMine(problem.authorId) &&
                      (pendingDelete === postKey(problem.id) ? (
                        <span className="flex items-center gap-1.5">
                          <span className="text-[11px] text-rose-200/80">Delete this post?</span>
                          <button
                            type="button"
                            aria-label={`Confirm deleting your post: ${problem.title}`}
                            onClick={() => {
                              setPendingDelete(null);
                              onDeleteProblem(problem.id);
                            }}
                            className="px-2.5 py-1 rounded-lg bg-rose-500/20 hover:bg-rose-500/30 border border-rose-500/30 text-rose-200 text-xs font-medium transition-colors cursor-pointer"
                          >
                            Yes, delete
                          </button>
                          <button
                            type="button"
                            aria-label={`Keep your post: ${problem.title}`}
                            onClick={() => setPendingDelete(null)}
                            className="px-2.5 py-1 rounded-lg text-white/60 hover:text-white text-xs transition-colors cursor-pointer"
                          >
                            Keep
                          </button>
                        </span>
                      ) : (
                        <button
                          type="button"
                          aria-label={`Delete your post: ${problem.title}`}
                          onClick={() => setPendingDelete(postKey(problem.id))}
                          className="px-3 py-1 rounded-lg bg-white/5 hover:bg-rose-500/15 border border-white/10 hover:border-rose-500/30 text-white/50 hover:text-rose-200 text-xs font-medium transition-colors flex items-center gap-1 cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          <span>Delete</span>
                        </button>
                      ))}

                    {/* Mentor action: Mark as Solved toggle */}
                    {problem.status === 'open' && (
                      <button
                        type="button"
                        onClick={() => onMarkSolved(problem.id)}
                        className="px-3 py-1 rounded-lg bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/30 text-emerald-300 text-xs font-medium transition-colors flex items-center gap-1 cursor-pointer"
                      >
                        <Check className="w-3.5 h-3.5" />
                        <span>Mark Solved</span>
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={() =>
                        setExpandedProblemId(isExpanded ? null : problem.id)
                      }
                      className="liquid-glass rounded-full px-4 py-1.5 text-xs font-medium text-white hover:scale-105 transition-transform cursor-pointer"
                    >
                      {isExpanded ? 'Hide Discussion' : 'Offer Solution / View Thread'}
                    </button>
                  </div>
                </div>

                {/* Expanded Discussion & Responses Thread */}
                {isExpanded && (
                  <div className="mt-5 pt-4 border-t border-white/10 space-y-4 animate-fade-rise">
                    {problem.responses.length > 0 ? (
                      <div className="space-y-3">
                        {problem.responses.map((resp) => (
                          <div
                            key={resp.id}
                            className={`p-4 rounded-xl border ${
                              resp.isSolution
                                ? 'bg-emerald-500/[0.06] border-emerald-500/30'
                                : 'bg-white/[0.03] border-white/5'
                            }`}
                          >
                            <div className="flex items-center justify-between mb-2">
                              <div className="flex items-center gap-2">
                                <img
                                  src={resp.authorAvatar}
                                  alt={resp.authorName}
                                  className="w-7 h-7 rounded-full object-cover ring-1 ring-white/10"
                                />
                                <div>
                                  <div className="text-xs font-medium text-white flex items-center gap-1.5">
                                    <span>{resp.authorName}</span>
                                    {resp.isMentor && (
                                      <span className="text-[10px] px-1.5 py-0.2 rounded bg-sky-500/20 text-sky-300 border border-sky-500/30 flex items-center gap-0.5">
                                        <ShieldCheck className="w-3 h-3" />
                                        <span>Mentor</span>
                                      </span>
                                    )}
                                  </div>
                                  <div className="text-[10px] text-white/40">{resp.authorRole}</div>
                                </div>
                              </div>

                              <div className="flex items-center gap-2">
                                {resp.isSolution && (
                                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 font-medium flex items-center gap-1">
                                    <Check className="w-3 h-3" />
                                    <span>Accepted Solution</span>
                                  </span>
                                )}
                                <span className="text-[10px] text-white/40">{resp.createdAt}</span>

                                {/* Your own answer can be withdrawn; someone else's cannot. */}
                                {isMine(resp.authorId) &&
                                  (pendingDelete === answerKey(problem.id, resp.id) ? (
                                    <span className="flex items-center gap-1.5">
                                      <button
                                        type="button"
                                        aria-label={`Confirm deleting your answer on ${problem.title}`}
                                        onClick={() => {
                                          setPendingDelete(null);
                                          onDeleteResponse(problem.id, resp.id);
                                        }}
                                        className="text-[10px] px-2 py-0.5 rounded bg-rose-500/20 hover:bg-rose-500/30 border border-rose-500/30 text-rose-200 font-medium transition-colors cursor-pointer"
                                      >
                                        Delete
                                      </button>
                                      <button
                                        type="button"
                                        aria-label={`Keep your answer on ${problem.title}`}
                                        onClick={() => setPendingDelete(null)}
                                        className="text-[10px] text-white/50 hover:text-white transition-colors cursor-pointer"
                                      >
                                        Keep
                                      </button>
                                    </span>
                                  ) : (
                                    <button
                                      type="button"
                                      aria-label={`Delete your answer on ${problem.title}`}
                                      onClick={() => setPendingDelete(answerKey(problem.id, resp.id))}
                                      className="text-white/40 hover:text-rose-200 transition-colors cursor-pointer"
                                    >
                                      <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                  ))}
                              </div>
                            </div>

                            <p className="text-xs text-white/80 leading-relaxed pl-9">
                              {resp.content}
                            </p>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="p-4 rounded-xl bg-white/[0.02] border border-white/5 text-center text-xs text-white/50">
                        No responses yet. Be the first mentor to help unblock {problem.authorName}!
                      </div>
                    )}

                    {/* Inline Response Form for Mentors and Community */}
                    <form
                      onSubmit={(e) => handleSendReply(problem.id, e)}
                      className="p-3.5 rounded-xl bg-white/[0.03] border border-white/10 space-y-2"
                    >
                      <div className="text-xs font-medium text-white flex items-center justify-between">
                        <span>Offer Concrete Solution or Guidance:</span>
                        {isMentor && (
                          <span className="text-[10px] text-sky-400">
                            Posting as a mentor
                          </span>
                        )}
                      </div>

                      <textarea
                        rows={3}
                        required
                        value={replyTexts[problem.id] || ''}
                        onChange={(e) =>
                          setReplyTexts({ ...replyTexts, [problem.id]: e.target.value })
                        }
                        placeholder="Provide actionable code advice, architecture pointers, or configuration flags..."
                        className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-xs text-white placeholder:text-white/30 focus:outline-none focus:border-white/40"
                      />

                      <div className="flex items-center justify-end gap-2">
                        <button
                          type="submit"
                          className="liquid-glass rounded-full px-5 py-2 text-xs font-medium text-white hover:scale-[1.02] transition-transform cursor-pointer flex items-center gap-1.5"
                        >
                          <Send className="w-3.5 h-3.5" />
                          <span>Submit Solution</span>
                        </button>
                      </div>
                    </form>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Post a Problem Modal */}
      {isPostModalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-md animate-fade-rise"
        >
          <div className="relative w-full max-w-xl bg-[#00172e] border border-white/10 rounded-2xl p-6 sm:p-8 text-white shadow-2xl max-h-[90vh] overflow-y-auto">
            <button
              type="button"
              onClick={() => setIsPostModalOpen(false)}
              className="absolute top-5 right-5 text-white/50 hover:text-white p-1"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="mb-6">
              <span
                style={{ fontFamily: "'Instrument Serif', serif" }}
                className="text-3xl text-white font-normal"
              >
                Post Your Challenge to Community
              </span>
              <p className="text-xs text-white/60 mt-1">
                Reach Staff+ mentors across AI, Systems, Design, and Product to unblock your project.
              </p>
            </div>

            <form onSubmit={handleCreateProblem} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-white/70 mb-1">
                  Problem Title / Headline
                </label>
                <input
                  type="text"
                  required
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  placeholder="e.g. Distributed KV cache OOM under long context concurrent load"
                  className="w-full px-3.5 py-2.5 rounded-xl bg-white/5 border border-white/15 text-xs sm:text-sm text-white placeholder:text-white/30 focus:outline-none focus:border-white/50"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-white/70 mb-1">
                    Discipline / Domain
                  </label>
                  <select
                    value={newDomain}
                    onChange={(e) => setNewDomain(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-[#001f3f] border border-white/15 text-xs text-white focus:outline-none focus:border-white/50"
                  >
                    {DOMAINS.filter((d) => d !== 'All Domains').map((d) => (
                      <option key={d} value={d}>
                        {d}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-white/70 mb-1">
                    Urgency Level
                  </label>
                  <select
                    value={newUrgency}
                    onChange={(e) => setNewUrgency(e.target.value as any)}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-[#001f3f] border border-white/15 text-xs text-white focus:outline-none focus:border-white/50"
                  >
                    <option value="high">High (Production Blocked)</option>
                    <option value="medium">Medium (Architecture Decision)</option>
                    <option value="low">Low (Exploratory / Learning)</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-white/70 mb-1">
                  Detailed Technical / Career Context
                </label>
                <textarea
                  rows={5}
                  required
                  value={newDescription}
                  onChange={(e) => setNewDescription(e.target.value)}
                  placeholder="Explain the setup, what error or trade off you are facing, what you've already attempted, and where you need mentor input..."
                  className="w-full px-3.5 py-2.5 rounded-xl bg-white/5 border border-white/15 text-xs sm:text-sm text-white placeholder:text-white/30 focus:outline-none focus:border-white/50"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-3">
                <button
                  type="button"
                  onClick={() => setIsPostModalOpen(false)}
                  className="px-4 py-2 text-xs text-white/60 hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="liquid-glass rounded-full px-6 py-2.5 text-xs sm:text-sm font-medium text-white hover:scale-[1.02] cursor-pointer"
                >
                  Publish Challenge
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
