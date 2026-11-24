// Suggestions only: every field also accepts anything you type.
// The lists are shared with the desktop side (electron/vocab.json), which uses them to read Mattel titles.
import vocab from '../electron/vocab.json';

export const CHARACTERS = vocab.characters;
export const LINES = vocab.lines;

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
