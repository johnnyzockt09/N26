import {
  LevelBody,
  LevelContent,
  LevelDifficulty,
  LevelFull,
  LevelHint,
  LevelMeta,
  LevelSubmitResult,
  GameProgress,
  StoryKey,
  matchesAnyAnswer,
  isValidLevelAnswer,
} from '@n26/shared';
import { Database } from '../db/database.js';

/**
 * A single puzzle definition. The `answers` array is private to the server
 * and is NEVER serialized to players. Everything players see lives in `body`
 * (clue content) – the accepted key is always derived from that content by a
 * transformation the player must perform.
 */
interface SeedLevel {
  slug: string;
  title: string;
  description: string;
  body: LevelBody;
  answers: string[];
  difficulty: LevelDifficulty;
  puzzleType: LevelFull['puzzleType'];
  storyKey?: StoryKey;
  storyReveal?: string;
  hints: string[];
}

const SEED_LEVELS: SeedLevel[] = [
  {
    slug: '01-initialisierung',
    title: 'Initialisierung',
    description: 'Das System fordert dich auf, dich auszuweisen.',
    body: {
      text: 'An der Mauer glüht eine alte Inschrift, halb vergessen. Ein Frequenzkennzeichen aus Zeiten, in denen Sprachausgabe noch „die Stimme des Systems" hieß.\n\n> FRJVAQ\n\nWas sagt sie?',
    },
    answers: ['Session', 'session'],
    difficulty: 1,
    puzzleType: 'TEXT',
    storyKey: 'UNKNOWN',
    storyReveal: 'SERVER STATUS: UNKNOWN',
    hints: [
      'Das System kennt nur ein Alphabet, um genau 13 Buchstaben verschoben.',
      'Verschiebe jeden Buchstaben über den Text darunter um 13 Stellen weiter (ROT13).',
      'FRJVAQ wird zu einem englischen Wort für einen Zugang bzw. eine laufende Verbindung.',
    ],
  },
  {
    slug: '02-kommentar',
    title: 'Der Kommentar',
    description: 'Der Quelltext flüstert ein Wort rückwärts.',
    body: {
      text: 'Die Turnsperre hat einen eingebauten Kommentar. Manchmal reicht es, einmal ganz genau hinzusehen.',
      code: '<!--\n  sperrmechanik v2\n  rückkanal  :/tuokcalb\n  zuletzt getestet: NEIN\n-->',
    },
    answers: ['Blackout', 'blackout'],
    difficulty: 2,
    puzzleType: 'CODE',
    storyKey: 'UNKNOWN',
    hints: [
      'Der Kommentar enthält einen Pfad, der ein Wort rückwärts trägt.',
      'Lies „tuokcalb" von hinten nach vorne.',
      'Das Ergebnis ist ein plötzlicher Stromverlust in dieser Welt.',
    ],
  },
  {
    slug: '03-beleuchtung',
    title: 'Beleuchtung',
    description: 'Im Serverraum leuchten einzelne Blöcke. Sie bilden etwas.',
    body: {
      text: 'Zwischen den toten Racks leuchten 40 Blöcke. Manche strahlen, manche schweigen. Lies nur die leuchtenden.',
      image: '/assets/levels/03/scene.svg',
    },
    answers: ['licht', 'Licht'],
    difficulty: 2,
    puzzleType: 'IMAGE',
    storyKey: 'UNKNOWN',
    hints: [
      'Die leuchtenden Blöcke formen Zeichen, die Schattenblöcke sind Füllmaterial.',
      'Zeichne die hellen Blöcke auf Papier nach – es sind fünf Blockbuchstaben.',
      'Es ist das Wort für das, was der Raum lange nicht mehr gesehen hat.',
    ],
  },
  {
    slug: '04-morsecode',
    title: 'Morsecode',
    description: 'Ein alter Sender klopft gegen die Nacht.',
    body: {
      text: 'Der Funker ist lange weg. Aber die Maschine klopft weiter.\n\nHör genau hin: kurz, lang. Drei Mal.',
      audio: '/assets/levels/04/morse-sos.wav',
    },
    answers: ['SOS', 'sos', 's.o.s.', '...---...'],
    difficulty: 2,
    puzzleType: 'AUDIO',
    storyKey: 'UNKNOWN',
    hints: [
      'Kurze Signale sind Punkte, lange Signale sind Striche.',
      'Die Gruppe folgt dem Muster: drei kurz – drei lang – drei kurz.',
      'Das ist der klassische internationale Notruf.',
    ],
  },
  {
    slug: '05-adresse',
    title: 'Die Adresse',
    description: 'Jede Tür hat eine Adresse. Diese hier lügt nicht.',
    body: {
      text: 'Auf der Messingplatte ist eine Verbindung eingraviert:\n\n> srv://dark/factory\n\nWer spricht in dieser Adresse zu dir?\n\n(Tipp: Es steht zwischen den // und dem /.)',
    },
    answers: ['dark', 'DARK'],
    difficulty: 1,
    puzzleType: 'URL',
    storyKey: 'PROJECT_NULL',
    storyReveal: 'EIN NAME TAUSCHT VOM SCHILD: PROJECT NULL.',
    hints: [
      'Eine URL hat immer: Schema://Host/Pfad.',
      'Der Host trägt den Namen des Ortes.',
      '„dark" ist die Antwort – der Schatten, der hier lebt.',
    ],
  },
  {
    slug: '06-funkverkehr',
    title: 'Funkverkehr',
    description: 'Der Funkverkehr ist verschlüsselt. Zum Glück nur schwach.',
    body: {
      text: 'In den Übertragungen steht ein Trägerblock. Entschlüssele die Zeichenfolge.',
      code: '<!--  dGVybWluYWw=  -->',
    },
    answers: ['terminal', 'TERMINAL'],
    difficulty: 3,
    puzzleType: 'CODE',
    storyKey: 'PROJECT_NULL',
    hints: [
      'Die Kombination aus Buchstaben, Ziffern und „=" ist typisch für Base64.',
      'Base64-Codierungen enden häufig mit einem oder zwei „="-Zeichen.',
      'Ein Terminal ist dein Ziel – der Ort, an dem du Befehle eingibst.',
    ],
  },
  {
    slug: '07-koordinaten',
    title: 'Koordinaten',
    description: 'Eine Karte des Kollektors. Markiert: die Diagonale und zwei Gegenstücke.',
    body: {
      text: 'Die Karte trägt Koordinaten. Fünf Zellen glänzen.\n\nLies die Buchstaben aus den markierten Zellen – das ist dein Schlüssel.',
      extra: {
        grid: 'A1:N  B1:.  C1:.  D1:.  E1:.\nA2:.  B2:E  C2:.  D2:.  E2:.\nA3:.  B3:.  C3:B  D3:.  E3:.\nA4:.  B4:.  C4:.  D4:E  E4:.\nA5:.  B5:.  C5:.  D5:.  E5:L',
      },
    },
    answers: ['nebel', 'NEBEL'],
    difficulty: 3,
    puzzleType: 'TEXT',
    storyKey: 'PROJECT_NULL',
    hints: [
      'Die Markierungen sind: A1, B2, C3, D4 und E5.',
      'A1 = erste Zeile, erste Spalte → lies den Buchstaben dort.',
      'Es ergibt ein Wort mit fünf Buchstaben – ein Auftrag für Level 19.',
    ],
  },
  {
    slug: '08-aktendatei',
    title: 'Die Akte',
    description: 'Auf dem Server liegt eine Akte. Öffne sie mit Bedacht.',
    body: {
      text: 'Eine Logdatei wurde zurückgelassen. In Zeile 3 steckt das Passwort – allerdings rückwärts.',
      file: '/assets/levels/08/moatslog.txt',
    },
    answers: ['master', 'MASTER'],
    difficulty: 3,
    puzzleType: 'FILE',
    storyKey: 'PROJECT_NULL',
    hints: [
      'Lade die Datei herunter und zähle bis zur dritten Zeile.',
      'Die dritte Zeile ist ein umgedrehtes Wort.',
      '„retsaM" von hinten gelesen ergibt die Antwort.',
    ],
  },
  {
    slug: '09-bild-und-link',
    title: 'Bild und Link',
    description: 'Das Bild zeigt eine Zahl. Der Link zeigt den Weg.',
    body: {
      text: 'Das Bild hängt über dem Terminal. Die Zahl daneben gehört zum Pfad.\n\n> die Route: datei-07\n\nFüge beides zusammen.',
      image: '/assets/levels/09/scene.svg',
    },
    answers: ['datei07', 'datei-07'],
    difficulty: 3,
    puzzleType: 'MIXED',
    storyKey: 'PROJECT_NULL',
    hints: [
      'Das Bild zeigt die Zahl in Leuchtschrift.',
      'Der Pfad lautet „datei-" – es fehlt die Nummer.',
      'Verbinde „datei" und die Zahl aus dem Bild zu einem Wort.',
    ],
  },
  {
    slug: '10-verdrahtung',
    title: 'Verdrahtung',
    description: 'Alte Kabel verbinden die Antworten der ersten beiden Systeme.',
    body: {
      text: 'Die Verkabelung ist simpel-gewollt.\n\nVerbinde die erste Antwort (Level 1) und die zweite Antwort (Level 2) mit einem Bindestrich.',
    },
    answers: ['session-blackout', 'sessionblackout'],
    difficulty: 4,
    puzzleType: 'META',
    storyKey: 'WORLD_01',
    storyReveal: 'WORLD_01: DIE WELT IST EIN SERVERRAUM.',
    hints: [
      'Deine Antwort aus Level 1 war der Zugang zum System.',
      'Deine Antwort aus Level 2 war der plötzliche Ausfall.',
      'Verkabelung: WORT1-WORT2. Ohne Leerzeichen danach oder davor.',
    ],
  },
  {
    slug: '11-klangzaehler',
    title: 'Der Zähler',
    description: 'Die Maschine zählt in Tönen.',
    body: {
      text: 'Drei Blöcke Ton, Pause, vier Blöcke Ton, Pause, zwei Blöcke Ton.\n\nAntworte mit der Ziffernfolge der Zählung.',
      audio: '/assets/levels/11/count-342.wav',
    },
    answers: ['342', '3-4-2'],
    difficulty: 2,
    puzzleType: 'AUDIO',
    storyKey: 'WORLD_01',
    hints: [
      'Jeder Tonblock ist ein kurzer Piepton.',
      'Zähle die Töne zwischen den Pausen: erst 3, dann mehr.',
      'Du erhältst genau drei Zahlen hintereinander.',
    ],
  },
  {
    slug: '12-datenpfad',
    title: 'Datenpfad',
    description: 'Der Pfad versteckt die Antwort benannt nach dem Block.',
    body: {
      text: 'Im Quelltext ruft das Layout einen Stein auf.\n\n> asset("stein-14")\n\nWie heißt das Asset vollständig?',
      code: '/* layout*/  background: asset("stein-14");',
    },
    answers: ['stein14', 'stein-14'],
    difficulty: 2,
    puzzleType: 'CODE',
    storyKey: 'WORLD_01',
    hints: [
      'Der Aufruf trägt den Dateinamen in Anführungszeichen.',
      'Eine Zahl folgt auf den Bindestrich.',
      'Lösung ist der komplette Name: stein-14.',
    ],
  },
  {
    slug: '13-zahlenrausch',
    title: 'Zahlenrausch',
    description: 'Der Empfänger auf dem Wagen rasselt im Hintergrund.',
    body: {
      text: 'Aus dem Rauschen zählst du Zahlen. Die Schwingung trägt sie alphabetisch.\n\n> [ 115 105 103 110 97 108 ]\n\nÜbersetze sie.',
      code: 'signal: [ 115 105 103 110 97 108 ]',
    },
    answers: ['signal', 'SIGNAL'],
    difficulty: 3,
    puzzleType: 'CODE',
    storyKey: 'WORLD_01',
    hints: [
      'Das sind ASCII-Codes im Dezimalsystem.',
      '115 = s, 105 = i, 103 = g ...',
      'Das Wort ergibt den Begriff für eine Übertragung.',
    ],
  },
  {
    slug: '14-bild-meta',
    title: 'Bildrücklauf',
    description: 'Im Bildband steckt ein Kommentar zur Kette.',
    body: {
      text: 'Der Abschnitt ist gespiegelt: „FERNGESPRÄCH" steht im Bild, aber rechts beginnend.',
      image: '/assets/levels/14/scene.svg',
      code: '<!--  emrihcs  -->',
    },
    answers: ['schirme', 'SCHIRME'],
    difficulty: 3,
    puzzleType: 'IMAGE',
    storyKey: 'WORLD_01',
    hints: [
      'Lies den Kommentar von rechts nach links.',
      'emrihcs umgedreht ergibt das gesuchte Wort.',
      'Es ist das Bildrücklauf-Signal der alten Röhrenmonitore.',
    ],
  },
  {
    slug: '15-echo',
    title: 'Echo',
    description: 'Die Höhle wiederholt, was sie hört – nur rückwärts.',
    body: {
      text: 'Eine gespiegelte Nachricht. Spiele den Ton rückwärts ab – danach klingt er wie das vertraute alte Klopfzeichen.\n\n(Tipp: Die Antwort ist ein klassisches akustisches Reflexionswort.)',
      audio: '/assets/levels/15/echo-reversed.wav',
    },
    answers: ['echo', 'ECHO'],
    difficulty: 4,
    puzzleType: 'AUDIO',
    storyKey: 'WORLD_02',
    storyReveal: 'WORLD_02: UNTER DER MINE SCHLÄFT MEHR.',
    hints: [
      'Spiele die Audiodatei mit einer rückwärts-Option ab.',
      'Der Ton besteht aus zwei kurzen Silben, gespiegelt.',
      'Was ein Raum dir zurückschickt, wenn du rufst.',
    ],
  },
  {
    slug: '16-voxel',
    title: 'Voxel-Katalog',
    description: 'Der Scanner zählt leuchtende Voxel im dunklen Frachtraster.',
    body: {
      text: 'Zähle die leuchtenden Voxel im Raster. Antworte mit der Zahl als deutsches Wort.',
      code: '[\n  [X,.,.,X],\n  [.,X,X,.],\n  [.,X,X,.],\n  [X,.,.,X]\n]',
    },
    answers: ['acht', '8', 'ACHT'],
    difficulty: 2,
    puzzleType: 'TEXT',
    storyKey: 'WORLD_02',
    hints: [
      'Jedes X ist ein leuchtendes Voxel, jeder Punkt ist dunkel.',
      'Zähle alle X im gesamten Raster.',
      'Die Antwort ist die Zahl in Worten.',
    ],
  },
  {
    slug: '17-verschluesselt',
    title: 'Stiller Raum',
    description: 'Zwei Verschlüsselungen schließen einen Namen weg.',
    body: {
      text: 'Die Kette ist zweifach versiegelt.\n\nErst Base64, dann ROT13.\n\n> Q2Vid3JweA==',
      code: 'nachricht: "Q2Vid3JweA=="',
    },
    answers: ['projekt', 'PROJEKT'],
    difficulty: 5,
    puzzleType: 'TEXT',
    storyKey: 'WORLD_02',
    hints: [
      'Schritt 1: Base64 -> ergibt einen ROT13-Text.',
      'Schritt 2: Um 13 Zeichen verschieben -> ergibt ein deutsches Wort.',
      'Es ist das Wort, das über allem steht: ein Projekt.',
    ],
  },
  {
    slug: '18-serverlog',
    title: 'Serverlogs',
    description: 'Das Logbuch der letzten Nacht. Eine Adresse sticht hervor.',
    body: {
      text: 'Blättere durch die Aufzeichnungen. Eine IP-Adresse taucht genau einmal auf.\n\nNenne das dritte Oktett.',
      code: `[00:13:07] ping 10.18.42.9 ok
[00:13:09] ping 10.18.42.9 ok
[01:01:01] auth anonymous denied
[01:59:59] ping 10.99.11.7 ok
[02:03:00] sync mirror failed`,
    },
    answers: ['99', '99'],
    difficulty: 2,
    puzzleType: 'CODE',
    storyKey: 'WORLD_02',
    hints: [
      'Eine IP hat vier Blöcke, getrennt durch Punkte.',
      'Die seltene Adresse ist 10.99.11.7.',
      'Das dritte Oktett steht vor der letzten Zahl.',
    ],
  },
  {
    slug: '19-kombination',
    title: 'Verschmelzung',
    description: 'Die Maschine verbindet die Antworten aus Level 6 und 7.',
    body: {
      text: 'Notiere deine Antworten aus Level 6 und Level 7 und verbinde sie mit einem Bindestrich.',
    },
    answers: ['terminal-nebel', 'terminal-nebel'],
    difficulty: 4,
    puzzleType: 'META',
    storyKey: 'WORLD_03',
    storyReveal: 'WORLD_03: DAS PORTAL WARTET.',
    hints: [
      'Level 6: der Ort, an dem du Befehle eingibst.',
      'Level 7: das Ergebnis aus den Koordinaten.',
      'Nur mit Bindestrich dazwischen.',
    ],
  },
  {
    slug: '20-tor',
    title: 'Das Tor',
    description: 'Der letzte Schlüssel verbindet die ersten Worte der Reise.',
    body: {
      text: 'Das Tor braucht die Vitrine deiner Antworten:\n\nAntwort 1 – Bindestrich – Antwort 2 – Bindestrich – Antwort 4.',
      code: 'TOR: (L1)-(L2)-(L4)',
    },
    answers: ['session-blackout-sos', 'session-blackout-sos'],
    difficulty: 5,
    puzzleType: 'META',
    storyKey: 'WORLD_03',
    storyReveal: 'PROJECT NULL IST REAL. DIE WELT IST NUR DER ANFANG.',
    hints: [
      'Level 1, 2 und 4 waren die ersten drei gelösten Rätsel.',
      'Session. Blackout. SOS.',
      'Verkette sie in exakt dieser Reihenfolge mit zwei Bindestrichen.',
    ],
  },
];

