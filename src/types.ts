export type Gender = 'fille' | 'gars' | 'na';

export type FurnitureKind = 'pupitre' | 'table2' | 'table4' | 'table6' | 'bureau' | 'porte' | 'tableau';

export type Tool = 'select' | FurnitureKind | 'row';

export type Student = {
  id: string;
  number: string;
  lastName: string;
  firstName: string;
  gender: Gender;
  grade: string;
  friendIds: string[];
  avoidIds: string[];
};

export type Furniture = {
  id: string;
  kind: FurnitureKind;
  x: number;
  y: number;
  rotation: number;
  /** Pupitres posés ensemble : ils se déplacent d’un bloc. */
  groupId?: string;
};

export type Placement = {
  studentId: string;
  furnitureId: string;
  seatIndex: number;
};

export type Classroom = {
  code: string;
  name: string;
  students: Student[];
  furniture: Furniture[];
  placements: Placement[];
  updatedAt: string;
};

export type ClassSummary = {
  code: string;
  name: string;
  updatedAt: string;
};

export const ROOM_W = 1760;
export const ROOM_H = 1120;

export const GRADES = [
  'Préscolaire',
  '1re année',
  '2e année',
  '3e année',
  '4e année',
  '5e année',
  '6e année',
  'Secondaire 1',
  'Secondaire 2',
  'Secondaire 3',
  'Secondaire 4',
  'Secondaire 5',
];

export const GENDER_LABEL: Record<Gender, string> = {
  fille: 'Fille',
  gars: 'Gars',
  na: 'N/A',
};

export const FURNITURE_LABEL: Record<FurnitureKind, string> = {
  pupitre: 'Pupitre',
  table2: 'Table de 2',
  table4: 'Table de 4',
  table6: 'Table de 6',
  bureau: 'Bureau',
  porte: 'Porte',
  tableau: 'Tableau',
};
