import React, { useState, useEffect } from 'react';
import { CinematicHero } from './components/CinematicHero.tsx';
import { PlansPage } from './components/PlansPage.tsx';
import { Navigation } from './components/Navigation.tsx';
import { LandingSections } from './components/LandingSections.tsx';
import { AuthModal } from './components/AuthModal.tsx';
import { RoleSelection } from './components/RoleSelection.tsx';
import { OnboardingFlow } from './components/OnboardingFlow.tsx';
import { MenteeDashboard } from './components/MenteeDashboard.tsx';
import { MentorDashboard } from './components/MentorDashboard.tsx';
import { MentorDirectory } from './components/MentorDirectory.tsx';
import { MentorDetailModal } from './components/MentorDetailModal.tsx';
import { RoadmapGenerator } from './components/RoadmapGenerator.tsx';
import { CommunityProblemBoard } from './components/CommunityProblemBoard.tsx';
import { ChatDrawer } from './components/ChatDrawer.tsx';
import { Toast, ToastMessage } from './components/Toast.tsx';
import { StateSwitcherBar } from './components/StateSwitcherBar.tsx';
import { AssessmentPanel } from './components/AssessmentPanel.tsx';
import { AgentPanel } from './components/AgentPanel.tsx';
import { RoadmapWorkspace } from './components/RoadmapWorkspace.tsx';
import { MatchPanel } from './components/MatchPanel.tsx';
import { StudentWorkspace } from './components/StudentWorkspace.tsx';
import { MentorInbox } from './components/MentorInbox.tsx';
import { AssistantDock } from './components/AssistantDock.tsx';
import { AssistantScreen } from './components/AssistantScreen.tsx';
import { useSession } from './lib/session.ts';
import { ApiError, api, type AssistantMentor } from './lib/api.ts';
import { INITIAL_MENTORS, INITIAL_REQUESTS, INITIAL_ROADMAP } from './data/mockMentors.ts';
import { INITIAL_PROBLEMS } from './data/mockCommunityProblems.ts';
import { UserProfile, Mentor, MentorshipRequest, CareerRoadmap, CommunityProblem } from './types.ts';
import {
  coerceTab,
  hashForTab,
  isTab,
  tabFromHash,
  TABS_REQUIRING_USER,
  type Tab,
} from './lib/router.ts';
import { qaControlsEnabled } from './lib/qa.ts';

/**
 * Shown above a sample screen when there is no server session.
 *
 * The AI-first screens (assessment, roadmap, matching, agent) read stored records and
 * need a session. Without one these sample screens are still the best preview of the
 * product, so they are shown with a label rather than hidden.
 */
function SampleNotice({ what }: { what: string }) {
  return (
    <div className="max-w-7xl mx-auto px-6 pt-24">
      <div className="p-4 rounded-2xl bg-amber-950/25 border border-amber-500/25 text-amber-100 text-xs flex items-start gap-2">
        <span className="font-medium shrink-0">{what}: sample data.</span>
        <span className="text-amber-100/80">
          This screen is running on the bundled sample records, not on your account, and nothing here is saved to a
          server. Sign in to use the version that reads your stored profile, goal, roadmap and mentor matches.
        </span>
      </div>
    </div>
  );
}