export class LevelService {
  constructor(private readonly db: Database) {}

  /**
   * Idempotent seeding of the base campaign. Runs once per database.
   */
  async seedIfEmpty(): Promise<void> {
    const count = await this.db.levels.count();
    if (count > 0) return;

    let prevId: number | null = null;
    for (const seed of SEED_LEVELS) {
      const level = await this.db.levels.create({
        slug: seed.slug,
        title: seed.title,
        description: seed.description,
        body: seed.body,
        answers: seed.answers,
        difficulty: seed.difficulty,
        puzzleType: seed.puzzleType,
        orderIndex: await this.db.levels.maxOrderIndex() + 1,
        requiresLevelId: prevId,
        storyKey: seed.storyKey ?? null,
        storyReveal: seed.storyReveal ?? null,
        active: true,
      });
      for (let i = 0; i < seed.hints.length; i++) {
        await this.db.levelHints.create({ levelId: level.id, position: i + 1, text: seed.hints[i] });
      }
      prevId = level.id;
    }
  }

  // ------------------------------------------------------------------
  // Player facing
  // ------------------------------------------------------------------

  async getProgress(userId: string): Promise<GameProgress> {
    const levels = await this.db.levels.listActive();
    const progress = await this.db.levelProgress.listForUser(userId);
    const solved = new Set(progress.filter((p) => p.solved).map((p) => p.levelId));
    const solvedCount = solved.size;

    let currentLevelId: number | null = null;
    let storyKey: GameProgress['storyKey'] = null;
    for (const level of levels) {
      const unlocked = this.isUnlocked(level, solved);
      const meta = this.toMeta(level, progress, solved, unlocked, 0);
      if (!meta.solved && meta.unlocked) {
        currentLevelId = level.id;
      }
      if (meta.storyKey) storyKey = meta.storyKey;
    }

    return {
      solvedCount,
      unlockedCount: levels.filter((l) => this.isUnlocked(l, solved)).length,
      totalActive: levels.length,
      currentLevelId,
      storyKey,
    };
  }

