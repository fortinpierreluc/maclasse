import type { Classroom, Furniture, Gender, Student } from './types';
import { ROOM_H, ROOM_W } from './types';

type Seed = { firstName: string; lastName: string; gender: Gender };

const GIRLS: Seed[] = [
  { firstName: 'Léa', lastName: 'Tremblay', gender: 'fille' },
  { firstName: 'Florence', lastName: 'Gagnon', gender: 'fille' },
  { firstName: 'Alice', lastName: 'Côté', gender: 'fille' },
  { firstName: 'Zoé', lastName: 'Bergeron', gender: 'fille' },
  { firstName: 'Chloé', lastName: 'Roy', gender: 'fille' },
  { firstName: 'Emma', lastName: 'Morin', gender: 'fille' },
  { firstName: 'Rosalie', lastName: 'Lavoie', gender: 'fille' },
  { firstName: 'Juliette', lastName: 'Bouchard', gender: 'fille' },
  { firstName: 'Maélie', lastName: 'Gauthier', gender: 'fille' },
  { firstName: 'Océane', lastName: 'Pelletier', gender: 'fille' },
  { firstName: 'Sarah', lastName: 'Fortin', gender: 'fille' },
  { firstName: 'Laurianne', lastName: 'Bélanger', gender: 'fille' },
];

const BOYS: Seed[] = [
  { firstName: 'Noah', lastName: 'Gagné', gender: 'gars' },
  { firstName: 'Émile', lastName: 'Caron', gender: 'gars' },
  { firstName: 'Louis', lastName: 'Thibault', gender: 'gars' },
  { firstName: 'Thomas', lastName: 'Leblanc', gender: 'gars' },
  { firstName: 'William', lastName: 'Nadeau', gender: 'gars' },
  { firstName: 'Antoine', lastName: 'Simard', gender: 'gars' },
  { firstName: 'Raphaël', lastName: 'Ouellet', gender: 'gars' },
  { firstName: 'Félix', lastName: 'Boucher', gender: 'gars' },
  { firstName: 'Nathan', lastName: 'Girard', gender: 'gars' },
  { firstName: 'Léo', lastName: 'Paquette', gender: 'gars' },
  { firstName: 'Hugo', lastName: 'Desjardins', gender: 'gars' },
  { firstName: 'Samuel', lastName: 'Perron', gender: 'gars' },
];

function student(seed: Seed, index: number): Student {
  return {
    id: `s${index + 1}`,
    number: String(index + 1),
    firstName: seed.firstName,
    lastName: seed.lastName,
    gender: seed.gender,
    grade: '4e année',
    friendIds: [],
    avoidIds: [],
  };
}

function relate(students: Student[], a: string, b: string, kind: 'friend' | 'avoid') {
  const left = students.find((item) => item.firstName === a);
  const right = students.find((item) => item.firstName === b);
  if (!left || !right) return;
  const key = kind === 'friend' ? 'friendIds' : 'avoidIds';
  if (!left[key].includes(right.id)) left[key].push(right.id);
  if (!right[key].includes(left.id)) right[key].push(left.id);
}

function buildStudents(): Student[] {
  const students = [...GIRLS, ...BOYS].map(student);
  relate(students, 'Léa', 'Florence', 'friend');
  relate(students, 'Alice', 'Zoé', 'friend');
  relate(students, 'Emma', 'Rosalie', 'friend');
  relate(students, 'Juliette', 'Océane', 'friend');
  relate(students, 'Noah', 'Émile', 'friend');
  relate(students, 'Louis', 'Thomas', 'friend');
  relate(students, 'Raphaël', 'Félix', 'friend');
  relate(students, 'Chloé', 'Emma', 'friend');
  relate(students, 'Antoine', 'Samuel', 'friend');
  relate(students, 'Chloé', 'William', 'avoid');
  relate(students, 'Maélie', 'Hugo', 'avoid');
  relate(students, 'Juliette', 'Nathan', 'avoid');
  relate(students, 'Laurianne', 'Samuel', 'avoid');
  return students;
}

const SEATING = [
  'Léa', 'Florence', 'Alice', 'Zoé', 'Chloé', 'William',
  'Emma', 'Rosalie', 'Juliette', 'Océane', 'Noah', 'Émile',
  'Louis', 'Thomas', 'Antoine', 'Raphaël', 'Félix', 'Léo',
  'Maélie', 'Hugo', 'Laurianne', 'Sarah', 'Nathan', 'Samuel',
];

function buildRoom(students: Student[]): { furniture: Furniture[]; placements: Classroom['placements'] } {
  const columns = 6;
  const originX = 420;
  const originY = 340;
  const gapX = 130;
  const gapY = 172;
  const furniture: Furniture[] = [
    { id: 'tableau', kind: 'tableau', x: ROOM_W / 2, y: 64, rotation: 0 },
    { id: 'porte', kind: 'porte', x: 28, y: ROOM_H / 2, rotation: 0 },
    { id: 'bureau', kind: 'bureau', x: 200, y: 180, rotation: 180 },
  ];
  const placements: Classroom['placements'] = [];
  SEATING.forEach((firstName, index) => {
    const column = index % columns;
    const row = Math.floor(index / columns);
    const id = `p${row + 1}-${column + 1}`;
    furniture.push({
      id,
      kind: 'pupitre',
      x: originX + column * gapX,
      y: originY + row * gapY,
      rotation: 0,
      groupId: `rangee-${row + 1}`,
    });
    const pupil = students.find((item) => item.firstName === firstName);
    if (pupil) placements.push({ studentId: pupil.id, furnitureId: id, seatIndex: 0 });
  });
  return { furniture, placements };
}

export function exampleClassroom(): Pick<Classroom, 'name' | 'students' | 'furniture' | 'placements'> {
  const students = buildStudents();
  const room = buildRoom(students);
  return {
    name: '4e année — exemple',
    students,
    furniture: room.furniture,
    placements: room.placements,
  };
}
