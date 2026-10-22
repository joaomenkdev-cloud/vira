"use client";

import { Camera, CameraOff } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Alert, Button, cn } from "@vira/ui";

type CameraState = "off" | "starting" | "on" | "denied" | "unavailable";

/** Frames are read this often: fast enough at a door, light on a phone's battery. */
const READ_EVERY_MS = 150;
/** The frame is shrunk to this width before decoding; a QR held up close stays readable. */
const DECODE_WIDTH = 640;

/**
 * The phone's camera reading QR Codes (docs/DESIGN.md, check-in). The camera starts only
 * when the operator asks, and the screen says how to go on without it (the code typed by
 * hand) when the browser refuses it. Decoding runs in the page with jsQR, loaded only
 * here; nothing leaves the device but the text of the QR.
 */
export function QrScanner({
  paused,
  onRead,
  className,
}: {
  /** Stops reading (the camera stays on) while the result of the last read is shown. */
  paused: boolean;
  onRead: (text: string) => void;
  className?: string;
}) {
  const video = useRef<HTMLVideoElement>(null);
  const stream = useRef<MediaStream | null>(null);
  const latestOnRead = useRef(onRead);
  const [state, setState] = useState<CameraState>("off");

  useEffect(() => {
    latestOnRead.current = onRead;
  }, [onRead]);

  // The camera is released when the screen goes away.
  useEffect(
    () => () => {
      for (const track of stream.current?.getTracks() ?? []) track.stop();
    },
    [],
  );

  useEffect(() => {
    if (state !== "on" || paused) return;
    let cancelled = false;
    let frame = 0;
    let last = 0;
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d", { willReadFrequently: true });
    void import("jsqr").then(({ default: decode }) => {
      const tick = (time: number) => {
        if (cancelled) return;
        frame = requestAnimationFrame(tick);
        const source = video.current;
        if (!context || !source || time - last < READ_EVERY_MS || source.videoWidth === 0) return;
        last = time;
        const scale = Math.min(1, DECODE_WIDTH / source.videoWidth);
        canvas.width = Math.round(source.videoWidth * scale);
        canvas.height = Math.round(source.videoHeight * scale);
        context.drawImage(source, 0, 0, canvas.width, canvas.height);
        const image = context.getImageData(0, 0, canvas.width, canvas.height);
        const found = decode(image.data, image.width, image.height, {
          inversionAttempts: "dontInvert",
        });
        if (found?.data) latestOnRead.current(found.data);
      };
      if (!cancelled) frame = requestAnimationFrame(tick);
    });
    return () => {
      cancelled = true;
      cancelAnimationFrame(frame);
    };
  }, [state, paused]);

  async function start() {
    // Absent outside a secure context (plain http on a phone) and on some old browsers.
    if (!("mediaDevices" in navigator)) {
      setState("unavailable");
      return;
    }
    setState("starting");
    try {
      const media = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" } },
        audio: false,
      });
      stream.current = media;
      if (video.current) {
        video.current.srcObject = media;
        await video.current.play();
      }
      setState("on");
    } catch (error) {
      setState(
        error instanceof DOMException && error.name === "NotAllowedError"
          ? "denied"
          : "unavailable",
      );
    }
  }

  function stop() {
    for (const track of stream.current?.getTracks() ?? []) track.stop();
    stream.current = null;
    if (video.current) video.current.srcObject = null;
    setState("off");
  }

  const live = state === "on" || state === "starting";

  return (
    <div className={cn("flex flex-col gap-3", className)}>
      <div className="relative aspect-square w-full overflow-hidden rounded-lg bg-ink">
        <video
          ref={video}
          muted
          playsInline
          aria-label="Imagem da câmera"
          className={cn("size-full object-cover", !live && "hidden")}
        />
        {live ? (
          <div
            aria-hidden="true"
            className={cn(
              "absolute inset-12 rounded-lg border-4 transition-colors duration-fast",
              paused ? "border-on-accent/40" : "border-on-accent",
            )}
          />
        ) : (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 p-6 text-center">
            <p className="text-body text-on-accent">Aponte a câmera para o QR Code do ingresso.</p>
            <Button
              variant="primary"
              size="lg"
              iconStart={Camera}
              onClick={() => {
                void start();
              }}
            >
              Ligar câmera
            </Button>
          </div>
        )}
      </div>

      {state === "denied" ? (
        <Alert variant="warning" title="Sem acesso à câmera">
          Permita o uso da câmera nas configurações do navegador para este site, ou digite o código
          do ingresso abaixo.
        </Alert>
      ) : null}
      {state === "unavailable" ? (
        <Alert variant="warning" title="A câmera não está disponível">
          Este aparelho ou navegador não deu acesso a uma câmera. Digite o código do ingresso
          abaixo.
        </Alert>
      ) : null}
      {live ? (
        <Button variant="ghost" iconStart={CameraOff} className="self-start" onClick={stop}>
          Desligar câmera
        </Button>
      ) : null}
    </div>
  );
}
