/**
 * The 11 default themes from the FTA benchmarking framework.
 * These are seeded into every new project. Projects can edit, remove, or add themes freely.
 */
export const DEFAULT_THEMES: Array<{
  name: string;
  description: string;
  color: string;
}> = [
  {
    name: 'Navigation',
    description: 'How users orient themselves and move through the site. Labels, menu structure, utilities, visual hierarchy in dropdowns.',
    color: '#3b82f6',
  },
  {
    name: 'Structure',
    description: 'Overall information architecture. Page templates, content grouping, depth, hierarchy, wayfinding patterns like breadcrumbs.',
    color: '#8b5cf6',
  },
  {
    name: 'Search',
    description: 'Site search behaviour, suggestions, results presentation, filters, and empty-state handling.',
    color: '#06b6d4',
  },
  {
    name: 'Services',
    description: 'How services are named, grouped, and presented. Service catalogue patterns, entry points, and completion flows.',
    color: '#10b981',
  },
  {
    name: 'Clarity',
    description: 'Clarity of writing, visual noise, signal-to-content ratio, layout whitespace, focus of page purpose.',
    color: '#f59e0b',
  },
  {
    name: 'Connect',
    description: 'Ways users can reach the organisation — contact, support, feedback channels, response expectations.',
    color: '#ef4444',
  },
  {
    name: 'Tools & Calculators',
    description: 'Embedded interactive tools — calculators, wizards, self-service utilities. Usability of inputs, step design, output clarity.',
    color: '#ec4899',
  },
  {
    name: 'Language',
    description: 'Tone, plain-language principles, translation quality, multilingual UX (esp. English/Arabic parity).',
    color: '#84cc16',
  },
  {
    name: 'Persona experiences',
    description: 'Role-based or audience-specific journeys (e.g., individual vs. business vs. agent). How well personalised each path feels.',
    color: '#f97316',
  },
  {
    name: 'AI',
    description: 'AI-driven features — chatbots, smart search, content recommendations, generated summaries. Trust, accuracy, user control.',
    color: '#6366f1',
  },
  {
    name: 'Other unique learnings',
    description: 'Catch-all for distinctive patterns that do not fit the standard themes but are worth capturing.',
    color: '#64748b',
  },
];
