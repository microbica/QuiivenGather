// "Mi escritorio": a desk a person claims and decorates. Painted as pixel art
// (1 cell = 2 map px, so a 2x1-tile desk is a 32x16 grid) to match avatars.
// Items are tiny ASCII sprites (one char per cell, "." = empty) so adding a
// new one is just a few lines.

export type DeskMaterial = "clara" | "roble" | "blanco" | "carbon" | "verde";
export type DeskSetup = "monitor" | "laptop" | "doble" | "todo-en-uno";
export type ChairStyle = "ergonomica" | "gamer" | "madera" | "balon";

type Sprite = string[];

// Shared palette for every sprite. "C" = the color the person picked (chair).
const PAL: Record<string, string> = {
  k: "#2c2c33", // Carbón (outline)
  m: "#4a4a55",
  S: "#a9a9b2",
  s: "#d8d8de",
  w: "#ffffff",
  W: "#f4f4f6",
  e: "#f1e6d3",
  h: "#c9a77c",
  N: "#c89b6d",
  n: "#7a4a2c",
  t: "#c96a3d",
  T: "#a65430",
  g: "#3fbf78",
  G: "#2e9e63",
  l: "#8fd694",
  y: "#ffd23f",
  Y: "#ffae00",
  o: "#ff7442",
  r: "#d63b3b",
  R: "#e66fa6",
  p: "#f7b6c8",
  b: "#349ce2",
  B: "#2f5fb3",
  c: "#a9e3f4",
  q: "#18d3b8",
  v: "#7c5cc4",
};

