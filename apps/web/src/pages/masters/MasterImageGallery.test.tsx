import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { MasterImageMeta } from '@/features/masters/masters.api';
import { MasterImageGalleryField, useMasterImageGallery } from './MasterImageGallery';

type TestEntity = {
  hasImage: boolean;
  images: MasterImageMeta[];
  imageFileName: string | null;
  imageMimeType: string | null;
  imageFileSize: number | null;
};

const meta = (id: string, fileName: string, isPrimary = false): MasterImageMeta => ({
  id,
  fileName,
  mimeType: 'image/jpeg',
  fileSize: 100,
  isPrimary,
});

const entity = (images: MasterImageMeta[], legacyName: string | null = null): TestEntity => ({
  hasImage: images.length > 0 || Boolean(legacyName),
  images,
  imageFileName: legacyName ?? images[0]?.fileName ?? null,
  imageMimeType: legacyName || images.length ? 'image/jpeg' : null,
  imageFileSize: legacyName || images.length ? 100 : null,
});

function GalleryHarness({
  masterId,
  value,
  api,
}: {
  masterId: string;
  value: TestEntity;
  api: {
    approve: (
      id: string,
      input: { fileName: string; mimeType: 'image/jpeg'; fileSize: number },
    ) => Promise<{ uploadUrl: string; expiresInSeconds: number }>;
    confirm: (id: string) => Promise<TestEntity>;
    download: (id: string, imageId?: string) => Promise<{ url: string; expiresInSeconds: number }>;
    remove: (id: string, imageId?: string) => Promise<{ deleted: true }>;
    reorder: (id: string, imageIds: string[]) => Promise<TestEntity>;
  };
}) {
  const gallery = useMasterImageGallery({
    masterId,
    entity: value,
    allowedMimeTypes: ['image/jpeg'] as const,
    maxSizeMb: 5,
    api,
    onExistingChange: undefined,
  });
  return (
    <>
      <MasterImageGalleryField
        label="Test Images"
        controller={gallery}
        accept="image/jpeg"
        maxSizeMb={5}
      />
      <button type="button" onClick={() => void gallery.persist(masterId)}>
        Save images
      </button>
    </>
  );
}

const displayedNames = (container: HTMLElement) =>
  [...container.querySelectorAll<HTMLParagraphElement>('p[title]')].map((node) => node.textContent);

