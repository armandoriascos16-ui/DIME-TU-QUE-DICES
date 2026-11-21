import type { LeaderboardEntry } from './types';
import {
  ANNOUNCER_SUSPENSE_META,
  type AnnouncerAnnouncementPlan,
  type AnnouncerConfig,
  type AnnouncerCue,
  type AnnouncerStage,
  type AnnouncerStyle,
  type SuspenseLevel,
} from './announcerTypes';

export interface ScoreTier {
  competitionRank: number; // 1, 2, 3, etc. (1,1,3 when 2 tie for 1st)
  score: number;
  entries: LeaderboardEntry[];
}

/**
 * Groups authoritative server leaderboard entries into score tiers so ties at any
 * position are accurately identified without altering server rankings or scores.
 */
export function buildScoreTiers(leaderboard: LeaderboardEntry[]): ScoreTier[] {
  if (!Array.isArray(leaderboard) || leaderboard.length === 0) return [];
  const tiers: ScoreTier[] = [];

  for (let i = 0; i < leaderboard.length; i++) {
    const entry = leaderboard[i];
    const prevTier = tiers[tiers.length - 1];
    if (prevTier && prevTier.score === entry.score) {
      prevTier.entries.push(entry);
    } else {
      tiers.push({
        competitionRank: i + 1,
        score: entry.score,
        entries: [entry],
      });
    }
  }

  return tiers;
}

/**
 * Cleans visual symbols/emojis out of a name for crisp TTS reading while
 * preserving accents, ñ, and director-provided phonetic overrides.
 */