/** Things that go on top of the desk (max 9 wide x 11 tall). */
const SURFACE = {
  // Plantas
  suculenta: ["...g.g...", "..gGgGg..", ".gGgGgGg.", "..gGgGg..", "..WWWWW..", "..WWWWW..", "...WWW..."],
  monstera: [".G.....G.", "GGG.g.GGG", "GgGGgGGgG", ".GGgGgGG.", "..GgGgG..", "....G....", "..kkkkk..", "..kmmmk..", "...kkk..."],
  cactus: ["...R.....", "...gg....", ".g.gg.g..", ".g.ggg.g.", ".gggg.gg.", "...gggg..", "...gg....", "..ttttt..", "..ttttt..", "...TTT..."],
  flores: [".R..Y..o.", "RRR.YYooo", ".R.YYY.o.", ".G..G..G.", "..G.G.G..", "...cccc..", "..cccccc.", "..cccccc.", "...cccc.."],
  girasol: ["..YYYYY..", ".YYnnnYY.", ".YYnnnYY.", "..YYYYY..", "....G....", "..GGG....", "....GGG..", "....G....", "..ttttt..", "...TTT..."],
  tulipanes: [".R..R..R.", "RpR.R.RpR", ".R.RpR.R.", ".G..G..G.", "..G.G.G..", "..ppppp..", "..pRRRp..", "...ppp..."],
  pothos: ["..g.G.g..", ".gGgGgGg.", "..WWWWW..", "..WWWWW.g", "g.WWWWW.G", "G..WWW..g", "g.......G"],
  sansevieria: ["..l...l..", "..gl.lg..", ".lgl.lgl.", ".lglglgl.", ".gglgggl.", "..hhhhh..", "..hhhhh..", "...hhh..."],
  bonsai: [".GGG.GG..", "GgGGGgGG.", ".GG.nGG..", "....n....", "...nn....", "mmmmmmmmm", ".mmmmmmm."],
  "planta-cara": ["..g...g..", ".gGg.gGg.", "..gGgGg..", "...gGg...", ".WWWWWWW.", ".WkWWWkW.", ".WpWWWpW.", ".WWWkWWW.", "..WWWWW.."],
  // Café y snacks
  taza: ["...s.s...", "..s.s....", ".WWWWWW..", ".WnnnnWWW", ".WWWWWW.W", ".WWWWWWWW", ".WWWWWW..", "..WWWW..."],
  "cafe-llevar": ["..mmmmm..", ".sssssss.", "..WWWWW..", "..NNNNN..", "..NeeeN..", "..NNNNN..", "...WWW..."],
  tetera: ["....k....", "...rrr...", ".rrrwrrr.", "rrwrrrwrr", "rrrrwrrr.", ".rrrrrr..", "..rrrr..."],
  limonada: ["......y..", ".....y...", "..sssss..", "..cyccc..", "..crcyc..", "..cccrc..", "..ccccc..", "...ccc..."],
  banano: ["........n", ".......yy", "......yy.", "y....yy..", ".yyyyy...", "..yyy...."],
  sandwich: ["...eeee..", "..eNNNNe.", ".eNNNNNNe", ".gggggggg", ".rrrrrrrr", ".eeeeeeee", ".NNNNNNNN"],
  galletas: ["..NNN....", ".NnNNN.N.", ".NNNnNNNN", "..NNN.NnN", "WWWWWWWWW", ".WWWWWWW."],
  moka: ["....m....", "...lll...", "..lllll.m", "...lll.m.", "..lllll..", ".lllllll.", ".lllllll.", "..lllll.."],
  // Papelería
  libros: [".ooooooo.", "..yyyyyy.", "..yyyyyy.", ".qqqqqqq.", ".qqqqqqq.", "bbbbbbbb.", "bbbbbbbb."],
  cuaderno: [".kkkkkkk.", ".kbbbbbb.", ".kbwwwwb.", ".kbbbbbb.", ".kbbbbbb.", ".kbbbbbb.", ".kkkkkkk."],
  portalapices: [".r.y...b.", ".r.y.k.b.", ".r.yk.bb.", "..rykbb..", ".qqqqqqq.", ".qwqwqwq.", ".qqqqqqq.", ".qwqwqwq.", "..qqqqq.."],
  carpetas: [".kkkkkkk.", ".bryqbry.", ".bryqbry.", ".wwwwwww.", ".bryqbry.", ".bryqbry.", ".bryqbry."],
  postits: ["yyyy.....", "yyyyRRRR.", "yyyyRRRR.", "yyyyRRRR.", "..qqqq...", "..qqqq...", "..qqqq..."],
  calendario: [".k.....k.", "rrrrrrrrr", "rwwwwwwwr", "wkwkwkwkw", "wwwwwwwww", "wkwkwrwkw", "wwwwwwwww", "wkwkwkwkw", "wwwwwwwww"],
  reloj: ["R.......R", ".RRRRRRR.", "RRwwwwwRR", "RwwwkwwwR", "RwwwkwwwR", "RwwwkkwwR", "RRwwwwwRR", ".RRRRRRR.", ".k.....k."],
  pendientes: ["...mmm...", ".NNmmmNN.", ".NwwwwwN.", ".NwkwkkN.", ".NwwwwwN.", ".NwkwkkN.", ".NwwwwwN.", ".NwkwkkN.", ".NNNNNNN."],
  papeles: [".wwwwwww.", ".sssssss.", ".wwwwwww.", ".sssssss.", ".wwwwwww.", ".sssssss."],
  // Tecnología
  monitor: ["kkkkkkkkk", "kbbbbbbbk", "kbbcbbbbk", "kbbbbbbbk", "kkkkkkkkk", "....k....", "..kkkkk.."],
  audifonos: ["..kkkkk..", ".k.....k.", "k.......k", "k.......k", "mm.....mm", "mm.....mm", "mm.....mm"],
  camara: [".kk......", "sssssssss", "pppkkkppp", "ppkmmmkpp", "ppkmbmkpp", "ppkmmmkpp", "pppkkkppp"],
  tocadiscos: ["rrrrrrrrr", "rkkkkkkkr", "rkmmmmkkr", "rkmrrmksr", "rkmmmmksr", "rkkkkkkkr", "rrrrrrrrr"],
  radio: ["......k..", ".....k...", "rrrrrrrrr", "rwwwwrkkr", "rwkwkrkkr", "rwwwwrrrr", "rrrrrrrrr", ".k.....k."],
  calculadora: [".mmmmmmm.", ".mqqqqqm.", ".mmmmmmm.", ".mwmwmwm.", ".mmmmmmm.", ".mwmwmom.", ".mmmmmmm.", ".mwmwmwm.", ".mmmmmmm."],
  telefono: ["kkkkkkkk.", "k......k.", ".mmmmmm..", "mmmbbbmm.", "mwmwmwmm.", "mmmmmmmm.", "mwmwmwmm.", "mmmmmmmm."],
  parlante: [".mmmmmm..", ".mmkkmm..", ".mkmmkm..", ".mmkkmm..", ".mkkkkm..", ".kmmmmk..", ".mkkkkm..", ".mmmmmm.."],
  // Arte y deco
  foto: ["kkkkkkkk.", "kcccccck.", "kccYccck.", "kcgcccck.", "kgggggck.", "kggggggk.", "kkkkkkkk."],
  frase: ["NNNNNNNNN", "NpppppppN", "NpkkpkkpN", "NpppppppN", "NpkkkkppN", "NpppppppN", "NNNNNNNNN", "..N...N.."],
  vela: ["....Y....", "...yoy...", "....k....", "..qqqqq..", "..qwwwq..", "..qwkwq..", "..qqqqq..", "..qqqqq.."],
  paleta: ["..NNNNN..", ".NrNNyNN.", "NNNNNNbNN", "NgNN.NNNN", "NNNN.NqNN", ".NNNNNNN.", "..NNNNN.."],
  acuarelas: ["WWWWWWWWW", "WrWyWbWgW", "WWWWWWWWW", "WRWoWqWvW", "WWWWWWWWW"],
  globo: ["...bbb...", "..bggbb..", ".bbgggbb.", ".bggbbgb.", ".bbbbggb.", "..bbggb..", "...bbb...", "....N....", "..NNNNN.."],
  lampara: ["..YYYYYY.", ".YYYYYYY.", "..eeeee..", "....k....", "...k.....", "..k......", "...k.....", "....k....", "..kkkkk.."],
  // Fitness
  mancuernas: ["kk.....kk", "kkmmmmmkk", "kk.....kk", ".........", "kk.....kk", "kkmmmmmkk", "kk.....kk"],
  kettlebell: ["..kkkkk..", ".k.....k.", ".kp...pk.", "..kkkkk..", ".kkmmmkk.", "kkkmmmkkk", "kkkkkkkkk", ".kkkkkkk."],
  botella: ["...kk....", "..kkkk...", "..ssss...", "..scss...", "..sccs...", "..scss...", "..sccs...", "..ssss..."],
  smartwatch: ["...RRR...", "..kkkkk..", "..kvwvk..", "..kwvwk..", "..kkkkk..", "...RRR...", "...RRR..."],
  cuerda: ["..k...k..", ".k.....k.", "k.......k", "R.......R", "R.......R", ".k.....k.", "..kkkkk.."],
  proteina: [".vvvvvvv.", "vRwwwwwRv", "vRwkwkwRv", "vRwwwwwRv", ".vvvvvvv."],
  frutas: ["...n.....", "..rrg....", ".rrrrr...", ".rrrrroo.", ".rrrrrooo", "..rrr.ooo", "......oo."],
  ensalada: [".g.r.l.g.", "glgGgrglg", "gGlgyglGg", ".ccccccc.", "..ccccc.."],
  batido: [".......k.", "......k..", "..sssss..", "..ppkpp..", "..ppppp..", "..pRppp..", "..ppppp..", "...ppp..."],
  // Divertidos
  patito: [".....yy..", "....yykyo", "....yyyy.", "yy..yyy..", "yyyyyyy..", "yyyyyyy..", ".yyyyy..."],
  gato: [".o...o...", ".oo.oo...", ".ooooo...", ".okooko..", "ooooooooo", "ooonnoooo", ".ooooooo.", "..ooooo.."],
  rubik: ["rrryyybbb", "rrryyybbb", "gggwwwooo", "gggwwwooo", "bbbrrryyy", "bbbrrryyy"],
  cohete: ["....r....", "...rrr...", "...www...", "...wbw...", "...www...", "..rwwwr..", ".rr.o.rr.", "....Y...."],
  // Banderas
  "bandera-col": ["kyyyyyy..", "kyyyyyy..", "kBBBBBB..", "krrrrrr..", "k........", "k........", "kk......."],
  "bandera-gt": ["kccwwcc..", "kccwwcc..", "kccwgcc..", "kccwwcc..", "k........", "k........", "kk......."],
  "bandera-mx": ["kGGwwrr..", "kGGwwrr..", "kGGwnrr..", "kGGwwrr..", "k........", "k........", "kk......."],
} satisfies Record<string, Sprite>;