  async listLevels(userId: string): Promise<LevelMeta[]> {
    const levels = await this.db.levels.listActive();
    const progress = await this.db.levelProgress.listForUser(userId);
    const solved = new Set(progress.filter((p) => p.solved).map((p) => p.levelId));
    const hintCounts = new Map<number, number>();
    for (const h of await this.db.levelHints.listForLevels(levels.map((l) => l.id))) {
      hintCounts.set(h.levelId, (hintCounts.get(h.levelId) ?? 0) + 1);
    }
    return levels.map((level) => this.toMeta(level, progress, solved, this.isUnlocked(level, solved), hintCounts.get(level.id) ?? 0));
  }

  async getLevel(userId: string, levelId: number): Promise<LevelContent | { code: string; message: string }> {
    const level = await this.db.levels.findById(levelId);
    if (!level || !level.active) return { code: 'LEVEL_NOT_FOUND', message: 'Level nicht gefunden' };

    const progress = await this.db.levelProgress.get(userId, levelId);
    const solved = new Set((await this.db.levelProgress.listForUser(userId)).filter((p) => p.solved).map((p) => p.levelId));
    const unlocked = this.isUnlocked(level, solved);
    if (!unlocked) return { code: 'LEVEL_LOCKED', message: 'Dieses Level ist noch gesperrt' };

    const hints = await this.db.levelHints.listForLevel(levelId);
    const hintsUsed = progress?.hintsUsed ?? 0;

    const meta = this.toMeta(level, progress ? [progress] : [], solved, unlocked, hints.length);

    const nextLevels = await this.db.levels.listActive();
    const next = nextLevels.find((l) => l.orderIndex === level.orderIndex + 1);

    return {
      ...meta,
      description: level.description,
      body: level.body,
      hints: hints.slice(0, hintsUsed).map((h) => ({ key: h.position, text: h.text })),
      nextLevelId: next ? next.id : null,
    };
  }

