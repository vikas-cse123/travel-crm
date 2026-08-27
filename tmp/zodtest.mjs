import { z } from 'zod';
const schema = z.object({
  name: z.string().trim().min(2, 'Destination name is required.').max(200),
});
const r = schema.safeParse({ name: '' });
console.log(JSON.stringify(r, null, 2));
