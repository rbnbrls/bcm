export const WORKFLOW_BUSINESS_TERMS = Object.freeze({
  node: "processtap",
  edge: "verbinding",
  blockType: "soort stap",
  canvas: "proceskaart",
  properties: "instellingen",
  graph: "proces",
  ist: "huidige waarde",
  soll: "nieuwe waarde",
} as const);

export const WORKFLOW_GLOSSARY = Object.freeze([
  { term: "Rol", explanation: "De functie die een stap uitvoert of goedkeurt." },
  { term: "Scope", explanation: "Het deel van de organisatie of catalogus waarop de workflow van toepassing is." },
  { term: "Goedkeuring", explanation: "Een controlepunt waarin een aangewezen rol de aanvraag goedkeurt, afwijst of terugstuurt." },
  { term: "Actie", explanation: "De wijziging die na goedkeuring wordt klaargezet of uitgevoerd." },
  { term: "Concept", explanation: "Een opgeslagen versie die nog niet ter beoordeling is aangeboden." },
  { term: "Ter review", explanation: "De workflow is klaar voor beoordeling door een bevoegde reviewer." },
  { term: "Publiceren", explanation: "De goedgekeurde versie beschikbaar maken voor gebruik." },
  { term: "Impact", explanation: "De catalogi, rollen en processen die door de wijziging worden geraakt." },
] as const);

export function businessLabel(value: string): string {
  return WORKFLOW_BUSINESS_TERMS[value as keyof typeof WORKFLOW_BUSINESS_TERMS] ?? value;
}
