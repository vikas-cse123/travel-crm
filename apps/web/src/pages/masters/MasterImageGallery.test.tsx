import { StrictMode, useState } from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { MasterImageMeta } from '@/features/masters/masters.api';
import { MasterImageGalleryField, useMasterImageGallery } from './MasterImageGallery';

type TestEntity = {
  id: string;
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

const entity = (
  images: MasterImageMeta[],
  legacyName: string | null = null,
  id = 'master-1',
): TestEntity => ({
  id,
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
  onExistingChange,
}: {
  masterId: string;
  value: TestEntity | undefined;
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
  onExistingChange?: () => Promise<unknown> | unknown;
}) {
  const gallery = useMasterImageGallery({
    masterId,
    entity: value,
    allowedMimeTypes: ['image/jpeg'] as const,
    maxSizeMb: 5,
    api,
    onExistingChange,
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

function RefetchingGalleryHarness({
  initial,
  latest,
  api,
  refetchGate,
}: {
  initial: MasterImageMeta[];
  latest: () => MasterImageMeta[];
  api: Parameters<typeof GalleryHarness>[0]['api'];
  refetchGate: Promise<void>;
}) {
  const [value, setValue] = useState<TestEntity | undefined>(() => entity(initial));
  return (
    <>
      <output data-testid="query-state">{value ? 'resolved' : 'undefined'}</output>
      <GalleryHarness
        masterId="master-1"
        value={value}
        api={api}
        onExistingChange={async () => {
          setValue(undefined);
          await refetchGate;
          setValue(entity(latest()));
        }}
      />
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
      <GalleryHarness
        masterId="master-a"
        value={entity([meta('a', 'a.jpg')], null, 'master-a')}
        api={api}
      />,
    );
    await user.upload(
      screen.getByLabelText('Add test images'),
      new File(['pending'], 'pending.jpg', { type: 'image/jpeg' }),
    );
    expect(screen.getByText('pending.jpg')).toBeInTheDocument();

    rendered.rerender(
      <GalleryHarness
        masterId="master-b"
        value={entity([meta('b', 'b.jpg')], null, 'master-b')}
        api={api}
      />,
    );

    await waitFor(() => expect(screen.queryByText('pending.jpg')).not.toBeInTheDocument());
    expect(screen.getByText('b.jpg')).toBeInTheDocument();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:pending.jpg');
  });

  it('hydrates persisted images when SPA query data resolves after mount', async () => {
    const download = vi.fn(async (_id: string, imageId?: string) => ({
      url: `https://images.example/${imageId}`,
      expiresInSeconds: 300,
    }));
    const api = {
      approve: vi.fn(),
      confirm: vi.fn(),
      download,
      remove: vi.fn(),
      reorder: vi.fn(),
    } as unknown as Parameters<typeof GalleryHarness>[0]['api'];
    const rendered = render(<GalleryHarness masterId="master-1" value={undefined} api={api} />);

    expect(displayedNames(rendered.container)).toEqual([]);
    rendered.rerender(
      <GalleryHarness
        masterId="master-1"
        value={entity([meta('a', 'a.jpg'), meta('b', 'b.jpg'), meta('c', 'c.jpg')])}
        api={api}
      />,
    );

    expect(displayedNames(rendered.container)).toEqual(['a.jpg', 'b.jpg', 'c.jpg']);
    await waitFor(() => expect(download).toHaveBeenCalledTimes(3));
    expect(await screen.findByAltText('c.jpg')).toHaveAttribute('src', 'https://images.example/c');
  });

  it('initializes immediately from detail data already cached during View to Edit navigation', () => {
    const api = {
      approve: vi.fn(),
      confirm: vi.fn(),
      download: vi.fn(() => new Promise(() => undefined)),
      remove: vi.fn(),
      reorder: vi.fn(),
    } as unknown as Parameters<typeof GalleryHarness>[0]['api'];
    const cached = entity([meta('a', 'a.jpg'), meta('b', 'b.jpg'), meta('c', 'c.jpg')]);

    const rendered = render(<GalleryHarness masterId="master-1" value={cached} api={api} />);

    expect(displayedNames(rendered.container)).toEqual(['a.jpg', 'b.jpg', 'c.jpg']);
  });

  it('preserves the gallery through temporary undefined query data and then accepts latest server IDs', async () => {
    const api = {
      approve: vi.fn(),
      confirm: vi.fn(),
      download: vi.fn(async (_id, imageId) => ({
        url: `https://images.example/${imageId}`,
        expiresInSeconds: 300,
      })),
      remove: vi.fn(),
      reorder: vi.fn(),
    } as unknown as Parameters<typeof GalleryHarness>[0]['api'];
    const rendered = render(
      <GalleryHarness
        masterId="master-1"
        value={entity([meta('a', 'a.jpg'), meta('b', 'b.jpg'), meta('c', 'c.jpg')])}
        api={api}
      />,
    );

    rendered.rerender(<GalleryHarness masterId="master-1" value={undefined} api={api} />);
    expect(displayedNames(rendered.container)).toEqual(['a.jpg', 'b.jpg', 'c.jpg']);

    rendered.rerender(
      <GalleryHarness
        masterId="master-1"
        value={entity([meta('a', 'a.jpg'), meta('c', 'c.jpg')])}
        api={api}
      />,
    );
    await waitFor(() => expect(displayedNames(rendered.container)).toEqual(['a.jpg', 'c.jpg']));

    rendered.rerender(<GalleryHarness masterId="master-1" value={entity([])} api={api} />);
    expect(displayedNames(rendered.container)).toEqual([]);
  });

  it('deletes duplicate-filename images by persisted ID without clearing their siblings', async () => {
    let serverImages = ['a', 'b', 'c', 'd', 'e', 'f'].map((id, index) =>
      meta(id, 'image.png', index === 0),
    );
    const remove = vi.fn(async (_id: string, imageId?: string) => {
      serverImages = serverImages.filter((image) => image.id !== imageId);
      return { deleted: true as const };
    });
    const download = vi.fn(async (_id: string, imageId?: string) => ({
      url: `https://images.example/${imageId}`,
      expiresInSeconds: 300,
    }));
    const api = {
      approve: vi.fn(),
      confirm: vi.fn(),
      download,
      remove,
      reorder: vi.fn(),
    } as unknown as Parameters<typeof GalleryHarness>[0]['api'];
    const user = userEvent.setup();
    const rendered = render(
      <GalleryHarness masterId="master-1" value={entity(serverImages)} api={api} />,
    );

    await waitFor(() => expect(download).toHaveBeenCalledTimes(6));
    expect(screen.getAllByRole('button', { name: 'Remove image.png' })).toHaveLength(6);
    expect(download.mock.calls.map((call) => call[1])).toEqual(['a', 'b', 'c', 'd', 'e', 'f']);

    await user.click(screen.getAllByRole('button', { name: 'Remove image.png' })[2]!);
    await waitFor(() => expect(remove).toHaveBeenLastCalledWith('master-1', 'c'));
    expect(screen.getAllByRole('button', { name: 'Remove image.png' })).toHaveLength(5);

    await user.click(screen.getAllByRole('button', { name: 'Remove image.png' })[3]!);
    await waitFor(() => expect(remove).toHaveBeenLastCalledWith('master-1', 'e'));
    expect(screen.getAllByRole('button', { name: 'Remove image.png' })).toHaveLength(4);

    await user.click(screen.getAllByRole('button', { name: 'Remove image.png' })[1]!);
    await waitFor(() => expect(remove).toHaveBeenLastCalledWith('master-1', 'b'));
    expect(displayedNames(rendered.container)).toEqual(['image.png', 'image.png', 'image.png']);
    expect(serverImages.map((image) => image.id)).toEqual(['a', 'd', 'f']);
  });

  it('keeps remaining images and URLs while delete refetch data is temporarily undefined', async () => {
    let serverImages = [
      meta('a', 'a.jpg', true),
      meta('b', 'b.jpg'),
      meta('c', 'c.jpg'),
      meta('d', 'd.jpg'),
    ];
    let releaseRefetch!: () => void;
    const refetchGate = new Promise<void>((resolve) => {
      releaseRefetch = resolve;
    });
    const remove = vi.fn(async (_id: string, imageId?: string) => {
      serverImages = serverImages.filter((image) => image.id !== imageId);
      return { deleted: true as const };
    });
    const api = {
      approve: vi.fn(),
      confirm: vi.fn(),
      download: vi.fn(async (_id: string, imageId?: string) => ({
        url: `https://images.example/${imageId}`,
        expiresInSeconds: 300,
      })),
      remove,
      reorder: vi.fn(),
    } as unknown as Parameters<typeof GalleryHarness>[0]['api'];
    const user = userEvent.setup();
    const rendered = render(
      <RefetchingGalleryHarness
        initial={serverImages}
        latest={() => serverImages}
        api={api}
        refetchGate={refetchGate}
      />,
    );
    await waitFor(() => expect(screen.getByAltText('d.jpg')).toBeInTheDocument());

    await user.click(screen.getByRole('button', { name: 'Remove b.jpg' }));
    await waitFor(() => expect(screen.getByTestId('query-state')).toHaveTextContent('undefined'));
    expect(displayedNames(rendered.container)).toEqual(['a.jpg', 'c.jpg', 'd.jpg']);
    expect(screen.getByAltText('a.jpg')).toHaveAttribute('src', 'https://images.example/a');
    expect(screen.getByAltText('c.jpg')).toHaveAttribute('src', 'https://images.example/c');
    expect(screen.getByAltText('d.jpg')).toHaveAttribute('src', 'https://images.example/d');

    releaseRefetch();
    await waitFor(() => expect(screen.getByTestId('query-state')).toHaveTextContent('resolved'));
    expect(displayedNames(rendered.container)).toEqual(['a.jpg', 'c.jpg', 'd.jpg']);
  });

  it('keeps pending files during server refetch and only changes authoritative existing IDs', async () => {
    const api = {
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
      <GalleryHarness
        masterId="master-1"
        value={entity([meta('a', 'a.jpg'), meta('b', 'b.jpg')])}
        api={api}
      />,
    );
    await user.upload(
      screen.getByLabelText('Add test images'),
      new File(['pending'], 'pending.jpg', { type: 'image/jpeg' }),
    );

    rendered.rerender(<GalleryHarness masterId="master-1" value={undefined} api={api} />);
    expect(displayedNames(rendered.container)).toEqual(['a.jpg', 'b.jpg', 'pending.jpg']);
    rendered.rerender(
      <GalleryHarness masterId="master-1" value={entity([meta('a', 'a.jpg')])} api={api} />,
    );
    expect(displayedNames(rendered.container)).toEqual(['a.jpg', 'pending.jpg']);
    rendered.rerender(<GalleryHarness masterId="master-1" value={entity([])} api={api} />);
    expect(displayedNames(rendered.container)).toEqual(['pending.jpg']);
  });

  it('does nothing when deletion is cancelled and removes only the confirmed ID afterward', async () => {
    const remove = vi.fn(async () => ({ deleted: true as const }));
    const api = {
      approve: vi.fn(),
      confirm: vi.fn(),
      download: vi.fn(async (_id, imageId) => ({
        url: `https://images.example/${imageId}`,
        expiresInSeconds: 300,
      })),
      remove,
      reorder: vi.fn(),
    } as unknown as Parameters<typeof GalleryHarness>[0]['api'];
    const user = userEvent.setup();
    const rendered = render(
      <GalleryHarness
        masterId="master-1"
        value={entity([meta('a', 'a.jpg'), meta('b', 'b.jpg'), meta('c', 'c.jpg')])}
        api={api}
      />,
    );
    vi.mocked(window.confirm).mockReturnValueOnce(false).mockReturnValueOnce(true);

    await user.click(screen.getByRole('button', { name: 'Remove b.jpg' }));
    expect(remove).not.toHaveBeenCalled();
    expect(displayedNames(rendered.container)).toEqual(['a.jpg', 'b.jpg', 'c.jpg']);

    await user.click(screen.getByRole('button', { name: 'Remove b.jpg' }));
    await waitFor(() => expect(remove).toHaveBeenCalledWith('master-1', 'b'));
    expect(displayedNames(rendered.container)).toEqual(['a.jpg', 'c.jpg']);
  });

  it('loads asynchronously and remains stable under React Strict Mode', async () => {
    const download = vi.fn(async (_id: string, imageId?: string) => ({
      url: `https://images.example/${imageId}`,
      expiresInSeconds: 300,
    }));
    const api = {
      approve: vi.fn(),
      confirm: vi.fn(),
      download,
      remove: vi.fn(),
      reorder: vi.fn(),
    } as unknown as Parameters<typeof GalleryHarness>[0]['api'];

    render(
      <StrictMode>
        <GalleryHarness
          masterId="master-1"
          value={entity([meta('a', 'a.jpg'), meta('b', 'b.jpg')])}
          api={api}
        />
      </StrictMode>,
    );

    expect(screen.getByText('a.jpg')).toBeInTheDocument();
    expect(await screen.findByAltText('a.jpg')).toHaveAttribute('src', 'https://images.example/a');
    expect(await screen.findByAltText('b.jpg')).toHaveAttribute('src', 'https://images.example/b');
  });

  it('persists an untouched gallery with every existing ID intact', async () => {
    const images = [meta('a', 'a.jpg', true), meta('b', 'b.jpg'), meta('c', 'c.jpg')];
    const reorder = vi.fn(async (_id: string, imageIds: string[]) =>
      entity(
        imageIds.map((id, index) => ({
          ...images.find((image) => image.id === id)!,
          isPrimary: index === 0,
        })),
      ),
    );
    const api = {
      approve: vi.fn(),
      confirm: vi.fn(),
      download: vi.fn(async (_id, imageId) => ({
        url: `https://images.example/${imageId}`,
        expiresInSeconds: 300,
      })),
      remove: vi.fn(),
      reorder,
    } as unknown as Parameters<typeof GalleryHarness>[0]['api'];
    const user = userEvent.setup();
    const rendered = render(
      <GalleryHarness masterId="master-1" value={entity(images)} api={api} />,
    );

    await user.click(screen.getByRole('button', { name: 'Save images' }));
    await waitFor(() => expect(reorder).toHaveBeenCalledWith('master-1', ['a', 'b', 'c']));
    expect(displayedNames(rendered.container)).toEqual(['a.jpg', 'b.jpg', 'c.jpg']);
  });
});
