import { useEffect, useState } from "react";
import Cropper, { type Area, type Point } from "react-easy-crop";
import { useTranslation } from "react-i18next";
import { Button } from "#/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "#/components/ui/dialog";
import { Label } from "#/components/ui/label";

/** Matches the API's own cap (ImageService.normalizeAvatar), which re-checks it. */
const AVATAR_MAX_SIZE = 512;

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("unreadable image"));
    image.src = url;
  });
}

function canvasToBlob(canvas: HTMLCanvasElement, type: string): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, type, 0.9));
}

/** Draws the chosen square region at most 512x512. Browsers apply EXIF orientation when drawing, matching the preview. */
async function cropToSquare(imageUrl: string, area: Area): Promise<Blob> {
  const image = await loadImage(imageUrl);
  const size = Math.max(1, Math.min(Math.round(area.width), AVATAR_MAX_SIZE));
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Canvas not supported");
  context.imageSmoothingQuality = "high";
  context.drawImage(image, area.x, area.y, area.width, area.height, 0, 0, size, size);
  // Browsers without WebP encoding (older Safari) return null or PNG.
  const blob = (await canvasToBlob(canvas, "image/webp")) ?? (await canvasToBlob(canvas, "image/png"));
  if (!blob) throw new Error("Couldn't export the cropped image");
  return blob;
}

interface AvatarCropDialogProps {
  file: File;
  onCancel: () => void;
  onConfirm: (cropped: Blob) => Promise<void>;
}

export function AvatarCropDialog({ file, onCancel, onConfirm }: AvatarCropDialogProps) {
  const { t } = useTranslation();
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [crop, setCrop] = useState<Point>({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [area, setArea] = useState<Area | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const url = URL.createObjectURL(file);
    let cancelled = false;
    // Checked up front so an undecodable file (e.g. HEIC outside Safari) shows a message instead of an empty cropper.
    loadImage(url).then(
      () => !cancelled && setImageUrl(url),
      () => !cancelled && setError(t("account.avatarUnreadable")),
    );
    return () => {
      cancelled = true;
      URL.revokeObjectURL(url);
    };
  }, [file, t]);

  async function confirm() {
    if (!imageUrl || !area) return;
    setPending(true);
    setError(null);
    try {
      await onConfirm(await cropToSquare(imageUrl, area));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && !pending && onCancel()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("account.cropTitle")}</DialogTitle>
          <DialogDescription>{t("account.cropDescription")}</DialogDescription>
        </DialogHeader>

        <div className="relative h-72 overflow-hidden rounded-md bg-muted" data-testid="avatar-cropper">
          {imageUrl ? (
            <Cropper
              image={imageUrl}
              crop={crop}
              zoom={zoom}
              aspect={1}
              cropShape="round"
              showGrid={false}
              onCropChange={setCrop}
              onZoomChange={setZoom}
              onCropComplete={(_, pixels) => setArea(pixels)}
            />
          ) : null}
        </div>

        <div className="flex items-center gap-3">
          <Label htmlFor="avatar-zoom" className="shrink-0">
            {t("account.zoom")}
          </Label>
          <input
            id="avatar-zoom"
            type="range"
            min={1}
            max={4}
            step={0.01}
            value={zoom}
            onChange={(event) => setZoom(Number(event.target.value))}
            className="w-full accent-primary"
            disabled={!imageUrl}
          />
        </div>

        {error ? <p className="text-sm text-destructive">{error}</p> : null}

        <DialogFooter>
          <Button variant="outline" onClick={onCancel} disabled={pending}>
            {t("account.cancel")}
          </Button>
          <Button onClick={() => void confirm()} disabled={!imageUrl || !area || pending}>
            {pending ? t("account.saving") : t("account.saveAvatar")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
