import React, { useState, useRef, useEffect } from 'react';
import {
  X,
  Send,
  Image,
  Video,
  Mic,
  Square,
  Play,
  Pause,
  Paperclip,
  CheckCheck,
  FileText,
  Trash2,
  Upload,
  AlertTriangle,
} from 'lucide-react';
import { ChatMessage, ChatAttachment } from '../types.ts';

interface ChatDrawerProps {
  isOpen: boolean;
  channelId: string;
  recipientName: string;
  recipientRole: string;
  recipientAvatar: string;
  topic?: string;
  currentUserName: string;
  onClose: () => void;
}

type AttachmentKind = 'image' | 'video' | 'voice' | 'file';

interface StagedFile {
  id: string;
  kind: AttachmentKind;
  url: string;
  name: string;
  size: number;
  duration?: string;
}

/** Ceilings per kind. A file that is too large is refused rather than trimmed. */
const LIMITS: Record<AttachmentKind, number> = {
  image: 15 * 1024 * 1024,
  video: 300 * 1024 * 1024,
  voice: 30 * 1024 * 1024,
  file: 50 * 1024 * 1024,
};

const ACCEPT: Record<'image' | 'video' | 'file', string> = {
  image: 'image/*',
  video: 'video/*',
  file: '*',
};

const KIND_LABEL: Record<AttachmentKind, string> = {
  image: 'Photo',
  video: 'Video',
  voice: 'Voice note',
  file: 'File',
};

const formatBytes = (bytes: number): string => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

const formatClock = (seconds: number): string => {
  const whole = Math.max(0, Math.round(seconds));
  const mins = Math.floor(whole / 60);
  const secs = whole % 60;
  return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
};

