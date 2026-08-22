import { QueryClient } from '@tanstack/react-query';
import { describe, expect, it, vi } from 'vitest';
import {
  masterImageFingerprint,
  refreshMasterImageQueries,
  type MasterImageMeta,
} from './masters.api';

const image = (id: string, fileName = 'image.png', isPrimary = true): MasterImageMeta => ({
  id,
  fileName,
  mimeType: 'image/png',
  fileSize: 100,
  isPrimary,
});

describe('Master image query synchronization', () => {
  it('changes the thumbnail fingerprint when an identical-filename primary gets a new image ID', () => {
    expect(masterImageFingerprint({ images: [image('image-a')] })).toBe('image-a');
    expect(masterImageFingerprint({ images: [image('image-b')] })).toBe('image-b');
  });

  it.each([
    ['destinations', ['masters', 'destinations']],
    ['hotels', ['masters', 'hotels']],
  ] as const)(
    'awaits authoritative list, detail, and thumbnail refreshes for %s',
    async (scope, root) => {
      const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
      let currentId = 'image-a';
      const listQuery = vi.fn(async () => ({
        data: [{ id: 'master-1', images: [image(currentId)] }],
      }));
      const detailQuery = vi.fn(async () => ({ id: 'master-1', images: [image(currentId)] }));
      const thumbnailQuery = vi.fn(async () => ({ url: `https://images.example/${currentId}` }));
      const listKey = [...root, 'pageSize=10'];
      const detailKey = [...root, 'master-1'];
      const thumbnailKey = [...root, 'master-1', 'image', 'image-a'];

      await Promise.all([
        client.fetchQuery({ queryKey: listKey, queryFn: listQuery }),
        client.fetchQuery({ queryKey: detailKey, queryFn: detailQuery }),
        client.fetchQuery({ queryKey: thumbnailKey, queryFn: thumbnailQuery }),
      ]);
      currentId = 'image-b';

      await refreshMasterImageQueries(client, scope);

      expect(client.getQueryData(listKey)).toEqual({
        data: [{ id: 'master-1', images: [image('image-b')] }],
      });
      expect(client.getQueryData(detailKey)).toEqual({
        id: 'master-1',
        images: [image('image-b')],
      });
      expect(client.getQueryData(thumbnailKey)).toEqual({
        url: 'https://images.example/image-b',
      });
      expect(listQuery).toHaveBeenCalledTimes(2);
      expect(detailQuery).toHaveBeenCalledTimes(2);
      expect(thumbnailQuery).toHaveBeenCalledTimes(2);
    },
  );
});