/** Things that stand on the floor next to your chair (max 10 wide x 16 tall). */
const FLOOR = {
  "planta-grande": ["...gG.....", "..gGGg.G..", ".GgGG.gGg.", "..GgG.GgG.", ".gGG.n.G..", "GgGg.n....", ".GG..n.gG.", "....nnGgGg", "..gG.n.GG.", ".gGGgn....", "..GG.n....", "..hhhhhh..", "..hNhNhh..", "..hhhhhh..", "..hNhNhh..", "...hhhh..."],
  palma: ["l...l...l.", ".l..l..l..", "..l.l.l...", "llllglllll", "..g.g.g...", ".g..g..g..", "g...g...g.", "....n.....", "....n.....", "....n.....", "....n.....", "..WWWWWW..", "..WWWWWW..", "..WWWWWW..", "...WWWW..."],
  "monstera-grande": [".GG....GG.", "GgGG..GGgG", "GGgGGGGgGG", ".GGgGGgGG.", "..GGgGgG..", "GG.GgGg.GG", "GgGGgGgGgG", ".GGgGgGGG.", "...GgGG...", ".....G....", "..ssssss..", "..ssssss..", "..ssssss..", "...ssss..."],
  "lampara-pie": ["..YYYYY...", ".YYYYYYY..", "...eee....", "....k.....", "....k.....", "....k.....", "....k.....", "....k.....", "....k.....", "....k.....", "....k.....", "....k.....", "...kkk....", "..kkkkk..."],
  papelera: ["..w.ww....", ".wsswsw...", ".mmmmmmm..", ".msmsmsm..", ".msmsmsm..", ".msmsmsm..", "..msmsm...", "..mmmmm..."],
  mochila: ["...NNN....", "..N...N...", ".YYYYYYY..", ".YYYYYYY..", ".YkkkkkY..", ".YYYYYYY..", ".YNNNNNY..", ".YNYYYNY..", ".YNNNNNY..", ".YYYYYYY.."],
  ventilador: [".RRRRRR...", "RRqkRRRR..", "RRkkkRRR..", "RRRkqRRR..", ".RRRRRR...", "...qq.....", "...qq.....", "...qq.....", "..qqqq....", ".qqqqqq..."],
  archivador: ["SSSSSSSS..", "SssssssS..", "SsskkssS..", "SssssssS..", "SSSSSSSS..", "SssssssS..", "SsskkssS..", "SssssssS..", "SSSSSSSS..", "SssssssS..", "SsskkssS..", "SssssssS..", "SSSSSSSS.."],
  guitarra: ["....n.....", "....n.....", "....n.....", "....n.....", "...NNN....", "..NNNNN...", "..NNkNN...", "...NNN....", "..NNNNN...", ".NNNNNNN..", ".NNNnNNN..", "..NNNNN..."],
  regadera: ["..bbbb....", ".b....b...", "bbbbbbb..b", "bbbbbbb.b.", "bbbbbbbb..", "bbbbbbb...", ".bbbbb...."],
  "balon-pilates": ["..pppppp..", ".pppppppp.", "ppwppppppp", "pwpppppppp", "pppppppppp", "pppppppppp", ".pppppppp.", "..pppppp.."],
  mat: ["..qqqq....", ".qqwwqq...", ".qwqqwq...", ".qqwwqq...", ".qqqqqq...", ".kqqqqk...", ".qqqqqq...", ".qqqqqq...", ".kqqqqk...", ".qqqqqq...", ".qqqqqq...", "..qqqq...."],
  pesas: ["kk.kk.kk..", "kkmkkmkk..", "kk.kk.kk..", "mmmmmmmm..", "m......m..", "m......m..", "m......m.."],
} satisfies Record<string, Sprite>;