export default function App() {
  // Identity for the AI surfaces comes from the server session, never from localStorage.
  // When there is a session, the real assessment, roadmap, matching and agent screens are
  // what render. Without one, the sample workspace below is shown with a visible label so
  // it is never mistaken for data belonging to the visitor.
  const { session } = useSession();
  const live = session.status === 'ready';

  // User Session State with localStorage persistence
  const [user, setUser] = useState<UserProfile | null>(() => {
    try {
      const saved = localStorage.getItem('pathfinders_user');
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });

  // The screen is the URL. `#/mentors`, `#/roadmaps` and the rest are real links, so a
  // tab can be opened directly and the back button works.
  const [currentTab, setCurrentTab] = useState<Tab>(() =>
    typeof window === 'undefined' ? 'hero' : tabFromHash(window.location.hash)
  );

  // Keep the URL in step with the screen, in both directions.
  useEffect(() => {
    const target = hashForTab(currentTab);
    if (window.location.hash !== target) window.location.hash = target;
  }, [currentTab]);

  useEffect(() => {
    const onHashChange = () => {
      const next = tabFromHash(window.location.hash);
      if (isTab(next)) setCurrentTab(next);
    };
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  // A deep link into a signed in screen while signed out goes home, the same place the
  // CTA rules would send it, instead of rendering an empty page.
  useEffect(() => {
    if (!user && TABS_REQUIRING_USER.includes(currentTab)) setCurrentTab('hero');
  }, [user, currentTab]);

  // Modals, Drawers & Details
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [inspectedMentor, setInspectedMentor] = useState<Mentor | null>(null);

  // Dedicated Chat Channel State (supports a separate channel per request)
  const [activeChat, setActiveChat] = useState<{
    channelId: string;
    recipientName: string;
    recipientRole: string;
    recipientAvatar: string;
    topic?: string;
  } | null>(null);

  // Notifications
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const addToast = (type: 'success' | 'info' | 'error', title: string, message?: string) => {
    const id = `t-${Date.now()}`;
    setToasts((prev) => [...prev, { id, type, title, message }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4000);
  };

  const removeToast = (id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  // App Data with persistence
  const [mentors, setMentors] = useState<Mentor[]>(INITIAL_MENTORS);
  const [requests, setRequests] = useState<MentorshipRequest[]>(() => {
    try {
      const saved = localStorage.getItem('pathfinders_requests');
      return saved ? JSON.parse(saved) : INITIAL_REQUESTS;
    } catch {
      return INITIAL_REQUESTS;
    }
  });
  const [roadmap, setRoadmap] = useState<CareerRoadmap>(INITIAL_ROADMAP);

  // Community Problems State
  const [problems, setProblems] = useState<CommunityProblem[]>(() => {
    try {
      const saved = localStorage.getItem('pathfinders_community_problems');
      return saved ? JSON.parse(saved) : INITIAL_PROBLEMS;
    } catch {
      return INITIAL_PROBLEMS;
    }
  });

  // Sync to local storage
  useEffect(() => {
    try {
      if (user) {
        localStorage.setItem('pathfinders_user', JSON.stringify(user));
      } else {
        localStorage.removeItem('pathfinders_user');
      }
    } catch {}
  }, [user]);

  useEffect(() => {
    try {
      localStorage.setItem('pathfinders_requests', JSON.stringify(requests));
    } catch {}
  }, [requests]);

  useEffect(() => {
    try {
      localStorage.setItem('pathfinders_community_problems', JSON.stringify(problems));
    } catch {}
  }, [problems]);

  /**
   * Functional CTA Decision Rules:
   * 1. If signed out -> route to the sign in / registration flow
   * 2. If authenticated but has not selected a role -> continue to role selection
   * 3. If selected role but has incomplete profile -> continue to onboarding
   * 4. If completed onboarding -> navigate to the dashboard for that role
   */
  const handleCtaClick = () => {
    // Rule 1: Signed out
    if (!user) {
      setAuthModalOpen(true);
      return;
    }

    // Rule 2: Authenticated but no role
    if (!user.role) {
      setCurrentTab('role-selection');
      return;
    }

    // Rule 3: Incomplete profile onboarding
    if (!user.isOnboarded) {
      setCurrentTab('onboarding');
      return;
    }

    // Rule 4: Completed onboarding -> navigate to the dashboard for that role
    setCurrentTab('dashboard');
  };

  // Auth Success Handler
  const handleAuthSuccess = (authenticatedUser: UserProfile) => {
    setUser(authenticatedUser);
    setAuthModalOpen(false);
    addToast('success', `Welcome, ${authenticatedUser.name}!`, 'Account connected successfully.');

    // Proceed following decision rules immediately
    if (!authenticatedUser.role) {
      setCurrentTab('role-selection');
    } else if (!authenticatedUser.isOnboarded) {
      setCurrentTab('onboarding');
    } else {
      setCurrentTab('dashboard');
    }
  };

  // Role Selection Handler
  const handleSelectRole = (role: 'mentee' | 'mentor') => {
    if (!user) return;
    const updatedUser: UserProfile = {
      ...user,
      role,
      onboardingStep: 1,
    };
    setUser(updatedUser);
    addToast('info', `${role === 'mentor' ? 'Mentor' : 'Mentee'} track selected`, 'Complete your profile to proceed.');
    // Proceed to Rule 3: Onboarding
    setCurrentTab('onboarding');
  };

  // Onboarding Completion Handler
  const handleOnboardingComplete = (completedUser: UserProfile) => {
    setUser(completedUser);
    addToast('success', 'Profile Activated!', 'Your PathFinders workspace is now ready.');
    // Proceed to Rule 4: Dashboard
    setCurrentTab('dashboard');
  };

  // Mentorship Request Submission
  const handleRequestMentorship = (
    mentor: Mentor,
    topic: string,
    note: string,
    selectedSlot?: string
  ) => {
    const newRequest: MentorshipRequest = {
      id: `req-${Date.now()}`,
      mentorId: mentor.id,
      mentorName: mentor.name,
      menteeId: user ? user.id : 'guest',
      menteeName: user ? user.name : 'Taylor Morgan',
      topic: selectedSlot ? `${topic} (${selectedSlot})` : topic,
      note,
      status: 'pending',
      createdAt: 'Just now',
    };
    setRequests([newRequest, ...requests]);
    addToast('success', 'Request recorded', `${mentor.name} is not contacted from this preview build. Your request and its chat channel are ready on your dashboard.`);
  };

  // Mentor Accept/Decline Handlers
  const handleAcceptRequest = (id: string) => {
    setRequests(
      requests.map((r) => (r.id === id ? { ...r, status: 'accepted' } : r))
    );
    addToast('success', 'Session marked accepted', 'Recorded in this session only. No invitation is sent.');
  };

  const handleDeclineRequest = (id: string) => {
    setRequests(
      requests.map((r) => (r.id === id ? { ...r, status: 'declined' } : r))
    );
    addToast('info', 'Request marked declined', 'Recorded in this session only. No notification is sent.');
  };

  // Community Problem Handlers
  const handlePostProblem = (newProblemData: Omit<CommunityProblem, 'id' | 'createdAt' | 'responses'>) => {
    const newProblem: CommunityProblem = {
      ...newProblemData,
      id: `prob-${Date.now()}`,
      createdAt: 'Just now',
      responses: [],
    };
    setProblems([newProblem, ...problems]);
    addToast('success', 'Challenge posted', 'It is on the board for everyone using this browser.');
  };

  const handleAddProblemResponse = (problemId: string, content: string) => {
    setProblems((prev) =>
      prev.map((prob) => {
        if (prob.id === problemId) {
          const isUserMentor = user?.role === 'mentor';
          const newResponse = {
            id: `resp-${Date.now()}`,
            authorId: user?.id,
            authorName: user ? user.name : 'Taylor Morgan',
            authorRole: user?.title || (isUserMentor ? 'Industry Mentor' : 'Software Engineer'),
            authorAvatar:
              user?.avatar ||
              'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=100&auto=format&fit=crop&q=80',
            isMentor: isUserMentor,
            content,
            createdAt: 'Just now',
            isSolution: isUserMentor,
          };
          return {
            ...prob,
            responses: [...prob.responses, newResponse],
          };
        }
        return prob;
      })
    );
    addToast('success', 'Solution Submitted', 'Your guidance was published to the problem discussion.');
  };

  //
  // Taking your own writing off the board. The board only ever offers these controls on
  // rows this browser wrote, and it decides that by author id rather than by name, so a
  // sample post that happens to carry your name is not yours to delete.
  //
  const handleDeleteProblem = (problemId: string) => {
    setProblems((prev) => prev.filter((prob) => prob.id !== problemId));
    addToast('info', 'Post deleted', 'It is gone from this browser. Nothing was sent to a server.');
  };

  const handleDeleteProblemResponse = (problemId: string, responseId: string) => {
    setProblems((prev) =>
      prev.map((prob) =>
        prob.id === problemId
          ? { ...prob, responses: prob.responses.filter((resp) => resp.id !== responseId) }
          : prob
      )
    );
    addToast('info', 'Answer deleted', 'It is gone from this browser. Nothing was sent to a server.');
  };

  /**
   * A mentorship request started from the assistant's answer.
   *
   * The mentor id comes from the matching engine, so the request the mentor receives
   * carries the same fit score they would have seen on the mentors screen. Signed out,
   * there is no account to store it against, so it sends the visitor to sign in instead
   * of pretending a request was made.
   */
  const openMentorsDirectory = () => {
    setCurrentTab('mentors');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleAssistantRequestMentor = async (mentor: AssistantMentor, topic: string) => {
    if (!live) {
      addToast('info', 'Sign in to request mentorship', 'Requests are stored against your account, so they need a session.');
      setAuthModalOpen(true);
      return;
    }
    try {
      await api.createRequest({
        mentorId: mentor.id,
        message: topic ? `Asked the assistant about: ${topic}` : '',
      });
      addToast('success', `Request sent to ${mentor.name}`, 'It is stored as pending until they answer. Nothing is emailed.');
    } catch (error) {
      addToast(
        'error',
        'That request did not go through',
        error instanceof ApiError ? error.userMessage : 'Try again in a moment.'
      );
    }
  };

  const handleMarkProblemSolved = (problemId: string) => {
    setProblems((prev) =>
      prev.map((prob) => {
        if (prob.id === problemId) {
          const newStatus = prob.status === 'solved' ? 'open' : 'solved';
          return { ...prob, status: newStatus };
        }
        return prob;
      })
    );
    addToast('success', 'Status Updated', 'Problem marked as solved.');
  };

  // Test Scenario Switcher for QA Verification
  const handleSetScenario = (
    scenario: 'signed-out' | 'auth-no-role' | 'auth-incomplete' | 'mentee-complete' | 'mentor-complete'
  ) => {
    switch (scenario) {
      case 'signed-out':
        setUser(null);
        setCurrentTab('hero');
        addToast('info', 'Switched to Rule 1: Signed Out');
        break;
      case 'auth-no-role':
        setUser({
          id: 'u-qa-1',
          name: 'Morgan Blake',
          email: 'morgan@example.com',
          avatar: 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=150&auto=format&fit=crop&q=80',
          role: null,
          isOnboarded: false,
        });
        setCurrentTab('hero');
        addToast('info', 'Switched to Rule 2: Auth (No Role)');
        break;
      case 'auth-incomplete':
        setUser({
          id: 'u-qa-2',
          name: 'Jordan Lee',
          email: 'jordan@example.com',
          avatar: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=150&auto=format&fit=crop&q=80',
          role: 'mentee',
          isOnboarded: false,
          onboardingStep: 1,
        });
        setCurrentTab('hero');
        addToast('info', 'Switched to Rule 3: Incomplete Onboarding');
        break;
      case 'mentee-complete':
        setUser({
          id: 'u-qa-3',
          name: 'Alex Mercer',
          email: 'alex.mercer@gmail.com',
          avatar: 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=150&auto=format&fit=crop&q=80',
          role: 'mentee',
          isOnboarded: true,
          title: 'Full Stack Engineer',
          company: 'Acme Cloud',
          bio: 'Transitioning to foundational distributed AI systems.',
          skills: ['TypeScript', 'React', 'Go', 'Docker'],
        });
        setCurrentTab('hero');
        addToast('success', 'Switched to Rule 4a: Mentee Dashboard');
        break;
      case 'mentor-complete':
        setUser({
          id: 'u-qa-4',
          name: 'Dr. Marcus Vance',
          email: 'marcus.vance@stripe.com',
          avatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150&auto=format&fit=crop&q=80',
          role: 'mentor',
          isOnboarded: true,
          title: 'VP of Product Architecture',
          company: 'Stripe',
          bio: '12 years building distributed payment systems and mentoring engineering executives.',
          skills: ['Distributed Systems', 'Product Strategy', 'Hiring', 'Executive Presence'],
        });
        setCurrentTab('hero');
        addToast('success', 'Switched to Rule 4b: Mentor Hub');
        break;
    }
  };

  const getCtaLabel = () => {
    if (!user) return 'Begin Journey';
    if (!user.role) return 'Select Your Path';
    if (!user.isOnboarded) return 'Continue Onboarding';
    return user.role === 'mentor' ? 'Open Mentor Hub' : 'Enter Mentee Dashboard';
  };

  const handleScrollToLandingDetails = () => {
    const el = document.getElementById('landing-details');
    if (el) {
      el.scrollIntoView({ behavior: 'smooth' });
    }
  };

  return (
    <div className="relative min-h-screen bg-[#002244] text-white selection:bg-white/20 selection:text-white flex flex-col font-sans">
      {/* Toast Notifications */}
      <Toast toasts={toasts} onDismiss={removeToast} />

      {/* Liquid Glass Navigation Bar */}
      <Navigation
        currentTab={currentTab}
        onSelectTab={(tab) => {
          if (tab === 'journey') {
            handleCtaClick();
          } else {
            setCurrentTab(coerceTab(tab));
            window.scrollTo({ top: 0, behavior: 'smooth' });
          }
        }}
        user={user}
        onCtaClick={handleCtaClick}
        onSignOut={() => {
          setUser(null);
          setCurrentTab('hero');
          addToast('info', 'Signed out successfully');
        }}
      />

      {/* Main Content Router */}
      <main className="flex-1 w-full">
        {currentTab === 'hero' && (
          <>
            <CinematicHero
              onCtaClick={handleCtaClick}
              ctaLabel={getCtaLabel()}
              onScrollDown={handleScrollToLandingDetails}
            />
            {/* Extended Editorial Sections Below Hero */}
            <LandingSections
              featuredMentors={mentors}
              onSelectMentor={(mentor) => setInspectedMentor(mentor)}
              onCtaClick={handleCtaClick}
              onExploreMentors={() => {
                setCurrentTab('mentors');
                window.scrollTo({ top: 0, behavior: 'smooth' });
              }}
              onViewRoadmap={() => {
                setCurrentTab('roadmaps');
                window.scrollTo({ top: 0, behavior: 'smooth' });
              }}
            />
          </>
        )}

        {currentTab === 'mentors' &&
          (live ? (
            <MatchPanel
              session={session}
              onRequested={(name) =>
                addToast('success', `Request sent to ${name}`, 'It is stored as pending until they answer.')
              }
            />
          ) : (
            <>
              <SampleNotice what="Mentor matching" />
              <MentorDirectory
                mentors={mentors}
                user={user}
                onRequestMentorship={handleRequestMentorship}
                onRequireAuth={() => setAuthModalOpen(true)}
              />
            </>
          ))}

        {currentTab === 'roadmaps' &&
          (live ? (
            <RoadmapWorkspace session={session} onOpenAgent={() => setCurrentTab('agent')} />
          ) : (
            <>
              <SampleNotice what="Roadmap generation" />
              <RoadmapGenerator initialRoadmap={roadmap} />
            </>
          ))}

        {currentTab === 'assess' && <AssessmentPanel session={session} />}

        {currentTab === 'agent' && <AgentPanel session={session} />}

        {/* The assistant, as a screen of its own. Also opens in the dock below. */}
        {currentTab === 'assistant' && (
          <AssistantScreen session={session} onRequestMentor={handleAssistantRequestMentor} onBrowseMentors={openMentorsDirectory} />
        )}

        {/* Community Problem Salons: Mentees post problems, mentors filter and solve */}
        {currentTab === 'plans' && (
          <PlansPage />
        )}

        {currentTab === 'plans' && (
          <PlansPage />
        )}

        {currentTab === 'plans' && (
          <PlansPage />
        )}

        {currentTab === 'community' && (
          <CommunityProblemBoard
            problems={problems}
            currentUser={user}
            onPostProblem={handlePostProblem}
            onAddResponse={handleAddProblemResponse}
            onMarkSolved={handleMarkProblemSolved}
            onDeleteProblem={handleDeleteProblem}
            onDeleteResponse={handleDeleteProblemResponse}
            onRequireAuth={() => setAuthModalOpen(true)}
          />
        )}

        {currentTab === 'role-selection' && user && (
          <RoleSelection
            userName={user.name}
            onSelectRole={handleSelectRole}
            onCancel={() => setCurrentTab('hero')}
          />
        )}

        {currentTab === 'onboarding' && user && (
          <OnboardingFlow
            user={user}
            onComplete={handleOnboardingComplete}
            onCancel={() => setCurrentTab('hero')}
          />
        )}

        {currentTab === 'dashboard' && user && (
          <>
            {live ? (
              session.isMentor ? (
                <MentorInbox session={session} />
              ) : (
                <>
                  <StudentWorkspace
                    session={session}
                    onOpenRoadmap={() => setCurrentTab('roadmaps')}
                    onOpenMatches={() => setCurrentTab('mentors')}
                    onOpenAgent={() => setCurrentTab('agent')}
                    onOpenAssessment={() => setCurrentTab('assess')}
                  />
                  <AgentPanel session={session} />
                </>
              )
            ) : (
              <>
                <SampleNotice what="Dashboard" />
                {user.role === 'mentor' ? (
                  <MentorDashboard
                user={user}
                requests={requests}
                onAcceptRequest={handleAcceptRequest}
                onDeclineRequest={handleDeclineRequest}
                onOpenHero={() => setCurrentTab('hero')}
                onOpenChat={(channelId, recipientName, recipientRole, recipientAvatar, topic) =>
                  setActiveChat({ channelId, recipientName, recipientRole, recipientAvatar, topic })
                }
              />
            ) : (
              <>
              <MenteeDashboard
                user={user}
                requests={requests}
                roadmap={roadmap}
                onExploreMentors={() => {
                  setCurrentTab('mentors');
                  window.scrollTo({ top: 0, behavior: 'smooth' });
                }}
                onViewRoadmap={() => {
                  setCurrentTab('roadmaps');
                  window.scrollTo({ top: 0, behavior: 'smooth' });
                }}
                onOpenHero={() => setCurrentTab('hero')}
                onOpenChat={(channelId, recipientName, recipientRole, recipientAvatar, topic) =>
                  setActiveChat({ channelId, recipientName, recipientRole, recipientAvatar, topic })
                }
              />
                  {/* The agent lives on the student dashboard, where approvals belong. */}
                  <AgentPanel session={session} />
                </>
              )}
              </>
            )}
          </>
        )}
      </main>

      {/* Verification controller for the four CTA rules. Development only, or a built
          site that opts in with ?qa=1, so it is not part of what a visitor sees. */}
      {qaControlsEnabled(window.location.search, import.meta.env.DEV) && (
        <StateSwitcherBar
          currentUser={user}
          onSetScenario={handleSetScenario}
        />
      )}

      {/* Authentication Modal */}
      <AuthModal
        isOpen={authModalOpen}
        onClose={() => setAuthModalOpen(false)}
        onSuccess={handleAuthSuccess}
      />

      {/* Mentor Detail & Booking Modal */}
      <MentorDetailModal
        mentor={inspectedMentor}
        onClose={() => setInspectedMentor(null)}
        onRequestMentorship={handleRequestMentorship}
        user={user}
        onRequireAuth={() => setAuthModalOpen(true)}
      />

      {/* The assistant, as a floating chat. Hidden on its own screen so there is never a
          chat inside a chat. */}
      {currentTab !== 'assistant' && (
        <AssistantDock
          session={session}
          onRequestMentor={handleAssistantRequestMentor}
          onBrowseMentors={openMentorsDirectory}
        />
      )}

      {/* Multimedia Chat Drawer with Video, Photos & Voice Notes */}
      {activeChat && (
        <ChatDrawer
          isOpen={Boolean(activeChat)}
          channelId={activeChat.channelId}
          recipientName={activeChat.recipientName}
          recipientRole={activeChat.recipientRole}
          recipientAvatar={activeChat.recipientAvatar}
          topic={activeChat.topic}
          currentUserName={user?.name || 'Taylor Morgan'}
          onClose={() => setActiveChat(null)}
        />
      )}
    </div>
  );
}
