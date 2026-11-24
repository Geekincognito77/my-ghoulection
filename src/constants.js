// Suggestions only: every field also accepts anything you type.

export const CHARACTERS = [
  'Abbey Bominable', 'Catty Noir', 'Clawd Wolf', 'Clawdeen Wolf', 'Clawdia Wolf', 'Cleo de Nile',
  'Deuce Gorgon', 'Draculaura', 'Elissabat', 'Frankie Stein', 'Ghoulia Yelps', 'Gigi Grant',
  'Gil Webber', 'Heath Burns', 'Holt Hyde', 'Honey Swamp', 'Howleen Wolf', 'Invisi Billy',
  'Iris Clops', 'Jackson Jekyll', 'Jinafire Long', 'Lagoona Blue', 'Manny Taur', 'Moanica D’Kay',
  'Nefera de Nile', 'Neighthan Rot', 'Operetta', 'Robecca Steam', 'Rochelle Goyle', 'Scarah Screams',
  'Skelita Calaveras', 'Spectra Vondergeist', 'Toralei Stripe', 'Twyla', 'Venus McFlytrap',
  'Viperine Gorgon', 'Wydowna Spider',
];

export const LINES = [
  'Basic (First Wave)', 'School’s Out', 'Dead Tired', 'Dawn of the Dance', 'Gloom Beach',
  'Sweet 1600', 'Ghouls Rule', 'Scaris: City of Frights', '13 Wishes', 'Freaky Fusion',
  'Frights, Camera, Action!', 'Boo York, Boo York', 'Welcome to Monster High', 'Haunt Couture',
  'Skulltimate Secrets', 'Creepover Party', 'Monster Ball', 'Day Out', 'Fang Vote', 'Reproduction',
  'Mattel Creations Exclusive', 'SDCC Exclusive',
];

export const GENERATIONS = ['G1', 'G2', 'G3', 'Collector', 'Other'];

export const CONDITIONS = [
  { value: 'NRFB', label: 'NRFB – never removed from box' },
  { value: 'NIB', label: 'NIB – in box, opened' },
  { value: 'Loose complete', label: 'Loose – complete' },
  { value: 'Loose incomplete', label: 'Loose – incomplete' },
  { value: 'Needs TLC', label: 'Needs TLC' },
];

export const EXTRAS = ['Pet', 'Diary', 'Doll stand', 'Hairbrush', 'Shoes', 'Bag / purse', 'Accessories', 'Box / packaging'];

export const PRIORITIES = ['High', 'Medium', 'Low'];

const money = new Intl.NumberFormat(undefined, { style: 'currency', currency: 'USD' });
export const fmtMoney = (n) => (n === null || n === undefined || n === '' || Number.isNaN(+n) ? '—' : money.format(+n));

export const displayName = (d) => d.character || d.dollName || 'Mystery Ghoul';