const CHAIRS: Record<ChairStyle, Sprite> = {
  ergonomica: ["..kkkkkkk..", ".kCCCCCCCk.", ".kCCCCCCCk.", "..kkkkkkk..", ".kkkkkkkkk.", "kmCCCCCCCmk", "kmCCCCCCCmk", "kmCCCCCCCmk", ".kkkkkkkkk.", "....kmk....", "..kk.k.kk.."],
  gamer: ["...kkkkk...", "..kkCkCkk..", ".kkkCkCkkk.", ".kkkCkCkkk.", ".kkkkkkkkk.", "kCkkkkkkkCk", "kCkkkkkkkCk", "kkkkkkkkkkk", ".kkkkkkkkk.", "....kmk....", "..kk.k.kk.."],
  madera: [".nnnnnnnnn.", ".n.n.n.n.n.", ".nnnnnnnnn.", "...........", ".nnnnnnnnn.", ".nCCCCCCCn.", ".nCCCCCCCn.", ".nCCCCCCCn.", ".nnnnnnnnn.", ".n.......n.", ".n.......n."],
  balon: ["...CCCCC...", ".CCCCCCCCC.", ".CwwCCCCCC.", "CCwCCCCCCCC", "CCCCCCCCCCC", "CCCCCCCCCCC", "CCCCCCCCCCC", ".CCCCCCCCC.", ".CCCCCCCCC.", "...CCCCC..."],
};