  async unlockHint(userId: string, levelId: number): Promise<{ hint: LevelHint; remaining: number } | { code: string; message: string }> {
    const level = await this.db.levels.findById(levelId);
    if (!level || !level.active) return { code: 'LEVEL_NOT_FOUND', message: 'Level nicht gefunden' };

    const solved = new Set((await this.db.levelProgress.listForUser(userId)).filter((p) => p.solved).map((p) => p.levelId));
    if (!this.isUnlocked(level, solved)) return { code: 'LEVEL_LOCKED', message: 'Dieses Level ist noch gesperrt' };

    const progress = await this.db.levelProgress.get(userId, levelId);
    const hints = await this.db.levelHints.listForLevel(levelId);
    const hintsUsed = progress?.hintsUsed ?? 0;
    if (hintsUsed >= hints.length) {
      return { code: 'NO_MORE_HINTS', message: 'Keine weiteren Hinweise' };
    }
    await this.db.levelProgress.incrementHintsUsed(userId, levelId);
    await this.db.auditLogs.create({
      event: 'LEVEL_HINT',
      actorUserId: userId,
      details: { levelId },
    });
    const nextHints = hints.map((h) => ({ key: h.position, text: h.text })).slice(0, hintsUsed + 1);
    return { hint: nextHints[nextHints.length - 1], remaining: hints.length - nextHints.length };
  }

