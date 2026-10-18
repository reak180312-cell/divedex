// Taxa that many divers treat as highlight encounters. This is a *suggestion* only: when such a species is
// added to a dive, its "special encounter" star starts switched on, and the diver can switch it off.
// It says nothing about how rare the animal is.
const FAMILIES = new Set([
  'Mobulidae', 'Rhincodontidae', 'Cheloniidae', 'Dermochelyidae', 'Delphinidae', 'Phocoenidae', 'Balaenopteridae',
  'Physeteridae', 'Ziphiidae', 'Balaenidae', 'Dugongidae', 'Trichechidae', 'Molidae', 'Sphyrnidae', 'Alopiidae',
  'Otariidae', 'Phocidae',
]);
const GENERA = new Set(['Hippocampus', 'Phyllopteryx', 'Phycodurus']);
const SPECIES = new Set(['Cheilinus undulatus']);
const ORDERS = new Set(['Lamniformes', 'Carcharhiniformes', 'Orectolobiformes']); // sharks seen by divers

/** @param {object|null|undefined} record WoRMS record */
export function isHighlightTaxon(record) {
  if (!record) return false;
  return FAMILIES.has(record.family) || GENERA.has(record.genus) || ORDERS.has(record.order) || SPECIES.has(record.valid_name || record.scientificname);
}