export type DeskItem = "ninguno" | keyof typeof SURFACE;
export type FloorItem = "ninguno" | keyof typeof FLOOR;

export interface DeskCustom {
  /** Decor id of the desk in the map (stable, from the generator). */
  deskId: number;
  material: DeskMaterial;
  setup: DeskSetup;
  chairStyle: ChairStyle;
  chairColor: string;
  left: DeskItem;
  right: DeskItem;
  /** Next to the chair, on the floor. */
  floor: FloorItem;
}

export const DESK_MATERIALS: { id: DeskMaterial; label: string; top: string }[] = [
  { id: "clara", label: "Madera clara", top: "#f1e6d3" },
  { id: "roble", label: "Roble", top: "#c89b6d" },
  { id: "blanco", label: "Blanco", top: "#fafafa" },
  { id: "carbon", label: "Carbón", top: "#4a4a55" },
  { id: "verde", label: "Verde salvia", top: "#b9d3c0" },
];
export const DESK_SETUPS: { id: DeskSetup; label: string }[] = [
  { id: "monitor", label: "Monitor" },
  { id: "laptop", label: "Portátil" },
  { id: "doble", label: "Doble monitor" },
  { id: "todo-en-uno", label: "Todo en uno" },
];
export const CHAIR_STYLES: { id: ChairStyle; label: string }[] = [
  { id: "ergonomica", label: "Ergonómica" },
  { id: "gamer", label: "Gamer" },
  { id: "madera", label: "Madera" },
  { id: "balon", label: "Balón" },
];

export type DeskCategory = "Plantas" | "Café y snacks" | "Papelería" | "Tecnología" | "Arte y deco" | "Fitness" | "Divertidos" | "Banderas";
export const DESK_CATEGORIES: { id: DeskCategory; icon: string }[] = [
  { id: "Plantas", icon: "🌿" },
  { id: "Café y snacks", icon: "☕" },
  { id: "Papelería", icon: "📚" },
  { id: "Tecnología", icon: "🎧" },
  { id: "Arte y deco", icon: "🖼️" },
  { id: "Fitness", icon: "🏋️" },
  { id: "Divertidos", icon: "🦆" },
  { id: "Banderas", icon: "🚩" },
];
export const DESK_ITEMS: { id: Exclude<DeskItem, "ninguno">; label: string; group: DeskCategory }[] = [
  { id: "suculenta", label: "Suculenta", group: "Plantas" },
  { id: "monstera", label: "Monstera", group: "Plantas" },
  { id: "cactus", label: "Cactus", group: "Plantas" },
  { id: "flores", label: "Flores", group: "Plantas" },
  { id: "girasol", label: "Girasol", group: "Plantas" },
  { id: "tulipanes", label: "Tulipanes", group: "Plantas" },
  { id: "pothos", label: "Pothos", group: "Plantas" },
  { id: "sansevieria", label: "Sansevieria", group: "Plantas" },
  { id: "bonsai", label: "Bonsái", group: "Plantas" },
  { id: "planta-cara", label: "Matera feliz", group: "Plantas" },
  { id: "taza", label: "Taza", group: "Café y snacks" },
  { id: "cafe-llevar", label: "Café para llevar", group: "Café y snacks" },
  { id: "tetera", label: "Tetera", group: "Café y snacks" },
  { id: "moka", label: "Moka", group: "Café y snacks" },
  { id: "limonada", label: "Limonada", group: "Café y snacks" },
  { id: "banano", label: "Banano", group: "Café y snacks" },
  { id: "sandwich", label: "Sándwich", group: "Café y snacks" },
  { id: "galletas", label: "Galletas", group: "Café y snacks" },
  { id: "libros", label: "Libros", group: "Papelería" },
  { id: "cuaderno", label: "Cuaderno", group: "Papelería" },
  { id: "portalapices", label: "Portalápices", group: "Papelería" },
  { id: "carpetas", label: "Carpetas", group: "Papelería" },
  { id: "postits", label: "Post-its", group: "Papelería" },
  { id: "calendario", label: "Calendario", group: "Papelería" },
  { id: "reloj", label: "Despertador", group: "Papelería" },
  { id: "pendientes", label: "Pendientes", group: "Papelería" },
  { id: "papeles", label: "Papeles", group: "Papelería" },
  { id: "monitor", label: "2º monitor", group: "Tecnología" },
  { id: "audifonos", label: "Audífonos", group: "Tecnología" },
  { id: "camara", label: "Cámara", group: "Tecnología" },
  { id: "tocadiscos", label: "Tocadiscos", group: "Tecnología" },
  { id: "radio", label: "Radio", group: "Tecnología" },
  { id: "parlante", label: "Parlante", group: "Tecnología" },
  { id: "calculadora", label: "Calculadora", group: "Tecnología" },
  { id: "telefono", label: "Teléfono", group: "Tecnología" },
  { id: "foto", label: "Foto", group: "Arte y deco" },
  { id: "frase", label: "Cuadro con frase", group: "Arte y deco" },
  { id: "vela", label: "Vela", group: "Arte y deco" },
  { id: "lampara", label: "Lámpara", group: "Arte y deco" },
  { id: "paleta", label: "Paleta", group: "Arte y deco" },
  { id: "acuarelas", label: "Acuarelas", group: "Arte y deco" },
  { id: "globo", label: "Globo terráqueo", group: "Arte y deco" },
  { id: "mancuernas", label: "Mancuernas", group: "Fitness" },
  { id: "kettlebell", label: "Pesa rusa", group: "Fitness" },
  { id: "botella", label: "Botella de agua", group: "Fitness" },
  { id: "smartwatch", label: "Smartwatch", group: "Fitness" },
  { id: "cuerda", label: "Lazo", group: "Fitness" },
  { id: "batido", label: "Batido", group: "Fitness" },
  { id: "proteina", label: "Barra de proteína", group: "Fitness" },
  { id: "frutas", label: "Frutas", group: "Fitness" },
  { id: "ensalada", label: "Ensalada", group: "Fitness" },
  { id: "patito", label: "Patito", group: "Divertidos" },
  { id: "gato", label: "Gato dormido", group: "Divertidos" },
  { id: "rubik", label: "Cubo Rubik", group: "Divertidos" },
  { id: "cohete", label: "Cohete", group: "Divertidos" },
  { id: "bandera-col", label: "Colombia", group: "Banderas" },
  { id: "bandera-gt", label: "Guatemala", group: "Banderas" },
  { id: "bandera-mx", label: "México", group: "Banderas" },
];

