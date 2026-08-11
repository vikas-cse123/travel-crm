import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ImageDropPasteManager } from './ImageDropPasteManager';

function installDataTransfer() {
  class TestDataTransfer {
    private selected: File[] = [];
    items = {
      add: (file: File) => {
        this.selected.push(file);
      },
    };
    get files() {
      return this.selected;
    }
  }
  vi.stubGlobal('DataTransfer', TestDataTransfer);
}

describe('ImageDropPasteManager', () => {
  it('sends a pasted clipboard image to the only available image input', () => {
    installDataTransfer();
    const onChange = vi.fn();
    render(
      <>
        <ImageDropPasteManager />
        <input aria-label="Logo" type="file" accept="image/png,image/jpeg" onChange={onChange} />
      </>,
    );
    const image = new File(['image'], 'clipboard.png', { type: 'image/png' });

    fireEvent.paste(document, { clipboardData: { files: [image], items: [] } });

    expect(onChange).toHaveBeenCalledOnce();
    expect(screen.getByRole('status')).toHaveTextContent('Clipboard image added');
  });

  it('rejects clipboard image formats not accepted by the active input', () => {
    installDataTransfer();
    const onChange = vi.fn();
    render(
      <label>
        Logo
        <input type="file" accept="image/png" onChange={onChange} />
      </label>,
    );
    render(<ImageDropPasteManager />);
    const input = screen.getByLabelText('Logo');
    fireEvent.pointerOver(input);
    const image = new File(['image'], 'clipboard.webp', { type: 'image/webp' });

    fireEvent.paste(document, { clipboardData: { files: [image], items: [] } });

    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByRole('status')).toHaveTextContent('not accepted');
  });
});
