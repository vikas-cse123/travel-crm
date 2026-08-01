import { useCallback, useEffect, useRef, useState } from 'react';
import { Minus, Move, Plus, RotateCcw, RotateCw } from 'lucide-react';
import { Button } from '@/components/ui/Button';

type CropAspect = 'free' | '1:1' | '16:9' | '4:3';
type CropRect = { x: number; y: number; width: number; height: number };

const EDITOR_CANVAS_WIDTH = 1200;
const EDITOR_CANVAS_HEIGHT = 675;
const CROP_ASPECTS: Array<{ value: CropAspect; label: string; ratio: number | null }> = [
  { value: 'free', label: 'Free', ratio: null },
  { value: '1:1', label: '1:1', ratio: 1 },
  { value: '16:9', label: '16:9', ratio: 16 / 9 },
  { value: '4:3', label: '4:3', ratio: 4 / 3 },
];

function cropForAspect(aspect: CropAspect): CropRect {
  if (aspect === 'free') {
    return { x: 0, y: 0, width: EDITOR_CANVAS_WIDTH, height: EDITOR_CANVAS_HEIGHT };
  }
  const ratio = CROP_ASPECTS.find((item) => item.value === aspect)?.ratio;
  const margin = 84;
  const maxWidth = EDITOR_CANVAS_WIDTH - margin * 2;
  const maxHeight = EDITOR_CANVAS_HEIGHT - margin * 2;
  let width = maxWidth;
  let height = maxHeight;
  if (ratio) {
    if (width / height > ratio) width = height * ratio;
    else height = width / ratio;
  }
  return {
    x: (EDITOR_CANVAS_WIDTH - width) / 2,
    y: (EDITOR_CANVAS_HEIGHT - height) / 2,
    width,
    height,
  };
}

function clampCrop(crop: CropRect): CropRect {
  const minSize = 120;
  const width = Math.min(Math.max(crop.width, minSize), EDITOR_CANVAS_WIDTH);
  const height = Math.min(Math.max(crop.height, minSize), EDITOR_CANVAS_HEIGHT);
  return {
    x: Math.min(Math.max(crop.x, 0), EDITOR_CANVAS_WIDTH - width),
    y: Math.min(Math.max(crop.y, 0), EDITOR_CANVAS_HEIGHT - height),
    width,
    height,
  };
}

function renderEditedImage(
  context: CanvasRenderingContext2D,
  image: HTMLImageElement,
  rotation: number,
  scale: number,
) {
  const width = EDITOR_CANVAS_WIDTH;
  const height = EDITOR_CANVAS_HEIGHT;
  context.clearRect(0, 0, width, height);
  context.fillStyle = '#f8fafc';
  context.fillRect(0, 0, width, height);

  const radians = (rotation * Math.PI) / 180;
  const rotated = Math.abs(rotation % 180) === 90;
  const baseScale = Math.min(
    width / (rotated ? image.height : image.width),
    height / (rotated ? image.width : image.height),
  );
  const finalScale = baseScale * scale;

  context.save();
  context.translate(width / 2, height / 2);
  context.rotate(radians);
  context.drawImage(
    image,
    (-image.width * finalScale) / 2,
    (-image.height * finalScale) / 2,
    image.width * finalScale,
    image.height * finalScale,
  );
  context.restore();
}

function drawCropOverlay(context: CanvasRenderingContext2D, crop: CropRect) {
  context.save();
  context.fillStyle = 'rgba(15, 23, 42, 0.58)';
  context.beginPath();
  context.rect(0, 0, EDITOR_CANVAS_WIDTH, EDITOR_CANVAS_HEIGHT);
  context.rect(crop.x, crop.y, crop.width, crop.height);
  context.fill('evenodd');

  context.strokeStyle = '#3b82f6';
  context.lineWidth = 4;
  context.strokeRect(crop.x, crop.y, crop.width, crop.height);

  context.strokeStyle = 'rgba(255, 255, 255, 0.65)';
  context.lineWidth = 1;
  for (const factor of [1 / 3, 2 / 3]) {
    const x = crop.x + crop.width * factor;
    const y = crop.y + crop.height * factor;
    context.beginPath();
    context.moveTo(x, crop.y);
    context.lineTo(x, crop.y + crop.height);
    context.moveTo(crop.x, y);
    context.lineTo(crop.x + crop.width, y);
    context.stroke();
  }

  const handles = [
    [crop.x, crop.y],
    [crop.x + crop.width, crop.y],
    [crop.x, crop.y + crop.height],
    [crop.x + crop.width, crop.y + crop.height],
    [crop.x + crop.width / 2, crop.y],
    [crop.x + crop.width / 2, crop.y + crop.height],
    [crop.x, crop.y + crop.height / 2],
    [crop.x + crop.width, crop.y + crop.height / 2],
  ];
  context.fillStyle = '#3b82f6';
  for (const [x, y] of handles) {
    context.fillRect(x! - 5, y! - 5, 10, 10);
  }
  context.restore();
}

