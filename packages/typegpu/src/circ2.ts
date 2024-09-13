import { henlo } from './circ1';

export const henloToo: {
  greeting: string;
  response: string;
} = {
  greeting: 'henlo too!',
  response: henlo.greeting,
};