export type FloorCategory = "Plantas grandes" | "Muebles y objetos" | "Fitness";
export const FLOOR_CATEGORIES: { id: FloorCategory; icon: string }[] = [
  { id: "Plantas grandes", icon: "🪴" },
  { id: "Muebles y objetos", icon: "🪑" },
  { id: "Fitness", icon: "🧘" },
];
export const FLOOR_ITEMS: { id: Exclude<FloorItem, "ninguno">; label: string; group: FloorCategory }[] = [
  { id: "planta-grande", label: "Ficus", group: "Plantas grandes" },
  { id: "palma", label: "Palma", group: "Plantas grandes" },
  { id: "monstera-grande", label: "Monstera grande", group: "Plantas grandes" },
  { id: "lampara-pie", label: "Lámpara de pie", group: "Muebles y objetos" },
  { id: "archivador", label: "Archivador", group: "Muebles y objetos" },
  { id: "papelera", label: "Papelera", group: "Muebles y objetos" },
  { id: "mochila", label: "Mochila", group: "Muebles y objetos" },
  { id: "ventilador", label: "Ventilador", group: "Muebles y objetos" },
  { id: "guitarra", label: "Guitarra", group: "Muebles y objetos" },
  { id: "regadera", label: "Regadera", group: "Muebles y objetos" },
  { id: "balon-pilates", label: "Balón de pilates", group: "Fitness" },
  { id: "mat", label: "Mat de yoga", group: "Fitness" },
  { id: "pesas", label: "Rack de pesas", group: "Fitness" },
];

/** Chair colors: Quiiven area colors plus neutrals. */
export const CHAIR_COLORS = ["#ffae00", "#18d3b8", "#349ce2", "#ff7442", "#2c2c33", "#a9a9b2", "#e66fa6", "#7c5cc4"];

export const DESK_W = 32;
export const DESK_H = 16;
export const CHAIR_W = 11;
export const CHAIR_H = 11;
export const FLOOR_W = 12;
export const FLOOR_H = 18;
const INK = PAL.k;

export interface PixelGrid {
  w: number;
  h: number;
  px: string[];
}

