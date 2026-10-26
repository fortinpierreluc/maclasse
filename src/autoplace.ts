import { CLOSE_DISTANCE, seatWorld, seatLocals } from './geometry';
import type { Classroom, Placement, Student } from './types';

/** Une correction à faire avant de pouvoir placer les élèves. */
export type PlacementIssue = {
  title: string;
  detail: string;
  pairs?: [Student, Student][];
};

export type AutoPlaceResult =
  | { ok: true; placements: Placement[]; friendsClose: number; friendsTotal: number }
  | { ok: false; issues: PlacementIssue[] };

type Seat = { furnitureId: string; seatIndex: number; x: number; y: number };

const AVOID_COST = 1000;
const FRIEND_GAIN = 10;

/** Même règle que pairLinks : même meuble, ou à CLOSE_DISTANCE ou moins. */
function seatsClose(a: Seat, b: Seat): boolean {
  return a.furnitureId === b.furnitureId || Math.hypot(a.x - b.x, a.y - b.y) <= CLOSE_DISTANCE;
}

function collectSeats(classroom: Classroom): Seat[] {
  const seats: Seat[] = [];
  for (const item of classroom.furniture) {
    const count = seatLocals(item.kind).length;
    for (let index = 0; index < count; index += 1) {
      const pos = seatWorld(item, index);
      if (pos) seats.push({ furnitureId: item.id, seatIndex: index, ...pos });
    }
  }
  return seats;
}

function plural(n: number, one: string, many: string): string {
  return `${n} ${n > 1 ? many : one}`;
}

/** Petite source aléatoire reproductible, pour qu’un même plan donne le même résultat. */
function makeRandom(seed: number): () => number {
  let state = seed >>> 0 || 1;
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return (state >>> 0) / 4294967296;
  };
}

/**
 * Place tous les élèves : aucun « pas ensemble » à proximité, et le plus d’amis côte à côte possible.
 * Si c’est impossible, renvoie les corrections à faire au lieu d’un plan.
 */
