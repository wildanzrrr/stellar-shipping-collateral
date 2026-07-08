import { init } from '@paralleldrive/cuid2';

const createId = init({
  fingerprint: process.env.FINGERPRINT_SECRET!,
  length: 25,
  random: Math.random,
});

export const generateCustomId = (prefix: string): string => {
  return `${prefix}-${createId()}`;
};

export const generateRandomString = (length: number): string => {
  const createId = init({
    fingerprint: process.env.FINGERPRINT_SECRET!,
    length,
    random: Math.random,
  });

  return createId();
};
