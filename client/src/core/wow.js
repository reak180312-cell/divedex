// "Rarity score" as most divers would rate it: how special / sought-after an encounter feels (1–10).
// This is an editorial DiveDex rating of popular perception, NOT a measure of biological rarity
// (mantas and whale sharks get 10 even where they are seen often). Edit the table freely.
//
// The most specific match wins: species > genus > family > order > class > broad group default.

const SPECIES = {
  'Rhincodon typus': 10, 'Mobula birostris': 10, 'Mobula alfredi': 10, 'Carcharodon carcharias': 10, 'Dermochelys coriacea': 10,
  'Megaptera novaeangliae': 10, 'Orcinus orca': 10, 'Dugong dugon': 10, 'Mola mola': 10, 'Mola alexandrini': 10,
  'Galeocerdo cuvier': 9, 'Carcharhinus longimanus': 9, 'Hapalochlaena lunulata': 9, 'Hapalochlaena maculosa': 9,
  'Thaumoctopus mimicus': 9, 'Wunderpus photogenicus': 9, 'Synchiropus splendidus': 8, 'Cheilinus undulatus': 8,
  'Hexabranchus sanguineus': 8, 'Rhinopias frondosa': 9, 'Rhinopias eschmeyeri': 9, 'Pterois miles': 6, 'Pterois volitans': 6,
  'Synanceia verrucosa': 7, 'Taeniura lymma': 6, 'Acanthaster planci': 5, 'Tridacna gigas': 6,
  'Amphiprion ocellaris': 5, 'Amphiprion percula': 5, 'Amphiprion bicinctus': 5, 'Paracanthurus hepatus': 5,
  'Zanclus cornutus': 4, 'Pygoplites diacanthus': 5, 'Sphyraena barracuda': 6, 'Triaenodon obesus': 7, 'Stegostoma tigrinum': 8,
};
const GENERA = {
  Mobula: 9, Manta: 10, Sphyrna: 9, Alopias: 9, Eusphyra: 9, Rhincodon: 10, Carcharodon: 10, Galeocerdo: 9,
  Hippocampus: 8, Phyllopteryx: 10, Phycodurus: 10, Hapalochlaena: 9, Rhinopias: 9, Aetobatus: 8, Aetomylaeus: 8,
  Eretmochelys: 8, Chelonia: 8, Caretta: 8, Lepidochelys: 8, Natator: 8, Laticauda: 8, Hydrophis: 8, Aipysurus: 8,
  Tursiops: 9, Stenella: 9, Delphinus: 9, Sousa: 9, Octopus: 7, Sepia: 7, Metasepia: 8, Nautilus: 9,
  Antennarius: 8, Antennatus: 8, Histrio: 7, Synchiropus: 8, Pseudanthias: 2, Chromis: 1, Dascyllus: 2, Abudefduf: 1,
  Amphiprion: 5, Premnas: 5, Pterois: 6, Dendrochirus: 6, Tridacna: 5, Hexabranchus: 8, Gymnothorax: 5, Muraena: 5,
  Rhinomuraena: 7, Heteroconger: 4, Gorgasia: 4, Echeneis: 3, Remora: 3, Thunnus: 6, Caranx: 4, Epinephelus: 4,
  Plectropomus: 4, Bolbometopon: 7, Diodon: 4, Arothron: 4, Ostracion: 4, Lactoria: 5, Rhinecanthus: 3, Balistoides: 4,
  Pseudobalistes: 4, Odonus: 3, Scarus: 3, Chlorurus: 3, Hipposcarus: 3, Cetoscarus: 4, Calotomus: 3, Taeniura: 6, Neotrygon: 6, Pastinachus: 6, Urogymnus: 7, Himantura: 6,
};
const FAMILIES = {
  Mobulidae: 10, Rhincodontidae: 10, Balaenopteridae: 10, Balaenidae: 10, Physeteridae: 10, Monodontidae: 10, Eschrichtiidae: 10,
  Dugongidae: 10, Trichechidae: 10, Molidae: 10, Dermochelyidae: 10, Lamnidae: 9, Sphyrnidae: 9, Alopiidae: 9,
  Delphinidae: 9, Phocoenidae: 8, Ziphiidae: 9, Otariidae: 9, Phocidae: 9, Odobenidae: 10, Spheniscidae: 9,
  Cheloniidae: 8, Elapidae: 8, Crocodylidae: 10, Myliobatidae: 8, Aetobatidae: 8, Rhinopteridae: 7, Rhinidae: 9, Rhinobatidae: 6,
  Carcharhinidae: 7, Ginglymostomatidae: 7, Stegostomatidae: 8, Orectolobidae: 8, Hemiscylliidae: 6, Triakidae: 6, Odontaspididae: 8,
  Torpedinidae: 6, Dasyatidae: 6, Urolophidae: 5, Syngnathidae: 6, Antennariidae: 8, Callionymidae: 6, Scorpaenidae: 6,
  Synanceiidae: 7, Ophichthidae: 4, Muraenidae: 5, Labridae: 2, Scaridae: 3, Pomacentridae: 2, Serranidae: 3, Lutjanidae: 3,
  Haemulidae: 2, Epinephelidae: 4, Anthiadidae: 2, Chaetodontidae: 3, Pomacanthidae: 4, Acanthuridae: 3, Zanclidae: 4, Balistidae: 3, Monacanthidae: 3,
  Tetraodontidae: 4, Diodontidae: 4, Ostraciidae: 4, Carangidae: 4, Scombridae: 5, Sphyraenidae: 5, Ephippidae: 5,
  Gobiidae: 2, Blenniidae: 2, Apogonidae: 2, Holocentridae: 2, Mullidae: 2, Siganidae: 2, Echeneidae: 3, Fistulariidae: 3,
  Aulostomidae: 3, Pempheridae: 2, Caesionidae: 2, Kyphosidae: 2, Plotosidae: 4, Pegasidae: 7, Solenostomidae: 8,
  Octopodidae: 7, Sepiidae: 7, Loliginidae: 6, Nautilidae: 9, Tridacnidae: 5, Cypraeidae: 4, Chromodorididae: 5,
  Hexabranchidae: 8, Phyllidiidae: 4, Facelinidae: 5, Glaucidae: 8, Palinuridae: 5, Scyllaridae: 5, Nephropidae: 5,
  Stenopodidae: 4, Palaemonidae: 4, Alpheidae: 3, Hippolytidae: 4, Odontodactylidae: 7, Squillidae: 6, Majidae: 3,
  Portunidae: 3, Diogenidae: 2, Cassiopeidae: 4, Pelagiidae: 4, Rhizostomatidae: 5,
};
const ORDERS = {
  Lamniformes: 9, Carcharhiniformes: 7, Orectolobiformes: 7, Squaliformes: 7, Hexanchiformes: 8, Myliobatiformes: 6,
  Rhinopristiformes: 7, Torpediniformes: 6, Testudines: 8, Sirenia: 10, Nudibranchia: 6, Octopoda: 7, Sepiida: 7,
  Teuthida: 6, Myopsida: 6, Oegopsida: 6, Decapoda: 3, Stomatopoda: 6, Syngnathiformes: 5, Lophiiformes: 6,
  Actiniaria: 2, Scleractinia: 1, Alcyonacea: 1, Malacalcyonacea: 1, Scleralcyonacea: 1, Antipatharia: 2, Semaeostomeae: 4,
  Rhizostomeae: 4, Valvatida: 2, Forcipulatida: 2, Diadematoida: 1, Camarodonta: 1, Holothuriida: 2, Synallactida: 2,
  Comatulida: 2, Ophiurida: 2,
};
const CLASSES = {
  Mammalia: 9, Reptilia: 8, Aves: 7, Elasmobranchii: 7, Holocephali: 8, Cephalopoda: 7, Cubozoa: 6, Scyphozoa: 4,
  Hydrozoa: 2, Anthozoa: 1, Ascidiacea: 2, Echinoidea: 1, Asteroidea: 2, Holothuroidea: 2, Ophiuroidea: 2, Crinoidea: 2,
  Polychaeta: 2, Demospongiae: 1, Calcarea: 1, Hexactinellida: 2, Gastropoda: 3, Bivalvia: 2, Polyplacophora: 2,
  Malacostraca: 3, Thecostraca: 1,
};
const GROUP_DEFAULT = {
  fish: 3, 'sharks-rays': 7, mammals: 9, reptiles: 8, birds: 7, cephalopods: 7, 'sea-slugs': 6, molluscs: 3,
  crustaceans: 3, echinoderms: 2, 'corals-anemones': 1, 'jellies-hydroids': 3, sponges: 1, worms: 2, tunicates: 2,
  'algae-plants': 1, other: 2,
};

/**
 * @param {object|null|undefined} record WoRMS record (scientificname, genus, family, order, class)
 * @param {string|null|undefined} group DiveDex group key (from WoRMS taxonomy)
 * @returns {{ score: number, basis: string } | null}
 */
export function rarityScoreFor(record, group) {
  if (!record) return null;
  const name = record.valid_name || record.scientificname;
  const tries = [
    [SPECIES[name], name],
    [GENERA[record.genus] ?? GENERA[name], `genus ${record.genus || name}`],
    [FAMILIES[record.family] ?? FAMILIES[name], `family ${record.family || name}`],
    [ORDERS[record.order] ?? ORDERS[name], `order ${record.order || name}`],
    [CLASSES[record.class] ?? CLASSES[name], `class ${record.class || name}`],
    [GROUP_DEFAULT[group], 'its animal group'],
  ];
  for (const [score, basis] of tries) if (score != null) return { score, basis };
  return null;
}
