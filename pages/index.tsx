"use client";

import React, { useRef, useState, useEffect, useCallback } from "react";
import {
  MantineProvider,
  createTheme,
  Button,
  FileButton,
  Card,
  Text,
  Group,
  NumberInput,
  ActionIcon,
  Stack,
  Select,
} from "@mantine/core";
import {
  IconPlayerPlay,
  IconPlayerTrackPrev,
  IconCut,
  IconTrash,
  IconUpload,
} from "@tabler/icons-react";
import "@mantine/core/styles.css";

const theme = createTheme({
  colors: {
    dark: [
      "#C1C2C5",
      "#A6A7AB",
      "#909296",
      "#5C5F66",
      "#373A40",
      "#2C2E33",
      "#25262B",
      "#1A1B1E",
      "#141517",
      "#101113",
    ],
  },
});

interface AudioTrimmerProps {
  audioBuffer: AudioBuffer;
  fileName: string;
  onReset: () => void;
}

function AudioTrimmer({ audioBuffer, fileName, onReset }: AudioTrimmerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [trimStart, setTrimStart] = useState(0);
  const [trimEnd, setTrimEnd] = useState(audioBuffer.duration);
  const [isTrimming, setIsTrimming] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [activeHandle, setActiveHandle] = useState<"start" | "end" | null>(null);
  const [hoveredHandle, setHoveredHandle] = useState<"start" | "end" | null>(null);

  const drawWaveform = useCallback(() => {
    if (!canvasRef.current) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const width = canvas.width;
    const height = canvas.height;
    const data = audioBuffer.getChannelData(0);
    const step = Math.ceil(data.length / width);

    ctx.clearRect(0, 0, width, height);

    ctx.beginPath();
    ctx.strokeStyle = "#4ECCA3";
    ctx.lineWidth = 2;
    for (let i = 0; i < width; i++) {
      const sliceStart = i * step;
      const sliceEnd = sliceStart + step;
      const max = Math.max(...data.slice(sliceStart, sliceEnd));
      const min = Math.min(...data.slice(sliceStart, sliceEnd));
      ctx.moveTo(i, ((1 + min) * height) / 2);
      ctx.lineTo(i, ((1 + max) * height) / 2);
    }
    ctx.stroke();

    const startX = (trimStart / audioBuffer.duration) * width;
    const endX = (trimEnd / audioBuffer.duration) * width;
    ctx.fillStyle = "rgba(78, 204, 163, 0.2)";
    ctx.fillRect(startX, 0, endX - startX, height);

    const drawHandle = (x: number, isActive: boolean, isHovered: boolean) => {
      ctx.fillStyle = isActive
        ? "rgba(255, 0, 0, 0.8)"
        : isHovered
        ? "rgba(78, 204, 163, 0.8)"
        : "rgba(78, 204, 163, 0.5)";
      ctx.fillRect(x - 4, 0, 8, height);
    };

    drawHandle(startX, activeHandle === "start", hoveredHandle === "start");
    drawHandle(endX, activeHandle === "end", hoveredHandle === "end");
  }, [audioBuffer, trimStart, trimEnd, activeHandle, hoveredHandle]);

  useEffect(() => {
    drawWaveform();
  }, [drawWaveform]);

  useEffect(() => {
    const resizeCanvas = () => {
      if (canvasRef.current && containerRef.current) {
        canvasRef.current.width = containerRef.current.clientWidth;
        canvasRef.current.height = 200;
        drawWaveform();
      }
    };

    resizeCanvas();
    window.addEventListener("resize", resizeCanvas);

    return () => {
      window.removeEventListener("resize", resizeCanvas);
    };
  }, [drawWaveform]);

  const getTimeFromX = (x: number) => {
    if (!canvasRef.current) return 0;
    const canvas = canvasRef.current;
    return (x / canvas.width) * audioBuffer.duration;
  };

  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const time = getTimeFromX(x);

    const startX = (trimStart / audioBuffer.duration) * canvas.width;
    const endX = (trimEnd / audioBuffer.duration) * canvas.width;

    if (Math.abs(x - startX) <= 10) {
      setActiveHandle("start");
    } else if (Math.abs(x - endX) <= 10) {
      setActiveHandle("end");
    } else {
      setTrimStart(time);
      setTrimEnd(audioBuffer.duration);
      setActiveHandle("end");
    }

    setIsDragging(true);
  };

  const handleMouseMove = useCallback(
    (e: MouseEvent) => {
      if (!canvasRef.current || !isDragging) return;

      const canvas = canvasRef.current;
      const rect = canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const time = getTimeFromX(x);

      if (activeHandle === "start") {
        setTrimStart(Math.min(Math.max(0, time), trimEnd - 0.1));
      } else if (activeHandle === "end") {
        setTrimEnd(Math.max(Math.min(audioBuffer.duration, time), trimStart + 0.1));
      }

      const startX = (trimStart / audioBuffer.duration) * canvas.width;
      const endX = (trimEnd / audioBuffer.duration) * canvas.width;

      if (Math.abs(x - startX) <= 10) {
        setHoveredHandle("start");
      } else if (Math.abs(x - endX) <= 10) {
        setHoveredHandle("end");
      } else {
        setHoveredHandle(null);
      }
    },
    [audioBuffer, activeHandle, trimStart, trimEnd, isDragging]
  );

  const handleMouseUp = useCallback(() => {
    setActiveHandle(null);
    setIsDragging(false);
  }, []);

  useEffect(() => {
    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);

    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [handleMouseMove, handleMouseUp]);

  const handleTrim = async () => {
    if (!audioBuffer) return;

    setIsTrimming(true);

    const sampleRate = audioBuffer.sampleRate;
    const channels = audioBuffer.numberOfChannels;
    const startOffset = Math.floor(trimStart * sampleRate);
    const endOffset = Math.floor(trimEnd * sampleRate);
    const frameCount = endOffset - startOffset;

    const audioContext = new (window.AudioContext ||
      (window as any).webkitAudioContext)();
    const trimmedBuffer = audioContext.createBuffer(channels, frameCount, sampleRate);

    for (let channel = 0; channel < channels; channel++) {
      const originalData = audioBuffer.getChannelData(channel);
      const trimmedData = trimmedBuffer.getChannelData(channel);
      for (let i = 0; i < frameCount; i++) {
        trimmedData[i] = originalData[i + startOffset];
      }
    }

    const trimmedBlob = await audioBufferToWav(trimmedBuffer);
    const trimmedUrl = URL.createObjectURL(trimmedBlob);

    const link = document.createElement("a");
    link.href = trimmedUrl;
    link.download = "trimmed_audio.wav";
    link.click();

    setIsTrimming(false);
  };

  const audioBufferToWav = (buffer: AudioBuffer): Promise<Blob> => {
    return new Promise((resolve) => {
      const length = buffer.length * buffer.numberOfChannels * 2 + 44;
      const data = new Uint8Array(length);

      let offset = 0;
      const writeString = (str: string) => {
        for (let i = 0; i < str.length; i++) {
          data.set(new Uint8Array([str.charCodeAt(i)]), offset + i);
        }
        offset += str.length;
      };

      const writeUint16 = (value: number) => {
        data.set(new Uint8Array([value & 0xff, (value >> 8) & 0xff]), offset);
        offset += 2;
      };

      const writeUint32 = (value: number) => {
        data.set(
          new Uint8Array([
            value & 0xff,
            (value >> 8) & 0xff,
            (value >> 16) & 0xff,
            (value >> 24) & 0xff,
          ]),
          offset
        );
        offset += 4;
      };

      writeString("RIFF");
      writeUint32(length - 8);
      writeString("WAVE");
      writeString("fmt ");
      writeUint32(16);
      writeUint16(1);
      writeUint16(buffer.numberOfChannels);
      writeUint32(buffer.sampleRate);
      writeUint32(buffer.sampleRate * buffer.numberOfChannels * 2);
      writeUint16(buffer.numberOfChannels * 2);
      writeUint16(16);
      writeString("data");
      writeUint32(length - 44);

      for (let i = 0; i < buffer.length; i++) {
        for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
          const sample = Math.max(-1, Math.min(1, buffer.getChannelData(channel)[i]));
          const value = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
          writeUint16(value);
        }
      }

      resolve(new Blob([data], { type: "audio/wav" }));
    });
  };

  const formatTime = (time: number) => {
    const minutes = Math.floor(time / 60);
    const seconds = Math.floor(time % 60);
    const milliseconds = Math.floor((time % 1) * 10);
    return `${minutes.toString().padStart(2, "0")}:${seconds
      .toString()
      .padStart(2, "0")}.${milliseconds}`;
  };

  return (
    <Card padding="lg" style={{ backgroundColor: "#1A1B1E", color: "#C1C2C5" }}>
      <Stack>
        <Group>
          <Text size="xl">{fileName}</Text>
          <ActionIcon variant="subtle" color="gray">
            <IconPlayerTrackPrev size={18} />
          </ActionIcon>
        </Group>

        <div ref={containerRef} style={{ position: "relative", height: "200px" }}>
          <canvas
            ref={canvasRef}
            style={{
              width: "100%",
              height: "100%",
              backgroundColor: "#25262B",
              borderRadius: "4px",
              cursor: isDragging ? "grabbing" : "grab",
            }}
            onMouseDown={handleMouseDown}
          />
        </div>

        <Group>
          <Text size="sm">{formatTime(trimStart)}</Text>
          <Text size="sm">{formatTime(trimEnd)}</Text>
        </Group>

        <Group>
          <ActionIcon variant="subtle" color="gray">
            <IconCut size={18} />
          </ActionIcon>
          <ActionIcon variant="subtle" color="gray" onClick={onReset}>
            <IconTrash size={18} />
          </ActionIcon>
        </Group>

        <Group grow>
          <NumberInput
            label="Start"
            value={trimStart}
            onChange={(value) => setTrimStart(Number(value))}
            min={0}
            max={trimEnd - 0.1}
            step={0.1}
            styles={{ input: { backgroundColor: "#25262B", color: "#C1C2C5" } }}
          />
          <NumberInput
            label="End"
            value={trimEnd}
            onChange={(value) => setTrimEnd(Number(value))}
            min={trimStart + 0.1}
            max={audioBuffer.duration}
            step={0.1}
            styles={{ input: { backgroundColor: "#25262B", color: "#C1C2C5" } }}
          />
        </Group>

        <Group align="center">
          <Select
            data={[
              { value: "mp3", label: "MP3" },
              { value: "wav", label: "WAV" },
            ]}
            defaultValue="wav"
            label="Format"
            styles={{ input: { backgroundColor: "#25262B", color: "#C1C2C5" } }}
          />
        </Group>
        <Button
          onClick={handleTrim}
          disabled={isTrimming}
          style={{ backgroundColor: "#ffffff", color: "#1A1B1E" }}
        >
          {isTrimming ? "Trimming..." : "Save"}
        </Button>
      </Stack>
    </Card>
  );
}