export function defaultDesk(deskId: number, areaColor = "#18d3b8"): DeskCustom {
  return { deskId, material: "clara", setup: "monitor", chairStyle: "ergonomica", chairColor: areaColor, left: "suculenta", right: "taza", floor: "ninguno" };
}

function blank(w: number, h: number): PixelGrid {
  return { w, h, px: new Array<string>(w * h).fill("") };
}

/** Draws a sprite with its bottom-left cell at (x, bottom); `flipY` mirrors it. */
function stamp(g: PixelGrid, sprite: Sprite, x: number, bottom: number, custom = "#18d3b8", flipY = false) {
  const rows = flipY ? sprite.slice().reverse() : sprite;
  const top = bottom - rows.length + 1;
  rows.forEach((row, r) => {
    for (let c = 0; c < row.length; c++) {
      const ch = row[c];
      if (ch === ".") continue;
      const xx = x + c;
      const yy = top + r;
      if (xx >= 0 && yy >= 0 && xx < g.w && yy < g.h) g.px[yy * g.w + xx] = ch === "C" ? custom : (PAL[ch] ?? INK);
    }
  });
}

/** Carbón outline around the filled cells of `layer`, painted into `g`. */
function outline(g: PixelGrid, layer: PixelGrid, onlyOver?: (i: number) => boolean) {
  for (let y = 0; y < g.h; y++)
    for (let x = 0; x < g.w; x++) {
      const i = y * g.w + x;
      if (layer.px[i]) continue;
      const near =
        (x > 0 && layer.px[i - 1]) || (x < g.w - 1 && layer.px[i + 1]) || (y > 0 && layer.px[i - g.w]) || (y < g.h - 1 && layer.px[i + g.w]);
      if (near && (!onlyOver || onlyOver(i))) g.px[i] = INK;
    }
  for (let i = 0; i < g.px.length; i++) if (layer.px[i]) g.px[i] = layer.px[i];
}

/** Monitor / laptop / dual / all-in-one in the middle of the desk. */
function paintSetup(g: PixelGrid, setup: DeskSetup, facing: "down" | "up", glow: string) {
  const far = facing === "down" ? g.h - 4 : 1; // screen row band (3 tall)
  const kb = facing === "down" ? 3 : g.h - 5; // keyboard toward the chair
  const rect = (x0: number, x1: number, y0: number, y1: number, c: string) => {
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) g.px[y * g.w + x] = c;
  };
  const screenLine = facing === "down" ? far : far + 2;
  if (setup === "laptop") {
    rect(12, 19, far, far + 2, "#a9a9b2");
    rect(13, 18, screenLine, screenLine, glow);
    rect(13, 18, kb, kb + 1, "#d8d8de");
    return;
  }
  if (setup === "doble") {
    rect(8, 15, far, far + 2, INK);
    rect(9, 14, screenLine, screenLine, glow);
    rect(16, 23, far, far + 2, INK);
    rect(17, 22, screenLine, screenLine, glow);
  } else if (setup === "todo-en-uno") {
    rect(11, 20, far, far + 2, "#f4f4f6");
    rect(12, 19, screenLine, screenLine, "#349ce2");
    rect(15, 16, facing === "down" ? far - 1 : far + 3, facing === "down" ? far - 1 : far + 3, "#a9a9b2");
  } else {
    rect(12, 19, far, far + 2, INK);
    rect(13, 18, screenLine, screenLine, glow);
  }
  rect(13, 18, kb, kb + 1, "#d8d8de");
}

/**
 * Paints the claimed desk. facing "down" = chair above, screen at the bottom
 * edge (seen from the person's side); "up" = mirrored vertically.
 */
export function paintDesk(custom: DeskCustom, facing: "down" | "up", glow = "#18d3b8"): PixelGrid {
  const g = blank(DESK_W, DESK_H);
  const top = DESK_MATERIALS.find((m) => m.id === custom.material)?.top ?? "#f1e6d3";
  // Desk surface with a 1-cell Carbón border and rounded corners.
  for (let y = 0; y < g.h; y++)
    for (let x = 0; x < g.w; x++) {
      const corner = (x === 0 || x === g.w - 1) && (y === 0 || y === g.h - 1);
      if (corner) continue;
      g.px[y * g.w + x] = x === 0 || y === 0 || x === g.w - 1 || y === g.h - 1 ? INK : top;
    }
  paintSetup(g, custom.setup, facing, glow);
  // Left and right items stand on the far edge so they read from above.
  const items = blank(DESK_W, DESK_H);
  const base = facing === "down" ? g.h - 2 : 12;
  if (custom.left !== "ninguno") stamp(items, SURFACE[custom.left], 1, base);
  if (custom.right !== "ninguno") stamp(items, SURFACE[custom.right], 22, base);
  outline(g, items, (i) => g.px[i] === top);
  return g;
}

