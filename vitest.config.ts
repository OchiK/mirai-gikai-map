import { getViteConfig } from 'astro/config';

export default getViteConfig({
  test: {
    include: ['tests/**/*.{test,spec}.{ts,js}'],
    environment: 'node',
  },
});