export function resolveSpokenParticipantName(
  entry: Pick<LeaderboardEntry, 'participantId' | 'name'>,
  overrides: Record<string, string> = {}
): string {
  const byId = overrides[entry.participantId]?.trim();
  if (byId) return byId;

  const byExactName = overrides[entry.name.trim().toLowerCase()]?.trim();
  if (byExactName) return byExactName;

  // Strip emojis / decorative symbols, collapse excessive whitespace
  const cleaned = entry.name
    .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu, ' ')
    .replace(/[_|~^*<>#]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (!cleaned) return entry.name.trim() || 'Participante';

  // Insert subtle pause comma for very long multi-word names (> 3 words) so TTS breathes naturally
  const words = cleaned.split(' ');
  if (words.length >= 5) {
    return `${words.slice(0, 2).join(' ')} ${words.slice(2).join(' ')}`;
  }

  return cleaned;
}

function startsWithISound(word: string): boolean {
  const normalized = word
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
  return /^h?i(?!a|e|o|u)/i.test(normalized) || /^y\b/i.test(normalized);
}

export function joinSpanishNames(names: string[]): string {
  if (names.length === 0) return '';
  if (names.length === 1) return names[0];
  const last = names[names.length - 1];
  const conj = startsWithISound(last) ? 'e' : 'y';
  if (names.length === 2) {
    return `${names[0]} ${conj} ${last}`;
  }
  return `${names.slice(0, -1).join(', ')} ${conj} ${last}`;
}

function pickVariant<T>(items: T[], seed: number, offset: number): T {
  const safeSeed = Math.abs(Math.floor(seed)) + offset;
  return items[safeSeed % items.length];
}

function buildSuspenseBridge(level: SuspenseLevel): string {
  switch (level) {
    case 'bajo':
      return '...';
    case 'medio':
      return '... ...';
    case 'alto':
      return '... Un momento...';
    case 'cinematografico':
      return '... Silencio en la sala... El resultado ya está sellado...';
  }
}

export function buildGeminiStyleInstruction(
  style: AnnouncerStyle,
  suspenseLevel: SuspenseLevel
): string {
  const suspenseHint =
    suspenseLevel === 'cinematografico'
      ? 'Use long dramatic pauses before revealing participant names, lowering your vocal pitch during suspense and building up powerfully at the reveal.'
      : suspenseLevel === 'alto'
        ? 'Insert clear theatrical pauses before names and build vocal anticipation.'
        : suspenseLevel === 'medio'
          ? 'Keep balanced pacing with brief natural pauses before revealing names.'
          : 'Keep crisp, smooth pacing with short transitions.';

  const accentBase =
    'Speak in clear, natural Latin American Spanish (neutral Colombian/Latin American broadcast Spanish). Pronounce names cleanly and naturally without sounding robotic.';

  switch (style) {
    case 'misterioso':
      return `${accentBase} Persona: deep, commanding, enigmatic game-show competition host. Grave, steady, suspenseful tone with theatrical intensity and warm authority. ${suspenseHint}`;
    case 'competitivo':
      return `${accentBase} Persona: high-energy, exciting championship broadcaster and arena announcer. Crisp diction, dynamic rising inflection, thrilling celebration on winners. ${suspenseHint}`;
    case 'divertido':
      return `${accentBase} Persona: charismatic, lively youth event host with genuine warmth, upbeat pacing, playful twinkle when teasing kindly, and encouraging enthusiasm. ${suspenseHint}`;
    case 'solemne':
      return `${accentBase} Persona: dignified, formal, ceremonial awards gala presenter. Measured cadence, noble and respectful tone fitting a special Christian youth gathering. ${suspenseHint}`;
    case 'juvenil':
      return `${accentBase} Persona: relatable, friendly, enthusiastic Christian youth ministry host. Fresh, natural, expressive conversational energy that connects closely with young people. ${suspenseHint}`;
  }
}

function buildIntroLine(
  style: AnnouncerStyle,
  gameTitle: string,
  participantCount: number,
  seed: number
): { spoken: string; display: string } {
  const cleanTitle = gameTitle.trim() || 'esta gran competencia bíblica';
  const templates: Record<AnnouncerStyle, Array<() => { spoken: string; display: string }>> = {
    misterioso: [
      () => ({
        spoken: `¡Atención, participantes! El tiempo ha terminado en "${cleanTitle}"... ${participantCount} valientes han respondido... Y ahora, revelaremos la verdad del marcador.`,
        display: `¡Atención, participantes! El tiempo ha terminado en "${cleanTitle}". Ahora revelaremos el marcador final.`,
      }),
      () => ({
        spoken: `Silencio en el auditorio... Las respuestas de "${cleanTitle}" ya han sido selladas. Ha llegado el instante decisivo de conocer quiénes conquistaron el podio.`,
        display: `Silencio en el auditorio... Las respuestas de "${cleanTitle}" han sido selladas. ¡Llega el instante decisivo!`,
      }),
      () => ({
        spoken: `La prueba bíblica "${cleanTitle}" ha concluido... Cada punto contó. Prepárense, porque la tabla final está a punto de salir de las sombras.`,
        display: `La prueba "${cleanTitle}" ha concluido. ¡Prepárense para conocer los resultados finales!`,
      }),
    ],
    competitivo: [
      () => ({
        spoken: `¡Señoras y señores, qué batalla bíblica acabamos de vivir en "${cleanTitle}"! Con ${participantCount} competidores en escena, es hora de premiar a los mejores.`,
        display: `¡Qué gran competencia en "${cleanTitle}"! Es hora de premiar a los mejores de la jornada.`,
      }),
      () => ({
        spoken: `¡Se acabó el cronómetro en "${cleanTitle}"! Todo se definió por precisión y velocidad. ¡Vamos a descubrir quién sube al podio esta noche!`,
        display: `¡Se acabó el cronómetro en "${cleanTitle}"! ¡Vamos a descubrir quién sube al podio!`,
      }),
    ],
    divertido: [
      () => ({
        spoken: `¡Muy bien, jóvenes! Ya guardamos los celulares y respiramos hondo después de "${cleanTitle}". ¡Llegó el momento más esperado y emocionante: conocer los resultados!`,
        display: `¡Llegó el momento más esperado de "${cleanTitle}": vamos a conocer los resultados!`,
      }),
      () => ({
        spoken: `¡Qué energía en "${cleanTitle}"! Hubo nervios, respuestas relámpago y mucha Palabra de Dios. ¡Veamos cómo quedó el marcador oficial!`,
        display: `¡Qué energía en "${cleanTitle}"! Veamos cómo quedó el marcador oficial.`,
      }),
    ],
    solemne: [
      () => ({
        spoken: `Estimados participantes de "${cleanTitle}", agradecemos su dedicación y amor por las Escrituras. Procedemos ahora a anunciar con honor los resultados oficiales.`,
        display: `Agradecemos su dedicación en "${cleanTitle}". Anunciamos ahora los resultados oficiales.`,
      }),
      () => ({
        spoken: `Concluida esta jornada de "${cleanTitle}", es un privilegio reconocer el esfuerzo, la preparación y el conocimiento bíblico de cada participante.`,
        display: `Concluida la jornada de "${cleanTitle}", reconocemos el esfuerzo y conocimiento de cada participante.`,
      }),
    ],
    juvenil: [
      () => ({
        spoken: `¡Ey, Sociedad de Jóvenes! Qué increíble estuvo "${cleanTitle}". ${participantCount} participantes lo dieron todo, y ahora sí... ¡vamos a conocer el podio!`,
        display: `¡Qué increíble estuvo "${cleanTitle}"! ¡Vamos a conocer el podio oficial!`,
      }),
      () => ({
        spoken: `¡Listos todos! Ya tenemos los puntajes confirmados de "${cleanTitle}". Preparen los aplausos porque vamos a anunciar los lugares oficiales.`,
        display: `¡Ya tenemos los puntajes confirmados de "${cleanTitle}"! Preparen los aplausos.`,
      }),
    ],
  };

  return pickVariant(templates[style], seed, 0)();
}

function buildPlaceScript(options: {
  rankKind: 'third' | 'second' | 'first';
  style: AnnouncerStyle;
  suspenseLevel: SuspenseLevel;
  spokenNames: string;
  displayNames: string;
  score: number;
  isTie: boolean;
  isSoleParticipant?: boolean;
  seed: number;
}): { spoken: string; display: string } {
  const {
    rankKind,
    style,
    suspenseLevel,
    spokenNames,
    displayNames,
    score,
    isTie,
    isSoleParticipant,
    seed,
  } = options;
  const bridge = buildSuspenseBridge(suspenseLevel);
  const pts = `${score.toLocaleString('es-CO')} puntos`;

  if (rankKind === 'first') {
    if (isSoleParticipant) {
      return {
        spoken: `¡En esta edición especial, nuestro participante destacado es${bridge} ${spokenNames}, con ${pts}! ¡Felicitaciones por tu entusiasmo en la Palabra!`,
        display: `¡Participante destacado: ${displayNames} (${pts})! ¡Felicitaciones!`,
      };
    }

    if (isTie) {
      const tieVariants: Array<() => { spoken: string; display: string }> = [
        () => ({
          spoken: `¡Atención, participantes! ¡Tenemos un empate histórico en el primer lugar! Con ${pts}, los campeones compartidos son${bridge} ${spokenNames}! ¡Grandes felicitaciones!`,
          display: `¡Empate en el 1.º puesto con ${pts}: ${displayNames}! ¡Felicitaciones!`,
        }),
        () => ({
          spoken: `¡Increíble cierre de competencia! Nadie cedió un milímetro. Compartiendo el puesto número uno con ${pts} están${bridge} ${spokenNames}! ¡Qué gran nivel bíblico!`,
          display: `¡Empate en el puesto número uno con ${pts}: ${displayNames}!`,
        }),
        () => ({
          spoken: `El marcador confirma un empate en la cima... En el primer puesto de honor, con ${pts}, celebramos juntos a${bridge} ${spokenNames}!`,
          display: `¡Empate en la cima con ${pts}: ${displayNames}!`,
        }),
      ];
      return pickVariant(tieVariants, seed, 11)();
    }

    const firstByStyle: Record<AnnouncerStyle, Array<() => { spoken: string; display: string }>> = {
      misterioso: [
        () => ({
          spoken: `¡Atención, participantes! Ha llegado el momento de conocer al ganador... ¡En el puesto número uno tenemos a${bridge} ${spokenNames}! ¡Con ${pts}, felicidades campeón!`,
          display: `¡En el puesto número uno: ${displayNames} con ${pts}! ¡Felicitaciones!`,
        }),
        () => ({
          spoken: `Solo uno logró llegar a lo más alto del tablero... El nombre que brilla en el primer puesto con ${pts} es${bridge} ¡${spokenNames}! ¡Felicitaciones!`,
          display: `¡1.º Puesto con ${pts}: ${displayNames}! ¡Felicitaciones!`,
        }),
        () => ({
          spoken: `Las cartas están sobre la mesa y la decisión es definitiva... ¡Quien conquista el primer lugar de esta competencia es${bridge} ${spokenNames}! ¡Aplauso para nuestro campeón!`,
          display: `¡Campeón del concurso con ${pts}: ${displayNames}!`,
        }),
      ],
      competitivo: [
        () => ({
          spoken: `¡Llegó la hora de coronar al número uno! ¡Con unos impresionantes ${pts}, el gran ganador es${bridge} ${spokenNames}! ¡Aplausos de pie!`,
          display: `¡Gran ganador con ${pts}: ${displayNames}!`,
        }),
        () => ({
          spoken: `¡Atención, participantes! ¡Superando cada reto con precisión, en el puesto número uno tenemos a${bridge} ${spokenNames}! ¡Felicitaciones, campeón!`,
          display: `¡Puesto número uno: ${displayNames} (${pts})!`,
        }),
      ],
      divertido: [
        () => ({
          spoken: `¡Redoble de aplausos! ¡Quien se lleva la corona bíblica del día con ${pts} es${bridge} ${spokenNames}! ¡Celebrémoslo con todo!`,
          display: `¡Corona bíblica del día para ${displayNames} con ${pts}!`,
        }),
        () => ({
          spoken: `¡Atención, participantes! Ha llegado el momento de conocer al ganador... ¡En el puesto número uno tenemos a${bridge} ${spokenNames}! ¡Inviten un aplauso bien fuerte!`,
          display: `¡En el puesto número uno: ${displayNames} (${pts})!`,
        }),
      ],
      solemne: [
        () => ({
          spoken: `Es un honor anunciar al primer lugar de esta competencia bíblica. Con ${pts}, el reconocimiento mayor corresponde a${bridge} ${spokenNames}. ¡Muchas felicitaciones!`,
          display: `1.º Puesto de Honor: ${displayNames} con ${pts}. ¡Felicitaciones!`,
        }),
        () => ({
          spoken: `Atención, estimados participantes. Quien alcanza el primer puesto en esta jornada de estudio bíblico es${bridge} ${spokenNames}, con ${pts}. ¡Gloria a Dios por su dedicación!`,
          display: `1.º Puesto: ${displayNames} (${pts}).`,
        }),
      ],
      juvenil: [
        () => ({
          spoken: `¡Llegó el momento que todos estábamos esperando! Con ${pts}, nuestro primer lugar de hoy es para${bridge} ¡${spokenNames}! ¡Felicidades, crack bíblico!`,
          display: `¡1.º Lugar con ${pts}: ${displayNames}! ¡Felicitaciones!`,
        }),
        () => ({
          spoken: `¡Atención, jóvenes! ¡En el puesto número uno de la Sociedad de Jóvenes tenemos a${bridge} ${spokenNames} con ${pts}! ¡Tremendo desempeño!`,
          display: `¡Puesto número uno: ${displayNames} (${pts})!`,
        }),
      ],
    };

    return pickVariant(firstByStyle[style], seed, 17)();
  }

  if (rankKind === 'second') {
    if (isTie) {
      const secondTieVariants: Array<() => { spoken: string; display: string }> = [
        () => ({
          spoken: `¡Atención! Tenemos un empate en el segundo puesto con ${pts}. ¡Suben juntos al podio${bridge} ${spokenNames}! ¡Excelente participación!`,
          display: `¡Empate en el 2.º puesto con ${pts}: ${displayNames}!`,
        }),
        () => ({
          spoken: `¡El segundo lugar se comparte hoy! Con ${pts}, felicitamos a${bridge} ${spokenNames} por una actuación sobresaliente.`,
          display: `¡2.º lugar compartido (${pts}): ${displayNames}!`,
        }),
      ];
      return pickVariant(secondTieVariants, seed, 23)();
    }

    const secondByStyle: Record<AnnouncerStyle, Array<() => { spoken: string; display: string }>> = {
      misterioso: [
        () => ({
          spoken: `¡El segundo lugar es para${bridge} ${spokenNames}! Con ${pts}, una excelente participación. ¡Sigue adelante!`,
          display: `¡2.º Puesto: ${displayNames} (${pts})! ¡Excelente participación!`,
        }),
        () => ({
          spoken: `Muy cerca de la cima, asegurando la medalla de plata con ${pts}, encontramos a${bridge} ¡${spokenNames}! ¡Gran trabajo!`,
          display: `¡2.º Puesto con ${pts}: ${displayNames}!`,
        }),
      ],
      competitivo: [
        () => ({
          spoken: `¡Qué cierre tan reñido! ¡El segundo lugar con ${pts} es para${bridge} ${spokenNames}! ¡Estuviste a un paso de la cima!`,
          display: `¡2.º Lugar: ${displayNames} (${pts})!`,
        }),
        () => ({
          spoken: `¡El segundo lugar es para${bridge} ${spokenNames}! Una actuación brillante con ${pts}. ¡Sigue adelante!`,
          display: `¡2.º Puesto: ${displayNames} (${pts})!`,
        }),
      ],
      divertido: [
        () => ({
          spoken: `¡Y con medalla de plata y ${pts}, el segundo lugar es para${bridge} ${spokenNames}! ¡Una excelente participación, casi te llevas el trofeo mayor!`,
          display: `¡2.º Puesto: ${displayNames} (${pts})! ¡Casi te llevas el trofeo!`,
        }),
      ],
      solemne: [
        () => ({
          spoken: `Con ${pts}, otorgamos el reconocimiento del segundo puesto a${bridge} ${spokenNames}. Una participación digna y admirable.`,
          display: `2.º Puesto: ${displayNames} (${pts}).`,
        }),
      ],
      juvenil: [
        () => ({
          spoken: `¡Fuerte ese aplauso! ¡El segundo lugar con ${pts} se lo lleva${bridge} ${spokenNames}! ¡Una excelente participación, sigue así!`,
          display: `¡2.º Puesto: ${displayNames} (${pts})!`,
        }),
      ],
    };

    return pickVariant(secondByStyle[style], seed, 29)();
  }

  // Third place
  if (isTie) {
    const thirdTieVariants: Array<() => { spoken: string; display: string }> = [
      () => ({
        spoken: `¡Comenzamos abriendo el podio con un empate en el tercer puesto! Con ${pts}, el reconocimiento es para${bridge} ${spokenNames}. ¡Un gran aplauso a su esfuerzo!`,
        display: `¡Empate en el 3.º puesto (${pts}): ${displayNames}!`,
      }),
      () => ({
        spoken: `¡Y en el tercer puesto tenemos empate entre${bridge} ${spokenNames}, ambos con ${pts}! ¡Un reconocimiento merecido!`,
        display: `¡3.º puesto compartido (${pts}): ${displayNames}!`,
      }),
    ];
    return pickVariant(thirdTieVariants, seed, 31)();
  }

  const thirdByStyle: Record<AnnouncerStyle, Array<() => { spoken: string; display: string }>> = {
    misterioso: [
      () => ({
        spoken: `¡Y en el tercer puesto tenemos a${bridge} ${spokenNames}! Con ${pts}, ¡un reconocimiento a tu esfuerzo!`,
        display: `¡3.º Puesto: ${displayNames} (${pts})! ¡Un reconocimiento a tu esfuerzo!`,
      }),
      () => ({
        spoken: `El primer nombre que iluminamos en este podio, conquistando el tercer lugar con ${pts}, pertenece a${bridge} ¡${spokenNames}!`,
        display: `¡3.º Puesto con ${pts}: ${displayNames}!`,
      }),
    ],
    competitivo: [
      () => ({
        spoken: `¡Abriendo el podio de honor! ¡En el tercer puesto con ${pts} tenemos a${bridge} ${spokenNames}! ¡Aplausos por su entrega!`,
        display: `¡3.º Puesto: ${displayNames} (${pts})!`,
      }),
    ],
    divertido: [
      () => ({
        spoken: `¡Y en el tercer puesto del podio bíblico tenemos a${bridge} ${spokenNames}, sumando ${pts}! ¡Bien merecido ese aplauso!`,
        display: `¡3.º Puesto: ${displayNames} (${pts})!`,
      }),
    ],
    solemne: [
      () => ({
        spoken: `Iniciamos la premiación reconociendo en el tercer puesto a${bridge} ${spokenNames}, quien alcanzó ${pts}. ¡Felicitaciones por su esfuerzo!`,
        display: `3.º Puesto: ${displayNames} (${pts}).`,
      }),
    ],
    juvenil: [
      () => ({
        spoken: `¡Arrancamos el podio! En el tercer lugar con ${pts} tenemos a${bridge} ¡${spokenNames}! ¡Qué buen trabajo!`,
        display: `¡3.º Puesto: ${displayNames} (${pts})!`,
      }),
    ],
  };

  return pickVariant(thirdByStyle[style], seed, 37)();
}

function buildLastPlaceScript(options: {
  style: AnnouncerStyle;
  suspenseLevel: SuspenseLevel;
  spokenNames: string;
  displayNames: string;
  score: number;
  isTie: boolean;
  seed: number;
}): { spoken: string; display: string; moralMessage: string } {
  const { style, suspenseLevel, spokenNames, displayNames, score, isTie, seed } =
    options;
  const bridge = buildSuspenseBridge(suspenseLevel);
  const pts = `${score.toLocaleString('es-CO')} puntos`;

  if (isTie) {
    const tieLastTemplates = [
      () => ({
        spoken: `¡Y ahora un momento especial para quienes cerraron la tabla con mucha valentía y buen ánimo! Empatados en el último lugar con ${pts} están${bridge} ${spokenNames}. ¡Gracias por participar sin rendirse; en la Biblia todos seguimos aprendiendo!`,
        display: `¡Mención especial de ánimo para ${displayNames} (${pts})! ¡Cada partida nos enseña más de la Palabra!`,
        moralMessage:
          'En la Palabra de Dios no gana solo el más rápido: gana quien nunca deja de aprender.',
      }),
      () => ({
        spoken: `¡Un aplauso bien cariñoso para el equipo de retaguardia! Hoy comparten el último puesto con ${pts}${bridge} ${spokenNames}. ¡Lo importante es disfrutar juntos y seguir creciendo en la Escritura; la próxima ronda será la revancha!`,
        display: `¡Aplauso especial de perseverancia para ${displayNames} (${pts})! ¡La próxima ronda será la revancha!`,
        moralMessage:
          'Perseverar hasta el final tiene su propio mérito. ¡A seguir escudriñando las Escrituras!',
      }),
    ];
    return pickVariant(tieLastTemplates, seed, 41)();
  }

  const singleLastTemplates: Record<
    AnnouncerStyle,
    Array<() => { spoken: string; display: string; moralMessage: string }>
  > = {
    misterioso: [
      () => ({
        spoken: `Pero esta historia no termina en el podio... Hay alguien que defendió con valentía la retaguardia hasta la última pregunta. En el último puesto con ${pts} tenemos a${bridge} ¡${spokenNames}! ¡Un aplauso enorme porque en la Palabra de Dios cada intento nos hace más sabios!`,
        display: `¡Reconocimiento a la perseverancia: ${displayNames} (${pts})! Cada intento nos hace más sabios.`,
        moralMessage:
          'La verdadera victoria está en aprender algo nuevo de la Biblia y llegar hasta el final.',
      }),
      () => ({
        spoken: `Y antes de despedirnos, un reconocimiento lleno de ánimo para quien hoy cerró la lista con ${pts}... ¡${spokenNames}! Recuerda que hasta David empezó cuidando ovejas antes de vencer gigantes. ¡Sigue estudiando y nos vemos en la revancha!`,
        display: `¡Mención de ánimo para ${displayNames} (${pts})! Hasta los grandes héroes empezaron paso a paso.`,
        moralMessage:
          '¡Ánimo! Todo gran conocedor de la Biblia empezó haciendo su primer intento.',
      }),
    ],
    competitivo: [
      () => ({
        spoken: `¡Y atención al espíritu deportivo de la noche! Quien terminó la carrera con ${pts} en el último lugar es${bridge} ¡${spokenNames}! ¡Un aplauso fuerte por competir hasta el final sin rendirse; hoy ganaste experiencia para la próxima batalla!`,
        display: `¡Espíritu deportivo para ${displayNames} (${pts})! ¡La experiencia de hoy impulsa la victoria de mañana!`,
        moralMessage:
          '¡Excelente actitud competitiva! Quien no se rinde siempre mejora en el siguiente desafío.',
      }),
    ],
    divertido: [
      () => ({
        spoken: `¡Y ahora un aplauso gigante y lleno de cariño para quien cuidó que nadie quedara detrás de la fila! En el último puesto con ${pts} está${bridge} ¡${spokenNames}! ¡Dicen que los últimos serán los primeros, así que prepárate para la revancha porque hoy nos enseñaste alegría y perseverancia!`,
        display: `¡Los últimos serán los primeros! Mención alegre para ${displayNames} (${pts}).`,
        moralMessage:
          '¡Con una sonrisa se aprende mejor! Los últimos serán los primeros en la próxima partida.',
      }),
      () => ({
        spoken: `¡Momento divertido y de cariño! Alguien tenía que vigilar el marcador desde la última posición, y ese honor hoy es para${bridge} ${spokenNames} con ${pts}. ¡Gracias por jugar con tanta buena onda y recordar que cada respuesta nos acerca más a la Biblia!`,
        display: `¡Gracias por tu alegría y valentía, ${displayNames} (${pts})! ¡A preparar la revancha!`,
        moralMessage:
          'Participar con alegría y humildad vale más que mil puntos en pantalla.',
      }),
    ],
    solemne: [
      () => ({
        spoken: `Queremos brindar un reconocimiento especial de ánimo a${bridge} ${spokenNames}, quien concluyó esta ronda con ${pts}. Cada participación en la Palabra de Dios edifica el corazón. ¡Te animamos a seguir creciendo con nosotros!`,
        display: `Reconocimiento de ánimo y perseverancia para ${displayNames} (${pts}).`,
        moralMessage:
          'Cada momento dedicado a estudiar la Palabra de Dios produce fruto duradero.',
      }),
    ],
    juvenil: [
      () => ({
        spoken: `¡Y no nos podíamos ir sin mandar toda la buena vibra al último puesto del marcador! ¡Un aplauso para${bridge} ${spokenNames} con ${pts}! ¡Cero pena, porque hoy aprendimos un montón y en el próximo sábado vienes por la revancha!`,
        display: `¡Toda la buena vibra para ${displayNames} (${pts})! ¡El próximo sábado viene la revancha!`,
        moralMessage:
          '¡A seguir con todo! Lo mejor de Sociedad de Jóvenes es aprender juntos y disfrutar en familia.',
      }),
    ],
  };

  return pickVariant(singleLastTemplates[style], seed, 47)();
}

function buildClosingLine(
  style: AnnouncerStyle,
  gameTitle: string,
  seed: number
): { spoken: string; display: string } {
  const cleanTitle = gameTitle.trim() || 'esta competencia';
  const variants: Record<AnnouncerStyle, Array<{ spoken: string; display: string }>> = {
    misterioso: [
      {
        spoken: `Así concluye "${cleanTitle}". Que la Palabra de Dios siga iluminando cada paso de sus vidas. ¡Hasta la próxima competencia!`,
        display: `¡Fin de la ceremonia en "${cleanTitle}"! Que la Palabra de Dios siga iluminando sus vidas.`,
      },
    ],
    competitivo: [
      {
        spoken: `¡Felicidades a todos los competidores de "${cleanTitle}"! Prepárense, estudien sus Biblias y nos vemos en el próximo torneo.`,
        display: `¡Felicidades a todos los competidores! ¡Nos vemos en el próximo torneo!`,
      },
    ],
    divertido: [
      {
        spoken: `¡Qué gran tiempo pasamos juntos en "${cleanTitle}"! Un aplauso para todos y a seguir disfrutando la Sociedad de Jóvenes.`,
        display: `¡Un aplauso para todos los participantes de "${cleanTitle}"!`,
      },
    ],
    solemne: [
      {
        spoken: `Agradecemos a cada participante por su entusiasmo en "${cleanTitle}". Que el Señor continúe bendiciendo este ministerio juvenil.`,
        display: `Que el Señor continúe bendiciendo a toda la Sociedad de Jóvenes.`,
      },
    ],
    juvenil: [
      {
        spoken: `¡Gracias a todos por participar en "${cleanTitle}"! Compartan el entusiasmo y nos vemos muy pronto en el siguiente reto bíblico.`,
        display: `¡Gracias por participar en "${cleanTitle}"! ¡Nos vemos en el próximo reto!`,
      },
    ],
  };

  return pickVariant(variants[style], seed, 59);
}

/**
 * Builds the deterministic, authoritative announcement sequence strictly from the
 * finished game's server leaderboard. Handles ties, < 4 participants, hard-to-pronounce
 * overrides, and style/suspense variations cleanly without ever inventing ranks or duplicating names.
 */
export function buildAnnouncerPlan(options: {
  leaderboard: LeaderboardEntry[];
  config: AnnouncerConfig;
  gameTitle: string;
  ceremonyRunId: string;
  variationSeed: number;
}): AnnouncerAnnouncementPlan {
  const { leaderboard, config, gameTitle, ceremonyRunId, variationSeed } = options;
  const tiers = buildScoreTiers(leaderboard);
  const participantCount = leaderboard.length;
  const hasAnyTie = tiers.some((t) => t.entries.length > 1);
  const basePause = ANNOUNCER_SUSPENSE_META[config.suspenseLevel].preDelayMs;
  const cues: AnnouncerCue[] = [];

  if (participantCount === 0) {
    cues.push({
      id: `${ceremonyRunId}-empty`,
      stage: 'complete',
      title: 'Partida sin participantes puntuando',
      rankLabel: 'Cierre',
      spokenText:
        'La partida ha finalizado, aunque no se registraron participantes en la clasificación.',
      displayText:
        'La partida ha finalizado sin participantes registrados en la clasificación.',
      highlightedParticipantIds: [],
      highlightedEntries: [],
      isTie: false,
      pauseBeforeMs: 250,
    });
    return {
      ceremonyRunId,
      participantCount: 0,
      hasAnyTie: false,
      cues,
    };
  }

  // 1. Intro suspense
  const intro = buildIntroLine(
    config.style,
    gameTitle,
    participantCount,
    variationSeed
  );
  cues.push({
    id: `${ceremonyRunId}-intro`,
    stage: 'intro_suspense',
    title: 'Preparando Resultados Oficiales',
    rankLabel: 'Suspenso',
    spokenText: intro.spoken,
    displayText: intro.display,
    highlightedParticipantIds: [],
    highlightedEntries: [],
    isTie: false,
    preSfx: config.sfxToggles.suspenseMusic ? 'suspense_intro' : undefined,
    pauseBeforeMs: 350,
  });

  const formatTierNames = (entries: LeaderboardEntry[]) => {
    const spokenArr = entries.map((e) =>
      resolveSpokenParticipantName(e, config.pronunciationOverrides)
    );
    const displayArr = entries.map((e) => e.name);
    return {
      spokenNames: joinSpanishNames(spokenArr),
      displayNames: joinSpanishNames(displayArr),
    };
  };

  // Helper to decide top tiers carefully
  // Tiers: tiers[0] is 1st place tier, tiers[1] is 2nd tier, tiers[2] is 3rd tier
  const tier1 = tiers[0];
  const tier2 = tiers[1];
  const tier3 = tiers[2];

  const announcedIds = new Set<string>();

  // 3rd place tier (only announce if there are at least 3 participants total AND tier3 exists & isn't already covered)
  // Wait: what if there are 3 participants and 2 tied for 1st, 1 in 3rd (`tier1` has 2 players, `tier2` has 1 player at competitionRank=3)?
  // Let's handle competitionRank accurately!
  const podiumTiers: Array<{
    stage: 'third_place' | 'second_place' | 'first_place';
    tier: ScoreTier;
    rankKind: 'third' | 'second' | 'first';
  }> = [];

  if (tier1) {
    if (tier3 && participantCount >= 3) {
      podiumTiers.push({ stage: 'third_place', tier: tier3, rankKind: 'third' });
    }
    if (tier2 && participantCount >= 2) {
      const rankKind = tier2.competitionRank >= 3 ? 'third' : 'second';
      podiumTiers.push({
        stage: rankKind === 'third' ? 'third_place' : 'second_place',
        tier: tier2,
        rankKind,
      });
    }
    podiumTiers.push({ stage: 'first_place', tier: tier1, rankKind: 'first' });
  }

  for (const item of podiumTiers) {
    const { tier, stage, rankKind } = item;
    const { spokenNames, displayNames } = formatTierNames(tier.entries);
    const isTie = tier.entries.length > 1;
    const isSoleParticipant = participantCount === 1 && rankKind === 'first';
    const script = buildPlaceScript({
      rankKind,
      style: config.style,
      suspenseLevel: config.suspenseLevel,
      spokenNames,
      displayNames,
      score: tier.score,
      isTie,
      isSoleParticipant,
      seed: variationSeed,
    });

    for (const entry of tier.entries) {
      announcedIds.add(entry.participantId);
    }

    const rankLabel = isSoleParticipant
      ? 'Participante Destacado'
      : rankKind === 'first'
        ? isTie
          ? 'Empate · 1.º Puesto'
          : '1.º Puesto · Campeón'
        : rankKind === 'second'
          ? isTie
            ? 'Empate · 2.º Puesto'
            : '2.º Puesto'
          : isTie
            ? 'Empate · 3.º Puesto'
            : '3.º Puesto';

    cues.push({
      id: `${ceremonyRunId}-${stage}`,
      stage,
      title: rankLabel,
      rankLabel,
      spokenText: script.spoken,
      displayText: script.display,
      highlightedParticipantIds: tier.entries.map((e) => e.participantId),
      highlightedEntries: tier.entries,
      isTie,
      preSfx: config.sfxToggles.drumroll ? 'drumroll' : undefined,
      postSfx:
        rankKind === 'first'
          ? config.sfxToggles.winnerFanfare
            ? 'winner_fanfare'
            : undefined
          : config.sfxToggles.topThreeSting
            ? 'top3_sting'
            : undefined,
      pauseBeforeMs: basePause,
    });
  }

  // Last place announcement:
  // Only when participantCount >= 4 AND there are unannounced participants in the lowest tier
  // (so < 4 participants never duplicate names or invent ranks, and 4-way ties don't duplicate!)
  if (participantCount >= 4 && tiers.length >= 2) {
    const lastTier = tiers[tiers.length - 1];
    const unannouncedInLastTier = lastTier.entries.filter(
      (e) => !announcedIds.has(e.participantId)
    );

    if (unannouncedInLastTier.length > 0) {
      const { spokenNames, displayNames } = formatTierNames(unannouncedInLastTier);
      const isTie = unannouncedInLastTier.length > 1;
      const lastScript = buildLastPlaceScript({
        style: config.style,
        suspenseLevel: config.suspenseLevel,
        spokenNames,
        displayNames,
        score: lastTier.score,
        isTie,
        seed: variationSeed,
      });

      cues.push({
        id: `${ceremonyRunId}-last_place`,
        stage: 'last_place',
        title: isTie
          ? 'Mención Especial · Último Puesto Compartido'
          : 'Mención Especial · Último Puesto',
        rankLabel: isTie ? 'Último Puesto (Empate)' : 'Último Puesto · ¡Ánimo!',
        spokenText: lastScript.spoken,
        displayText: `${lastScript.display} — ${lastScript.moralMessage}`,
        highlightedParticipantIds: unannouncedInLastTier.map(
          (e) => e.participantId
        ),
        highlightedEntries: unannouncedInLastTier,
        isTie,
        preSfx: config.sfxToggles.lastPlaceSting ? 'last_place_sting' : undefined,
        pauseBeforeMs: Math.round(basePause * 0.75),
      });
    }
  }

  // Final closing
  const closing = buildClosingLine(config.style, gameTitle, variationSeed);
  cues.push({
    id: `${ceremonyRunId}-complete`,
    stage: 'complete',
    title: 'Cierre Oficial de Premiación',
    rankLabel: 'Tabla Completa',
    spokenText: closing.spoken,
    displayText: closing.display,
    highlightedParticipantIds: [],
    highlightedEntries: [],
    isTie: false,
    postSfx: config.sfxToggles.closingMusic ? 'closing' : undefined,
    pauseBeforeMs: 450,
  });

  return {
    ceremonyRunId,
    participantCount,
    hasAnyTie,
    cues,
  };
}

export function getUnlockedStagesUpToCue(
  plan: AnnouncerAnnouncementPlan,
  cueIndex: number
): AnnouncerStage[] {
  const unlocked = new Set<AnnouncerStage>();
  const capped = Math.min(cueIndex, plan.cues.length - 1);
  for (let i = 0; i <= capped; i++) {
    unlocked.add(plan.cues[i].stage);
  }
  return Array.from(unlocked);
}