  async submitAnswer(
    userId: string,
    levelId: number,
    answer: unknown
  ): Promise<LevelSubmitResult | { code: string; message: string }> {
    const level = await this.db.levels.findById(levelId);
    if (!level || !level.active) return { code: 'LEVEL_NOT_FOUND', message: 'Level nicht gefunden' };

    const solved = new Set((await this.db.levelProgress.listForUser(userId)).filter((p) => p.solved).map((p) => p.levelId));
    if (!this.isUnlocked(level, solved)) return { code: 'LEVEL_LOCKED', message: 'Dieses Level ist noch gesperrt' };

    const progress = await this.db.levelProgress.get(userId, levelId);
    if (progress?.solved) {
      return { solved: true, alreadySolved: true, levelId, nextLevelId: await this.nextLevel(levelId), storyReveal: null };
    }

    if (!isValidLevelAnswer(answer)) {
      return { code: 'INVALID_ANSWER', message: 'Ungültige Antwort' };
    }

    await this.db.levelProgress.upsertAttempt(userId, levelId);
    await this.db.auditLogs.create({
      event: 'LEVEL_ATTEMPT',
      actorUserId: userId,
      details: { levelId },
    });

    if (!matchesAnyAnswer(answer, level.answers)) {
      return { solved: false, alreadySolved: false, levelId, nextLevelId: null, storyReveal: null };
    }

    await this.db.levelProgress.markSolved(userId, levelId);
    await this.db.auditLogs.create({
      event: 'LEVEL_SOLVE',
      actorUserId: userId,
      details: { levelId, levelSlug: level.slug },
    });

    return {
      solved: true,
      alreadySolved: false,
      levelId,
      nextLevelId: await this.nextLevel(levelId),
      storyReveal: level.storyReveal,
    };
  }