export default function AudioTrimmerApp() {
  const [audioBuffer, setAudioBuffer] = useState<AudioBuffer | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);

  const handleFileUpload = async (file: File | null) => {
    if (file) {
      const arrayBuffer = await file.arrayBuffer();
      const audioContext = new (window.AudioContext ||
        (window as any).webkitAudioContext)();
      const decodedBuffer = await audioContext.decodeAudioData(arrayBuffer);
      setAudioBuffer(decodedBuffer);
      setFileName(file.name);
    }
  };

  const handleReset = () => {
    setAudioBuffer(null);
    setFileName(null);
  };

  return (
    <div className="center">
      {audioBuffer && fileName ? (
        <AudioTrimmer
          audioBuffer={audioBuffer}
          fileName={fileName}
          onReset={handleReset}
        />
      ) : (
        <div>
          <Card style={{ backgroundColor: "#1A1B1E", color: "#C1C2C5" }}>
            <Stack align="center">
              <span>
                <p className="text textH1">Audio Cutter</p>
                <p className="text textH2">
                  Free editor to trim and cut any audio file online
                </p>
              </span>
              <FileButton onChange={handleFileUpload} accept="audio/*">
                {(props) => (
                  <Button
                    {...props}
                    className="stylized-button"
                    style={{ backgroundColor: "#1A1B1E", color: "#ffffff" }}
                  >
                    Browse my files
                  </Button>
                )}
              </FileButton>
            </Stack>
          </Card>
        </div>
      )}
    </div>
  );
}