export function autoPlace(classroom: Classroom): AutoPlaceResult {
  const students = classroom.students;
  const seats = collectSeats(classroom);
  const n = students.length;
  const m = seats.length;

  if (n === 0) {
    return { ok: false, issues: [{ title: 'Aucun élève dans la liste', detail: 'Ajoutez les élèves avant de lancer le placement.' }] };
  }
  if (m < n) {
    const missing = n - m;
    return {
      ok: false,
      issues: [
        {
          title: `Il manque ${plural(missing, 'place', 'places')}`,
          detail: `La classe compte ${plural(n, 'élève', 'élèves')} pour ${plural(m, 'place', 'places')}. Ajoutez des pupitres ou des tables, ou retirez des élèves de la liste.`,
        },
      ],
    };
  }

  // Relations entre élèves : 1 = amis, -1 = pas ensemble.
  const index = new Map(students.map((student, i) => [student.id, i]));
  const rel: Int8Array[] = students.map(() => new Int8Array(n));
  students.forEach((student, i) => {
    for (const id of student.friendIds) {
      const j = index.get(id);
      if (j !== undefined && j !== i && rel[i][j] === 0) {
        rel[i][j] = 1;
        rel[j][i] = 1;
      }
    }
  });
  students.forEach((student, i) => {
    for (const id of student.avoidIds) {
      const j = index.get(id);
      if (j !== undefined && j !== i) {
        rel[i][j] = -1;
        rel[j][i] = -1;
      }
    }
  });
  const pairCost = (i: number, j: number) => (rel[i][j] === -1 ? AVOID_COST : rel[i][j] === 1 ? -FRIEND_GAIN : 0);

  // Places proches les unes des autres.
  const near: number[][] = seats.map(() => []);
  for (let a = 0; a < m; a += 1) {
    for (let b = a + 1; b < m; b += 1) {
      if (seatsClose(seats[a], seats[b])) {
        near[a].push(b);
        near[b].push(a);
      }
    }
  }

  // Quand il y a plus de places que d’élèves, on remplit d’abord l’avant de la classe.
  const board = classroom.furniture.find((item) => item.kind === 'tableau');
  const front = new Float64Array(m);
  if (board && m > n) {
    const dists = seats.map((seat) => Math.hypot(seat.x - board.x, seat.y - board.y));
    const max = Math.max(...dists) || 1;
    dists.forEach((d, s) => (front[s] = (d / max) * 2));
  }

  const occ = new Int32Array(m);
  const seatOf = new Int32Array(n);

  // Coût d’un élève i sur la place s, sans compter l’élève « ignore ».
  const localCost = (i: number, s: number, ignore: number) => {
    let cost = front[s];
    for (const t of near[s]) {
      const o = occ[t];
      if (o < 0 || o === i || o === ignore) continue;
      cost += pairCost(i, o);
    }
    return cost;
  };

  const totalCost = () => {
    let cost = 0;
    for (let i = 0; i < n; i += 1) cost += localCost(i, seatOf[i], -1);
    // Chaque paire a été comptée deux fois, les places une seule.
    let fronts = 0;
    for (let i = 0; i < n; i += 1) fronts += front[seatOf[i]];
    return (cost - fronts) / 2 + fronts;
  };

  let best: Int32Array | null = null;
  let bestCost = Infinity;
  const steps = Math.min(400_000, Math.max(60_000, n * m * 60));
  const rounds = 5;
  const seedBase = Array.from(classroom.code || 'nid').reduce((acc, ch) => acc * 31 + ch.charCodeAt(0), 7);

  for (let round = 0; round < rounds; round += 1) {
    const random = makeRandom(seedBase + round * 7919);
    // Départ aléatoire.
    const order = Array.from({ length: m }, (_, s) => s);
    for (let k = m - 1; k > 0; k -= 1) {
      const r = Math.floor(random() * (k + 1));
      [order[k], order[r]] = [order[r], order[k]];
    }
    occ.fill(-1);
    for (let i = 0; i < n; i += 1) {
      seatOf[i] = order[i];
      occ[order[i]] = i;
    }

    let cost = totalCost();
    if (cost < bestCost) {
      bestCost = cost;
      best = Int32Array.from(seatOf);
    }

    const hot = 400;
    const cold = 0.3;
    for (let step = 0; step < steps; step += 1) {
      const temperature = hot * Math.pow(cold / hot, step / steps);
      const i = Math.floor(random() * n);
      const target = Math.floor(random() * m);
      const from = seatOf[i];
      if (target === from) continue;
      const j = occ[target];

      let delta: number;
      if (j < 0) {
        delta = localCost(i, target, -1) - localCost(i, from, -1);
      } else {
        const before = localCost(i, from, j) + localCost(j, target, i);
        const after = localCost(i, target, j) + localCost(j, from, i);
        delta = after - before;
      }

      if (delta <= 0 || random() < Math.exp(-delta / temperature)) {
        occ[from] = j;
        occ[target] = i;
        seatOf[i] = target;
        if (j >= 0) seatOf[j] = from;
        cost += delta;
        if (cost < bestCost - 1e-9) {
          bestCost = cost;
          best = Int32Array.from(seatOf);
        }
      }
    }
  }

  const final = best ?? seatOf;

  // Bilan du meilleur plan trouvé.
  const conflicts: [Student, Student][] = [];
  let friendsClose = 0;
  let friendsTotal = 0;
  for (let i = 0; i < n; i += 1) {
    for (let j = i + 1; j < n; j += 1) {
      if (rel[i][j] === 0) continue;
      const close = seatsClose(seats[final[i]], seats[final[j]]);
      if (rel[i][j] === 1) {
        friendsTotal += 1;
        if (close) friendsClose += 1;
      } else if (close) {
        conflicts.push([students[i], students[j]]);
      }
    }
  }

  if (conflicts.length > 0) {
    const issues: PlacementIssue[] = [
      {
        title: conflicts.length === 1 ? 'Un conflit ne peut pas être évité' : `${conflicts.length} conflits ne peuvent pas être évités`,
        detail:
          'Avec la disposition actuelle, ces élèves se retrouvent forcément proches l’un de l’autre. Retirez la relation « Pas ensemble » dans leur fiche, ou changez la disposition.',
        pairs: conflicts,
      },
    ];

    // Combien d’élèves a-t-on en conflit, et combien de places « isolées » existent ?
    const shared = classroom.furniture.filter((item) => seatLocals(item.kind).length > 1).length;
    issues.push({
      title: 'Les places sont trop rapprochées',
      detail:
        shared > 0
          ? 'Deux élèves assis à la même table sont toujours considérés proches. Remplacez quelques tables par des pupitres individuels, ou espacez les meubles, pour créer des places à l’écart.'
          : 'Espacez certains pupitres, ou ajoutez-en quelques-uns à l’écart, pour pouvoir éloigner les élèves qui ne doivent pas être ensemble.',
    });

    const avoidCounts = students
      .map((student, i) => ({ student, count: rel[i].reduce((acc, r) => acc + (r === -1 ? 1 : 0), 0) }))
      .filter((item) => item.count >= 4)
      .sort((a, b) => b.count - a.count)
      .slice(0, 3);
    if (avoidCounts.length > 0) {
      issues.push({
        title: 'Certains élèves ont beaucoup de contraintes',
        detail: `${avoidCounts
          .map((item) => `${item.student.firstName} (${item.count})`)
          .join(', ')} ${avoidCounts.length > 1 ? 'ont' : 'a'} plusieurs relations « Pas ensemble ». Vérifiez qu’elles sont toutes nécessaires.`,
      });
    }

    return { ok: false, issues };
  }

  const placements: Placement[] = students.map((student, i) => ({
    studentId: student.id,
    furnitureId: seats[final[i]].furnitureId,
    seatIndex: seats[final[i]].seatIndex,
  }));
  return { ok: true, placements, friendsClose, friendsTotal };
}