  async resetProgress(userId: string): Promise<void> {
    await this.db.levelProgress.resetForUser(userId);
    await this.db.auditLogs.create({
      event: 'LEVEL_RESET',
      actorUserId: userId,
    });
  }

  // ------------------------------------------------------------------
  // Admin
  // ------------------------------------------------------------------

  async listAll(): Promise<LevelFull[]> {
    const levels = await this.db.levels.listAll();
    const hints = await this.db.levelHints.listForLevels(levels.map((l) => l.id));
    return levels.map((level) => ({
      id: level.id,
      slug: level.slug,
      title: level.title,
      description: level.description,
      body: level.body,
      answers: level.answers,
      difficulty: level.difficulty,
      puzzleType: level.puzzleType,
      orderIndex: level.orderIndex,
      requiresLevelId: level.requiresLevelId,
      storyKey: level.storyKey,
      storyReveal: level.storyReveal,
      active: level.active,
      hints: hints.filter((h) => h.levelId === level.id).map((h) => ({ key: h.position, text: h.text })),
      createdAt: level.createdAt.toISOString(),
      updatedAt: level.updatedAt.toISOString(),
    }));
  }

  async create(input: {
    slug: string;
    title: string;
    description: string;
    body: LevelBody;
    answers: string[];
    difficulty: LevelDifficulty;
    puzzleType: LevelFull['puzzleType'];
    requiresLevelId?: number | null;
    storyKey?: StoryKey | null;
    storyReveal?: string | null;
    active?: boolean;
    hints?: string[];
  }, orderIndex?: number, actorUserId = 'admin'): Promise<LevelFull> {
    const level = await this.db.levels.create({
      slug: input.slug,
      title: input.title,
      description: input.description,
      body: input.body,
      answers: input.answers,
      difficulty: input.difficulty,
      puzzleType: input.puzzleType,
      orderIndex: orderIndex ?? (await this.db.levels.maxOrderIndex()) + 1,
      requiresLevelId: input.requiresLevelId ?? null,
      storyKey: input.storyKey ?? null,
      storyReveal: input.storyReveal ?? null,
      active: input.active ?? true,
    });
    for (let i = 0; i < (input.hints ?? []).length; i++) {
      await this.db.levelHints.create({ levelId: level.id, position: i + 1, text: input.hints![i] });
    }
    await this.db.auditLogs.create({
      event: 'LEVEL_CREATE',
      actorUserId,
      details: { levelId: level.id, slug: input.slug },
    });
    return (await this.listAll()).find((l) => l.id === level.id)!;
  }

