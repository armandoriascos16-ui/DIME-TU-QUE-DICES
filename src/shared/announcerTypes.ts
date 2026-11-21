import type { LeaderboardEntry } from './types';

export type AnnouncerStyle =
  | 'misterioso'
  | 'competitivo'
  | 'divertido'
  | 'solemne'
  | 'juvenil';

export type SuspenseLevel = 'bajo' | 'medio' | 'alto' | 'cinematografico';

export type AnnouncerVoiceName =
  | 'Charon'
  | 'Fenrir'
  | 'Kore'
  | 'Puck'
  | 'Zephyr';

export type AnnouncerAudioTarget = 'auto' | 'projector' | 'presenter' | 'both';

export type AnnouncerStage =
  | 'idle'
  | 'intro_suspense'
  | 'third_place'
  | 'second_place'
  | 'first_place'
  | 'last_place'
  | 'complete';

export type AnnouncerSfxCueKey =
  | 'suspenseMusic'
  | 'drumroll'
  | 'winnerFanfare'
  | 'topThreeSting'
  | 'lastPlaceSting'
  | 'closingMusic';

export interface AnnouncerSfxToggles {
  suspenseMusic: boolean;
  drumroll: boolean;
  winnerFanfare: boolean;
  topThreeSting: boolean;
  lastPlaceSting: boolean;
  closingMusic: boolean;
}

export interface AnnouncerConfig {
  enabled: boolean;
  autoAnnounce: boolean;
  progressiveReveal: boolean;
  mutedVoice: boolean;
  musicEnabled: boolean;
  voiceVolume: number; // 0..1
  musicVolume: number; // 0..1
  sfxVolume: number; // 0..1
  sfxToggles: AnnouncerSfxToggles;
  style: AnnouncerStyle;
  suspenseLevel: SuspenseLevel;
  voiceName: AnnouncerVoiceName;
  audioTarget: AnnouncerAudioTarget;
  pronunciationOverrides: Record<string, string>;
}

export interface AnnouncerRoomState {
  config: AnnouncerConfig;
  stage: AnnouncerStage;
  unlockedStages: AnnouncerStage[];
  activeCueIndex: number;
  highlightedParticipantIds: string[];
  ceremonyRunId: string | null;
  ceremonyVariationSeed: number;
  triggeredForFinishedAt: number | null;
  updatedAt: number;
}

export type AnnouncerCuePreSfx =
  | 'suspense_intro'
  | 'drumroll'
  | 'top3_sting'
  | 'winner_fanfare'
  | 'last_place_sting'
  | 'closing';

export interface AnnouncerCue {
  id: string;
  stage: AnnouncerStage;
  title: string;
  rankLabel: string;
  spokenText: string;
  displayText: string;
  highlightedParticipantIds: string[];
  highlightedEntries: LeaderboardEntry[];
  isTie: boolean;
  preSfx?: AnnouncerCuePreSfx;
  postSfx?: AnnouncerCuePreSfx;
  pauseBeforeMs: number;
}

export interface AnnouncerAnnouncementPlan {
  ceremonyRunId: string;
  participantCount: number;
  hasAnyTie: boolean;
  cues: AnnouncerCue[];
}

export const ANNOUNCER_STYLE_META: Record<
  AnnouncerStyle,
  { label: string; description: string; defaultVoice: AnnouncerVoiceName }
> = {
  misterioso: {
    label: 'Misterioso',
    description: 'Pausado, profundo y con suspenso cinematográfico de concurso.',
    defaultVoice: 'Charon',
  },
  competitivo: {
    label: 'Competitivo',
    description: 'Enérgico, intenso y vibrante como final de campeonato.',
    defaultVoice: 'Fenrir',
  },
  divertido: {
    label: 'Divertido',
    description: 'Dinámico, cercano y con humor respetuoso y edificante.',
    defaultVoice: 'Puck',
  },
  solemne: {
    label: 'Solemne',
    description: 'Serio, ceremonial y con tono digno de premiación especial.',
    defaultVoice: 'Charon',
  },
  juvenil: {
    label: 'Juvenil',
    description: 'Fresco, natural y expresivo para Sociedad de Jóvenes.',
    defaultVoice: 'Zephyr',
  },
};

export const ANNOUNCER_SUSPENSE_META: Record<
  SuspenseLevel,
  { label: string; preDelayMs: number }
> = {
  bajo: { label: 'Suave', preDelayMs: 350 },
  medio: { label: 'Equilibrado', preDelayMs: 700 },
  alto: { label: 'Alto', preDelayMs: 1150 },
  cinematografico: { label: 'Cinematográfico', preDelayMs: 1650 },
};

export const ANNOUNCER_VOICE_META: Record<
  AnnouncerVoiceName,
  { label: string; tone: string }
> = {
  Charon: { label: 'Mateo (Profunda)', tone: 'Voz grave, serena y con autoridad de anfitrión' },
  Fenrir: { label: 'Gabriel (Intensa)', tone: 'Voz firme, enérgica e imponente' },
  Kore: { label: 'Valeria (Clara)', tone: 'Voz femenina clara, cálida y expresiva' },
  Puck: { label: 'Lucas (Dinámica)', tone: 'Voz ágil, alegre y entusiasta' },
  Zephyr: { label: 'Camila (Juvenil)', tone: 'Voz fresca, natural y cercana' },
};

export function createDefaultAnnouncerConfig(): AnnouncerConfig {
  return {
    enabled: true,
    autoAnnounce: true,
    progressiveReveal: true,
    mutedVoice: false,
    musicEnabled: true,
    voiceVolume: 0.95,
    musicVolume: 0.42,
    sfxVolume: 0.78,
    sfxToggles: {
      suspenseMusic: true,
      drumroll: true,
      winnerFanfare: true,
      topThreeSting: true,
      lastPlaceSting: true,
      closingMusic: true,
    },
    style: 'misterioso',
    suspenseLevel: 'alto',
    voiceName: 'Charon',
    audioTarget: 'auto',
    pronunciationOverrides: {},
  };
}

export function createInitialAnnouncerRoomState(
  partial?: Partial<AnnouncerConfig>
): AnnouncerRoomState {
  const defaults = createDefaultAnnouncerConfig();
  return {
    config: {
      ...defaults,
      ...(partial || {}),
      sfxToggles: {
        ...defaults.sfxToggles,
        ...(partial?.sfxToggles || {}),
      },
      pronunciationOverrides: {
        ...(partial?.pronunciationOverrides || {}),
      },
    },
    stage: 'idle',
    unlockedStages: [],
    activeCueIndex: -1,
    highlightedParticipantIds: [],
    ceremonyRunId: null,
    ceremonyVariationSeed: Math.floor(Math.random() * 10000),
    triggeredForFinishedAt: null,
    updatedAt: Date.now(),
  };
}