export function MasterImageEditor({
  file,
  imageUrl,
  isOpen,
  title = 'Edit Image',
  onApply,
  onCancel,
}: {
  file: File;
  imageUrl: string;
  isOpen: boolean;
  title?: string;
  onApply: (file: File) => void;
  onCancel: () => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const dragRef = useRef<{
    mode: 'move' | 'resize';
    pointerId: number;
    startX: number;
    startY: number;
    startCrop: CropRect;
  } | null>(null);
  const [scale, setScale] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [aspect, setAspect] = useState<CropAspect>('free');
  const [crop, setCrop] = useState<CropRect>(() => cropForAspect('free'));

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext('2d');
    if (!context) return;

    const image = new Image();
    image.onload = () => {
      renderEditedImage(context, image, rotation, scale);
      drawCropOverlay(context, crop);
    };
    image.src = imageUrl;
  }, [crop, imageUrl, rotation, scale]);

  useEffect(() => {
    if (isOpen) draw();
  }, [draw, isOpen]);

  useEffect(() => {
    setScale(1);
    setRotation(0);
    setAspect('free');
    setCrop(cropForAspect('free'));
  }, [file]);

  const zoom = (amount: number) => {
    setScale((value) => Math.min(3, Math.max(0.25, Number((value + amount).toFixed(2)))));
  };

  const canvasPoint = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    return {
      x: ((event.clientX - rect.left) / rect.width) * EDITOR_CANVAS_WIDTH,
      y: ((event.clientY - rect.top) / rect.height) * EDITOR_CANVAS_HEIGHT,
    };
  };

  const changeAspect = (nextAspect: CropAspect) => {
    setAspect(nextAspect);
    setCrop(cropForAspect(nextAspect));
  };

  const onPointerDown = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const point = canvasPoint(event);
    const nearRight = Math.abs(point.x - (crop.x + crop.width)) < 28;
    const nearBottom = Math.abs(point.y - (crop.y + crop.height)) < 28;
    const inside =
      point.x >= crop.x &&
      point.x <= crop.x + crop.width &&
      point.y >= crop.y &&
      point.y <= crop.y + crop.height;
    if (!inside && !(nearRight && nearBottom)) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = {
      mode: nearRight && nearBottom ? 'resize' : 'move',
      pointerId: event.pointerId,
      startX: point.x,
      startY: point.y,
      startCrop: crop,
    };
  };

  const onPointerMove = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const point = canvasPoint(event);
    const deltaX = point.x - drag.startX;
    const deltaY = point.y - drag.startY;

    if (drag.mode === 'move') {
      setCrop(
        clampCrop({
          ...drag.startCrop,
          x: drag.startCrop.x + deltaX,
          y: drag.startCrop.y + deltaY,
        }),
      );
      return;
    }

    const ratio = CROP_ASPECTS.find((item) => item.value === aspect)?.ratio;
    let width = drag.startCrop.width + deltaX;
    let height = drag.startCrop.height + deltaY;
    if (ratio) height = width / ratio;
    setCrop(clampCrop({ ...drag.startCrop, width, height }));
  };

  const stopDrag = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (dragRef.current?.pointerId === event.pointerId) {
      dragRef.current = null;
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
    }
  };

  const apply = () => {
    const isFullFrame =
      aspect === 'free' &&
      crop.x === 0 &&
      crop.y === 0 &&
      crop.width === EDITOR_CANVAS_WIDTH &&
      crop.height === EDITOR_CANVAS_HEIGHT;
    if (isFullFrame && rotation === 0 && scale === 1) {
      onApply(file);
      return;
    }

    const fullCanvas = document.createElement('canvas');
    fullCanvas.width = EDITOR_CANVAS_WIDTH;
    fullCanvas.height = EDITOR_CANVAS_HEIGHT;
    const fullContext = fullCanvas.getContext('2d');
    if (!fullContext) return;

    const image = new Image();
    image.onload = () => {
      renderEditedImage(fullContext, image, rotation, scale);
      const outputCanvas = document.createElement('canvas');
      outputCanvas.width = Math.round(crop.width);
      outputCanvas.height = Math.round(crop.height);
      const outputContext = outputCanvas.getContext('2d');
      if (!outputContext) return;
      outputContext.drawImage(
        fullCanvas,
        crop.x,
        crop.y,
        crop.width,
        crop.height,
        0,
        0,
        outputCanvas.width,
        outputCanvas.height,
      );
      outputCanvas.toBlob(
        (blob) => {
          if (!blob) {
            onApply(file);
            return;
          }
          onApply(new File([blob], file.name, { type: file.type, lastModified: Date.now() }));
        },
        file.type,
        0.9,
      );
    };
    image.src = imageUrl;
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4"
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div className="w-full max-w-3xl overflow-hidden rounded-xl bg-card shadow-2xl">
        <div className="flex items-center justify-between border-b px-5 py-4">
          <div>
            <h2 className="text-lg font-semibold">{title}</h2>
            <p className="text-sm text-slate-500">Crop, zoom and rotate before uploading.</p>
          </div>
          <Button type="button" variant="secondary" size="sm" onClick={onCancel}>
            Close
          </Button>
        </div>
        <div className="space-y-4 p-5">
          <div className="flex flex-wrap items-center gap-2 text-sm font-medium">
            <span className="mr-1 text-slate-600">Aspect ratio:</span>
            {CROP_ASPECTS.map((item) => (
              <button
                key={item.value}
                type="button"
                onClick={() => changeAspect(item.value)}
                className={`rounded-lg border px-3 py-2 ${
                  aspect === item.value
                    ? 'border-brand-500 bg-brand-50 text-brand-700'
                    : 'border-slate-200 bg-card text-slate-700 hover:bg-slate-50'
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>
          <div className="overflow-hidden rounded-lg border bg-slate-50">
            <canvas
              ref={canvasRef}
              width={EDITOR_CANVAS_WIDTH}
              height={EDITOR_CANVAS_HEIGHT}
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={stopDrag}
              onPointerCancel={stopDrag}
              className="aspect-video w-full cursor-move touch-none bg-slate-50"
            />
          </div>
          <div className="grid gap-4 md:grid-cols-[1fr_auto] md:items-end">
            <label className="block text-sm font-medium">
              Zoom
              <input
                className="mt-2 w-full accent-brand-600"
                type="range"
                min="0.25"
                max="3"
                step="0.05"
                value={scale}
                onChange={(event) => setScale(Number(event.target.value))}
              />
            </label>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="secondary"
                onClick={() => setRotation((value) => (value + 270) % 360)}
              >
                <RotateCcw className="h-4 w-4" /> Rotate left
              </Button>
              <Button
                type="button"
                variant="secondary"
                onClick={() => setRotation((value) => (value + 90) % 360)}
              >
                <RotateCw className="h-4 w-4" /> Rotate right
              </Button>
              <Button type="button" variant="secondary" onClick={() => zoom(0.1)}>
                <Plus className="h-4 w-4" /> Zoom
              </Button>
              <Button type="button" variant="secondary" onClick={() => zoom(-0.1)}>
                <Minus className="h-4 w-4" /> Zoom
              </Button>
              <Button
                type="button"
                variant="secondary"
                onClick={() => {
                  setScale(1);
                  setRotation(0);
                  setAspect('free');
                  setCrop(cropForAspect('free'));
                }}
              >
                Reset
              </Button>
              <Button type="button" variant="secondary" onClick={() => onApply(file)}>
                Use original
              </Button>
              <Button type="button" onClick={apply}>
                <Move className="h-4 w-4" />
                Apply image
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