describe('MasterImageGallery', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: true }) as Response),
    );
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    Object.defineProperty(URL, 'createObjectURL', {
      configurable: true,
      value: vi.fn((file: File) => `blob:${file.name}`),
    });
    Object.defineProperty(URL, 'revokeObjectURL', {
      configurable: true,
      value: vi.fn(),
    });
  });

  it('shows a legacy single image through the compatibility entry', async () => {
    const download = vi.fn(async (_id: string, imageId?: string) => ({
      url: `https://images.example/${imageId ?? 'legacy'}`,
      expiresInSeconds: 300,
    }));
    const value = entity([], 'legacy.jpg');
    const api = {
      approve: vi.fn(),
      confirm: vi.fn(),
      download,
      remove: vi.fn(),
      reorder: vi.fn(),
    } as unknown as Parameters<typeof GalleryHarness>[0]['api'];

    render(<GalleryHarness masterId="master-1" value={value} api={api} />);

    expect(await screen.findByText('legacy.jpg')).toBeInTheDocument();
    await waitFor(() => expect(download).toHaveBeenCalledWith('master-1', undefined));
    expect(await screen.findByAltText('legacy.jpg')).toHaveAttribute(
      'src',
      'https://images.example/legacy',
    );
  });

  it('uploads several images, adds to an existing gallery, reorders, removes, and reloads', async () => {
    let serverImages = [meta('a', 'a.jpg', true), meta('b', 'b.jpg')];
    let approvedFileName = '';
    const remove = vi.fn(async (_id: string, imageId?: string) => {
      serverImages = serverImages.filter((image) => image.id !== imageId);
      return { deleted: true as const };
    });
    const reorder = vi.fn(async (_id: string, imageIds: string[]) => {
      const byId = new Map(serverImages.map((image) => [image.id, image]));
      serverImages = imageIds.map((id, index) => ({
        ...byId.get(id)!,
        isPrimary: index === 0,
      }));
      return entity(serverImages);
    });
    const api: Parameters<typeof GalleryHarness>[0]['api'] = {
      approve: vi.fn(async (_id, input) => {
        approvedFileName = input.fileName;
        return { uploadUrl: 'https://uploads.example/image', expiresInSeconds: 300 };
      }),
      confirm: vi.fn(async () => {
        const id = `new-${approvedFileName}`;
        serverImages = [...serverImages, meta(id, approvedFileName)];
        return entity(serverImages);
      }),
      download: vi.fn(async (_id, imageId) => ({
        url: `https://images.example/${imageId}`,
        expiresInSeconds: 300,
      })),
      remove,
      reorder,
    };
    const user = userEvent.setup();
    const first = render(
      <GalleryHarness masterId="master-1" value={entity(serverImages)} api={api} />,
    );

    await waitFor(() => expect(displayedNames(first.container)).toEqual(['a.jpg', 'b.jpg']));
    await user.upload(screen.getByLabelText('Add test images'), [
      new File(['c'], 'c.jpg', { type: 'image/jpeg' }),
      new File(['d'], 'd.jpg', { type: 'image/jpeg' }),
    ]);
    expect(displayedNames(first.container)).toEqual(['a.jpg', 'b.jpg', 'c.jpg', 'd.jpg']);

    await user.click(screen.getByRole('button', { name: 'Move c.jpg left' }));
    await user.click(screen.getByRole('button', { name: 'Move c.jpg left' }));
    expect(displayedNames(first.container)).toEqual(['c.jpg', 'a.jpg', 'b.jpg', 'd.jpg']);

    await user.click(screen.getByRole('button', { name: 'Remove b.jpg' }));
    await waitFor(() => expect(remove).toHaveBeenCalledWith('master-1', 'b'));
    await user.click(screen.getByRole('button', { name: 'Remove d.jpg' }));
    expect(displayedNames(first.container)).toEqual(['c.jpg', 'a.jpg']);

    await user.click(screen.getByRole('button', { name: 'Save images' }));
    await waitFor(() => expect(reorder).toHaveBeenLastCalledWith('master-1', ['new-c.jpg', 'a']));
    expect(serverImages.map((image) => image.fileName)).toEqual(['c.jpg', 'a.jpg']);

    first.unmount();
    const reloaded = render(
      <GalleryHarness masterId="master-1" value={entity(serverImages)} api={api} />,
    );
    await waitFor(() => expect(displayedNames(reloaded.container)).toEqual(['c.jpg', 'a.jpg']));
  });

  it('clears unsaved files when the form is reused for another master', async () => {
    const api: Parameters<typeof GalleryHarness>[0]['api'] = {
      approve: vi.fn(),
      confirm: vi.fn(),
      download: vi.fn(async (_id, imageId) => ({
        url: `https://images.example/${imageId}`,
        expiresInSeconds: 300,
      })),
      remove: vi.fn(),
      reorder: vi.fn(),
    } as unknown as Parameters<typeof GalleryHarness>[0]['api'];
    const user = userEvent.setup();
    const rendered = render(
      <GalleryHarness masterId="master-a" value={entity([meta('a', 'a.jpg')])} api={api} />,
    );
    await user.upload(
      screen.getByLabelText('Add test images'),
      new File(['pending'], 'pending.jpg', { type: 'image/jpeg' }),
    );
    expect(screen.getByText('pending.jpg')).toBeInTheDocument();

    rendered.rerender(
      <GalleryHarness masterId="master-b" value={entity([meta('b', 'b.jpg')])} api={api} />,
    );

    await waitFor(() => expect(screen.queryByText('pending.jpg')).not.toBeInTheDocument());
    expect(screen.getByText('b.jpg')).toBeInTheDocument();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:pending.jpg');
  });
});
