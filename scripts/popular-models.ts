/** A single reusable batch manifest, rather than per-track preparation files. */
export const popularModels = [
  { trackId: "it-monza", layoutId: "grand-prix" },
  { trackId: "it-mugello", layoutId: "grand-prix" },
  { trackId: "de-nurburgring", layoutId: "grand-prix" },
  { trackId: "de-hockenheimring", layoutId: "grand-prix" },
  {
    trackId: "gb-silverstone-circuit-3571477",
    layoutId: "silverstone-gp-wing-sf",
  },
  { trackId: "gb-brands-hatch-circuit-4906929", layoutId: "brands-hatch-gp" },
  { trackId: "gb-donington-park-27131003", layoutId: "donington-gp" },
  {
    trackId: "gb-oulton-park-circuit-21831735",
    layoutId: "oulton-park-international",
  },
  { trackId: "fr-magny-cours", layoutId: "grand-prix" },
  { trackId: "fr-paul-ricard", layoutId: "main" },
  { trackId: "nl-zandvoort", layoutId: "grand-prix" },
  { trackId: "hu-hungaroring-231328650", layoutId: "main" },
  { trackId: "pt-algarve-international-circuit-39218663", layoutId: "main" },
  { trackId: "pt-autodromo-do-estoril-38160756", layoutId: "estoril" },
  { trackId: "us-cota-circuit", layoutId: "main" },
  { trackId: "us-weathertech-raceway-laguna-seca-10464852", layoutId: "main" },
  { trackId: "us-road-america-110527567", layoutId: "road-america" },
  {
    trackId: "us-watkins-glen-international-20163576",
    layoutId: "watkins-glen",
  },
  {
    trackId: "us-sebring-international-raceway-426154257",
    layoutId: "sebring",
  },
  { trackId: "br-interlagos-6c69e04f", layoutId: "interlagos" },
] as const;
