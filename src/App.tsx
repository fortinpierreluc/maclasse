import { useEffect, useState } from 'react';
import { health } from './api';
import { Editor } from './components/Editor';
import { Welcome } from './components/WelcomeScreen';
import type { Classroom } from './types';

export function App() {
  const [classroom, setClassroom] = useState<Classroom | null>(null);
  const [driver, setDriver] = useState('');

  useEffect(() => {
    health()
      .then((result) => setDriver(result.driver))
      .catch(() => setDriver(''));
  }, []);

  useEffect(() => {
    if (!classroom) document.title = 'Ma Classe';
  }, [classroom]);

  if (!classroom) return <Welcome driver={driver} onOpen={setClassroom} />;
  return <Editor key={classroom.code} initial={classroom} driver={driver} onOpen={setClassroom} onExit={() => setClassroom(null)} />;
}