const newId = (prefix: string): string =>
  `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

const classify = (file: File): AttachmentKind => {
  if (file.type.startsWith('image/')) return 'image';
  if (file.type.startsWith('video/')) return 'video';
  if (file.type.startsWith('audio/')) return 'voice';
  return 'file';
};

/** Read a video's real duration from the file itself, or null if it cannot be read. */
const probeVideoDuration = (file: File): Promise<number | null> =>
  new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const el = document.createElement('video');
    let settled = false;
    const finish = (value: number | null) => {
      if (settled) return;
      settled = true;
      URL.revokeObjectURL(url);
      resolve(value);
    };
    el.preload = 'metadata';
    el.onloadedmetadata = () => finish(Number.isFinite(el.duration) ? el.duration : null);
    el.onerror = () => finish(null);
    window.setTimeout(() => finish(null), 5000);
    el.src = url;
  });

export const ChatDrawer: React.FC<ChatDrawerProps> = ({
  isOpen,
  channelId,
  recipientName,
  recipientRole,
  recipientAvatar,
  topic,
  currentUserName,
  onClose,
}) => {
  // Store messages per channel in state & sync with localStorage
  const [messages, setMessages] = useState<ChatMessage[]>(() => {
    try {
      const saved = localStorage.getItem(`pathfinders_chat_${channelId}`);
      if (saved) {
        const parsed = JSON.parse(saved) as ChatMessage[];
        // A file is held only for the session it was attached in. Anything loaded from
        // storage keeps its name and size but never a remote link.
        return parsed.map((msg) =>
          msg.attachment && !msg.attachment.url.startsWith('blob:')
            ? { ...msg, attachment: { ...msg.attachment, url: '' } }
            : msg
        );
      }
    } catch {}

    // Default introductory message for this channel
    return [
      {
        id: `msg-${channelId}-init`,
        sender: 'other',
        senderName: recipientName,
        text: `Hi ${currentUserName}! Looking forward to working on "${topic || 'our mentorship goals'}". Feel free to send screenshots, architecture diagrams, video walkthroughs, or voice notes here before our session!`,
        timestamp: 'Yesterday at 3:30 PM',
      },
    ];
  });

  const [inputText, setInputText] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [isRecordingVoice, setIsRecordingVoice] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [staged, setStaged] = useState<StagedFile[]>([]);
  const [captionInput, setCaptionInput] = useState('');
  const [attachError, setAttachError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  // Voice note playback tracking: id -> isPlaying
  const [playingVoiceId, setPlayingVoiceId] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const recordingTimerRef = useRef<number | null>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const audioRefs = useRef<Record<string, HTMLAudioElement | null>>({});
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const stagedRef = useRef<StagedFile[]>([]);
  const messagesRef = useRef<ChatMessage[]>([]);

  useEffect(() => {
    stagedRef.current = staged;
  }, [staged]);

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  // Sync to local storage. A file attached in this session lives only in memory, so its
  // object URL is stripped before it is written: what is stored is the message, not a
  // link that would be dead after a reload.
  useEffect(() => {
    try {
      const persisted = messages.map((msg) =>
        msg.attachment && msg.attachment.url
          ? { ...msg, attachment: { ...msg.attachment, url: '' } }
          : msg
      );
      localStorage.setItem(`pathfinders_chat_${channelId}`, JSON.stringify(persisted));
    } catch {}
    // Guarded: a missing or non-element ref must never break sending a message.
    const end = messagesEndRef.current;
    if (end && typeof end.scrollIntoView === 'function') {
      end.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, channelId, isTyping]);

  // Voice recording timer
  useEffect(() => {
    if (isRecordingVoice) {
      setRecordingSeconds(0);
      recordingTimerRef.current = window.setInterval(() => {
        setRecordingSeconds((prev) => prev + 1);
      }, 1000);
    } else {
      if (recordingTimerRef.current) clearInterval(recordingTimerRef.current);
    }
    return () => {
      if (recordingTimerRef.current) clearInterval(recordingTimerRef.current);
    };
  }, [isRecordingVoice]);

  // Release every object URL and stop the microphone when the drawer goes away
  useEffect(
    () => () => {
      stagedRef.current.forEach((item) => URL.revokeObjectURL(item.url));
      messagesRef.current.forEach((msg) => {
        if (msg.attachment?.url.startsWith('blob:')) URL.revokeObjectURL(msg.attachment.url);
      });
      if (recorderRef.current && recorderRef.current.state !== 'inactive') {
        recorderRef.current.stop();
      }
      streamRef.current?.getTracks().forEach((track) => track.stop());
    },
    []
  );

  if (!isOpen) return null;

  const addFiles = (files: FileList | null, only: AttachmentKind | 'auto' = 'auto') => {
    if (!files || files.length === 0) return;

    const accepted: StagedFile[] = [];
    const refused: string[] = [];

    Array.from(files).forEach((file) => {
      const kind = only === 'auto' ? classify(file) : only;

      if (file.size === 0) {
        refused.push(`${file.name} is empty`);
        return;
      }
      if (kind === 'image' && !file.type.startsWith('image/')) {
        refused.push(`${file.name} is not an image`);
        return;
      }
      if (kind === 'video' && !file.type.startsWith('video/')) {
        refused.push(`${file.name} is not a video`);
        return;
      }
      if (file.size > LIMITS[kind]) {
        refused.push(
          `${file.name} is ${formatBytes(file.size)}, over the ${formatBytes(LIMITS[kind])} limit`
        );
        return;
      }

      accepted.push({
        id: newId('file'),
        kind,
        url: URL.createObjectURL(file),
        name: file.name,
        size: file.size,
      });
    });

    if (accepted.length > 0) {
      setStaged((prev) => [...prev, ...accepted]);
      setAttachError(null);
    }
    if (refused.length > 0) {
      setAttachError(refused.slice(0, 2).join('. '));
    }

    // Fill in real durations for videos, read from the file rather than guessed
    const picked = Array.from(files);
    accepted
      .filter((item) => item.kind === 'video')
      .forEach((item) => {
        const source = picked.find((f) => f.name === item.name);
        if (!source) return;
        void probeVideoDuration(source).then((seconds) => {
          if (seconds === null) return;
          setStaged((prev) =>
            prev.map((entry) =>
              entry.id === item.id ? { ...entry, duration: formatClock(seconds) } : entry
            )
          );
        });
      });
  };

  const removeStaged = (id: string) => {
    setStaged((prev) => {
      const going = prev.find((item) => item.id === id);
      if (going) URL.revokeObjectURL(going.url);
      return prev.filter((item) => item.id !== id);
    });
  };

  const clearStaged = () => {
    staged.forEach((item) => URL.revokeObjectURL(item.url));
    setStaged([]);
    setCaptionInput('');
    setAttachError(null);
  };

  const handleSendTextMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputText.trim()) return;

    const newMsg: ChatMessage = {
      id: newId('msg'),
      sender: 'user',
      senderName: currentUserName,
      text: inputText.trim(),
      timestamp: 'Just now',
    };

    setMessages((prev) => [...prev, newMsg]);
    setInputText('');
    triggerAutoReply('text');
  };

  const startRecording = async () => {
    setAttachError(null);

    if (typeof MediaRecorder === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      setAttachError('This browser cannot record audio here. Attach a voice file instead.');
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      chunksRef.current = [];

      const recorder = new MediaRecorder(stream);
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data);
      };
      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || 'audio/webm' });
        stream.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
        recorderRef.current = null;

        if (blob.size === 0) {
          setAttachError('Nothing was recorded, so no voice note was created.');
          return;
        }
        if (blob.size > LIMITS.voice) {
          setAttachError(
            `That recording is ${formatBytes(blob.size)}, over the ${formatBytes(LIMITS.voice)} limit.`
          );
          return;
        }

        setStaged((prev) => [
          ...prev,
          {
            id: newId('voice'),
            kind: 'voice',
            url: URL.createObjectURL(blob),
            name: `Voice note ${new Date().toLocaleTimeString()}`,
            size: blob.size,
            duration: formatClock(recordingSeconds || 0),
          },
        ]);
      };

      recorderRef.current = recorder;
      recorder.start();
      setIsRecordingVoice(true);
    } catch {
      setAttachError('The microphone was not shared, so no voice note was recorded.');
      streamRef.current = null;
    }
  };

  const stopRecording = () => {
    setIsRecordingVoice(false);
    const recorder = recorderRef.current;
    if (recorder && recorder.state !== 'inactive') recorder.stop();
  };

  const cancelRecording = () => {
    setIsRecordingVoice(false);
    chunksRef.current = [];
    const recorder = recorderRef.current;
    if (recorder) {
      recorder.onstop = null;
      if (recorder.state !== 'inactive') recorder.stop();
    }
    recorderRef.current = null;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  };

  const sendStaged = () => {
    if (staged.length === 0) return;

    const caption = captionInput.trim();
    const base = Date.now();
    const kinds = new Set(staged.map((item) => item.kind));

    const sent: ChatMessage[] = staged.map((item, index) => ({
      id: `msg-${base}-${index}`,
      sender: 'user',
      senderName: currentUserName,
      text: index === 0 ? caption || `Sent ${KIND_LABEL[item.kind].toLowerCase()}` : undefined,
      attachment: {
        type: item.kind,
        url: item.url,
        name: item.name,
        size: item.size,
        duration: item.duration,
      } as ChatAttachment,
      timestamp: 'Just now',
    }));

    setMessages((prev) => [...prev, ...sent]);
    setStaged([]);
    setCaptionInput('');
    setAttachError(null);

    const main: AttachmentKind = kinds.size === 1 ? staged[0].kind : 'file';
    triggerAutoReply(main);
  };

  const triggerAutoReply = (type: AttachmentKind | 'text') => {
    setIsTyping(true);
    setTimeout(() => {
      setIsTyping(false);
      let replyText = '';
      if (type === 'voice') {
        replyText = `Listened to your audio note! Your breakdown of the problem makes complete sense. Let's make that our first agenda topic.`;
      } else if (type === 'image') {
        replyText = `Thanks for sending the diagram! The component topology looks solid. I noticed a potential bottleneck in the caching layer. We will trace it during our call.`;
      } else if (type === 'video') {
        replyText = `Watched the video recording. Seeing the reproduction of the latency spike in real time is super helpful.`;
      } else if (type === 'file') {
        replyText = `Got the file, thank you. I will read through it before our call and bring questions.`;
      } else {
        replyText = `Got your message! I'm reviewing the context now and will bring actionable recommendations to our one on one.`;
      }

      const replyMsg: ChatMessage = {
        id: newId('reply'),
        sender: 'other',
        senderName: recipientName,
        text: replyText,
        timestamp: 'Just now',
      };
      setMessages((prev) => [...prev, replyMsg]);
    }, 1400);
  };

  const toggleVoicePlayback = (id: string) => {
    const el = audioRefs.current[id];
    if (!el) return;

    if (playingVoiceId === id) {
      el.pause();
      setPlayingVoiceId(null);
      return;
    }

    Object.entries(audioRefs.current).forEach(([key, audio]) => {
      if (key !== id && audio) audio.pause();
    });
    el.currentTime = 0;
    const played = el.play();
    setPlayingVoiceId(id);
    if (played && typeof played.catch === 'function') {
      played.catch(() => {
        setPlayingVoiceId(null);
        setAttachError('That voice note could not be played back in this browser.');
      });
    }
  };

  const durationLabel = `0:${recordingSeconds < 10 ? '0' : ''}${recordingSeconds}`;

  return (
    <div
      role="dialog"
      aria-modal="true"
      onDragOver={(e) => {
        e.preventDefault();
        setIsDragging(true);
      }}
      onDragLeave={() => setIsDragging(false)}
      onDrop={(e) => {
        e.preventDefault();
        setIsDragging(false);
        addFiles(e.dataTransfer.files);
      }}
      className="fixed inset-0 z-50 flex justify-end bg-black/60 backdrop-blur-sm animate-fade-rise"
    >
      <div className="w-full max-w-lg bg-[#00172e] border-l border-white/10 h-full flex flex-col text-white shadow-2xl relative">
        {isDragging && (
          <div className="absolute inset-0 z-20 pointer-events-none flex items-center justify-center bg-[#00172e]/80 border-2 border-dashed border-emerald-400/60">
            <div className="flex flex-col items-center gap-2 text-emerald-300">
              <Upload className="w-8 h-8" />
              <span className="text-sm font-medium">Drop to attach from this device</span>
            </div>
          </div>
        )}

        {/* Chat Header */}
        <div className="p-4 sm:p-5 border-b border-white/10 flex items-center justify-between bg-white/[0.02]">
          <div className="flex items-center gap-3 min-w-0">
            <div className="relative shrink-0">
              <img
                src={recipientAvatar}
                alt={recipientName}
                className="w-10 h-10 rounded-full object-cover ring-2 ring-emerald-500/30"
              />
              <span className="absolute bottom-0 right-0 w-2.5 h-2.5 bg-emerald-400 border-2 border-[#00172e] rounded-full" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-medium text-white truncate">{recipientName}</h3>
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                  Channel #{channelId.replace(/[^a-zA-Z0-9]/g, '').slice(-4)}
                </span>
              </div>
              <div className="text-xs text-white/50 truncate">{recipientRole}</div>
              {topic && (
                <div className="text-[11px] text-white/70 italic truncate mt-0.5">
                  Focus: {topic}
                </div>
              )}
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close chat"
            className="p-1.5 rounded-lg text-white/50 hover:text-white hover:bg-white/5 transition-colors shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Messages List */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          <div className="text-center my-1">
            <span className="text-[10px] uppercase tracking-wider px-2.5 py-0.5 rounded-full bg-white/5 text-white/40">
              Dedicated Mentorship Channel · Voice, Photo, Video and Files
            </span>
          </div>

          {messages.map((msg) => {
            const isMe = msg.sender === 'user';
            const attachment = msg.attachment;
            const hasFile = Boolean(attachment && attachment.url);
            return (
              <div
                key={msg.id}
                className={`flex flex-col ${isMe ? 'items-end' : 'items-start'}`}
              >
                <div className="text-[10px] text-white/40 mb-1 px-1">
                  {isMe ? 'You' : msg.senderName}
                </div>

                <div
                  className={`max-w-[85%] rounded-2xl px-4 py-3 text-xs sm:text-sm leading-relaxed ${
                    isMe
                      ? 'bg-white text-gray-900 font-normal rounded-tr-sm shadow-md'
                      : 'bg-white/[0.08] text-white/95 border border-white/10 rounded-tl-sm'
                  }`}
                >
                  {/* Text Body */}
                  {msg.text && (
                    <div className={attachment ? 'mb-2 font-medium' : ''}>
                      {msg.text}
                    </div>
                  )}

                  {/* An attachment whose file is no longer in memory */}
                  {attachment && !hasFile && (
                    <div
                      className={`flex items-start gap-2 text-[11px] ${
                        isMe ? 'text-gray-600' : 'text-white/60'
                      }`}
                    >
                      <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                      <span>
                        {attachment.name ? `${attachment.name}: ` : ''}
                        attached in an earlier session and no longer held. Attach it again to share it.
                      </span>
                    </div>
                  )}

                  {attachment?.type === 'image' && hasFile && (
                    <div className="rounded-xl overflow-hidden border border-black/10 my-1">
                      <img
                        src={attachment.url}
                        alt={attachment.name || 'Shared photo'}
                        className="max-h-60 w-full object-cover"
                      />
                      <div
                        className={`px-2 py-1 text-[10px] ${
                          isMe ? 'text-gray-600' : 'text-white/60'
                        }`}
                      >
                        {attachment.name}
                        {attachment.size ? ` · ${formatBytes(attachment.size)}` : ''}
                      </div>
                    </div>
                  )}

                  {attachment?.type === 'video' && hasFile && (
                    <div className="rounded-xl overflow-hidden border border-black/10 my-1">
                      <video
                        controls
                        playsInline
                        preload="metadata"
                        src={attachment.url}
                        className="max-h-60 w-full object-cover rounded-xl"
                      />
                      <div
                        className={`px-2 py-1 text-[10px] ${
                          isMe ? 'text-gray-600' : 'text-white/60'
                        }`}
                      >
                        {attachment.name}
                        {attachment.duration ? ` · ${attachment.duration}` : ''}
                        {attachment.size ? ` · ${formatBytes(attachment.size)}` : ''}
                      </div>
                    </div>
                  )}

                  {attachment?.type === 'voice' && (
                    <div className="flex items-center gap-3 py-1">
                      {hasFile ? (
                        <>
                          <button
                            type="button"
                            onClick={() => toggleVoicePlayback(msg.id)}
                            aria-label={
                              playingVoiceId === msg.id ? 'Pause voice note' : 'Play voice note'
                            }
                            className={`w-9 h-9 rounded-full flex items-center justify-center transition-colors cursor-pointer shrink-0 ${
                              isMe
                                ? 'bg-gray-900 text-white hover:bg-black'
                                : 'bg-white text-gray-900 hover:bg-gray-100'
                            }`}
                          >
                            {playingVoiceId === msg.id ? (
                              <Pause className="w-4 h-4" />
                            ) : (
                              <Play className="w-4 h-4 ml-0.5" />
                            )}
                          </button>
                          <audio
                            ref={(el) => {
                              audioRefs.current[msg.id] = el;
                            }}
                            src={attachment.url}
                            preload="metadata"
                            onEnded={() =>
                              setPlayingVoiceId((prev) => (prev === msg.id ? null : prev))
                            }
                            className="hidden"
                          />
                        </>
                      ) : (
                        <span
                          className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 ${
                            isMe ? 'bg-gray-200 text-gray-500' : 'bg-white/10 text-white/40'
                          }`}
                        >
                          <Mic className="w-4 h-4" />
                        </span>
                      )}

                      <div className="flex-1 space-y-1">
                        {/* Audio Waveform Visualizer */}
                        <div className="flex items-center gap-1 h-4">
                          {[40, 70, 30, 90, 60, 100, 50, 80, 45, 95, 35, 75, 60].map(
                            (height, i) => (
                              <span
                                key={i}
                                className={`w-1 rounded-full transition-all ${
                                  playingVoiceId === msg.id && hasFile
                                    ? isMe
                                      ? 'bg-gray-900 animate-pulse'
                                      : 'bg-emerald-400 animate-pulse'
                                    : isMe
                                    ? 'bg-gray-400'
                                    : 'bg-white/40'
                                }`}
                                style={{ height: `${height}%` }}
                              />
                            )
                          )}
                        </div>
                        <div
                          className={`text-[10px] ${isMe ? 'text-gray-600' : 'text-white/60'}`}
                        >
                          {attachment.name || 'Voice note'}
                          {attachment.duration ? ` · ${attachment.duration}` : ''}
                        </div>
                      </div>
                    </div>
                  )}

                  {attachment?.type === 'file' && (
                    <div
                      className={`flex items-center gap-2.5 p-2 rounded-xl border ${
                        isMe ? 'border-gray-300 bg-gray-50' : 'border-white/15 bg-white/5'
                      }`}
                    >
                      <Paperclip
                        className={`w-4 h-4 shrink-0 ${isMe ? 'text-gray-600' : 'text-white/70'}`}
                      />
                      <div className="min-w-0 flex-1">
                        <div className="text-[11px] font-medium truncate">
                          {attachment.name || 'File'}
                        </div>
                        <div
                          className={`text-[10px] ${isMe ? 'text-gray-600' : 'text-white/60'}`}
                        >
                          {attachment.size ? formatBytes(attachment.size) : 'size unknown'}
                          {hasFile ? '' : ' · no longer held'}
                        </div>
                      </div>
                      {hasFile && (
                        <a
                          href={attachment.url}
                          download={attachment.name || 'file'}
                          className={`text-[10px] px-2 py-1 rounded-lg shrink-0 ${
                            isMe
                              ? 'bg-gray-900 text-white hover:bg-black'
                              : 'bg-white text-gray-900 hover:bg-gray-100'
                          }`}
                        >
                          Open
                        </a>
                      )}
                    </div>
                  )}
                </div>

                <div className="flex items-center gap-1 text-[10px] text-white/40 mt-1 px-1">
                  <span>{msg.timestamp}</span>
                  {isMe && <CheckCheck className="w-3 h-3 text-emerald-400" />}
                </div>
              </div>
            );
          })}

          {isTyping && (
            <div className="flex items-center gap-1.5 p-3 rounded-xl bg-white/[0.05] border border-white/5 w-fit text-xs text-white/60">
              <span className="w-1.5 h-1.5 bg-white/60 rounded-full animate-bounce" />
              <span className="w-1.5 h-1.5 bg-white/60 rounded-full animate-bounce [animation-delay:0.2s]" />
              <span className="w-1.5 h-1.5 bg-white/60 rounded-full animate-bounce [animation-delay:0.4s]" />
              <span className="ml-1 text-[11px]">{recipientName} is reviewing...</span>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* A file that was refused, or a microphone that was not shared */}
        {attachError && (
          <div className="px-4 py-2 bg-amber-950/50 border-t border-amber-500/30 flex items-start gap-2 text-[11px] text-amber-200">
            <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
            <span className="flex-1">{attachError}</span>
            <button
              type="button"
              onClick={() => setAttachError(null)}
              aria-label="Dismiss message"
              className="text-amber-200/70 hover:text-amber-100 cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* Voice Note Recording State Bar */}
        {isRecordingVoice && (
          <div className="p-3 bg-red-950/60 border-t border-red-500/30 flex items-center justify-between text-xs animate-fade-rise">
            <div className="flex items-center gap-2 text-red-300 font-medium">
              <span className="w-2.5 h-2.5 rounded-full bg-red-500 animate-ping" />
              <span>Recording Voice Note... {durationLabel}</span>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={cancelRecording}
                className="px-2.5 py-1 text-white/60 hover:text-white text-xs cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={stopRecording}
                className="px-3 py-1 bg-red-500 hover:bg-red-600 text-white rounded-lg font-medium text-xs flex items-center gap-1.5 cursor-pointer"
              >
                <Square className="w-3 h-3 fill-white" />
                <span>Stop recording</span>
              </button>
            </div>
          </div>
        )}

        {/* Files chosen from this device, waiting to be sent */}
        {staged.length > 0 && (
          <div className="p-4 bg-[#001f3f] border-t border-white/10 space-y-3 animate-fade-rise">
            <div className="flex items-center justify-between text-xs text-white font-medium">
              <span>
                {staged.length} {staged.length === 1 ? 'file' : 'files'} from this device, ready to send
              </span>
              <button
                type="button"
                onClick={clearStaged}
                aria-label="Remove all attachments"
                className="text-white/50 hover:text-white cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex gap-2 overflow-x-auto pb-1">
              {staged.map((item) => (
                <div
                  key={item.id}
                  className="relative shrink-0 w-28 rounded-xl border border-white/15 bg-white/5 overflow-hidden"
                >
                  {item.kind === 'image' && (
                    <img src={item.url} alt={item.name} className="w-28 h-20 object-cover" />
                  )}
                  {item.kind === 'video' && (
                    <video
                      src={item.url}
                      muted
                      playsInline
                      preload="metadata"
                      className="w-28 h-20 object-cover"
                    />
                  )}
                  {item.kind === 'voice' && (
                    <div className="w-28 h-20 flex flex-col items-center justify-center gap-1 text-rose-300">
                      <Mic className="w-5 h-5" />
                      <span className="text-[10px]">{item.duration || '0:00'}</span>
                    </div>
                  )}
                  {item.kind === 'file' && (
                    <div className="w-28 h-20 flex flex-col items-center justify-center gap-1 px-1 text-white/70">
                      <FileText className="w-5 h-5" />
                      <span className="text-[9px] text-center leading-tight break-all">
                        {item.name}
                      </span>
                    </div>
                  )}

                  <div className="px-1.5 py-1 text-[9px] text-white/60 truncate">
                    {formatBytes(item.size)}
                  </div>

                  <button
                    type="button"
                    onClick={() => removeStaged(item.id)}
                    aria-label={`Remove ${item.name}`}
                    className="absolute top-1 right-1 p-1 rounded-lg bg-black/60 text-white/80 hover:text-white cursor-pointer"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              ))}
            </div>

            <div className="flex gap-2">
              <input
                type="text"
                value={captionInput}
                onChange={(e) => setCaptionInput(e.target.value)}
                placeholder="Add a note for the first attachment (optional)"
                className="flex-1 px-3 py-2 rounded-xl bg-white/5 border border-white/10 text-xs text-white placeholder:text-white/30 focus:outline-none focus:border-white/40"
              />
              <button
                type="button"
                onClick={sendStaged}
                className="px-3 py-2 rounded-xl bg-white text-gray-900 font-medium text-xs hover:bg-gray-100 transition-colors cursor-pointer shrink-0"
              >
                Send {staged.length === 1 ? KIND_LABEL[staged[0].kind].toLowerCase() : `${staged.length} files`}
              </button>
            </div>
          </div>
        )}

        {/* Message Input Toolbar & Form */}
        <div className="p-3.5 border-t border-white/10 bg-white/[0.02]">
          <input
            ref={imageInputRef}
            type="file"
            accept={ACCEPT.image}
            multiple
            className="hidden"
            onChange={(e) => {
              addFiles(e.target.files, 'image');
              e.target.value = '';
            }}
          />
          <input
            ref={videoInputRef}
            type="file"
            accept={ACCEPT.video}
            multiple
            className="hidden"
            onChange={(e) => {
              addFiles(e.target.files, 'video');
              e.target.value = '';
            }}
          />
          <input
            ref={fileInputRef}
            type="file"
            accept={ACCEPT.file}
            multiple
            className="hidden"
            onChange={(e) => {
              addFiles(e.target.files, 'file');
              e.target.value = '';
            }}
          />

          {/* Action icons bar: Photo, Video, File, Voice note */}
          <div className="flex items-center gap-1 mb-2 text-white/60">
            <button
              type="button"
              onClick={() => imageInputRef.current?.click()}
              title="Choose a photo from this device"
              className="p-1.5 rounded-lg hover:text-white hover:bg-white/10 transition-colors cursor-pointer flex items-center gap-1 text-xs"
            >
              <Image className="w-4 h-4 text-emerald-400" />
              <span className="text-[11px] hidden sm:inline">Photo</span>
            </button>

            <button
              type="button"
              onClick={() => videoInputRef.current?.click()}
              title="Choose a video from this device"
              className="p-1.5 rounded-lg hover:text-white hover:bg-white/10 transition-colors cursor-pointer flex items-center gap-1 text-xs"
            >
              <Video className="w-4 h-4 text-sky-400" />
              <span className="text-[11px] hidden sm:inline">Video</span>
            </button>

            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              title="Choose any file from this device"
              className="p-1.5 rounded-lg hover:text-white hover:bg-white/10 transition-colors cursor-pointer flex items-center gap-1 text-xs"
            >
              <Paperclip className="w-4 h-4 text-amber-300" />
              <span className="text-[11px] hidden sm:inline">File</span>
            </button>

            <button
              type="button"
              onClick={() => (isRecordingVoice ? stopRecording() : void startRecording())}
              title="Record a voice note"
              className={`p-1.5 rounded-lg transition-colors cursor-pointer flex items-center gap-1 text-xs ${
                isRecordingVoice ? 'text-red-400 bg-red-500/20' : 'hover:text-white hover:bg-white/10'
              }`}
            >
              <Mic className="w-4 h-4 text-rose-400" />
              <span className="text-[11px] hidden sm:inline">Voice Note</span>
            </button>

            <span className="ml-auto text-[10px] text-white/30 hidden sm:inline">
              Files come from your device and are held for this session only
            </span>
          </div>

          <form onSubmit={handleSendTextMessage} className="flex gap-2">
            <input
              type="text"
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              placeholder="Type your message, questions, or updates..."
              className="flex-1 px-3.5 py-2.5 rounded-xl bg-white/5 border border-white/10 text-xs sm:text-sm text-white placeholder:text-white/30 focus:outline-none focus:border-white/40"
            />
            <button
              type="submit"
              disabled={!inputText.trim()}
              className="p-2.5 rounded-xl bg-white text-gray-900 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-gray-100 transition-colors cursor-pointer shrink-0"
            >
              <Send className="w-4 h-4" />
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};
