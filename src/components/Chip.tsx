import type { Gender, Student } from '../types';
import { GENDER_LABEL } from '../types';
import { shortGrade } from '../geometry';

export const GENDER_TINT: Record<Gender, string> = {
  fille: '#f3a8c0',
  gars: '#9ec4f2',
  na: '#9ed09a',
};

export function Chip({
  student,
  conflict = false,
  friend = false,
  source = false,
  showGrade = false,
}: {
  student: Student;
  conflict?: boolean;
  friend?: boolean;
  source?: boolean;
  showGrade?: boolean;
}) {
  const detail = [student.number && `no ${student.number}`, `${student.firstName} ${student.lastName}`, GENDER_LABEL[student.gender], student.grade]
    .filter(Boolean)
    .join(' · ');
  return (
    <div
      className={['chip', conflict ? 'is-conflict' : '', !conflict && friend ? 'is-friend' : '', source ? 'is-source' : ''].filter(Boolean).join(' ')}
      style={{ background: GENDER_TINT[student.gender] }}
      title={detail}
    >
      {student.number ? <span className="chip-no">{student.number}</span> : null}
      <span className="chip-name">{student.firstName}</span>
      {showGrade && student.grade ? <span className="chip-grade">{shortGrade(student.grade)}</span> : null}
    </div>
  );
}