/** The chair seen from above; `facing` is where the person looks. */
export function paintChair(style: ChairStyle, color: string, facing: "down" | "up"): PixelGrid {
  const g = blank(CHAIR_W, CHAIR_H);
  // Sprites are drawn with the backrest on top (person looks down).
  stamp(g, CHAIRS[style], 0, CHAIR_H - 1, color, facing === "up");
  return g;
}

/** Floor item next to the chair (with a 1-cell outline margin). */
export function paintFloor(item: FloorItem): PixelGrid {
  const g = blank(FLOOR_W, FLOOR_H);
  if (item === "ninguno") return g;
  const layer = blank(FLOOR_W, FLOOR_H);
  stamp(layer, FLOOR[item], 1, FLOOR_H - 2);
  outline(g, layer);
  return g;
}

/** Single desk item centered in a small tile, for the picker thumbnails. */
export function paintItemThumb(item: DeskItem): PixelGrid {
  const g = blank(13, 13);
  if (item === "ninguno") return g;
  const layer = blank(13, 13);
  const sp = SURFACE[item];
  stamp(layer, sp, 2, 12 - Math.floor((11 - sp.length) / 2));
  outline(g, layer);
  return g;
}

/** Floor item thumbnail (same as the floor painter). */
export const paintFloorThumb = paintFloor;

/** Preview: desk with the chair below it and the floor item to its right. */
export function paintDeskScene(custom: DeskCustom, glow = "#18d3b8"): PixelGrid {
  const g = blank(DESK_W + 6, DESK_H + FLOOR_H - 4);
  const blit = (src: PixelGrid, ox: number, oy: number) => {
    for (let y = 0; y < src.h; y++)
      for (let x = 0; x < src.w; x++) {
        const c = src.px[y * src.w + x];
        if (c && ox + x < g.w && oy + y < g.h) g.px[(oy + y) * g.w + ox + x] = c;
      }
  };
  blit(paintDesk(custom, "up", glow), 0, 0);
  blit(paintChair(custom.chairStyle, custom.chairColor, "up"), (DESK_W - CHAIR_W) / 2 | 0, DESK_H + 1);
  blit(paintFloor(custom.floor), DESK_W - 6, g.h - FLOOR_H);
  return g;
}

const STORAGE_KEY = "quiiven.desk.v1";
const ITEM_IDS = new Set<string>(Object.keys(SURFACE));
const FLOOR_IDS = new Set<string>(Object.keys(FLOOR));
const pick = <T extends string>(v: unknown, ids: readonly T[], fallback: T): T =>
  typeof v === "string" && (ids as readonly string[]).includes(v) ? (v as T) : fallback;

export function sanitizeDesk(raw: unknown): DeskCustom | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.deskId !== "number" || !Number.isFinite(r.deskId)) return null;
  const item = (v: unknown): DeskItem => (typeof v === "string" && ITEM_IDS.has(v) ? (v as DeskItem) : "ninguno");
  return {
    deskId: r.deskId,
    material: pick(r.material, DESK_MATERIALS.map((m) => m.id), "clara"),
    setup: pick(r.setup, DESK_SETUPS.map((m) => m.id), "monitor"),
    chairStyle: pick(r.chairStyle, CHAIR_STYLES.map((m) => m.id), "ergonomica"),
    chairColor: typeof r.chairColor === "string" && /^#[0-9a-f]{6}$/i.test(r.chairColor) ? r.chairColor : CHAIR_COLORS[1],
    left: item(r.left),
    right: item(r.right),
    floor: typeof r.floor === "string" && FLOOR_IDS.has(r.floor) ? (r.floor as FloorItem) : "ninguno",
  };
}

export function loadDesk(): DeskCustom | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? sanitizeDesk(JSON.parse(raw)) : null;
  } catch {
    return null;
  }
}

export function saveDesk(desk: DeskCustom | null): void {
  try {
    if (desk) localStorage.setItem(STORAGE_KEY, JSON.stringify(desk));
    else localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* storage unavailable */
  }
}
