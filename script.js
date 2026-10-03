/* =========================================================
   BEAT RUSH — mini juego de ritmo (5 niveles + nivel secreto)
   HTML5 + CSS3 + JavaScript vanilla. Sin dependencias.

   Estructura de este archivo:
   1. Configuración, música y niveles (datos)
   2. Construcción de la canción de cada nivel
   3. Personajes (SVG) y escenarios (SVG)
   4. Audio (Web Audio API, todo sintetizado)
   5. Reloj compartido audio / visual / input
   6. Progreso guardado (localStorage)
   7. Pantallas: inicio, mapa, opciones
   8. Juego: render, juicio de golpes, bucle
   9. Resultados
   10. Input y arranque

   Sincronización: la música se agenda en el reloj del AudioContext.
   Los visuales y los toques usan performance.now(), convertido al
   mismo "tiempo de canción" con Clock.song(). Una sola referencia.
   ========================================================= */
(() => {
  'use strict';

  /* =========================================================
     1. CONFIGURACIÓN
     ========================================================= */
  const LEAD_IN = 1.9;              // segundos de intro antes de la cuenta 3-2-1
  const DEBOUNCE = 0.045;           // evita doble registro del mismo input
  const DOUBLE_TAP_GRACE = 0.15;    // toque extra justo después de acertar: se ignora
  const RESULTS_INPUT_DELAY = 700;  // ms antes de aceptar ESPACIO en resultados
  const PASS_SCORE = 50;            // nota mínima (0–100) para desbloquear el siguiente nivel
  const STORE_KEY = 'beat-rush-progress-v2';

  const COLORS = {
    pink: '#FF4D8D',
    mint: '#3DF5C2',
    yellow: '#FFD23F',
    sky: '#7CC8FF',
    red: '#FF5E57',
    ink: '#FFF4E6',
    violet: '#8F6BFF'
  };

  const SUB_COLORS = {
    beat: COLORS.pink,
    half: COLORS.mint,
    third: COLORS.sky,
    quarter: COLORS.yellow
  };

  // Progresiones de acordes (originales)
  const CH = {
    am: [
      { root: 110.00, tones: [220.00, 261.63, 329.63] },
      { root: 87.31, tones: [174.61, 220.00, 261.63] },
      { root: 130.81, tones: [196.00, 261.63, 329.63] },
      { root: 98.00, tones: [196.00, 246.94, 293.66] }
    ],
    c: [
      { root: 130.81, tones: [261.63, 329.63, 392.00] },
      { root: 110.00, tones: [220.00, 261.63, 329.63] },
      { root: 87.31, tones: [174.61, 220.00, 261.63] },
      { root: 98.00, tones: [196.00, 246.94, 293.66] }
    ],
    dm: [
      { root: 73.42, tones: [146.83, 174.61, 220.00] },
      { root: 116.54, tones: [233.08, 293.66, 349.23] },
      { root: 87.31, tones: [174.61, 220.00, 261.63] },
      { root: 130.81, tones: [261.63, 329.63, 392.00] }
    ],
    em: [
      { root: 82.41, tones: [164.81, 196.00, 246.94] },
      { root: 130.81, tones: [196.00, 261.63, 329.63] },
      { root: 110.00, tones: [220.00, 261.63, 329.63] },
      { root: 123.47, tones: [185.00, 246.94, 311.13] }
    ],
    gm: [
      { root: 98.00, tones: [196.00, 233.08, 293.66] },
      { root: 77.78, tones: [155.56, 196.00, 233.08] },
      { root: 116.54, tones: [233.08, 293.66, 349.23] },
      { root: 87.31, tones: [174.61, 220.00, 261.63] }
    ],
    bm: [
      { root: 123.47, tones: [246.94, 293.66, 369.99] },
      { root: 98.00, tones: [196.00, 246.94, 293.66] },
      { root: 146.83, tones: [293.66, 369.99, 440.00] },
      { root: 110.00, tones: [220.00, 277.18, 329.63] }
    ]
  };
  const A_MAJOR = { root: 110.00, tones: [220.00, 277.18, 329.63] };

  /* Estilos musicales: secuenciador por pasos.
     grid = pasos por compás (16 = semicorcheas, 12 = tresillos).
     kick/clap/hat/open: 'X'/'x' golpe fuerte, 'o' suave, '.' silencio.
     bass: 'R' raíz, 'O' octava, 'F' quinta. arp: índice del acorde (0-2). */
  const MUS = {
    arcade: {
      grid: 16,
      kick: 'X...x...x...x...',
      clap: '....x.......x...',
      hat: '..x...x...x...x.',
      open: '',
      bass: 'R...O...R...O.O.', bassWave: 'square',
      arp: '0.1.2.1.0.1.2.1.', leadWave: 'square', arpOct: 1, leadVol: 0.045,
      pad: false
    },
    forest: {
      grid: 16,
      kick: 'X...x...X...x...',
      clap: '...o..x....o..x.',
      hat: 'oxoxoxoxoxoxoxox',
      open: '',
      bass: 'R.....R...O.....', bassWave: 'triangle',
      arp: '0..1..2.0..1..2.', leadWave: 'sine', arpOct: 2, leadVol: 0.09,
      pad: false
    },
    space: {
      grid: 16,
      kick: 'X.........x.....',
      clap: '........x.......',
      hat: '..o...o...o...o.',
      open: '......x.......x.',
      bass: 'R.......F.......', bassWave: 'triangle',
      arp: '0...2...1...2...', leadWave: 'sine', arpOct: 2, leadVol: 0.07,
      pad: true
    },
    neo: {
      grid: 12,
      kick: 'X.....x..x..',
      clap: '...x.....x..',
      hat: 'xooxooxooxoo',
      open: '.....x.....x',
      bass: 'R..R.OR..R.O', bassWave: 'sawtooth',
      arp: '0.2.1.0.2.1.', leadWave: 'sawtooth', arpOct: 2, leadVol: 0.035,
      pad: false
    },
    final: {
      grid: 16,
      kick: 'X...x...x...x...',
      clap: '....x.......x..o',
      hat: 'xoxoxoxoxoxoxoxo',
      open: '..x...x...x...x.',
      bass: 'R.RO.RR.R.RO.RF.', bassWave: 'sawtooth',
      arp: '0121012101210121', leadWave: 'sawtooth', arpOct: 2, leadVol: 0.03,
      pad: true
    },
    prismA: {
      grid: 16,
      kick: 'X..x....x.x.....',
      clap: '....x.......x..o',
      hat: 'x.xxx.xxx.xxx.xx',
      open: '',
      bass: 'R..R..O.R..F..O.', bassWave: 'square',
      arp: '0.2.1.2.0.2.1.2.', leadWave: 'square', arpOct: 2, leadVol: 0.04,
      pad: false
    },
    prismB: {
      grid: 16,
      kick: 'X...x...x...x...',
      clap: '....x.......x...',
      hat: 'xoxoxoxoxoxoxoxo',
      open: '..x...x...x...x.',
      bass: 'O.R.O.R.O.R.O.R.', bassWave: 'sawtooth',
      arp: '0121012101210121', leadWave: 'sawtooth', arpOct: 2, leadVol: 0.03,
      pad: false
    },
    prismC: {
      grid: 12,
      kick: 'X........x..',
      clap: '......x.....',
      hat: 'x.xx.xx.xx.x',
      open: '',
      bass: 'R.....F.....', bassWave: 'triangle',
      arp: '0.1.2.1.0.2.', leadWave: 'sine', arpOct: 2, leadVol: 0.08,
      pad: true
    },
    prismD: {
      grid: 16,
      kick: 'X...x...x...x.x.',
      clap: '....x.......x...',
      hat: 'xxoxxxoxxxoxxxox',
      open: '..x...x...x...x.',
      bass: 'R.RO.RR.R.RO.RF.', bassWave: 'sawtooth',
      arp: '0120120120120122', leadWave: 'square', arpOct: 2, leadVol: 0.035,
      pad: true
    }
  };

  const T = 1 / 3; // tresillo

  /* NIVELES. Cada compás es una lista de posiciones (en pulsos, 0–3.x) */
  const LEVELS = [
    {
      id: '1', num: 1, secret: false,
      name: 'Arcade Nocturno', difficulty: 'Tutorial',
      char: 'bolt', charName: 'Bolt, el robot',
      scene: 'arcade', color: '#FF4D8D', accent: '255, 77, 141',
      hitWave: 'square', approach: 1.7, win: [0.09, 0.17],
      intro: ['TOCA AL RITMO', 'Toca cuando la bolita llegue al aro'],
      sections: [{
        bpm: 100, mus: MUS.arcade, chords: CH.am,
        bars: [
          [0, 2], [0, 2], [0, 1, 2, 3], [0, 1, 2],
          [0, 2, 3], [0, 1, 2, 3], [0, 1, 2, 2.5], [0, 2],
          [0, 1, 2, 3], [0, 0.5, 1, 2], [0, 1, 2, 2.5, 3], [0, 2],
          [0, 1, 2, 3], [0, 1, 2, 2.5, 3], [0]
        ]
      }],
      tags: [
        { bar: 3, text: '¡Ahora cada pulso!' },
        { bar: 7, text: '¡Ojo: golpes dobles!' },
        { bar: 13, text: '¡Último empujón!' }
      ]
    },
    {
      id: '2', num: 2, secret: false,
      name: 'Bosque Colorido', difficulty: 'Fácil',
      char: 'miso', charName: 'Miso, la gata',
      scene: 'forest', color: '#3DF5C2', accent: '61, 245, 194',
      hitWave: 'sine', approach: 1.6, win: [0.085, 0.165],
      intro: ['BOSQUE COLORIDO', 'Ritmo saltarín: 1... 2... 3'],
      sections: [{
        bpm: 108, mus: MUS.forest, chords: CH.c,
        bars: [
          [0, 1.5, 3], [0, 1.5, 3], [0, 1, 2, 3], [0, 1.5, 3],
          [0, 1.5, 2, 3], [0, 1.5, 2.5, 3], [0, 0.5, 1.5, 3], [0, 2],
          [0, 1.5, 3, 3.5], [1, 1.5, 3], [0, 1.5, 2, 2.5, 3], [0, 1.5, 3],
          [0, 0.5, 1.5, 2, 3], [0, 1.5, 2.5, 3, 3.5], [0, 1.5, 3], [0]
        ]
      }],
      tags: [
        { bar: 5, text: '¡Más golpes!' },
        { bar: 9, text: '¡Contratiempos!' },
        { bar: 13, text: '¡Final del bosque!' }
      ]
    },
    {
      id: '3', num: 3, secret: false,
      name: 'Órbita Lunar', difficulty: 'Intermedio',
      char: 'nova', charName: 'Nova, la astronauta',
      scene: 'space', color: '#7CC8FF', accent: '124, 200, 255',
      hitWave: 'sine', approach: 1.5, win: [0.08, 0.16],
      intro: ['ÓRBITA LUNAR', 'Atento a los contratiempos y silencios'],
      sections: [{
        bpm: 116, mus: MUS.space, chords: CH.dm,
        bars: [
          [0, 1, 2, 3], [0, 1.5, 2, 3], [0.5, 1.5, 2, 3], [0, 2],
          [0.5, 1.5, 2.5, 3], [0, 1, 3], [0, 0.5, 1.5, 2.5], [0, 3],
          [0, 0.5, 1, 2.5, 3], [1, 1.5, 2.5, 3.5], [0, 0.5, 1.5, 2, 3, 3.5], [0, 2.5],
          [0.5, 1, 1.5, 2.5, 3], [0, 0.5, 1, 1.5, 2.5, 3], [0, 1.5, 2, 3], [0]
        ]
      }],
      tags: [
        { bar: 3, text: '¡Empieza a destiempo!' },
        { bar: 8, text: '¡Silencio espacial!' },
        { bar: 13, text: '¡Lluvia de meteoros!' }
      ]
    },
    {
      id: '4', num: 4, secret: false,
      name: 'Neo Ciudad', difficulty: 'Difícil',
      char: 'kage', charName: 'Kage, el ninja',
      scene: 'future', color: '#FF7EDB', accent: '255, 126, 219',
      hitWave: 'triangle', approach: 1.35, win: [0.075, 0.15],
      intro: ['NEO CIUDAD', 'Tresillos ninja: bolitas azules'],
      sections: [{
        bpm: 124, mus: MUS.neo, chords: CH.em,
        bars: [
          [0, 1, 2, 3], [0, 2 * T, 4 * T, 2, 3], [0, 1, 5 * T, 2, 3], [0, 2 * T, 2, 8 * T],
          [0, T, 2 * T, 2, 3], [0, 1, 2, 7 * T, 8 * T], [0, 2 * T, 4 * T, 2, 3], [0, 2],
          [0, T, 2 * T, 1, 2, 8 * T, 10 * T], [0, 5 * T, 7 * T, 3], [0, T, 2 * T, 5 * T, 2, 3], [0, 2 * T, 4 * T, 2, 8 * T, 10 * T],
          [0, 1, 4 * T, 5 * T, 2, 3, 10 * T, 11 * T], [0, 2 * T, 4 * T, 2, 7 * T, 8 * T, 10 * T], [0, 1, 2, 3], [0]
        ]
      }],
      tags: [
        { bar: 2, text: '¡Ritmo ninja!' },
        { bar: 5, text: '¡Ráfaga de tresillos!' },
        { bar: 9, text: '¡Más rápido!' },
        { bar: 13, text: '¡Golpe final ninja!' }
      ]
    },
    {
      id: '5', num: 5, secret: false,
      name: 'Gran Final', difficulty: 'Muy difícil',
      char: 'draco', charName: 'Draco, el dragón DJ',
      scene: 'stage', color: '#FFD23F', accent: '255, 210, 63',
      hitWave: 'sawtooth', approach: 1.15, win: [0.07, 0.14],
      intro: ['GRAN FINAL', 'Todo junto: síncopas y golpes rapidísimos'],
      sections: [{
        bpm: 132, mus: MUS.final, chords: CH.gm,
        bars: [
          [0, 1, 2, 3], [0, 0.5, 1, 2, 2.5, 3], [0, 0.75, 1.5, 2, 3], [0, 1, 1.25, 2, 3],
          [0, 0.5, 1.5, 2, 2.5, 3.5], [0, 0.75, 1.5, 2.25, 3], [0, 1, 1.25, 1.5, 2, 3, 3.5], [0, 3],
          [0, 0.5, 1, 1.5, 2, 2.25, 2.5, 3], [0.5, 1, 2, 2.75, 3.5], [0, 0.25, 1, 1.5, 2, 2.25, 3], [0, 1.5, 3],
          [0, 0.5, 0.75, 1.5, 2, 2.5, 2.75, 3.5], [0, 0.25, 0.5, 1, 2, 2.25, 2.5, 3], [0, 0.75, 1.5, 2, 2.5, 3, 3.25, 3.5], [0, 1, 2, 2.5, 3, 3.25, 3.5],
          [0]
        ]
      }],
      tags: [
        { bar: 3, text: '¡Síncopas!' },
        { bar: 8, text: '¡Pausa sorpresa!' },
        { bar: 13, text: '¡Todo o nada!' }
      ]
    },
    {
      id: 'S', num: 6, secret: true,
      name: 'Prisma Secreto', difficulty: 'Secreto',
      char: 'lumi', charName: 'Lumi, el espíritu prisma',
      scene: 'prism', color: '#FF7EDB', accent: '255, 126, 219',
      hitWave: 'triangle', approach: 1.1, win: [0.07, 0.14],
      intro: ['NIVEL SECRETO', 'El tempo va a cambiar. ¡Suerte!'],
      finalChord: A_MAJOR,
      sections: [
        {
          bpm: 120, mus: MUS.prismA, chords: CH.am,
          bars: [
            [0, 0.5, 1, 2, 2.5, 3], [0, 0.75, 1.5, 2, 3, 3.5], [0, 1, 1.25, 1.5, 2, 3], [0, 0.5, 1.5, 2, 2.75, 3.5]
          ]
        },
        {
          bpm: 150, mus: MUS.prismB, chords: CH.bm, tag: '¡Acelera! 150 BPM',
          bars: [
            [0, 1, 2, 3], [0, 0.5, 1, 2, 3], [0, 1, 1.5, 2, 2.5, 3], [0, 0.5, 1, 1.5, 2, 3], [0, 2]
          ]
        },
        {
          bpm: 96, mus: MUS.prismC, chords: CH.em, tag: '¡Frena! Tresillos lentos',
          bars: [
            [0, 2 * T, 4 * T, 2, 3], [0, T, 2 * T, 1, 2, 3], [0, 1, 4 * T, 5 * T, 2, 8 * T, 10 * T], [0, 2]
          ]
        },
        {
          bpm: 140, mus: MUS.prismD, chords: CH.gm, tag: '¡Sprint final!',
          bars: [
            [0, 0.5, 0.75, 1.5, 2, 2.5, 3, 3.5], [0, 0.25, 0.5, 1, 2, 2.75, 3.5], [0, 0.75, 1.5, 2.25, 3, 3.25, 3.5], [0, 0.5, 1, 1.25, 1.5, 2, 2.5, 3, 3.5], [0]
          ]
        }
      ],
      tags: []
    }
  ];
  const MAIN_LEVELS = LEVELS.filter((l) => !l.secret);
  const SECRET_LEVEL = LEVELS.find((l) => l.secret);
  const levelById = (id) => LEVELS.find((l) => l.id === id);

  const PHRASES = {
    S: ['¡Perfecto absoluto!', '¡Eres una máquina de ritmo!', '¡Impecable!'],
    A: ['¡Casi perfecto!', '¡Excelente!', '¡Qué buen oído!'],
    B: ['¡Buen ritmo!', '¡Vas muy bien!', '¡Nada mal!'],
    C: ['¡Ya casi lo tienes!', '¡Sigue practicando!', '¡Cada intento cuenta!'],
    D: ['¡Inténtalo otra vez!', '¡El ritmo está en ti, otra vez!', '¡Escucha el bombo y vuelve!']
  };

  /* ---------------- Utilidades ---------------- */
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const fmt = (n) => Math.round(n).toLocaleString('es-MX');
  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
  const $ = (id) => document.getElementById(id);
  const near = (a, b) => Math.abs(a - b) < 0.01;

  function mulberry(seed) {
    let s = seed >>> 0;
    return () => {
      s = (s + 0x6D2B79F5) >>> 0;
      let t = s;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  const motionQuery = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
  let reducedMotion = !!(motionQuery && motionQuery.matches);
  if (motionQuery) {
    const onMotion = (e) => { reducedMotion = e.matches; };
    if (motionQuery.addEventListener) motionQuery.addEventListener('change', onMotion);
    else if (motionQuery.addListener) motionQuery.addListener(onMotion);
  }

  function scoreToStars(score) {
    if (score >= 100) return 5;
    if (score >= 90) return 4;
    if (score >= 75) return 3;
    if (score >= 60) return 2;
    if (score >= PASS_SCORE) return 1;
    return 0;
  }

  function ratingFor(score) {
    if (score >= 100) return 'S';
    if (score >= 90) return 'A';
    if (score >= 75) return 'B';
    if (score >= 60) return 'C';
    return 'D';
  }

  function starsHTML(n) {
    let s = '';
    for (let i = 0; i < 5; i++) s += i < n ? '★' : '<span class="off">☆</span>';
    return s;
  }

  /* =========================================================
     2. CONSTRUCCIÓN DE LA CANCIÓN
     ========================================================= */
  function subdivision(pos) {
    let f = pos - Math.floor(pos);
    if (near(f, 1)) f = 0;
    if (near(f, 0)) return 'beat';
    if (near(f, 0.5)) return 'half';
    if (near(f, 1 / 3) || near(f, 2 / 3)) return 'third';
    return 'quarter';
  }

  const songCache = {};

  function buildSong(level) {
    if (songCache[level.id]) return songCache[level.id];
    const secs = level.sections;
    const cdBeat = 60 / secs[0].bpm;
    const notes = [];
    const lines = [];
    const bars = [];
    const tags = [];
    for (let b = 0; b < 4; b++) lines.push({ t: b * cdBeat, bar: b === 0 });

    let t = 4 * cdBeat;
    let absBar = 0;
    const totalBars = secs.reduce((a, s) => a + s.bars.length, 0);

    secs.forEach((sec, si) => {
      const beat = 60 / sec.bpm;
      if (si > 0 && sec.tag) tags.push({ t: t - 2 * (60 / secs[si - 1].bpm), text: sec.tag });
      sec.bars.forEach((pattern, bi) => {
        absBar++;
        const isFinal = absBar === totalBars;
        const chord = isFinal && level.finalChord ? level.finalChord : sec.chords[bi % 4];
        let intensity;
        if (secs.length > 1) {
          intensity = bi === 0 ? 2 : 3;
        } else {
          const f = (absBar - 1) / totalBars;
          intensity = f < 0.25 ? 1 : f < 0.55 ? 2 : 3;
        }
        bars.push({ t, beat, mus: sec.mus, chord, intensity, final: isFinal, fill: false, bpm: sec.bpm });
        for (let k = 0; k < 4; k++) lines.push({ t: t + k * beat, bar: k === 0 });
        pattern.forEach((pos, k) => {
          let f = chord.tones[k % 3] * 2;
          while (f > 900) f /= 2;
          notes.push({ t: t + pos * beat, sub: subdivision(pos), freq: f });
        });
        t += 4 * beat;
      });
    });

    (level.tags || []).forEach((tg) => {
      const bar = bars[tg.bar - 1];
      if (!bar) return;
      tags.push({ t: bar.t - 2 * bar.beat, text: tg.text });
      if (tg.bar >= 2) bars[tg.bar - 2].fill = true;
    });
    // Redoble antes de cada cambio de sección
    let acc = 0;
    secs.forEach((sec, si) => {
      acc += sec.bars.length;
      if (si < secs.length - 1 && bars[acc - 1]) bars[acc - 1].fill = true;
    });

    notes.sort((a, b) => a.t - b.t);
    tags.sort((a, b) => a.t - b.t);
    const lastNote = notes[notes.length - 1].t;
    const lastBeat = bars[bars.length - 1].beat;
    const song = {
      notes,
      lines: lines.filter((l) => l.t <= lastNote + 0.001),
      bars,
      tags,
      cdBeat,
      firstT: notes[0].t,
      lastT: lastNote,
      finT: lastNote + lastBeat,
      endT: lastNote + 4 * lastBeat,
      approach: level.approach,
      winP: level.win[0],
      winG: level.win[1],
      winEarly: level.win[1] + 0.06,
      lateGrace: level.win[1] + 0.1
    };
    songCache[level.id] = song;
    return song;
  }

  /* =========================================================
     3a. PERSONAJES (SVG originales)
     Todos comparten la misma estructura: .b-body (rebote),
     .b-arm (baqueta), ojos/bocas para cada expresión.
     ========================================================= */
  let svgUid = 0;

  function armSVG(limb, hand, stick = '#FFF4E6', tip = '#FF4D8D') {
    return `<g class="b-arm">
      <path d="M90 94 Q108 98 116 88" fill="none" stroke="${limb}" stroke-width="9" stroke-linecap="round"/>
      <line x1="116" y1="88" x2="145" y2="60" stroke="${stick}" stroke-width="5" stroke-linecap="round"/>
      <circle cx="145" cy="60" r="5" fill="${tip}"/>
      <circle cx="116" cy="88" r="7.5" fill="${hand}"/>
    </g>`;
  }

  function faceSVG(o = {}) {
    const lx = o.lx ?? 45, rx = o.rx ?? 75, y = o.y ?? 70;
    const ew = o.ew ?? 8.5, eh = o.eh ?? 10.5;
    const white = o.white || '#fff', pupil = o.pupil || '#1A0F33';
    const my = o.my ?? 89, mw = o.mw ?? 7;
    const pr = ew * 0.57;
    const normalMouth = o.mouthD || `M${60 - mw} ${my} Q60 ${my + 7} ${60 + mw} ${my}`;
    return `
      <g class="b-eyes b-eyes-normal">
        <ellipse cx="${lx}" cy="${y}" rx="${ew}" ry="${eh}" fill="${white}"/>
        <ellipse cx="${rx}" cy="${y}" rx="${ew}" ry="${eh}" fill="${white}"/>
        <circle cx="${lx + 2}" cy="${y + 2}" r="${pr}" fill="${pupil}"/>
        <circle cx="${rx + 2}" cy="${y + 2}" r="${pr}" fill="${pupil}"/>
        <circle cx="${lx + 4}" cy="${y - 1}" r="1.7" fill="#fff"/>
        <circle cx="${rx + 4}" cy="${y - 1}" r="1.7" fill="#fff"/>
      </g>
      <g class="b-eyes b-eyes-happy">
        <path d="M${lx - 8} ${y + 3} Q${lx} ${y - 9} ${lx + 8} ${y + 3}"/>
        <path d="M${rx - 8} ${y + 3} Q${rx} ${y - 9} ${rx + 8} ${y + 3}"/>
      </g>
      <g class="b-eyes b-eyes-dizzy">
        <path d="M${lx - 6} ${y - 6} L${lx + 6} ${y + 6} M${lx + 6} ${y - 6} L${lx - 6} ${y + 6}"/>
        <path d="M${rx - 6} ${y - 6} L${rx + 6} ${y + 6} M${rx + 6} ${y - 6} L${rx - 6} ${y + 6}"/>
      </g>
      <path class="b-mouth b-mouth-normal" d="${normalMouth}"/>
      <path class="b-mouth-open" d="M${60 - 11} ${my - 2} Q60 ${my - 4} ${60 + 11} ${my - 2} Q${60 + 9} ${my + 13} 60 ${my + 13} Q${60 - 9} ${my + 13} ${60 - 11} ${my - 2} Z"/>
      <path class="b-mouth b-mouth-sad" d="M${60 - 8} ${my + 8} Q60 ${my} ${60 + 8} ${my + 8}"/>`;
  }

  // Ojos de pantalla para el robot
  function screenFaceSVG(c) {
    return `
      <g class="b-eyes b-eyes-normal">
        <rect x="39" y="52" width="11" height="15" rx="3" fill="${c}"/>
        <rect x="70" y="52" width="11" height="15" rx="3" fill="${c}"/>
      </g>
      <g class="b-eyes b-eyes-happy">
        <path d="M37 62 Q44 51 51 62"/><path d="M69 62 Q76 51 83 62"/>
      </g>
      <g class="b-eyes b-eyes-dizzy">
        <path d="M39 53 L50 64 M50 53 L39 64"/><path d="M70 53 L81 64 M81 53 L70 64"/>
      </g>
      <path class="b-mouth b-mouth-normal" d="M52 72 Q60 77 68 72"/>
      <path class="b-mouth-open" d="M50 70 L70 70 Q68 80 60 80 Q52 80 50 70 Z"/>
      <path class="b-mouth b-mouth-sad" d="M52 78 Q60 71 68 78"/>`;
  }

  const BLOB = 'M60 26 C92 26 106 52 106 84 C106 114 88 128 60 128 C32 128 14 114 14 84 C14 52 28 26 60 26 Z';

  const CHARACTERS = {
    // Mascota de la portada
    pum: () => ({
      line: '#1A0F33',
      body: `
        ${armSVG('#8F6BFF', '#A487FF')}
        <g class="b-antenna-group">
          <path d="M60 30 Q57 16 68 8" fill="none" stroke="#6A47E0" stroke-width="4" stroke-linecap="round"/>
          <circle cx="68" cy="8" r="6.5" fill="#FFD23F"/>
        </g>
        <path d="${BLOB}" fill="#8F6BFF"/>
        <ellipse cx="60" cy="102" rx="27" ry="19" fill="#B9A2FF"/>
        <circle cx="15" cy="98" r="7.5" fill="#A487FF"/>
        <ellipse cx="33" cy="87" rx="7" ry="4.5" fill="#FF8FB8" opacity="0.8"/>
        <ellipse cx="87" cy="87" rx="7" ry="4.5" fill="#FF8FB8" opacity="0.8"/>
        ${faceSVG()}
        <ellipse cx="42" cy="129" rx="11" ry="6" fill="#6A47E0"/>
        <ellipse cx="78" cy="129" rx="11" ry="6" fill="#6A47E0"/>
        <g class="b-crown">
          <path d="M38 30 L38 8 L49 19 L60 2 L71 19 L82 8 L82 30 Z" fill="#FFD23F" stroke="#C9900E" stroke-width="2.5" stroke-linejoin="round"/>
          <circle cx="60" cy="20" r="4.5" fill="#FF4D8D"/>
          <circle cx="45" cy="24" r="3" fill="#3DF5C2"/>
          <circle cx="75" cy="24" r="3" fill="#7CC8FF"/>
        </g>`
    }),

    // Nivel 1: robot
    bolt: () => ({
      line: '#3DF5C2',
      body: `
        ${armSVG('#7FA3C9', '#A9C4E0')}
        <line x1="60" y1="28" x2="60" y2="13" stroke="#A9C4E0" stroke-width="4" stroke-linecap="round"/>
        <circle class="sc-blink" cx="60" cy="10" r="6" fill="#FF4D8D"/>
        <rect x="13" y="50" width="10" height="20" rx="3" fill="#5D7FA6"/>
        <rect x="97" y="50" width="10" height="20" rx="3" fill="#5D7FA6"/>
        <rect x="20" y="26" width="80" height="64" rx="18" fill="#8FB3D9"/>
        <rect x="30" y="38" width="60" height="44" rx="10" fill="#14213D"/>
        <rect x="50" y="88" width="20" height="8" fill="#5D7FA6"/>
        <rect x="30" y="94" width="60" height="32" rx="11" fill="#8FB3D9"/>
        <circle cx="60" cy="108" r="6" fill="#3DF5C2"/>
        <rect x="40" y="117" width="40" height="3" rx="1.5" fill="#5D7FA6"/>
        <circle cx="25" cy="104" r="7" fill="#A9C4E0"/>
        ${screenFaceSVG('#3DF5C2')}
        <rect x="34" y="123" width="20" height="10" rx="4" fill="#5D7FA6"/>
        <rect x="66" y="123" width="20" height="10" rx="4" fill="#5D7FA6"/>`
    }),

    // Nivel 2: gata
    miso: () => ({
      line: '#4A2410',
      body: `
        <path d="M26 116 Q-2 112 8 86 Q13 74 21 80" fill="none" stroke="#E07A1F" stroke-width="10" stroke-linecap="round"/>
        ${armSVG('#FF9F43', '#FFC58A')}
        <path d="M24 50 L28 12 L54 32 Z" fill="#FF9F43"/>
        <path d="M30 42 L32 22 L46 33 Z" fill="#FF8FB8"/>
        <path d="M96 50 L92 12 L66 32 Z" fill="#FF9F43"/>
        <path d="M90 42 L88 22 L74 33 Z" fill="#FF8FB8"/>
        <path d="${BLOB}" fill="#FF9F43"/>
        <path d="M52 32 L54 43 M60 30 L60 43 M68 32 L66 43" stroke="#E07A1F" stroke-width="3.5" stroke-linecap="round"/>
        <ellipse cx="60" cy="110" rx="23" ry="14" fill="#FFE3C4"/>
        <ellipse cx="60" cy="88" rx="17" ry="11" fill="#FFE3C4"/>
        <path d="M56 82 L64 82 L60 87 Z" fill="#FF5E8A"/>
        <path d="M44 86 L22 81 M44 90 L22 92 M76 86 L98 81 M76 90 L98 92" stroke="#7A4A1F" stroke-width="1.6" stroke-linecap="round"/>
        <circle cx="15" cy="98" r="7.5" fill="#FFC58A"/>
        <ellipse cx="31" cy="82" rx="6" ry="4" fill="#FF8FB8" opacity="0.7"/>
        <ellipse cx="89" cy="82" rx="6" ry="4" fill="#FF8FB8" opacity="0.7"/>
        ${faceSVG({ y: 67, pupil: '#1F4D2B', my: 91, mouthD: 'M52 90 Q56 95 60 90 Q64 95 68 90' })}
        <ellipse cx="42" cy="129" rx="11" ry="6" fill="#E07A1F"/>
        <ellipse cx="78" cy="129" rx="11" ry="6" fill="#E07A1F"/>`
    }),

    // Nivel 3: astronauta
    nova: () => ({
      line: '#FFF4E6',
      body: `
        <rect x="8" y="58" width="22" height="50" rx="7" fill="#B9C2DE"/>
        ${armSVG('#EDEFF7', '#FF8F5A')}
        <rect x="26" y="80" width="68" height="48" rx="22" fill="#EDEFF7"/>
        <rect x="26" y="106" width="68" height="6" fill="#C9D0E8"/>
        <rect x="47" y="88" width="26" height="13" rx="3" fill="#2B3A6B"/>
        <circle cx="53" cy="94.5" r="2.4" fill="#FF4D8D"/>
        <circle cx="60" cy="94.5" r="2.4" fill="#FFD23F"/>
        <circle cx="67" cy="94.5" r="2.4" fill="#3DF5C2"/>
        <line x1="84" y1="30" x2="93" y2="14" stroke="#C9D0E8" stroke-width="3" stroke-linecap="round"/>
        <circle class="sc-blink" cx="93" cy="13" r="4" fill="#FF4D8D"/>
        <circle cx="60" cy="58" r="37" fill="#EDEFF7"/>
        <ellipse cx="60" cy="60" rx="28" ry="24" fill="#1B2A55"/>
        <path d="M40 50 Q46 40 58 38" fill="none" stroke="#FFFFFF" stroke-width="4" stroke-linecap="round" opacity="0.35"/>
        <circle cx="22" cy="102" r="7" fill="#FF8F5A"/>
        ${faceSVG({ lx: 49, rx: 71, y: 58, ew: 6.5, eh: 8, pupil: '#1B2A55', my: 70, mw: 6 })}
        <rect x="32" y="122" width="22" height="11" rx="5" fill="#8E98BD"/>
        <rect x="66" y="122" width="22" height="11" rx="5" fill="#8E98BD"/>`
    }),

    // Nivel 4: ninja
    kage: () => ({
      line: '#8A92C4',
      body: `
        <path d="M22 46 Q4 38 -2 52 M22 51 Q8 58 6 70" fill="none" stroke="#FF4D5E" stroke-width="5" stroke-linecap="round"/>
        ${armSVG('#2E3350', '#3D4470', '#FFF4E6', '#FF4D5E')}
        <path d="${BLOB}" fill="#2E3350"/>
        <rect x="20" y="56" width="80" height="26" rx="13" fill="#F2C6A0"/>
        <rect x="16" y="41" width="88" height="12" rx="6" fill="#FF4D5E"/>
        <rect x="50" y="42" width="20" height="10" rx="2" fill="#C9D0E8"/>
        <circle cx="21" cy="47" r="6" fill="#E03848"/>
        <rect x="24" y="104" width="72" height="7" rx="3" fill="#4A5280"/>
        <circle cx="15" cy="98" r="7.5" fill="#3D4470"/>
        ${faceSVG({ y: 69, ew: 7.5, eh: 8.5, pupil: '#1A0F33', my: 92 })}
        <path class="b-eyes-normal" d="M36 58 L53 62 M84 58 L67 62" stroke="#2E3350" stroke-width="3" stroke-linecap="round"/>
        <ellipse cx="42" cy="129" rx="11" ry="6" fill="#1E2238"/>
        <ellipse cx="78" cy="129" rx="11" ry="6" fill="#1E2238"/>`
    }),

    // Nivel 5: dragón DJ
    draco: () => ({
      line: '#3A0E06',
      body: `
        <path d="M28 116 Q0 122 6 98" fill="none" stroke="#E8553A" stroke-width="10" stroke-linecap="round"/>
        <path d="M1 98 L10 88 L13 101 Z" fill="#FFD23F"/>
        <path d="M26 70 L2 42 L15 46 L10 28 L34 54 Z" fill="#B8402A"/>
        <path d="M94 70 L118 42 L105 46 L110 28 L86 54 Z" fill="#B8402A"/>
        ${armSVG('#FF6B4A', '#FF8C6E', '#FFF4E6', '#3DF5C2')}
        <path d="M36 36 L29 10 L48 28 Z" fill="#FFE7A3"/>
        <path d="M84 36 L91 10 L72 28 Z" fill="#FFE7A3"/>
        <path d="${BLOB}" fill="#FF6B4A"/>
        <path d="M54 27 L60 15 L66 27 Z" fill="#FFD23F"/>
        <ellipse cx="60" cy="104" rx="26" ry="19" fill="#FFD27A"/>
        <path d="M40 98 L80 98 M38 106 L82 106 M42 114 L78 114" stroke="#E8A93A" stroke-width="2"/>
        <path d="M24 66 Q24 22 60 22 Q96 22 96 66" fill="none" stroke="#2B1A57" stroke-width="6" stroke-linecap="round"/>
        <rect x="13" y="56" width="15" height="25" rx="6" fill="#2B1A57"/>
        <rect x="16.5" y="62" width="8" height="13" rx="3" fill="#FF4D8D"/>
        <rect x="92" y="56" width="15" height="25" rx="6" fill="#2B1A57"/>
        <rect x="95.5" y="62" width="8" height="13" rx="3" fill="#3DF5C2"/>
        <circle cx="15" cy="98" r="7.5" fill="#FF8C6E"/>
        <circle cx="55" cy="82" r="1.8" fill="#3A0E06"/>
        <circle cx="65" cy="82" r="1.8" fill="#3A0E06"/>
        ${faceSVG({ y: 66, pupil: '#3A0E06', my: 90 })}
        <ellipse cx="42" cy="129" rx="11" ry="6" fill="#C94A2F"/>
        <ellipse cx="78" cy="129" rx="11" ry="6" fill="#C94A2F"/>`
    }),

    // Secreto: espíritu prisma
    lumi: (uid) => ({
      line: '#3B1F6B',
      defs: `<linearGradient id="lg${uid}" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stop-color="#7CC8FF"/><stop offset="0.5" stop-color="#FF7EDB"/><stop offset="1" stop-color="#FFD23F"/>
        </linearGradient>`,
      body: `
        <circle class="b-halo" cx="60" cy="76" r="54" fill="#FFFFFF" opacity="0.1"/>
        ${armSVG('#C9B6FF', '#FFFFFF', '#FFFFFF', '#FFD23F')}
        <path d="M60 16 L100 52 L90 112 L60 130 L30 112 L20 52 Z" fill="url(#lg${uid})"/>
        <path d="M20 52 L60 40 L100 52 L60 16 Z" fill="#FFFFFF" opacity="0.3"/>
        <path d="M30 112 L60 98 L90 112 L60 130 Z" fill="#1A0F33" opacity="0.15"/>
        <path d="M60 40 L60 16" stroke="#FFFFFF" stroke-width="1.5" opacity="0.5"/>
        <circle cx="18" cy="96" r="6.5" fill="#FFFFFF"/>
        ${faceSVG({ y: 70, pupil: '#3B1F6B', my: 90 })}
        <path class="b-sparkle" d="M12 22 L15 30 L23 33 L15 36 L12 44 L9 36 L1 33 L9 30 Z" fill="#FFD23F"/>
        <path class="b-sparkle" d="M104 18 L106 24 L112 26 L106 28 L104 34 L102 28 L96 26 L102 24 Z" fill="#7CC8FF"/>
        <path class="b-sparkle" d="M108 112 L110 117 L115 119 L110 121 L108 126 L106 121 L101 119 L106 117 Z" fill="#FF7EDB"/>`
    })
  };

  function characterSVG(kind) {
    const uid = ++svgUid;
    const c = CHARACTERS[kind](uid);
    const shadow = kind === 'lumi'
      ? '<ellipse cx="60" cy="136" rx="24" ry="4" fill="rgba(0,0,0,0.3)"/>'
      : '<ellipse cx="60" cy="134" rx="38" ry="5" fill="rgba(0,0,0,0.35)"/>';
    return `<div class="buddy-inner"><svg class="buddy-svg" viewBox="0 0 150 140" style="--line:${c.line}" aria-hidden="true" focusable="false">
      ${c.defs ? `<defs>${c.defs}</defs>` : ''}
      ${shadow}
      <g class="b-body">${c.body}</g>
    </svg></div>`;
  }

  /* =========================================================
     3b. ESCENARIOS (SVG ligeros generados en código)
     ========================================================= */
  function sceneSVG(kind) {
    const rnd = mulberry(kind.length * 977 + kind.charCodeAt(0));
    const W = 400, H = 800;
    let out = '';
    const stars = (n, maxY, cls = 'sc-tw') => {
      let s = '';
      for (let i = 0; i < n; i++) {
        const x = rnd() * W, y = rnd() * maxY, r = 0.6 + rnd() * 1.6;
        const tw = rnd() < 0.35 ? ` class="${cls}" style="animation-delay:${(rnd() * 2).toFixed(2)}s"` : '';
        s += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${r.toFixed(2)}" fill="#fff" opacity="${(0.4 + rnd() * 0.6).toFixed(2)}"${tw}/>`;
      }
      return s;
    };

    if (kind === 'arcade') {
      out += `<defs><linearGradient id="skA" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#120826"/><stop offset="1" stop-color="#3A1460"/></linearGradient></defs>
        <rect width="${W}" height="${H}" fill="url(#skA)"/>${stars(40, 380)}
        <circle cx="318" cy="150" r="42" fill="#FFE9B8" opacity="0.85"/><circle cx="305" cy="140" r="8" fill="#F2D59A" opacity="0.7"/><circle cx="330" cy="166" r="6" fill="#F2D59A" opacity="0.7"/>`;
      const layer = (baseY, minH, maxH, fill, winOp) => {
        let x = -10, s = '';
        while (x < W) {
          const w = 34 + rnd() * 46, h = minH + rnd() * (maxH - minH), y = baseY - h;
          s += `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${w.toFixed(1)}" height="${(H - y).toFixed(1)}" fill="${fill}"/>`;
          for (let wy = y + 12; wy < baseY - 10; wy += 18) {
            for (let wx = x + 7; wx < x + w - 8; wx += 12) {
              if (rnd() < 0.42) {
                const c = pick(['#FFD23F', '#FF4D8D', '#7CC8FF', '#FFE9B8']);
                s += `<rect x="${wx.toFixed(1)}" y="${wy.toFixed(1)}" width="5" height="8" fill="${c}" opacity="${winOp}"/>`;
              }
            }
          }
          x += w + 2;
        }
        return s;
      };
      out += layer(640, 160, 320, '#22103F', 0.35);
      out += layer(800, 140, 300, '#150A2B', 0.55);
      out += `<rect x="36" y="520" width="104" height="36" rx="9" fill="none" stroke="#FF4D8D" stroke-width="8" opacity="0.25"/>
        <rect class="sc-blink" x="36" y="520" width="104" height="36" rx="9" fill="none" stroke="#FF4D8D" stroke-width="3"/>
        <rect x="270" y="470" width="80" height="30" rx="8" fill="none" stroke="#3DF5C2" stroke-width="3" opacity="0.8"/>`;
    }

    if (kind === 'forest') {
      out += `<defs><linearGradient id="skF" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#1B1446"/><stop offset="0.55" stop-color="#3B2B6E"/><stop offset="0.85" stop-color="#E86A92"/></linearGradient></defs>
        <rect width="${W}" height="${H}" fill="url(#skF)"/>${stars(18, 260)}
        <circle cx="200" cy="560" r="78" fill="#FFB86B" opacity="0.65"/>
        <path d="M0 560 Q80 500 160 545 T320 530 T400 520 V800 H0 Z" fill="#2B6E5E"/>`;
      for (let i = 0; i < 9; i++) {
        const x = rnd() * W, base = 600 + rnd() * 70, h = 50 + rnd() * 40, r = 24 + rnd() * 22;
        const c = pick(['#FF7EB6', '#FFB347', '#4CD9A0', '#B07CFF', '#FFD23F']);
        out += `<rect x="${(x - 5).toFixed(1)}" y="${(base - h).toFixed(1)}" width="10" height="${h.toFixed(1)}" fill="#4A2E2A"/>
          <circle cx="${x.toFixed(1)}" cy="${(base - h - r * 0.6).toFixed(1)}" r="${r.toFixed(1)}" fill="${c}"/>
          <circle cx="${(x - r * 0.35).toFixed(1)}" cy="${(base - h - r).toFixed(1)}" r="${(r * 0.35).toFixed(1)}" fill="#fff" opacity="0.18"/>`;
      }
      out += `<path d="M0 640 Q100 600 200 640 T400 630 V800 H0 Z" fill="#1F5A49"/>
        <path d="M0 720 Q120 690 220 720 T400 710 V800 H0 Z" fill="#164237"/>`;
      for (let i = 0; i < 4; i++) {
        const x = 30 + rnd() * 340, y = 735 + rnd() * 30;
        out += `<rect x="${(x - 3).toFixed(1)}" y="${y.toFixed(1)}" width="6" height="14" fill="#FFE3C4"/><path d="M${(x - 12).toFixed(1)} ${(y + 2).toFixed(1)} Q${x.toFixed(1)} ${(y - 16).toFixed(1)} ${(x + 12).toFixed(1)} ${(y + 2).toFixed(1)} Z" fill="#FF5E57"/>`;
      }
      for (let i = 0; i < 16; i++) {
        out += `<circle class="sc-ff" style="animation-delay:${(rnd() * 3).toFixed(2)}s" cx="${(rnd() * W).toFixed(1)}" cy="${(300 + rnd() * 420).toFixed(1)}" r="2.6" fill="#FFF59D"/>`;
      }
    }

    if (kind === 'space') {
      out += `<defs>
          <linearGradient id="skS" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#050820"/><stop offset="1" stop-color="#160B3A"/></linearGradient>
          <radialGradient id="nebS"><stop offset="0" stop-color="#7B3FC4" stop-opacity="0.55"/><stop offset="1" stop-color="#7B3FC4" stop-opacity="0"/></radialGradient>
          <radialGradient id="nebS2"><stop offset="0" stop-color="#1E7AB8" stop-opacity="0.45"/><stop offset="1" stop-color="#1E7AB8" stop-opacity="0"/></radialGradient>
          <radialGradient id="plS" cx="0.35" cy="0.35"><stop offset="0" stop-color="#FFB08A"/><stop offset="1" stop-color="#B04A7A"/></radialGradient>
        </defs>
        <rect width="${W}" height="${H}" fill="url(#skS)"/>
        <ellipse cx="110" cy="300" rx="190" ry="120" fill="url(#nebS)"/>
        <ellipse cx="300" cy="460" rx="170" ry="110" fill="url(#nebS2)"/>
        ${stars(110, 700)}
        <circle cx="300" cy="170" r="58" fill="url(#plS)"/>
        <ellipse cx="300" cy="172" rx="96" ry="18" fill="none" stroke="#FFD9A8" stroke-width="6" opacity="0.75" transform="rotate(-16 300 172)"/>
        <circle class="sc-float" cx="70" cy="420" r="16" fill="#8FA0D9"/>
        <path d="M0 720 Q100 680 200 705 T400 690 V800 H0 Z" fill="#2A2550"/>
        <ellipse cx="90" cy="750" rx="26" ry="7" fill="#1E1A40"/><ellipse cx="290" cy="740" rx="34" ry="8" fill="#1E1A40"/>`;
    }

    if (kind === 'future') {
      out += `<defs>
          <linearGradient id="skN" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#0B0626"/><stop offset="0.6" stop-color="#3B0F5E"/><stop offset="0.75" stop-color="#FF3D7F"/></linearGradient>
          <linearGradient id="sunN" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#FFD23F"/><stop offset="1" stop-color="#FF4D8D"/></linearGradient>
        </defs>
        <rect width="${W}" height="${H}" fill="url(#skN)"/>${stars(30, 300)}
        <circle cx="200" cy="600" r="110" fill="url(#sunN)" opacity="0.9"/>`;
      for (let y = 560; y < 600; y += 10) out += `<rect x="80" y="${y}" width="240" height="${(y - 550) / 8}" fill="#3B0F5E"/>`;
      let x = -6;
      while (x < W) {
        const w = 26 + rnd() * 34, h = 140 + rnd() * 300, y = 600 - h;
        out += `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${w.toFixed(1)}" height="${h.toFixed(1)}" fill="#160A33"/>
          <rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="2" height="${h.toFixed(1)}" fill="#3DF5C2" opacity="0.6"/>`;
        if (rnd() < 0.5) out += `<rect class="sc-blink" x="${(x + w / 2 - 2).toFixed(1)}" y="${(y - 14).toFixed(1)}" width="4" height="14" fill="#FF4D8D"/>`;
        x += w + 8 + rnd() * 20;
      }
      out += `<rect x="0" y="600" width="${W}" height="200" fill="#12062A"/>`;
      for (let i = 1; i < 9; i++) {
        const y = 600 + Math.pow(i / 8, 1.8) * 200;
        out += `<line x1="0" y1="${y.toFixed(1)}" x2="${W}" y2="${y.toFixed(1)}" stroke="#FF4D8D" stroke-width="2" opacity="0.4"/>`;
      }
      for (let i = -8; i <= 8; i++) {
        out += `<line x1="200" y1="600" x2="${200 + i * 70}" y2="800" stroke="#7CC8FF" stroke-width="1.5" opacity="0.3"/>`;
      }
      out += `<rect class="sc-streak" x="0" y="260" width="70" height="3" rx="1.5" fill="#3DF5C2" opacity="0.8"/>
        <rect class="sc-streak" style="animation-delay:1.3s" x="0" y="380" width="50" height="3" rx="1.5" fill="#FFD23F" opacity="0.8"/>`;
    }

    if (kind === 'stage') {
      out += `<defs>
          <linearGradient id="skT" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#1A0508"/><stop offset="1" stop-color="#3A0A1A"/></linearGradient>
          <linearGradient id="spT" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#FFF4E6" stop-opacity="0.35"/><stop offset="1" stop-color="#FFF4E6" stop-opacity="0"/></linearGradient>
        </defs>
        <rect width="${W}" height="${H}" fill="url(#skT)"/>
        <path class="sc-spot" d="M95 40 L20 700 L170 700 Z" fill="url(#spT)"/>
        <path class="sc-spot" style="animation-delay:-1.6s" d="M200 40 L130 700 L270 700 Z" fill="url(#spT)"/>
        <path class="sc-spot" style="animation-delay:-0.8s" d="M305 40 L230 700 L380 700 Z" fill="url(#spT)"/>`;
      for (let i = 0; i < 6; i++) {
        out += `<rect x="${i * 13}" y="0" width="13" height="${H}" fill="${i % 2 ? '#7A1426' : '#8E1B2E'}"/>`;
        out += `<rect x="${W - (i + 1) * 13}" y="0" width="13" height="${H}" fill="${i % 2 ? '#7A1426' : '#8E1B2E'}"/>`;
      }
      out += `<rect x="0" y="0" width="${W}" height="50" fill="#A3243A"/>`;
      for (let i = 0; i < 10; i++) out += `<circle cx="${20 + i * 40}" cy="50" r="20" fill="#A3243A"/>`;
      out += `<rect x="0" y="44" width="${W}" height="4" fill="#FFD23F"/>`;
      for (let i = 0; i < 12; i++) out += `<circle class="sc-blink" style="animation-delay:${(i % 3) * 0.33}s" cx="${17 + i * 33}" cy="22" r="4" fill="${pick(['#FFD23F', '#FF4D8D', '#3DF5C2'])}"/>`;
      out += `<rect x="0" y="650" width="${W}" height="150" fill="#2A1012"/><rect x="0" y="650" width="${W}" height="5" fill="#FFD23F" opacity="0.7"/>`;
      let crowd = '';
      for (let i = 0; i < 14; i++) {
        const cx = i * 30 + rnd() * 10, cy = 748 + rnd() * 14;
        crowd += `<circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="15" fill="#0D0306"/><rect x="${(cx - 20).toFixed(1)}" y="${(cy + 10).toFixed(1)}" width="40" height="60" rx="16" fill="#0D0306"/>`;
      }
      out += `<g class="sc-crowd">${crowd}</g>`;
    }

    if (kind === 'prism') {
      out += `<defs>
          <linearGradient id="skP" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#0A0A2A"/><stop offset="1" stop-color="#2A0F4F"/></linearGradient>
          <linearGradient id="auP" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#3DF5C2"/><stop offset="0.5" stop-color="#7CC8FF"/><stop offset="1" stop-color="#FF7EDB"/></linearGradient>
        </defs>
        <rect width="${W}" height="${H}" fill="url(#skP)"/>${stars(70, 760)}
        <path class="sc-aurora" d="M-40 220 Q100 140 200 220 T440 200 L440 290 Q300 250 200 300 T-40 290 Z" fill="url(#auP)" opacity="0.32"/>
        <path class="sc-aurora" style="animation-delay:-3s" d="M-40 340 Q120 280 220 340 T440 320 L440 380 Q300 350 200 390 T-40 380 Z" fill="url(#auP)" opacity="0.2"/>`;
      const rainbow = ['#FF5E57', '#FFB347', '#FFD23F', '#3DF5C2', '#7CC8FF', '#B07CFF'];
      rainbow.forEach((c, i) => {
        out += `<path d="M232 470 L400 ${400 + i * 34} L400 ${430 + i * 34} Z" fill="${c}" opacity="0.28"/>`;
      });
      out += `<path d="M200 400 L250 490 L150 490 Z" fill="#FFFFFF" opacity="0.12" stroke="#FFFFFF" stroke-opacity="0.6" stroke-width="2"/>
        <line x1="0" y1="458" x2="185" y2="452" stroke="#FFFFFF" stroke-width="3" opacity="0.6"/>`;
      for (let i = 0; i < 9; i++) {
        const x = rnd() * W, y = 80 + rnd() * 640, s = 8 + rnd() * 14;
        const c = rainbow[i % rainbow.length];
        out += `<path class="sc-float" style="animation-delay:${(-rnd() * 3).toFixed(2)}s" d="M${x.toFixed(1)} ${(y - s).toFixed(1)} L${(x + s * 0.6).toFixed(1)} ${y.toFixed(1)} L${x.toFixed(1)} ${(y + s).toFixed(1)} L${(x - s * 0.6).toFixed(1)} ${y.toFixed(1)} Z" fill="${c}" opacity="0.7"/>`;
      }
    }

    return `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMax slice" xmlns="http://www.w3.org/2000/svg">${out}</svg>`;
  }
  const sceneCache = {};

  /* =========================================================
     4. AUDIO (Web Audio API, todo sintetizado)
     ========================================================= */
  const AudioEngine = {
    ctx: null,
    master: null,
    sfx: null,
    runBus: null,
    runSources: [],
    noiseBuf: null,
    muted: false,

    init() {
      if (this.ctx) return this.ctx;
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      try {
        this.ctx = new AC({ latencyHint: 'interactive' });
      } catch (e) {
        try { this.ctx = new AC(); } catch (e2) { this.ctx = null; return null; }
      }
      const c = this.ctx;
      const comp = c.createDynamicsCompressor();
      comp.threshold.value = -14;
      comp.knee.value = 8;
      comp.ratio.value = 4;
      comp.attack.value = 0.003;
      comp.release.value = 0.15;

      this.master = c.createGain();
      this.master.gain.value = this.muted ? 0 : 0.9;
      this.master.connect(comp);
      comp.connect(c.destination);

      this.sfx = c.createGain();
      this.sfx.gain.value = 1;
      this.sfx.connect(this.master);

      const len = Math.floor(c.sampleRate);
      const buf = c.createBuffer(1, len, c.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
      this.noiseBuf = buf;
      return c;
    },

    // Debe llamarse dentro de un gesto del usuario
    unlock() {
      const c = this.init();
      if (!c) return Promise.resolve(false);
      try {
        if (navigator.audioSession) navigator.audioSession.type = 'playback';
      } catch (e) { /* no soportado */ }
      try {
        const b = c.createBuffer(1, 1, 22050);
        const s = c.createBufferSource();
        s.buffer = b;
        s.connect(c.destination);
        s.start(0);
      } catch (e) { /* ignorar */ }
      let p;
      try { p = c.state === 'running' ? Promise.resolve() : c.resume(); } catch (e) { p = Promise.resolve(); }
      const timeout = new Promise((r) => setTimeout(r, 900));
      return Promise.race([Promise.resolve(p).catch(() => {}), timeout])
        .then(() => c.state === 'running');
    },

    isRunning() {
      return !!(this.ctx && this.ctx.state === 'running');
    },

    setMuted(m) {
      this.muted = m;
      if (!this.ctx) return;
      const t = this.ctx.currentTime;
      this.master.gain.cancelScheduledValues(t);
      this.master.gain.setTargetAtTime(m ? 0 : 0.9, t, 0.015);
    },

    startRun() {
      this.stopRun();
      if (!this.ctx) return;
      const g = this.ctx.createGain();
      g.gain.value = 1;
      g.connect(this.master);
      this.runBus = g;
      this.runSources = [];
    },

    stopRun() {
      const g = this.runBus;
      const sources = this.runSources;
      this.runBus = null;
      this.runSources = [];
      if (!g || !this.ctx) return;
      const t = this.ctx.currentTime;
      try {
        g.gain.cancelScheduledValues(t);
        g.gain.setValueAtTime(g.gain.value, t);
        g.gain.linearRampToValueAtTime(0, t + 0.04);
      } catch (e) { /* ignorar */ }
      setTimeout(() => {
        sources.forEach((s) => { try { s.stop(); } catch (e) { /* ya detenido */ } });
        try { g.disconnect(); } catch (e) { /* ignorar */ }
      }, 80);
    },

    _track(src, dest) {
      if (dest && dest === this.runBus) {
        this.runSources.push(src);
        if (this.runSources.length > 600) this.runSources.splice(0, 200);
      }
    },
    _play(src, t, stopAt, dest) {
      src.start(t);
      src.stop(stopAt);
      this._track(src, dest);
    },
    _env(gainNode, t, peak, attack, decay) {
      const g = gainNode.gain;
      g.setValueAtTime(0.0001, t);
      g.exponentialRampToValueAtTime(Math.max(peak, 0.0002), t + attack);
      g.exponentialRampToValueAtTime(0.0001, t + attack + decay);
    },
    _noise(t, dest, type, freq, q, vel, attack, decay) {
      const c = this.ctx;
      const src = c.createBufferSource();
      src.buffer = this.noiseBuf;
      const f = c.createBiquadFilter();
      f.type = type;
      f.frequency.value = freq;
      f.Q.value = q;
      const g = c.createGain();
      this._env(g, t, vel, attack, decay);
      src.connect(f);
      f.connect(g);
      g.connect(dest);
      src.start(t, Math.random() * 0.5);
      src.stop(t + attack + decay + 0.03);
      this._track(src, dest);
    },

    // --- Instrumentos ---
    kick(t, dest, vel = 1) {
      const c = this.ctx;
      const o = c.createOscillator();
      const g = c.createGain();
      o.type = 'sine';
      o.frequency.setValueAtTime(155, t);
      o.frequency.exponentialRampToValueAtTime(44, t + 0.13);
      this._env(g, t, vel, 0.003, 0.34);
      o.connect(g);
      g.connect(dest);
      this._play(o, t, t + 0.4, dest);
      const o2 = c.createOscillator();
      const g2 = c.createGain();
      o2.type = 'triangle';
      o2.frequency.setValueAtTime(900, t);
      o2.frequency.exponentialRampToValueAtTime(180, t + 0.03);
      this._env(g2, t, vel * 0.28, 0.001, 0.03);
      o2.connect(g2);
      g2.connect(dest);
      this._play(o2, t, t + 0.06, dest);
    },
    clap(t, dest, vel = 0.7) {
      [0, 0.011, 0.023].forEach((d) => this._noise(t + d, dest, 'bandpass', 1300, 1.2, vel * 0.55, 0.001, 0.02));
      this._noise(t + 0.03, dest, 'bandpass', 1100, 0.8, vel, 0.002, 0.16);
    },
    hat(t, dest, open, vel) {
      this._noise(t, dest, 'highpass', 7500, 0.7, vel, 0.001, open ? 0.22 : 0.045);
    },
    crash(t, dest) {
      this._noise(t, dest, 'highpass', 3500, 0.5, 0.32, 0.004, 1.7);
    },
    bass(t, dest, freq, dur, wave = 'sawtooth') {
      const c = this.ctx;
      const o = c.createOscillator();
      const f = c.createBiquadFilter();
      const g = c.createGain();
      o.type = wave;
      o.frequency.value = freq;
      f.type = 'lowpass';
      f.Q.value = 5;
      f.frequency.setValueAtTime(wave === 'triangle' ? 1400 : 950, t);
      f.frequency.exponentialRampToValueAtTime(200, t + dur);
      this._env(g, t, wave === 'triangle' ? 0.34 : wave === 'square' ? 0.18 : 0.26, 0.008, dur);
      o.connect(f);
      f.connect(g);
      g.connect(dest);
      this._play(o, t, t + dur + 0.05, dest);
    },
    lead(t, dest, freq, dur, wave, vol) {
      const c = this.ctx;
      const o = c.createOscillator();
      const f = c.createBiquadFilter();
      const g = c.createGain();
      o.type = wave;
      o.frequency.value = freq;
      f.type = 'lowpass';
      f.frequency.value = 3200;
      this._env(g, t, vol, 0.004, dur);
      o.connect(f);
      f.connect(g);
      g.connect(dest);
      this._play(o, t, t + dur + 0.05, dest);
    },
    pad(t, dest, freqs, dur) {
      const c = this.ctx;
      const g = c.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.05, t + Math.min(0.35, dur * 0.3));
      g.gain.setValueAtTime(0.05, t + dur * 0.75);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      g.connect(dest);
      freqs.forEach((fr, i) => {
        const o = c.createOscillator();
        o.type = 'triangle';
        o.frequency.value = fr;
        o.detune.value = (i - 1) * 6;
        o.connect(g);
        this._play(o, t, t + dur + 0.05, dest);
      });
    },
    stab(t, dest, freqs, dur) {
      const c = this.ctx;
      const f = c.createBiquadFilter();
      const g = c.createGain();
      f.type = 'lowpass';
      f.frequency.value = 2200;
      this._env(g, t, 0.11, 0.005, dur);
      f.connect(g);
      g.connect(dest);
      freqs.forEach((fr) => {
        const o = c.createOscillator();
        o.type = 'square';
        o.frequency.value = fr;
        o.connect(f);
        this._play(o, t, t + dur + 0.05, dest);
      });
    },
    wood(t, dest, freq, vel) {
      const c = this.ctx;
      const o = c.createOscillator();
      const g = c.createGain();
      o.type = 'sine';
      o.frequency.value = freq;
      this._env(g, t, vel, 0.001, 0.09);
      o.connect(g);
      g.connect(dest);
      this._play(o, t, t + 0.12, dest);
    },

    // --- Efectos del jugador (inmediatos) ---
    hit(result, freq, wave = 'triangle') {
      if (!this.isRunning()) return;
      const c = this.ctx;
      const t = c.currentTime;
      const bright = result === 'perfect';
      const o = c.createOscillator();
      const o2 = c.createOscillator();
      const f = c.createBiquadFilter();
      const g = c.createGain();
      o.type = wave;
      o.frequency.value = freq;
      o2.type = 'sine';
      o2.frequency.value = freq * 2;
      f.type = 'lowpass';
      f.frequency.value = bright ? 5200 : 1900;
      const loud = wave === 'sawtooth' || wave === 'square' ? 0.26 : 0.42;
      this._env(g, t, bright ? loud : loud * 0.66, 0.002, 0.26);
      o.connect(f);
      o2.connect(f);
      f.connect(g);
      g.connect(this.sfx);
      o.start(t); o.stop(t + 0.32);
      o2.start(t); o2.stop(t + 0.32);
      if (bright) {
        [0, 0.045].forEach((d, i) => {
          const s = c.createOscillator();
          const sg = c.createGain();
          s.type = 'sine';
          s.frequency.value = freq * (i === 0 ? 3 : 4);
          this._env(sg, t + d, 0.08, 0.002, 0.15);
          s.connect(sg);
          sg.connect(this.sfx);
          s.start(t + d);
          s.stop(t + d + 0.2);
        });
      }
    },
    bonk(vel = 1) {
      if (!this.isRunning()) return;
      const c = this.ctx;
      const t = c.currentTime;
      const o = c.createOscillator();
      const f = c.createBiquadFilter();
      const g = c.createGain();
      o.type = 'square';
      o.frequency.setValueAtTime(210, t);
      o.frequency.exponentialRampToValueAtTime(70, t + 0.16);
      f.type = 'lowpass';
      f.frequency.value = 700;
      this._env(g, t, 0.34 * vel, 0.002, 0.2);
      o.connect(f);
      f.connect(g);
      g.connect(this.sfx);
      o.start(t);
      o.stop(t + 0.25);
    },
    tick() {
      if (!this.isRunning()) return;
      this.wood(this.ctx.currentTime, this.sfx, 880, 0.3);
    },
    chime() {
      if (!this.isRunning()) return;
      const t = this.ctx.currentTime;
      this.wood(t, this.sfx, 1318.5, 0.18);
      this.wood(t + 0.06, this.sfx, 1760, 0.16);
    },
    // Efecto de "cinta que se detiene" (el Gran Silencio)
    drop(t, dest) {
      const c = this.ctx;
      const o = c.createOscillator();
      const f = c.createBiquadFilter();
      const g = c.createGain();
      o.type = 'sawtooth';
      o.frequency.setValueAtTime(330, t);
      o.frequency.exponentialRampToValueAtTime(28, t + 0.9);
      f.type = 'lowpass';
      f.frequency.setValueAtTime(2400, t);
      f.frequency.exponentialRampToValueAtTime(120, t + 0.9);
      g.gain.setValueAtTime(0.28, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 1.0);
      o.connect(f);
      f.connect(g);
      g.connect(dest);
      this._play(o, t, t + 1.05, dest);
      this._noise(t, dest, 'lowpass', 900, 0.7, 0.18, 0.01, 0.8);
    },
    // Zumbido grave y oscuro
    drone(t, dest, freq, dur) {
      const c = this.ctx;
      const g = c.createGain();
      const f = c.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = 420;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.16, t + 1.2);
      g.gain.setValueAtTime(0.16, t + dur - 1.2);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      f.connect(g);
      g.connect(dest);
      [1, 1.5, 2.02].forEach((m, i) => {
        const o = c.createOscillator();
        o.type = i === 0 ? 'sawtooth' : 'triangle';
        o.frequency.value = freq * m;
        o.detune.value = (i - 1) * 9;
        o.connect(f);
        this._play(o, t, t + dur + 0.05, dest);
      });
    },
    // Campana brillante
    bell(t, dest, freq, vol) {
      const c = this.ctx;
      const g = c.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(vol, t + 0.004);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 1.1);
      g.connect(dest);
      [1, 2.76, 5.4].forEach((m, i) => {
        const o = c.createOscillator();
        const og = c.createGain();
        o.type = 'sine';
        o.frequency.value = freq * m;
        og.gain.value = i === 0 ? 1 : 0.25 / i;
        o.connect(og);
        og.connect(g);
        this._play(o, t, t + 1.15, dest);
      });
    },

    fanfare(big) {
      if (!this.isRunning()) return;
      const t = this.ctx.currentTime + 0.05;
      const notes = big ? [523.25, 659.25, 783.99, 1046.5, 1318.5] : [523.25, 659.25, 783.99, 1046.5];
      notes.forEach((f, i) => this.lead(t + i * 0.09, this.sfx, f, 0.35, 'square', 0.06));
      if (big) this.pad(t + notes.length * 0.09, this.sfx, [523.25, 659.25, 783.99], 1.4);
    }
  };

  /* Programador de música por compases (lookahead de ~1.2 s) */
  const Music = {
    song: null,
    t0: 0,
    idx: 0,

    begin(song, t0) {
      this.song = song;
      this.t0 = t0;
      this.idx = 0;
      const A = AudioEngine;
      const bus = A.runBus;
      if (!bus) return;
      for (let i = 0; i < 4; i++) {
        A.wood(t0 + i * song.cdBeat, bus, i === 3 ? 1568 : 1046.5, i === 3 ? 0.55 : 0.4);
      }
    },

    pump() {
      const A = AudioEngine;
      if (!this.song || !A.runBus || !A.ctx) return;
      const horizon = A.ctx.currentTime + 1.2;
      const bars = this.song.bars;
      while (this.idx < bars.length && this.t0 + bars[this.idx].t < horizon) {
        this.scheduleBar(bars[this.idx], this.t0 + bars[this.idx].t);
        this.idx++;
      }
    },

    stop() {
      this.song = null;
    },

    scheduleBar(bar, t) {
      const A = AudioEngine;
      const bus = A.runBus;
      if (!bus) return;
      const beat = bar.beat;
      const mus = bar.mus;
      const chord = bar.chord;

      if (bar.final) {
        A.kick(t, bus, 1);
        A.crash(t, bus);
        A.bass(t, bus, chord.root, beat * 3, mus.bassWave);
        A.stab(t, bus, chord.tones, beat * 2.5);
        A.pad(t, bus, chord.tones.map((f) => f * 2), beat * 3);
        return;
      }

      const steps = mus.grid;
      const sd = (4 * beat) / steps;
      const I = bar.intensity;
      const at = (str, i) => (str && str.length === steps ? str[i] : '.');

      for (let i = 0; i < steps; i++) {
        const st = t + i * sd;
        const k = at(mus.kick, i);
        if (k !== '.') A.kick(st, bus, k === 'X' ? 1 : 0.8);
        if (I >= 2) {
          const cl = at(mus.clap, i);
          if (cl !== '.') A.clap(st, bus, cl === 'o' ? 0.45 : 0.7);
        }
        const h = at(mus.hat, i);
        if (h !== '.') A.hat(st, bus, false, h === 'o' ? 0.06 : 0.11);
        if (I >= 3 && at(mus.open, i) !== '.') A.hat(st, bus, true, 0.1);

        const b = at(mus.bass, i);
        if (b !== '.') {
          let j = i + 1;
          while (j < steps && at(mus.bass, j) === '.') j++;
          const f = b === 'O' ? chord.root * 2 : b === 'F' ? chord.root * 1.5 : chord.root;
          A.bass(st, bus, f, Math.min((j - i) * sd * 0.92, beat * 2), mus.bassWave);
        }
        if (I >= 2) {
          const a = at(mus.arp, i);
          if (a !== '.') {
            const f = chord.tones[+a] * mus.arpOct;
            A.lead(st, bus, f, sd * 1.6, mus.leadWave, mus.leadVol);
          }
        }
      }
      if (I >= 3 && mus.pad) A.pad(t, bus, chord.tones, 4 * beat);
      if (bar.fill) {
        A.clap(t + 3.5 * beat, bus, 0.5);
        A.clap(t + 3.75 * beat, bus, 0.75);
      }
    }
  };

  /* =========================================================
     5. RELOJ COMPARTIDO
     song(perfMs) -> segundos desde el pulso 0, tal como se ESCUCHA.
     ========================================================= */
  const Clock = {
    useAudio: false,
    offsetMs: 0,      // performance.now() - ctx.currentTime*1000
    latency: 0,       // latencia de salida reportada (s)
    userOffset: 0,    // ajuste de sincronía elegido por el jugador (s)
    startCtx: 0,
    startPerf: 0,

    begin(useAudio) {
      this.useAudio = useAudio;
      if (useAudio) {
        const c = AudioEngine.ctx;
        this.offsetMs = Infinity;
        this.latency = 0;
        this.sample(true);
        this.startCtx = c.currentTime + LEAD_IN;
      } else {
        this.startPerf = performance.now() + LEAD_IN * 1000;
      }
    },

    sample(updateLatency) {
      if (!this.useAudio) return;
      const c = AudioEngine.ctx;
      const o = performance.now() - c.currentTime * 1000;
      if (o < this.offsetMs) this.offsetMs = o;
      if (updateLatency) {
        let lat = (c.baseLatency || 0) + (c.outputLatency || 0);
        if (!isFinite(lat) || lat < 0) lat = 0;
        this.latency = Math.min(lat, 0.35);
      }
    },

    song(perfMs) {
      const base = this.useAudio
        ? (perfMs - this.offsetMs) / 1000 - this.latency - this.startCtx
        : (perfMs - this.startPerf) / 1000;
      return base - this.userOffset;
    }
  };

  /* =========================================================
     6. PROGRESO (localStorage con respaldo en memoria)
     ========================================================= */
  function defaultProgress() {
    return {
      v: 2,
      unlocked: 1,
      levels: {},
      secretUnlocked: false,
      secretCleared: false,
      introSeen: false,
      muted: false,
      offsetMs: 0
    };
  }

  const Store = {
    ok: false,
    init() {
      try {
        const k = '__beat_rush_test__';
        window.localStorage.setItem(k, '1');
        window.localStorage.removeItem(k);
        this.ok = true;
      } catch (e) {
        this.ok = false;
      }
    },
    load() {
      const p = defaultProgress();
      if (!this.ok) return p;
      try {
        const raw = window.localStorage.getItem(STORE_KEY);
        if (!raw) return p;
        const d = JSON.parse(raw);
        if (!d || typeof d !== 'object') return p;
        p.unlocked = clamp(parseInt(d.unlocked, 10) || 1, 1, MAIN_LEVELS.length);
        p.secretUnlocked = !!d.secretUnlocked;
        p.secretCleared = !!d.secretCleared;
        p.muted = !!d.muted;
        p.introSeen = !!d.introSeen;
        p.offsetMs = clamp(parseInt(d.offsetMs, 10) || 0, -250, 250);
        if (d.levels && typeof d.levels === 'object') {
          LEVELS.forEach((l) => {
            const r = d.levels[l.id];
            if (r && typeof r === 'object') {
              p.levels[l.id] = {
                best: clamp(+r.best || 0, 0, 100),
                acc: clamp(+r.acc || 0, 0, 100),
                combo: Math.max(0, +r.combo || 0),
                points: Math.max(0, +r.points || 0),
                plays: Math.max(0, +r.plays || 0)
              };
            }
          });
        }
      } catch (e) { /* datos corruptos: empezar de cero */ }
      return p;
    },
    save(p) {
      if (!this.ok) return;
      try {
        window.localStorage.setItem(STORE_KEY, JSON.stringify(p));
      } catch (e) { /* lleno o bloqueado: seguir en memoria */ }
    }
  };

  Store.init();
  let progress = Store.load();
  const devUnlock = (() => {
    try { return new URLSearchParams(window.location.search).get('desbloquear') === 'todo'; } catch (e) { return false; }
  })();

  function rec(level) {
    return progress.levels[level.id] || { best: 0, acc: 0, combo: 0, points: 0, plays: 0 };
  }

  function isUnlocked(level) {
    if (devUnlock) return true;
    if (level.secret) return progress.secretUnlocked;
    return level.num <= progress.unlocked;
  }

  function allMainPerfect() {
    return MAIN_LEVELS.every((l) => rec(l).best >= 100);
  }

  function totalStars() {
    return MAIN_LEVELS.reduce((a, l) => a + scoreToStars(rec(l).best), 0);
  }

  // Si por alguna razón el secreto ya cumple la condición, lo reflejamos
  if (!progress.secretUnlocked && allMainPerfect()) progress.secretUnlocked = true;
  AudioEngine.muted = progress.muted;
  Clock.userOffset = progress.offsetMs / 1000;

  /* =========================================================
     7. DOM Y PANTALLAS
     ========================================================= */
  const screens = {
    gate: $('screen-gate'),
    story: $('screen-story'),
    title: $('screen-title'),
    map: $('screen-map'),
    options: $('screen-options'),
    game: $('screen-game'),
    result: $('screen-result')
  };
  const stage = $('stage');
  const canvas = $('lane');
  const g = canvas.getContext('2d');
  const sceneEl = $('scene');
  const hudLevel = $('hud-level');
  const hudScore = $('hud-score');
  const hudCombo = $('hud-combo');
  const hudComboWrap = hudCombo.parentElement;
  const hudMult = $('hud-mult');
  const hudAcc = $('hud-acc');
  const callout = $('callout');
  const cMain = callout.querySelector('.c-main');
  const cSub = callout.querySelector('.c-sub');
  const tag = $('tag');
  const judgment = $('judgment');
  const jMain = judgment.querySelector('.j-main');
  const jSub = judgment.querySelector('.j-sub');
  const soundButtons = Array.from(document.querySelectorAll('.btn-sound'));
  const buddyTitle = $('buddy-title');
  const buddyGame = $('buddy-game');
  const buddyResult = $('buddy-result');
  const mapTrack = $('map-track');
  const mapPath = $('map-path');
  const mapScroll = $('map-scroll');
  const mapPanel = $('map-panel');
  const confettiEl = $('confetti');
  let buddyBody = null;
  let currentScreen = 'title';

  buddyTitle.innerHTML = characterSVG('pum');
  $('buddy-gate').innerHTML = characterSVG('pum');

  function showScreen(name) {
    currentScreen = name;
    Object.keys(screens).forEach((k) => {
      const el = screens[k];
      const on = k === name;
      el.classList.toggle('is-active', on);
      el.setAttribute('aria-hidden', on ? 'false' : 'true');
    });
    if (name !== 'result') clearConfetti();
  }

  function blurActive() {
    const a = document.activeElement;
    if (a && a.blur && a !== document.body) a.blur();
  }

  /* ---------------- Pantalla principal ---------------- */
  function renderTitle() {
    const stars = totalStars();
    let html = `★ ${stars} / ${MAIN_LEVELS.length * 5}`;
    if (progress.secretCleared) html += '<span class="legend-badge">Leyenda del ritmo</span>';
    $('title-progress').innerHTML = html;
    buddyTitle.classList.toggle('has-crown', progress.secretCleared);
  }

  /* ---------------- Mapa ---------------- */
  let selectedId = '1';

  function defaultSelection() {
    if (isUnlocked(SECRET_LEVEL) && !progress.secretCleared) return SECRET_LEVEL.id;
    const firstUncleared = MAIN_LEVELS.find((l) => isUnlocked(l) && rec(l).best < PASS_SCORE);
    if (firstUncleared) return firstUncleared.id;
    const unlocked = MAIN_LEVELS.filter((l) => isUnlocked(l));
    return unlocked[unlocked.length - 1].id;
  }

  function currentLevelId() {
    const firstUncleared = MAIN_LEVELS.find((l) => isUnlocked(l) && rec(l).best < PASS_SCORE);
    if (firstUncleared) return firstUncleared.id;
    if (isUnlocked(SECRET_LEVEL) && !progress.secretCleared) return SECRET_LEVEL.id;
    return null;
  }

  function renderMap() {
    Array.from(mapTrack.querySelectorAll('.map-node')).forEach((n) => n.remove());
    const current = currentLevelId();
    let side = 0;
    const addNode = (el) => {
      el.classList.add(side % 2 === 0 ? 'is-left' : 'is-right');
      side++;
      mapTrack.appendChild(el);
    };

    MAIN_LEVELS.forEach((l) => {
      const unlocked = isUnlocked(l);
      const r = rec(l);
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'map-node' + (unlocked ? ' is-unlocked' : ' is-locked');
      if (current === l.id) btn.classList.add('is-current');
      if (selectedId === l.id) btn.classList.add('is-selected');
      btn.dataset.level = l.id;
      btn.style.setProperty('--c', l.color);
      const label = unlocked
        ? `Nivel ${l.num}, ${l.name}${r.plays ? `, mejor ${r.best} de 100` : ''}`
        : `Nivel ${l.num}, bloqueado`;
      btn.setAttribute('aria-label', label);
      btn.innerHTML = `
        <span class="map-dot">${unlocked ? l.num : '🔒'}</span>
        <span class="map-label">
          <span class="map-name">${unlocked ? '⭐ ' : ''}Nivel ${l.num}${unlocked ? '' : ' 🔒'}</span>
          <span class="map-sub">${unlocked ? l.name : 'Bloqueado'}</span>
          ${unlocked && r.plays ? `<span class="map-stars">${starsHTML(scoreToStars(r.best))} ${r.best}/100</span>` : ''}
        </span>`;
      addNode(btn);
    });

    const goal = document.createElement('div');
    goal.className = 'map-node map-node--goal';
    goal.setAttribute('aria-hidden', 'true');
    goal.innerHTML = `<span class="map-dot">🏁</span><span class="map-label"><span class="map-name">Meta</span><span class="map-sub">${totalStars()} / ${MAIN_LEVELS.length * 5} ★</span></span>`;
    addNode(goal);

    const s = SECRET_LEVEL;
    const sUnlocked = isUnlocked(s);
    const sr = rec(s);
    const sb = document.createElement('button');
    sb.type = 'button';
    sb.className = 'map-node map-node--secret' + (sUnlocked ? ' is-unlocked' : ' is-locked');
    if (current === s.id) sb.classList.add('is-current');
    if (selectedId === s.id) sb.classList.add('is-selected');
    sb.dataset.level = s.id;
    sb.style.setProperty('--c', '#FF7EDB');
    sb.setAttribute('aria-label', sUnlocked ? 'Nivel secreto desbloqueado' : 'Nivel secreto bloqueado');
    sb.innerHTML = `
      <span class="map-dot">${sUnlocked ? '✨' : '🔒'}</span>
      <span class="map-label">
        <span class="map-name">${sUnlocked ? '✨ NIVEL SECRETO ✨' : '🔒 NIVEL SECRETO'}</span>
        <span class="map-sub">${sUnlocked ? s.name : 'Consigue 100 en todos'}</span>
        ${sUnlocked && sr.plays ? `<span class="map-stars">${starsHTML(scoreToStars(sr.best))} ${sr.best}/100</span>` : ''}
      </span>`;
    addNode(sb);

    $('map-stars').textContent = `★ ${totalStars()}`;
    renderPanel();
    requestAnimationFrame(drawMapPath);
  }

  function renderPanel() {
    const l = levelById(selectedId) || LEVELS[0];
    const unlocked = isUnlocked(l);
    const r = rec(l);
    const title = l.secret ? (unlocked ? '✨ Nivel secreto ✨' : '🔒 Nivel secreto') : `Nivel ${l.num}: ${l.name}`;
    const dot = l.secret ? (unlocked ? '✨' : '🔒') : (unlocked ? l.num : '🔒');
    let body;
    if (unlocked) {
      const bpm = l.sections.length > 1
        ? `${Math.min(...l.sections.map((s) => s.bpm))}–${Math.max(...l.sections.map((s) => s.bpm))} BPM`
        : `${l.sections[0].bpm} BPM`;
      body = `
        <p class="panel-sub">${l.secret ? l.name + '. ' : ''}${l.difficulty}. Con ${l.charName}. ${bpm}.</p>
        <div class="panel-stats">
          <div><span>MEJOR</span><b>${r.plays ? r.best + '/100' : '—'}</b></div>
          <div><span>PRECISIÓN</span><b>${r.plays ? r.acc + '%' : '—'}</b></div>
          <div><span>COMBO</span><b>${r.plays ? r.combo : '—'}</b></div>
        </div>
        <button id="panel-play" class="btn-primary" type="button">JUGAR</button>`;
    } else {
      const msg = l.secret
        ? 'Consigue 100 en todos los niveles para desbloquearlo.'
        : `Supera el Nivel ${l.num - 1} con ${PASS_SCORE} o más para desbloquearlo.`;
      body = `<p class="panel-lock">${msg}</p>
        <button class="btn-primary" type="button" disabled>BLOQUEADO</button>`;
    }
    mapPanel.innerHTML = `
      <div class="panel-head">
        <span class="map-dot" style="--c:${l.color}">${dot}</span>
        <div><h3 class="panel-title">${title}</h3></div>
      </div>${body}`;
    const play = $('panel-play');
    if (play) play.addEventListener('click', () => startLevel(l.id));
  }

  function selectLevel(id, scroll) {
    selectedId = id;
    mapTrack.querySelectorAll('.map-node[data-level]').forEach((n) => {
      n.classList.toggle('is-selected', n.dataset.level === id);
    });
    renderPanel();
    if (scroll) scrollMapTo(id);
  }

  function scrollMapTo(id) {
    const node = mapTrack.querySelector(`.map-node[data-level="${id}"]`);
    if (!node) return;
    const top = node.offsetTop + mapTrack.offsetTop - mapScroll.clientHeight / 2 + node.offsetHeight / 2;
    mapScroll.scrollTop = Math.max(0, top);
  }

  function drawMapPath() {
    const tr = mapTrack.getBoundingClientRect();
    if (!tr.width || !tr.height) return;
    mapPath.setAttribute('viewBox', `0 0 ${tr.width.toFixed(1)} ${tr.height.toFixed(1)}`);
    const nodes = Array.from(mapTrack.querySelectorAll('.map-node'));
    const pts = nodes.map((n) => {
      const r = n.querySelector('.map-dot').getBoundingClientRect();
      return [r.left - tr.left + r.width / 2, r.top - tr.top + r.height / 2];
    });
    const vertical = getComputedStyle(mapTrack).flexDirection.indexOf('column') === 0;
    let html = '';
    for (let i = 0; i < pts.length - 1; i++) {
      const [x1, y1] = pts[i];
      const [x2, y2] = pts[i + 1];
      let cls;
      if (i < MAIN_LEVELS.length - 1) cls = isUnlocked(MAIN_LEVELS[i + 1]) ? 'is-done' : 'is-locked';
      else if (i === MAIN_LEVELS.length - 1) cls = rec(MAIN_LEVELS[MAIN_LEVELS.length - 1]).best >= PASS_SCORE ? 'is-done' : 'is-locked';
      else cls = 'is-secret ' + (isUnlocked(SECRET_LEVEL) ? 'is-done' : 'is-locked');
      const d = vertical
        ? `M${x1.toFixed(1)} ${y1.toFixed(1)} C${x1.toFixed(1)} ${((y1 + y2) / 2).toFixed(1)}, ${x2.toFixed(1)} ${((y1 + y2) / 2).toFixed(1)}, ${x2.toFixed(1)} ${y2.toFixed(1)}`
        : `M${x1.toFixed(1)} ${y1.toFixed(1)} C${((x1 + x2) / 2).toFixed(1)} ${y1.toFixed(1)}, ${((x1 + x2) / 2).toFixed(1)} ${y2.toFixed(1)}, ${x2.toFixed(1)} ${y2.toFixed(1)}`;
      html += `<path class="seg ${cls}" d="${d}"/>`;
    }
    mapPath.innerHTML = html;
  }

  function openMap(selectId) {
    if (selectId) selectedId = selectId;
    else selectedId = defaultSelection();
    showScreen('map');
    renderMap();
    requestAnimationFrame(() => {
      drawMapPath();
      scrollMapTo(selectedId);
    });
  }

  mapTrack.addEventListener('click', (e) => {
    const node = e.target.closest('.map-node[data-level]');
    if (!node) return;
    const id = node.dataset.level;
    if (id === selectedId && isUnlocked(levelById(id))) {
      startLevel(id);
      return;
    }
    selectLevel(id, false);
  });

  /* ---------------- Opciones ---------------- */
  const syncRange = $('sync-range');
  const syncValue = $('sync-value');
  const optSound = $('opt-sound');
  const optReset = $('opt-reset');
  let resetArmedTimer = 0;

  function renderOptions() {
    optSound.setAttribute('aria-checked', AudioEngine.muted ? 'false' : 'true');
    syncRange.value = String(progress.offsetMs);
    syncValue.textContent = (progress.offsetMs > 0 ? '+' : '') + progress.offsetMs + ' ms';
    $('opt-storage-note').textContent = Store.ok
      ? 'Tu progreso se guarda en este dispositivo.'
      : 'Este navegador no permite guardar: tu progreso durará sólo mientras la página esté abierta.';
    optReset.classList.remove('is-armed');
    optReset.textContent = 'Borrar progreso';
  }

  function setOffset(ms) {
    progress.offsetMs = clamp(Math.round(ms / 5) * 5, -250, 250);
    Clock.userOffset = progress.offsetMs / 1000;
    Store.save(progress);
    renderOptions();
  }

  syncRange.addEventListener('input', () => setOffset(+syncRange.value));
  $('sync-minus').addEventListener('click', () => setOffset(progress.offsetMs - 10));
  $('sync-plus').addEventListener('click', () => setOffset(progress.offsetMs + 10));
  $('sync-reset').addEventListener('click', () => setOffset(0));
  optSound.addEventListener('click', () => toggleMute());
  optReset.addEventListener('click', () => {
    if (!optReset.classList.contains('is-armed')) {
      optReset.classList.add('is-armed');
      optReset.textContent = '¿Seguro? Toca otra vez';
      clearTimeout(resetArmedTimer);
      resetArmedTimer = setTimeout(() => {
        optReset.classList.remove('is-armed');
        optReset.textContent = 'Borrar progreso';
      }, 3500);
      return;
    }
    clearTimeout(resetArmedTimer);
    const keep = { muted: progress.muted, offsetMs: progress.offsetMs, introSeen: progress.introSeen };
    progress = Object.assign(defaultProgress(), keep);
    Store.save(progress);
    renderOptions();
    renderTitle();
    optReset.textContent = 'Progreso borrado';
  });

  /* ---------------- Sonido ---------------- */
  function updateSoundButtons() {
    const m = AudioEngine.muted;
    soundButtons.forEach((b) => {
      b.setAttribute('aria-pressed', m ? 'true' : 'false');
      b.setAttribute('aria-label', m ? 'Activar sonido' : 'Silenciar sonido');
    });
    optSound.setAttribute('aria-checked', m ? 'false' : 'true');
  }

  function toggleMute() {
    AudioEngine.setMuted(!AudioEngine.muted);
    progress.muted = AudioEngine.muted;
    Store.save(progress);
    updateSoundButtons();
  }

  /* =========================================================
     7b. HISTORIA (cinemática de introducción)
     Se reproduce sola la primera vez que se abre el juego.
     Todo es SVG + CSS + Web Audio, sincronizado con el reloj de la
     música: 120 BPM, compases de 2 segundos.
     ========================================================= */
  const STORY_BEAT = 0.5;
  const STORY_BAR = 2;
  const STORY_END = 28.6; // aparece el botón final
  const STORY_SCENES = [
    { id: 's1', at: 0, bob: 1, face: '', text: 'En Beat City, todo se movía al ritmo.' },
    { id: 's2', at: 4, bob: 0, face: 'is-sad', text: 'Hasta que una noche llegó el Gran Silencio.' },
    { id: 's3', at: 8, bob: 0, face: 'is-shock', text: 'Y se llevó los cinco ritmos del mundo.' },
    { id: 's4', at: 12, bob: 0, face: '', text: 'Pero a Pum le quedó una baqueta que todavía latía...' },
    { id: 's5', at: 16, bob: 1, face: 'is-victory', text: 'Con sus amigos viajará por cinco mundos para recuperarlos.' },
    { id: 's6', at: 22, bob: 1, face: 'is-shock', text: 'Y dicen que quien toque a la perfección encontrará un sexto ritmo...' },
    { id: 's7', at: 26, bob: 1, face: 'is-victory', text: '' }
  ];

  // Nube con ojos: el Gran Silencio
  function cloudSVG() {
    const rnd = mulberry(77);
    let blobs = '';
    for (let i = 0; i < 16; i++) {
      blobs += `<circle cx="${(rnd() * 600).toFixed(0)}" cy="${(40 + rnd() * 150).toFixed(0)}" r="${(60 + rnd() * 70).toFixed(0)}"/>`;
    }
    let specks = '';
    for (let i = 0; i < 60; i++) {
      specks += `<rect x="${(rnd() * 600).toFixed(0)}" y="${(60 + rnd() * 200).toFixed(0)}" width="${(4 + rnd() * 10).toFixed(0)}" height="2" fill="#8E86A8" opacity="${(0.2 + rnd() * 0.5).toFixed(2)}"/>`;
    }
    return `<svg viewBox="0 0 600 320" preserveAspectRatio="none" aria-hidden="true">
      <g fill="#221D36" transform="translate(0 22)">${blobs}</g>
      <g fill="#36304F">${blobs}</g>
      ${specks}
      <g fill="#FF5E57"><ellipse cx="250" cy="200" rx="9" ry="6"/><ellipse cx="350" cy="200" rx="9" ry="6"/></g>
      <path d="M270 228 Q300 218 330 228" fill="none" stroke="#FF5E57" stroke-width="4" stroke-linecap="round"/>
    </svg>`;
  }

  // Música de la historia
  function scheduleStoryMusic(t0) {
    const A = AudioEngine;
    const bus = A.runBus;
    if (!bus) return;
    const bar = (i) => t0 + i * STORY_BAR;
    const groove = (i, mus, chord, intensity) =>
      Music.scheduleBar({ t: 0, beat: STORY_BEAT, mus, chord, intensity, final: false, fill: false }, bar(i));

    // 1. La ciudad suena
    groove(0, MUS.arcade, CH.am[0], 3);
    groove(1, MUS.arcade, CH.am[1], 3);
    // 2. El Gran Silencio: la música se apaga
    A.drop(bar(2), bus);
    A.drone(bar(2) + 0.5, bus, 55, 7.5);
    // 3. Los cinco ritmos se van volando
    [1318.5, 1174.66, 987.77, 880, 783.99].forEach((f, i) => A.bell(bar(4) + 0.25 + i * 0.4, bus, f, 0.12));
    // 4. Un latido
    for (let k = 0; k < 4; k++) {
      const t = bar(6) + k;
      A.kick(t, bus, 0.35 + k * 0.13);
      A.kick(t + 0.22, bus, 0.25 + k * 0.1);
    }
    A.pad(bar(7), bus, CH.am[0].tones, 2);
    A.bell(bar(7) + 1.5, bus, 1760, 0.05);
    // 5. Vuelve el ritmo, poco a poco, mientras llegan los amigos
    groove(8, MUS.arcade, CH.am[0], 1);
    groove(9, MUS.arcade, CH.am[1], 2);
    groove(10, MUS.final, CH.am[2], 3);
    [523.25, 659.25, 783.99, 880, 1046.5].forEach((f, i) => A.bell(bar(8) + i * STORY_BEAT, bus, f, 0.07));
    // 6. El misterio del sexto ritmo
    Music.scheduleBar({ t: 0, beat: STORY_BEAT, mus: MUS.space, chord: CH.em[0], intensity: 3, final: false, fill: false }, bar(11));
    Music.scheduleBar({ t: 0, beat: STORY_BEAT, mus: MUS.space, chord: CH.em[3], intensity: 3, final: false, fill: true }, bar(12));
    [0.5, 1.25, 2, 2.75, 3.5].forEach((d, i) => A.bell(bar(11) + d, bus, [1567.98, 1760, 2093, 1760, 2637][i], 0.05));
    // 7. ¡BEAT RUSH!
    A.crash(bar(13), bus);
    groove(13, MUS.final, CH.am[0], 3);
    [523.25, 659.25, 783.99, 1046.5, 1318.5].forEach((f, i) => A.lead(bar(14) - 0.45 + i * 0.09, bus, f, 0.35, 'square', 0.06));
    const AM = [220, 277.18, 329.63];
    A.kick(bar(14), bus, 1);
    A.crash(bar(14), bus);
    A.stab(bar(14), bus, AM, 1.3);
    A.pad(bar(14), bus, AM.map((f) => f * 2), 2.4);
    A.bass(bar(14), bus, 110, 1.8, 'sawtooth');
  }

  const Story = {
    el: $('story'),
    raf: 0,
    t0: 0,
    perf0: 0,
    useAudio: false,
    sceneIdx: -1,
    done: false,
    token: 0,

    build() {
      if (!sceneCache.arcade) sceneCache.arcade = sceneSVG('arcade');
      const friends = ['bolt', 'miso', 'nova', 'kage', 'draco'];
      const ox = [14, 32, 50, 68, 86];
      const oy = [6, 0, -3, 0, 6];
      const odx = [-120, -60, 0, 60, 120];
      const orbs = MAIN_LEVELS.map((l, i) =>
        `<div class="st-orb" style="--i:${i};--c:${l.color};--x:${ox[i]}%;--y:${oy[i]}%;--dx:${odx[i]}px"><i></i></div>`).join('');
      const fx = [2, 21, 40, 59, 78];
      const crew = friends.map((f, i) =>
        `<div class="buddy st-who st-friend" style="--i:${i};--x:${fx[i]}%">${characterSVG(f)}</div>`).join('');
      this.el.innerHTML = `
        <div class="st-bg">${sceneCache.arcade}</div>
        <div class="st-col">
          <div class="st-cloud"><div class="st-cloud-inner">${cloudSVG()}</div></div>
          ${orbs}
          <div class="st-who st-lumi">${characterSVG('lumi')}<span class="st-q">?</span></div>
          ${crew}
          <div class="buddy st-who st-pum">${characterSVG('pum')}<span class="st-glow"></span></div>
          <div class="st-title">
            <div class="logo" aria-label="Beat Rush"><span>BEAT</span><span>RUSH</span></div>
            <p class="st-moral">Toca al ritmo y devuélvele la música al mundo.</p>
          </div>
          <p class="st-cap" aria-live="polite"></p>
          <button class="btn-primary st-play" type="button">¡A JUGAR!</button>
        </div>
        <div class="st-flash"></div>`;
      this.el.querySelector('.st-play').addEventListener('click', () => this.finish());
    },

    async play() {
      if (currentScreen === 'story') return;
      const token = ++this.token;
      this.stop();
      this.build();
      this.el.className = 'story';
      this.el.style.setProperty('--bob', '1');
      this.sceneIdx = -1;
      this.done = false;
      blurActive();
      showScreen('story');

      // Dentro del gesto del usuario: desbloquea el audio en móviles
      const ok = await AudioEngine.unlock();
      if (token !== this.token || currentScreen !== 'story') return;
      this.useAudio = ok;
      if (ok) {
        AudioEngine.startRun();
        this.t0 = AudioEngine.ctx.currentTime + 0.3;
        scheduleStoryMusic(this.t0);
      } else {
        this.perf0 = performance.now() + 300;
      }
      const loop = () => {
        this.raf = requestAnimationFrame(loop);
        this.tick();
      };
      this.raf = requestAnimationFrame(loop);
    },

    time() {
      if (this.useAudio) {
        const c = AudioEngine.ctx;
        const lat = Math.min(0.35, (c.baseLatency || 0) + (c.outputLatency || 0));
        return c.currentTime - this.t0 - lat;
      }
      return (performance.now() - this.perf0) / 1000;
    },

    tick() {
      const t = this.time();
      let idx = -1;
      for (let i = 0; i < STORY_SCENES.length; i++) if (t >= STORY_SCENES[i].at) idx = i;
      while (this.sceneIdx < idx) this.enter(++this.sceneIdx);
      const p = t >= 0 ? (t / STORY_BEAT) % 1 : 0;
      const amp = reducedMotion ? 0.25 : 1;
      this.el.style.setProperty('--pulse', (t >= 0 ? Math.pow(1 - p, 3) * amp : 0).toFixed(3));
      this.el.style.setProperty('--lift', (t >= 0 ? Math.sin(p * Math.PI) * 5 * amp : 0).toFixed(2));
      if (!this.done && t >= STORY_END) {
        this.done = true;
        this.el.classList.add('is-done');
        const b = this.el.querySelector('.st-play');
        try { b.focus({ preventScroll: true }); } catch (e) { b.focus(); }
      }
    },

    enter(i) {
      const sc = STORY_SCENES[i];
      this.el.classList.add('at-' + sc.id);
      this.el.style.setProperty('--bob', String(sc.bob));
      const pum = this.el.querySelector('.st-pum');
      pum.classList.remove('is-sad', 'is-shock', 'is-victory');
      if (sc.face) pum.classList.add(sc.face);
      if (sc.id === 's7') this.el.querySelectorAll('.st-friend').forEach((f) => f.classList.add('is-victory'));
      const cap = this.el.querySelector('.st-cap');
      cap.textContent = sc.text;
      cap.classList.remove('is-on');
      void cap.offsetWidth;
      if (sc.text) cap.classList.add('is-on');
      if (sc.id === 's2') this.flash('is-dark');
      if (sc.id === 's5' || sc.id === 's7') this.flash('is-light');
    },

    flash(cls) {
      const f = this.el.querySelector('.st-flash');
      if (!f) return;
      f.className = 'st-flash';
      void f.offsetWidth;
      f.classList.add(cls);
    },

    stop() {
      if (this.raf) cancelAnimationFrame(this.raf);
      this.raf = 0;
      AudioEngine.stopRun();
    },

    // Termina (o se salta) la historia y lleva a la pantalla principal
    finish() {
      if (currentScreen !== 'story') return;
      this.token++;
      this.stop();
      progress.introSeen = true;
      Store.save(progress);
      renderTitle();
      showScreen('title');
      this.el.innerHTML = '';
    }
  };

  function skipGate() {
    progress.introSeen = true;
    Store.save(progress);
    renderTitle();
    showScreen('title');
  }

  /* =========================================================
     8. JUEGO
     ========================================================= */
  const state = {
    phase: 'idle',          // idle | starting | playing | results
    runToken: 0,
    level: LEVELS[0],
    song: null,
    notes: [],
    cursor: 0,
    drawStart: 0,
    lineStart: 0,
    barPtr: 0,
    score: 0,
    combo: 0,
    maxCombo: 0,
    perfect: 0,
    good: 0,
    miss: 0,
    stray: 0,
    lastInputS: -Infinity,
    lastHitS: -Infinity,
    lastAutoMissT: -Infinity,
    countIdx: -1,
    introCleared: false,
    tagIdx: 0,
    finShown: false,
    rafId: 0,
    countRaf: 0,
    lastFrame: 0,
    pressAt: -Infinity,
    flash: null,
    ripples: [],
    particles: [],
    resultsAt: 0,
    primaryAction: null,
    timers: new Set(),
    faceTimer: 0,
    swingTimer: 0
  };

  function later(fn, ms) {
    const id = setTimeout(() => {
      state.timers.delete(id);
      fn();
    }, ms);
    state.timers.add(id);
    return id;
  }
  function cancelLater(id) {
    if (!id) return;
    clearTimeout(id);
    state.timers.delete(id);
  }
  function clearTimers() {
    state.timers.forEach((id) => clearTimeout(id));
    state.timers.clear();
    state.faceTimer = 0;
    state.swingTimer = 0;
  }

  /* ---------------- Layout ---------------- */
  const L = { W: 0, H: 0, dpr: 1, cx: 0, laneW: 0, laneTop: 0, targetY: 0, ringR: 0, noteR: 0, padW: 0, padH: 0, padTop: 0 };

  function layout() {
    const r = stage.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) return;
    L.W = r.width;
    L.H = r.height;
    L.dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(L.W * L.dpr);
    canvas.height = Math.round(L.H * L.dpr);
    g.setTransform(L.dpr, 0, 0, L.dpr, 0, 0);

    L.cx = L.W / 2;
    L.noteR = clamp(L.W * 0.043, 13, 21);
    L.ringR = L.noteR + 8;
    L.laneW = clamp(L.W * 0.28, 88, 136);
    L.padW = clamp(L.W * 0.5, 150, 270);
    L.padH = clamp(L.H * 0.1, 50, 76);
    const bottom = 14;
    L.padTop = L.H - bottom - L.padH;
    L.targetY = L.padTop - 12 - L.ringR;
    L.laneTop = 8;

    const bw = clamp(Math.min(L.W * 0.24, L.H * 0.3), 56, 132);
    const bh = bw * (140 / 150);
    const bx = Math.max(4, L.cx - L.padW / 2 - bw * 0.8);
    const by = L.H - bottom - bh + bw * 0.03;
    stage.style.setProperty('--bx', bx + 'px');
    stage.style.setProperty('--by', by + 'px');
    stage.style.setProperty('--bw', bw + 'px');
    stage.style.setProperty('--judge-y', (L.targetY - L.ringR - 42) + 'px');
  }

  /* ---------------- Render ---------------- */
  function roundRect(x, y, w, h, r) {
    const rr = Math.min(r, w / 2, h / 2);
    g.beginPath();
    g.moveTo(x + rr, y);
    g.lineTo(x + w - rr, y);
    g.quadraticCurveTo(x + w, y, x + w, y + rr);
    g.lineTo(x + w, y + h - rr);
    g.quadraticCurveTo(x + w, y + h, x + w - rr, y + h);
    g.lineTo(x + rr, y + h);
    g.quadraticCurveTo(x, y + h, x, y + h - rr);
    g.lineTo(x, y + rr);
    g.quadraticCurveTo(x, y, x + rr, y);
    g.closePath();
  }

  function circle(x, y, r) {
    g.beginPath();
    g.arc(x, y, r, 0, Math.PI * 2);
  }

  function yFor(t, s, approach) {
    const startY = L.laneTop + L.noteR;
    return L.targetY - ((t - s) / approach) * (L.targetY - startY);
  }

  // Fase dentro del pulso actual (0..1), respetando cambios de tempo
  function beatPhase(s) {
    const song = state.song;
    if (!song) return 0;
    if (s < song.bars[0].t) {
      const p = s / song.cdBeat;
      return p - Math.floor(p);
    }
    const bars = song.bars;
    while (state.barPtr + 1 < bars.length && bars[state.barPtr + 1].t <= s) state.barPtr++;
    const b = bars[state.barPtr];
    const p = (s - b.t) / b.beat;
    return p - Math.floor(p);
  }

  function render(s, nowMs, dt) {
    if (!L.W) return;
    const song = state.song;
    const { W, H, cx } = L;
    const approach = song ? song.approach : 1.5;
    g.clearRect(0, 0, W, H);

    const active = song && s >= 0 && s <= song.lastT + 0.6;
    const phase = active ? beatPhase(s) : 0;
    const pulse = active ? Math.pow(1 - phase, 3) * (reducedMotion ? 0.35 : 1) : 0;
    const accent = state.level.accent;

    const glowR = Math.min(W * 0.5, H * 0.75);
    const glow = g.createRadialGradient(cx, L.targetY, 0, cx, L.targetY, glowR);
    glow.addColorStop(0, `rgba(${accent}, ${0.12 + 0.16 * pulse})`);
    glow.addColorStop(1, `rgba(${accent}, 0)`);
    g.fillStyle = glow;
    g.fillRect(0, 0, W, H);

    // Carril (con fondo oscuro para que se lean las bolitas sobre cualquier escenario)
    const laneX = cx - L.laneW / 2;
    const laneH = L.targetY + L.ringR + 6 - L.laneTop;
    const laneGrad = g.createLinearGradient(0, L.laneTop, 0, L.laneTop + laneH);
    laneGrad.addColorStop(0, 'rgba(12, 6, 28, 0)');
    laneGrad.addColorStop(0.18, 'rgba(12, 6, 28, 0.5)');
    laneGrad.addColorStop(1, 'rgba(12, 6, 28, 0.65)');
    g.fillStyle = laneGrad;
    roundRect(laneX, L.laneTop, L.laneW, laneH, L.laneW / 2);
    g.fill();
    g.strokeStyle = 'rgba(255, 244, 230, 0.08)';
    g.lineWidth = 1.5;
    g.stroke();

    if (song) {
      // Líneas de pulso
      const lines = song.lines;
      while (state.lineStart < lines.length && lines[state.lineStart].t < s - 0.05) state.lineStart++;
      g.lineCap = 'round';
      for (let i = state.lineStart; i < lines.length; i++) {
        const ln = lines[i];
        if (ln.t - s > approach) break;
        const y = yFor(ln.t, s, approach);
        if (y < L.laneTop + 4 || y > L.targetY) continue;
        g.strokeStyle = ln.bar ? 'rgba(255, 244, 230, 0.24)' : 'rgba(255, 244, 230, 0.1)';
        g.lineWidth = ln.bar ? 3 : 2;
        const hw = L.laneW * (ln.bar ? 0.38 : 0.26);
        g.beginPath();
        g.moveTo(cx - hw, y);
        g.lineTo(cx + hw, y);
        g.stroke();
      }
    }

    // Aro objetivo
    const ringPulse = 1 + 0.08 * pulse;
    g.fillStyle = 'rgba(255, 255, 255, 0.06)';
    circle(cx, L.targetY, L.ringR * ringPulse);
    g.fill();
    g.strokeStyle = `rgba(255, 244, 230, ${0.6 + 0.4 * pulse})`;
    g.lineWidth = 3.5;
    circle(cx, L.targetY, L.ringR * ringPulse);
    g.stroke();

    // Indicadores
    if (song) {
      const notes = state.notes;
      while (state.drawStart < notes.length && notes[state.drawStart].t < s - 0.7) state.drawStart++;
      const r = L.noteR;
      for (let i = state.drawStart; i < notes.length; i++) {
        const n = notes[i];
        const ahead = n.t - s;
        if (ahead > approach + 0.05) break;
        if (n.judged && n.result !== 'miss') continue;
        const y = yFor(n.t, s, approach);
        if (y < L.laneTop - r) continue;
        if (n.result === 'miss') {
          g.globalAlpha = clamp(1 - (s - n.t) / 0.6, 0, 1) * 0.45;
          g.fillStyle = '#6E5C99';
          circle(cx, y, r * 0.9);
          g.fill();
          g.globalAlpha = 1;
          continue;
        }
        const col = SUB_COLORS[n.sub];
        const fadeIn = clamp((approach - ahead) / 0.18, 0, 1);
        g.globalAlpha = 0.22 * fadeIn;
        g.fillStyle = col;
        circle(cx, y, r * 1.55);
        g.fill();
        g.globalAlpha = fadeIn;
        circle(cx, y, r);
        g.fill();
        g.fillStyle = 'rgba(255, 255, 255, 0.85)';
        circle(cx - r * 0.3, y - r * 0.32, r * 0.28);
        g.fill();
        g.globalAlpha = 1;
      }
    }

    // Ondas de acierto
    for (let i = state.ripples.length - 1; i >= 0; i--) {
      const rp = state.ripples[i];
      const k = (nowMs - rp.t) / 380;
      if (k >= 1) { state.ripples.splice(i, 1); continue; }
      g.globalAlpha = 1 - k;
      g.strokeStyle = rp.col;
      g.lineWidth = 5 * (1 - k) + 1;
      circle(cx, L.targetY, L.ringR + 40 * k);
      g.stroke();
      g.globalAlpha = 1;
    }

    // Pad TAP
    const pressed = nowMs - state.pressAt < 90;
    const py = L.padTop + (pressed ? 3 : 0);
    const px = cx - L.padW / 2;
    g.fillStyle = '#140A2A';
    roundRect(px, L.padTop + 5, L.padW, L.padH, 20);
    g.fill();
    const padGrad = g.createLinearGradient(0, py, 0, py + L.padH);
    padGrad.addColorStop(0, '#3A2475');
    padGrad.addColorStop(1, '#2A1857');
    g.fillStyle = padGrad;
    roundRect(px, py, L.padW, L.padH, 20);
    g.fill();
    if (state.flash) {
      const k = (nowMs - state.flash.t) / 240;
      if (k >= 1) {
        state.flash = null;
      } else {
        g.globalAlpha = 0.6 * (1 - k);
        g.fillStyle = state.flash.col;
        roundRect(px, py, L.padW, L.padH, 20);
        g.fill();
        g.globalAlpha = 1;
      }
    }
    g.strokeStyle = 'rgba(255, 244, 230, 0.2)';
    g.lineWidth = 2;
    roundRect(px + 1, py + 1, L.padW - 2, L.padH - 2, 19);
    g.stroke();
    g.fillStyle = COLORS.ink;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.font = `${Math.round(clamp(L.padH * 0.4, 18, 28))}px Bungee, "Arial Black", Impact, sans-serif`;
    g.fillText('TAP', cx, py + L.padH / 2 + 1);

    // Confeti del PERFECT
    const ps = state.particles;
    for (let i = ps.length - 1; i >= 0; i--) {
      const p = ps[i];
      p.life += dt;
      if (p.life >= p.max) { ps.splice(i, 1); continue; }
      p.vy += 620 * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.rot += p.vr * dt;
      g.save();
      g.globalAlpha = 1 - p.life / p.max;
      g.translate(p.x, p.y);
      g.rotate(p.rot);
      g.fillStyle = p.col;
      g.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.6);
      g.restore();
    }
  }

  function burst() {
    if (reducedMotion) return;
    const palette = [COLORS.yellow, COLORS.pink, COLORS.mint, COLORS.ink];
    for (let i = 0; i < 16; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = 140 + Math.random() * 220;
      state.particles.push({
        x: L.cx, y: L.targetY,
        vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 120,
        life: 0, max: 0.45 + Math.random() * 0.3,
        size: 5 + Math.random() * 5,
        rot: Math.random() * 6, vr: (Math.random() - 0.5) * 18,
        col: palette[i % palette.length]
      });
    }
  }

  /* ---------------- Feedback ---------------- */
  function showJudgment(result, sub) {
    judgment.dataset.r = result;
    jMain.textContent = result === 'perfect' ? 'PERFECT!' : result === 'good' ? 'GOOD!' : 'MISS!';
    jSub.textContent = sub || '';
    judgment.classList.remove('is-on');
    void judgment.offsetWidth;
    judgment.classList.add('is-on');
  }

  function buddyReact(result) {
    buddyGame.classList.remove('is-perfect', 'is-good', 'is-miss');
    void buddyGame.offsetWidth;
    buddyGame.classList.add('is-' + result);
    cancelLater(state.faceTimer);
    state.faceTimer = later(() => {
      buddyGame.classList.remove('is-perfect', 'is-good', 'is-miss');
      state.faceTimer = 0;
    }, 380);
  }

  function buddySwing() {
    buddyGame.classList.add('is-swing');
    cancelLater(state.swingTimer);
    state.swingTimer = later(() => {
      buddyGame.classList.remove('is-swing');
      state.swingTimer = 0;
    }, 100);
  }

  function resetBuddy() {
    buddyGame.classList.remove('is-perfect', 'is-good', 'is-miss', 'is-swing', 'is-victory', 'is-defeat');
    if (buddyBody) buddyBody.style.transform = '';
  }

  function buddyBob(s) {
    if (!buddyBody || !state.song) return;
    if (s < 0 || s > state.song.lastT + 0.3) {
      buddyBody.style.transform = '';
      return;
    }
    const p = beatPhase(s);
    const amp = reducedMotion ? 0.2 : 1;
    const sq = Math.pow(1 - p, 4);
    const lift = Math.sin(p * Math.PI) * 4 * amp;
    buddyBody.style.transform = `translateY(${(-lift).toFixed(2)}px) scale(${(1 + 0.05 * sq * amp).toFixed(3)}, ${(1 - 0.07 * sq * amp).toFixed(3)})`;
  }

  function shakeStage() {
    if (reducedMotion) return;
    stage.classList.remove('is-shake');
    void stage.offsetWidth;
    stage.classList.add('is-shake');
  }

  function feedback(result, sub, note) {
    const now = performance.now();
    showJudgment(result, sub);
    buddyReact(result);
    const wave = state.level.hitWave;
    if (result === 'perfect') {
      AudioEngine.hit('perfect', note.freq, wave);
      burst();
      state.ripples.push({ t: now, col: COLORS.yellow });
      state.flash = { t: now, col: COLORS.yellow };
    } else if (result === 'good') {
      AudioEngine.hit('good', note.freq, wave);
      state.ripples.push({ t: now, col: COLORS.sky });
      state.flash = { t: now, col: COLORS.sky };
    } else {
      AudioEngine.bonk(note ? 0.8 : 0.55);
      state.flash = { t: now, col: COLORS.red };
      shakeStage();
    }
  }

  function showCallout(main, sub, mode) {
    cMain.textContent = main;
    cSub.textContent = sub || '';
    callout.className = 'callout mode-' + mode + ' is-hold';
  }

  function flashCallout(main, mode, sub) {
    cMain.textContent = main;
    cSub.textContent = sub || '';
    callout.className = 'callout mode-' + mode;
    void callout.offsetWidth;
    callout.classList.add('is-flash');
  }

  function hideCallout() {
    callout.className = 'callout';
  }

  function showTag(text) {
    tag.textContent = text;
    tag.classList.remove('is-on');
    void tag.offsetWidth;
    tag.classList.add('is-on');
  }

  /* ---------------- Puntuación ---------------- */
  function comboMult(c) {
    return 1 + Math.min(4, Math.floor(c / 10)) * 0.5; // hasta x3
  }

  function judgedTotal() {
    return state.perfect + state.good + state.miss + state.stray;
  }

  // PRECISIÓN: calidad del timing (PERFECT 100%, GOOD 60%)
  function accuracy() {
    const total = judgedTotal();
    if (!total) return 100;
    return Math.round(((state.perfect + state.good * 0.6) / total) * 100);
  }

  // NOTA 0–100: aciertos (PERFECT 100%, GOOD 90%). 100 = sin MISS y casi todo PERFECT.
  function score100() {
    const total = state.notes.length + state.stray;
    if (!total) return 0;
    return Math.round(((state.perfect + state.good * 0.9) / total) * 100);
  }

  function updateHud(kind) {
    hudScore.textContent = fmt(state.score);
    hudCombo.textContent = state.combo;
    const m = comboMult(state.combo);
    hudMult.textContent = m > 1 ? '×' + m : '';
    hudAcc.textContent = accuracy() + '%';
    if (kind === 'hit' || kind === 'break') {
      hudComboWrap.classList.remove('is-bump', 'is-milestone', 'is-break');
      void hudComboWrap.offsetWidth;
      if (kind === 'break') hudComboWrap.classList.add('is-break');
      else hudComboWrap.classList.add(state.combo > 0 && state.combo % 10 === 0 ? 'is-milestone' : 'is-bump');
    }
  }

  /* ---------------- Juicio de golpes ---------------- */
  function advanceCursor() {
    const notes = state.notes;
    while (state.cursor < notes.length && notes[state.cursor].judged) state.cursor++;
  }

  function judge(note, result, delta) {
    note.judged = true;
    note.result = result;
    let sub = '';
    if (result === 'miss') {
      const hadCombo = state.combo > 0;
      state.miss++;
      state.combo = 0;
      if (delta !== null && delta < 0) sub = 'muy temprano';
      feedback('miss', sub, note);
      updateHud(hadCombo ? 'break' : 'none');
    } else {
      state.combo++;
      if (state.combo > state.maxCombo) state.maxCombo = state.combo;
      const base = result === 'perfect' ? 100 : 50;
      state.score += Math.round(base * comboMult(state.combo));
      if (result === 'perfect') state.perfect++;
      else {
        state.good++;
        sub = delta < 0 ? 'temprano' : 'tarde';
      }
      feedback(result, sub, note);
      updateHud('hit');
      if (state.combo % 10 === 0) AudioEngine.chime();
    }
    advanceCursor();
  }

  function processLate(s) {
    const song = state.song;
    const notes = state.notes;
    for (let i = state.cursor; i < notes.length; i++) {
      const n = notes[i];
      if (n.judged) continue;
      if (s - n.t > song.winG) {
        judge(n, 'miss', null);
        state.lastAutoMissT = n.t;
      } else {
        break;
      }
    }
  }

  function strayTap() {
    const hadCombo = state.combo > 0;
    state.stray++;
    state.combo = 0;
    feedback('miss', 'fuera de ritmo', null);
    updateHud(hadCombo ? 'break' : 'none');
  }

  function handleTap(perfMs) {
    if (state.phase !== 'playing') return;
    const song = state.song;
    const s = Clock.song(perfMs);
    if (s - state.lastInputS < DEBOUNCE) return;
    state.lastInputS = s;
    state.pressAt = performance.now();
    buddySwing();

    // Antes de las notas: toques de práctica sin penalización
    if (s < song.firstT - song.winEarly) {
      AudioEngine.tick();
      state.flash = { t: performance.now(), col: COLORS.violet };
      return;
    }
    if (state.cursor >= state.notes.length) return;

    processLate(s);

    let target = null;
    let early = false;
    const notes = state.notes;
    for (let i = state.cursor; i < notes.length; i++) {
      const n = notes[i];
      if (n.judged) continue;
      const d = s - n.t;
      if (d > song.winG) continue;
      if (d >= -song.winG) { target = n; break; }
      if (d >= -song.winEarly) { target = n; early = true; }
      break;
    }

    if (target && !early) {
      const d = s - target.t;
      judge(target, Math.abs(d) <= song.winP ? 'perfect' : 'good', d);
      state.lastHitS = s;
      return;
    }
    if (s - state.lastHitS < DOUBLE_TAP_GRACE) return;
    if (s - state.lastAutoMissT <= song.lateGrace) return;

    if (target && early) {
      judge(target, 'miss', s - target.t);
      return;
    }
    strayTap();
  }

  /* ---------------- Línea de tiempo ---------------- */
  function updateTimeline(s) {
    const song = state.song;
    if (s < 0) return;
    if (!state.introCleared) {
      state.introCleared = true;
      hideCallout();
    }
    if (s < 4 * song.cdBeat) {
      const idx = Math.floor(s / song.cdBeat);
      if (idx !== state.countIdx) {
        state.countIdx = idx;
        flashCallout(['3', '2', '1', 'GO!'][idx], 'count');
      }
    }
    while (state.tagIdx < song.tags.length && s >= song.tags[state.tagIdx].t) {
      const tg = song.tags[state.tagIdx];
      if (s < tg.t + 0.5) showTag(tg.text);
      state.tagIdx++;
    }
    if (!state.finShown && s >= song.finT) {
      state.finShown = true;
      const passed = score100() >= PASS_SCORE;
      flashCallout(passed ? '¡NIVEL SUPERADO!' : '¡FIN!', 'end');
      buddyGame.classList.remove('is-perfect', 'is-good', 'is-miss');
      buddyGame.classList.add(passed ? 'is-victory' : 'is-defeat');
      if (passed) AudioEngine.fanfare(false);
    }
  }

  /* ---------------- Bucle ---------------- */
  function frame(nowMs) {
    state.rafId = requestAnimationFrame(frame);
    const dt = clamp((nowMs - state.lastFrame) / 1000, 0, 0.05);
    state.lastFrame = nowMs;

    Clock.sample(false);
    const s = Clock.song(performance.now());
    if (s < 0) Clock.sample(true);
    Music.pump();

    updateTimeline(s);
    processLate(s);
    buddyBob(s);
    render(s, nowMs, dt);

    if (s >= state.song.endT) finishLevel();
  }

  /* ---------------- Flujo de partida ---------------- */
  function resetRun() {
    state.notes = state.song.notes.map((n) => ({ t: n.t, sub: n.sub, freq: n.freq, judged: false, result: null }));
    state.cursor = 0;
    state.drawStart = 0;
    state.lineStart = 0;
    state.barPtr = 0;
    state.score = 0;
    state.combo = 0;
    state.maxCombo = 0;
    state.perfect = 0;
    state.good = 0;
    state.miss = 0;
    state.stray = 0;
    state.lastInputS = -Infinity;
    state.lastHitS = -Infinity;
    state.lastAutoMissT = -Infinity;
    state.countIdx = -1;
    state.introCleared = false;
    state.tagIdx = 0;
    state.finShown = false;
    state.pressAt = -Infinity;
    state.flash = null;
    state.ripples.length = 0;
    state.particles.length = 0;
    hudComboWrap.classList.remove('is-bump', 'is-milestone', 'is-break');
    updateHud('none');
  }

  function stopRun() {
    if (state.rafId) cancelAnimationFrame(state.rafId);
    state.rafId = 0;
    if (state.countRaf) cancelAnimationFrame(state.countRaf);
    state.countRaf = 0;
    clearTimers();
    Music.stop();
    AudioEngine.stopRun();
    state.particles.length = 0;
    state.ripples.length = 0;
    resetBuddy();
    hideCallout();
    tag.classList.remove('is-on');
    judgment.classList.remove('is-on');
    stage.classList.remove('is-shake');
  }

  function prepareLevelVisuals(level) {
    if (!sceneCache[level.scene]) sceneCache[level.scene] = sceneSVG(level.scene);
    sceneEl.innerHTML = sceneCache[level.scene];
    sceneEl.dataset.scene = level.scene;
    buddyGame.innerHTML = characterSVG(level.char);
    buddyBody = buddyGame.querySelector('.b-body');
    hudLevel.textContent = level.secret ? '✨ Secreto' : `Nivel ${level.num}`;
    document.querySelector('meta[name="theme-color"]').setAttribute('content', '#1A0F33');
  }

  async function startLevel(id) {
    const level = levelById(id);
    if (!level || !isUnlocked(level)) return;
    if (state.phase === 'starting') return;
    blurActive();
    const token = ++state.runToken;
    stopRun();
    state.phase = 'starting';
    state.level = level;
    state.song = buildSong(level);
    resetRun();
    prepareLevelVisuals(level);
    showScreen('game');
    layout();
    showCallout(level.intro[0], level.intro[1], 'intro');
    render(-LEAD_IN, performance.now(), 0);

    // Dentro del gesto del usuario: desbloquea el audio en móviles
    const audioOk = await AudioEngine.unlock();
    if (token !== state.runToken || state.phase !== 'starting') return;

    Clock.begin(audioOk);
    if (audioOk) {
      AudioEngine.startRun();
      Music.begin(state.song, Clock.startCtx);
      Music.pump();
    }
    state.phase = 'playing';
    state.lastFrame = performance.now();
    state.rafId = requestAnimationFrame(frame);
  }

  function leaveToMap() {
    state.runToken++;
    stopRun();
    state.phase = 'idle';
    openMap(state.level.id);
  }

  /* =========================================================
     9. RESULTADOS
     ========================================================= */
  function recordResult(level, res) {
    const r = Object.assign({ best: 0, acc: 0, combo: 0, points: 0, plays: 0 }, progress.levels[level.id]);
    const isRecord = r.plays > 0 && res.score > r.best;
    r.best = Math.max(r.best, res.score);
    r.acc = Math.max(r.acc, res.acc);
    r.combo = Math.max(r.combo, res.combo);
    r.points = Math.max(r.points, res.points);
    r.plays += 1;
    progress.levels[level.id] = r;

    const out = { isRecord, unlockedLevel: null, secretNew: false, secretClearedNow: false, passed: res.score >= PASS_SCORE };
    if (out.passed && !level.secret && level.num < MAIN_LEVELS.length && progress.unlocked < level.num + 1) {
      progress.unlocked = level.num + 1;
      out.unlockedLevel = MAIN_LEVELS[level.num];
    }
    if (out.passed && level.secret && !progress.secretCleared) {
      progress.secretCleared = true;
      out.secretClearedNow = true;
    }
    if (!progress.secretUnlocked && allMainPerfect()) {
      progress.secretUnlocked = true;
      out.secretNew = true;
    }
    Store.save(progress);
    return out;
  }

  function finishLevel() {
    if (state.phase !== 'playing') return;
    state.phase = 'results';
    if (state.rafId) cancelAnimationFrame(state.rafId);
    state.rafId = 0;
    clearTimers();
    resetBuddy();

    const level = state.level;
    const res = {
      score: score100(),
      acc: accuracy(),
      combo: state.maxCombo,
      points: state.score
    };
    const rating = ratingFor(res.score);
    const outcome = recordResult(level, res);
    const stars = scoreToStars(res.score);

    $('res-level').textContent = level.secret ? `Nivel secreto: ${level.name}` : `Nivel ${level.num}: ${level.name}`;
    $('res-title').textContent = outcome.secretClearedNow
      ? '¡LEYENDA DEL RITMO!'
      : outcome.passed ? '¡NIVEL SUPERADO!' : 'RESULTADO';
    $('res-score').textContent = '0';
    $('res-stars').innerHTML = starsHTML(stars);
    const ratingEl = $('res-rating');
    ratingEl.textContent = rating;
    ratingEl.dataset.rating = rating;
    $('res-phrase').textContent = pick(PHRASES[rating]);
    $('res-record').hidden = !outcome.isRecord;
    $('res-acc').textContent = res.acc + '%';
    $('res-combo').textContent = fmt(res.combo);
    $('res-points').textContent = fmt(res.points);
    $('res-perfect').textContent = state.perfect;
    $('res-good').textContent = state.good;
    $('res-miss').textContent = state.miss + state.stray;
    const best = rec(level);
    $('res-best').textContent = `Tu mejor marca: ${best.best}/100, precisión ${best.acc}%, combo ${best.combo}`;

    const unlockEl = $('res-unlock');
    unlockEl.className = 'unlock';
    unlockEl.hidden = true;
    if (outcome.secretNew) {
      unlockEl.textContent = '✨ ¡NIVEL SECRETO DESBLOQUEADO! ✨';
      unlockEl.classList.add('is-secret');
      unlockEl.hidden = false;
    } else if (outcome.secretClearedNow) {
      unlockEl.textContent = '👑 Ganaste la Corona Prisma. Mira la pantalla de inicio.';
      unlockEl.classList.add('is-secret');
      unlockEl.hidden = false;
    } else if (outcome.unlockedLevel) {
      unlockEl.textContent = `🔓 ¡Nivel ${outcome.unlockedLevel.num} desbloqueado!`;
      unlockEl.hidden = false;
    } else if (!outcome.passed && !level.secret && level.num < MAIN_LEVELS.length && !isUnlocked(MAIN_LEVELS[level.num])) {
      unlockEl.textContent = `Consigue ${PASS_SCORE} o más para desbloquear el Nivel ${level.num + 1}.`;
      unlockEl.classList.add('is-hint');
      unlockEl.hidden = false;
    } else if (!level.secret && res.score < 100 && !isUnlocked(SECRET_LEVEL) && outcome.passed) {
      unlockEl.textContent = 'Saca 100 en todos los niveles para descubrir el secreto.';
      unlockEl.classList.add('is-hint');
      unlockEl.hidden = false;
    }

    // Personaje del nivel celebrando o mareado
    buddyResult.innerHTML = characterSVG(level.char);
    buddyResult.className = 'buddy buddy--result ' + (outcome.passed ? 'is-victory' : 'is-defeat');

    // Botones
    const btnNext = $('btn-next');
    const btnRetry = $('btn-retry');
    const btnMap = $('btn-tomap');
    let primary;
    const nextMain = !level.secret && level.num < MAIN_LEVELS.length ? MAIN_LEVELS[level.num] : null;
    if (outcome.passed && outcome.secretNew) {
      primary = { label: 'NIVEL SECRETO', action: () => startLevel(SECRET_LEVEL.id) };
    } else if (outcome.passed && nextMain && isUnlocked(nextMain)) {
      primary = { label: 'SIGUIENTE NIVEL', action: () => startLevel(nextMain.id) };
    } else if (outcome.passed) {
      primary = { label: 'MAPA', action: () => openMap(level.id) };
    } else {
      primary = { label: 'REINTENTAR', action: () => startLevel(level.id) };
    }
    btnNext.textContent = primary.label;
    state.primaryAction = primary.action;
    btnRetry.hidden = primary.label === 'REINTENTAR';
    btnMap.hidden = primary.label === 'MAPA';

    screens.result.classList.toggle('is-legend', outcome.secretClearedNow || (level.secret && outcome.passed));
    showScreen('result');
    state.resultsAt = performance.now();
    countUp($('res-score'), res.score);

    if (outcome.secretNew || outcome.secretClearedNow) {
      confetti(60, true);
      AudioEngine.fanfare(true);
    } else if (res.score >= 100) {
      confetti(40, false);
    } else if (outcome.passed) {
      confetti(18, false);
    }

    later(() => {
      try { btnNext.focus({ preventScroll: true }); } catch (e) { btnNext.focus(); }
    }, 350);
  }

  function countUp(el, target) {
    if (reducedMotion || target === 0) {
      el.textContent = String(target);
      return;
    }
    const start = performance.now();
    const dur = 800;
    const step = (now) => {
      const k = clamp((now - start) / dur, 0, 1);
      el.textContent = String(Math.round(target * (1 - Math.pow(1 - k, 3))));
      if (k < 1) state.countRaf = requestAnimationFrame(step);
      else state.countRaf = 0;
    };
    state.countRaf = requestAnimationFrame(step);
  }

  function confetti(n, rainbow) {
    clearConfetti();
    if (reducedMotion) return;
    const cols = rainbow
      ? ['#FF5E57', '#FFB347', '#FFD23F', '#3DF5C2', '#7CC8FF', '#B07CFF', '#FF7EDB']
      : ['#FFD23F', '#FF4D8D', '#3DF5C2', '#7CC8FF'];
    let html = '';
    for (let i = 0; i < n; i++) {
      const left = (Math.random() * 100).toFixed(1);
      const delay = (Math.random() * 1.2).toFixed(2);
      const dur = (2.2 + Math.random() * 1.8).toFixed(2);
      html += `<i style="left:${left}%;background:${cols[i % cols.length]};animation-delay:${delay}s;animation-duration:${dur}s"></i>`;
    }
    confettiEl.innerHTML = html;
  }

  function clearConfetti() {
    confettiEl.innerHTML = '';
  }

  /* =========================================================
     10. INPUT Y ARRANQUE
     ========================================================= */
  function eventTime(e) {
    const now = performance.now();
    const ts = e && e.timeStamp;
    if (ts > 0 && ts <= now && now - ts < 500) return ts;
    return now;
  }

  if (window.PointerEvent) {
    stage.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      e.preventDefault();
      handleTap(eventTime(e));
    });
  } else {
    stage.addEventListener('touchstart', (e) => {
      handleTap(eventTime(e));
    }, { passive: true });
    stage.addEventListener('mousedown', (e) => {
      if (e.button !== 0) return;
      e.preventDefault();
      handleTap(eventTime(e));
    });
  }

  // Evitar zoom, scroll y menú contextual durante el juego
  stage.addEventListener('touchstart', (e) => { if (e.cancelable) e.preventDefault(); }, { passive: false });
  stage.addEventListener('touchmove', (e) => { if (e.cancelable) e.preventDefault(); }, { passive: false });
  stage.addEventListener('contextmenu', (e) => e.preventDefault());
  document.addEventListener('dblclick', (e) => e.preventDefault(), { passive: false });
  ['gesturestart', 'gesturechange', 'gestureend'].forEach((ev) => {
    document.addEventListener(ev, (e) => e.preventDefault(), { passive: false });
  });

  window.addEventListener('keydown', (e) => {
    const isSpace = e.code === 'Space' || e.key === ' ' || e.key === 'Spacebar';
    const onButton = document.activeElement && document.activeElement.tagName === 'BUTTON';
    if (currentScreen === 'story') {
      if (e.key === 'Escape') Story.finish();
      return;
    }
    if (currentScreen === 'gate') {
      if (isSpace && !onButton) {
        e.preventDefault();
        if (!e.repeat) Story.play();
      } else if (e.key === 'Escape') {
        skipGate();
      }
      return;
    }
    if (isSpace && state.phase === 'playing') {
      e.preventDefault();
      if (!e.repeat) handleTap(eventTime(e));
      return;
    }
    if (isSpace && state.phase === 'starting') {
      e.preventDefault();
      return;
    }
    if (isSpace && currentScreen === 'result' && !onButton) {
      e.preventDefault();
      if (!e.repeat && performance.now() - state.resultsAt > RESULTS_INPUT_DELAY && state.primaryAction) state.primaryAction();
      return;
    }
    if (isSpace && currentScreen === 'map' && !onButton) {
      e.preventDefault();
      if (!e.repeat && isUnlocked(levelById(selectedId))) startLevel(selectedId);
      return;
    }
    if (isSpace && currentScreen === 'title' && !onButton) {
      e.preventDefault();
      if (!e.repeat) openMap();
      return;
    }
    if (e.key === 'Escape') {
      if (state.phase === 'playing' || state.phase === 'starting') leaveToMap();
      else if (currentScreen === 'map' || currentScreen === 'options') { showScreen('title'); renderTitle(); }
      else if (currentScreen === 'result') openMap(state.level.id);
      return;
    }
    if ((e.key === 'm' || e.key === 'M') && !e.repeat && !(e.target && e.target.tagName === 'INPUT')) toggleMute();
  });

  $('btn-map').addEventListener('click', () => openMap());
  $('btn-gate-start').addEventListener('click', () => Story.play());
  $('btn-gate-skip').addEventListener('click', () => skipGate());
  $('btn-title-story').addEventListener('click', () => Story.play());
  $('opt-story').addEventListener('click', () => Story.play());
  $('btn-story-skip').addEventListener('click', () => Story.finish());
  $('btn-options').addEventListener('click', () => { renderOptions(); showScreen('options'); });
  $('map-back').addEventListener('click', () => { renderTitle(); showScreen('title'); });
  $('opt-back').addEventListener('click', () => { renderTitle(); showScreen('title'); });
  $('btn-quit').addEventListener('click', () => leaveToMap());
  $('btn-restart').addEventListener('click', () => startLevel(state.level.id));
  $('btn-next').addEventListener('click', () => {
    if (performance.now() - state.resultsAt < 250) return;
    if (state.primaryAction) state.primaryAction();
  });
  $('btn-retry').addEventListener('click', () => startLevel(state.level.id));
  $('btn-tomap').addEventListener('click', () => { state.phase = 'idle'; openMap(state.level.id); });
  soundButtons.forEach((b) => b.addEventListener('click', () => {
    toggleMute();
    b.blur();
  }));

  // Si el jugador cambia de app o pestaña, la partida se cancela limpiamente
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && currentScreen === 'story') Story.finish();
    if (document.hidden && (state.phase === 'playing' || state.phase === 'starting')) leaveToMap();
  });
  window.addEventListener('pagehide', () => {
    if (state.phase === 'playing' || state.phase === 'starting') leaveToMap();
  });

  function onStageResize() {
    layout();
    if (state.phase !== 'playing') render(-LEAD_IN, performance.now(), 0);
  }
  function onMapResize() {
    if (currentScreen === 'map') drawMapPath();
  }
  if (window.ResizeObserver) {
    new ResizeObserver(onStageResize).observe(stage);
    new ResizeObserver(onMapResize).observe(mapTrack);
  } else {
    window.addEventListener('resize', () => { onStageResize(); onMapResize(); });
    window.addEventListener('orientationchange', () => { onStageResize(); onMapResize(); });
  }
  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(() => {
      if (state.phase !== 'playing') onStageResize();
      onMapResize();
    });
  }

  /* ---------------- Inicio ---------------- */
  state.phase = 'idle';
  state.level = LEVELS[0];
  updateSoundButtons();
  renderTitle();
  showScreen(progress.introSeen ? 'title' : 'gate');
})();