  async update(
    id: number,
    input: Partial<{
      slug: string;
      title: string;
      description: string;
      body: LevelBody;
      answers: string[];
      difficulty: LevelDifficulty;
      puzzleType: LevelFull['puzzleType'];
      requiresLevelId: number | null;
      storyKey: StoryKey | null;
      storyReveal: string | null;
      active: boolean;
      hints: string[];
    }>
  , actorUserId = 'admin'): Promise<LevelFull | null> {
    const patch: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(input)) {
      if (value !== undefined) patch[key] = value;
    }
    const level = await this.db.levels.update(id, patch as never);
    if (!level) return null;
    if (input.hints) {
      await this.db.levelHints.deleteForLevel(id);
      for (let i = 0; i < input.hints.length; i++) {
        await this.db.levelHints.create({ levelId: id, position: i + 1, text: input.hints[i] });
      }
    }
    await this.db.auditLogs.create({
      event: 'LEVEL_UPDATE',
      actorUserId,
      details: { levelId: id },
    });
    return (await this.listAll()).find((l) => l.id === id) ?? null;
  }

  async remove(id: number, actorUserId = 'admin'): Promise<void> {
    await this.db.levelHints.deleteForLevel(id);
    await this.db.levels.remove(id);
    await this.db.auditLogs.create({
      event: 'LEVEL_DELETE',
      actorUserId,
      details: { levelId: id },
    });
  }

  // ------------------------------------------------------------------
  // internal helpers
  // ------------------------------------------------------------------

  private isUnlocked(level: { requiresLevelId: number | null }, solvedIds: Set<number>): boolean {
    if (level.requiresLevelId === null) return true;
    return solvedIds.has(level.requiresLevelId);
  }

  private toMeta(
    level: {
      id: number;
      slug: string;
      title: string;
      difficulty: LevelDifficulty;
      puzzleType: LevelFull['puzzleType'];
      orderIndex: number;
      storyKey: StoryKey | null;
      active: boolean;
    },
    progress: { levelId: number; solved: boolean; attempts: number; hintsUsed: number }[],
    solvedIds: Set<number>,
    unlocked: boolean,
    totalHints: number
  ): LevelMeta {
    const prog = progress.find((p) => p.levelId === level.id);
    return {
      id: level.id,
      slug: level.slug,
      title: level.title,
      difficulty: level.difficulty,
      puzzleType: level.puzzleType,
      orderIndex: level.orderIndex,
      storyKey: level.storyKey,
      active: level.active,
      solved: prog?.solved ?? false,
      unlocked,
      hintsUsed: prog?.hintsUsed ?? 0,
      totalHints,
      attempts: prog?.attempts ?? 0,
      nextLevelId: null,
    };
  }

  private async nextLevel(levelId: number): Promise<number | null> {
    const level = await this.db.levels.findById(levelId);
    if (!level) return null;
    const levels = await this.db.levels.listActive();
    const next = levels.find((l) => l.orderIndex === level.orderIndex + 1);
    return next ? next.id : null;
  }
}